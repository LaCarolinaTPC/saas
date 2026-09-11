/**
 * Etapa 2 del expediente (fase 3 del plan), lado servidor: completar datos,
 * homologar, ajustar y liquidar. Las reglas puras están en
 * liquidacion-reglas.ts; aquí solo se lee y escribe la base.
 *
 * Toda escritura al expediente lleva `WHERE version = :leida`: si no afecta
 * filas, otra persona lo cambió antes y se rechaza con ConflictoVersion. El
 * trigger de la base incrementa `version` y `updated_at` en cada UPDATE.
 *
 * Cada ajuste (12.18) queda en incapacidad_ajustes_liquidacion con campo,
 * valor anterior, nuevo y motivo; y si el expediente ya estaba liquidado, se
 * recalcula dejando la liquidación anterior sin vigencia.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { liquidar } from "./motor";
import type { ExpedienteVista } from "./expedientes";
import {
  CAMPOS_AJUSTE,
  ESTADOS_EDITABLES,
  aDosDecimales,
  aplicarSobrescrituras,
  armarEntrada,
  faltantesParaLiquidar,
  motivoValido,
  reglaDesdeFila,
  type CampoAjuste,
  type Faltante,
} from "./liquidacion-reglas";

export class ConflictoVersion extends Error {
  constructor() {
    super("Otra persona modificó el expediente mientras lo editabas. Vuelve a cargarlo y repite el cambio.");
    this.name = "ConflictoVersion";
  }
}

/** Faltan datos para liquidar: uno por campo, para mostrarlos junto al campo. */
export class FaltanDatos extends Error {
  readonly faltantes: Faltante[];
  constructor(faltantes: Faltante[]) {
    super(`No se puede liquidar: ${faltantes.map((f) => f.mensaje).join(" ")}`);
    this.name = "FaltanDatos";
    this.faltantes = faltantes;
  }
}

export interface Actor {
  email: string | null;
  rol: string | null;
}

// ── Lecturas de apoyo ────────────────────────────────────────────────────────

export async function leerReglaOperativa() {
  const { data, error } = await createAdminClient()
    .from("incapacidad_reglas")
    .select("id, codigo, descripcion, parametros")
    .eq("operativa", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No hay ninguna regla operativa en incapacidad_reglas.");
  return reglaDesdeFila(data as { id: string; codigo: string; descripcion: string; parametros: unknown });
}

export interface SugerenciaSalario {
  salario: number;
  moneda: string;
  cargo: string | null;
  desde: string | null;
}

/**
 * El salario actual en `employees`, solo como sugerencia visible: nunca se
 * toma solo (decisión 12.4). Es el actual, no el vigente al inicio de la
 * incapacidad; por eso quien lo acepta lo hace a sabiendas.
 */
export async function sugerenciaSalario(cedula: string): Promise<SugerenciaSalario | null> {
  const { data, error } = await createAdminClient()
    .from("employees")
    .select("salary, salary_currency, position, hire_date")
    .eq("document_number", cedula)
    .not("salary", "is", null)
    .order("hire_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as { salary: number | string; salary_currency: string | null; position: string | null; hire_date: string | null };
  const salario = Number(d.salary);
  if (!Number.isFinite(salario) || salario <= 0) return null;
  return { salario, moneda: d.salary_currency ?? "COP", cargo: d.position, desde: d.hire_date };
}

export interface TipoOrigen {
  codigo: string;
  nombre: string;
}

export async function listarTiposOrigen(): Promise<TipoOrigen[]> {
  const { data, error } = await createAdminClient()
    .from("ausentismo_catalogos")
    .select("codigo, nombre")
    .eq("tipo", "ORIGEN")
    .eq("activo", true)
    .order("codigo");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { codigo: string | null; nombre: string }[])
    .filter((x) => x.codigo)
    .map((x) => ({ codigo: x.codigo!.toUpperCase(), nombre: x.nombre }));
}

async function leerVista(id: string): Promise<ExpedienteVista> {
  const { data, error } = await createAdminClient()
    .from("vw_incapacidad_expedientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("El expediente no existe.");
  return data as ExpedienteVista;
}

function exigirEditable(v: ExpedienteVista) {
  if (!ESTADOS_EDITABLES.has(v.estado)) {
    throw new Error(`El expediente está en estado «${v.estado}» y no admite cambios de la etapa 2.`);
  }
  if (v.matriz_eliminada_at) throw new Error("La incapacidad está eliminada en la matriz EPS.");
}

// ── Escrituras de apoyo ──────────────────────────────────────────────────────

async function bitacora(expedienteId: string, accion: string, antes: unknown, despues: unknown, email: string | null) {
  try {
    await createAdminClient().from("ausentismo_log").insert({
      registro_id: expedienteId,
      accion,
      datos_anteriores: antes ?? null,
      datos_nuevos: despues ?? null,
      user_email: email,
    });
  } catch (e) {
    console.error("[incapacidades] no se pudo escribir la bitácora:", e);
  }
}

/** UPDATE con control de versión. Devuelve la versión nueva. */
async function actualizarExpediente(id: string, version: number, cambios: Record<string, unknown>): Promise<number> {
  const { data, error } = await createAdminClient()
    .from("incapacidad_expedientes")
    .update(cambios)
    .eq("id", id)
    .eq("version", version)
    .is("eliminado_at", null)
    .select("version");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ConflictoVersion();
  return (data[0] as { version: number }).version;
}

export interface AjustePendiente {
  campo: CampoAjuste;
  valorAnterior: unknown;
  valorNuevo: unknown;
  motivo: string;
}

async function registrarAjustes(expedienteId: string, ajustes: AjustePendiente[], email: string): Promise<string[]> {
  if (ajustes.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("incapacidad_ajustes_liquidacion")
    .insert(
      ajustes.map((a) => ({
        expediente_id: expedienteId,
        campo: a.campo,
        nivel: CAMPOS_AJUSTE[a.campo],
        valor_anterior: a.valorAnterior ?? null,
        valor_nuevo: a.valorNuevo ?? null,
        motivo: a.motivo,
        ajustado_por_email: email,
      }))
    )
    .select("id");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).map((x) => x.id);
}

const cambio = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

/**
 * Un cambio sobre un dato de liquidación ya diligenciado es un ajuste y exige
 * motivo. Diligenciarlo por primera vez no.
 */
function ajusteSiCambia(
  campo: CampoAjuste,
  anterior: unknown,
  nuevo: unknown,
  motivo: string | null,
  ajustes: AjustePendiente[]
) {
  if (!cambio(anterior, nuevo) || anterior == null) return;
  if (!motivoValido(motivo)) {
    throw new Error(`Cambiar «${campo}» que ya estaba diligenciado es un ajuste: escribe el motivo (mínimo 5 caracteres).`);
  }
  ajustes.push({ campo, valorAnterior: anterior, valorNuevo: nuevo, motivo: motivo.replace(/\s+/g, " ").trim() });
}

// ── Operaciones ──────────────────────────────────────────────────────────────

export interface DatosCompletar {
  responsable_email: string | null;
  salario_base: number | null;
  salario_vigencia_desde: string | null;
  salario_fuente: "manual" | "employees" | null;
  observaciones: string | null;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  motivo: string | null;
}

export interface ResultadoOperacion {
  /** Ajustes registrados (campos). */
  ajustes: CampoAjuste[];
  /** Si el expediente ya estaba liquidado y se recalculó. */
  recalculado: boolean;
  avisos: string[];
}

/** Completar datos del expediente (responsable, salario, observaciones, próxima acción). */
export async function completarDatos(id: string, version: number, d: DatosCompletar, actor: Actor): Promise<ResultadoOperacion> {
  const v = await leerVista(id);
  exigirEditable(v);
  if (v.version !== version) throw new ConflictoVersion();
  if (d.salario_base != null && !(Number.isFinite(d.salario_base) && d.salario_base > 0)) {
    throw new Error("El salario base debe ser mayor que cero.");
  }
  if (d.salario_base != null && !d.salario_fuente) throw new Error("Indica la fuente del salario.");

  const ajustes: AjustePendiente[] = [];
  ajusteSiCambia("salario_base", v.salario_base, d.salario_base, d.motivo, ajustes);
  ajusteSiCambia("salario_vigencia_desde", v.salario_vigencia_desde, d.salario_vigencia_desde, d.motivo, ajustes);

  const salarioCambio = cambio(v.salario_base, d.salario_base) || cambio(v.salario_vigencia_desde, d.salario_vigencia_desde) || cambio(v.salario_fuente, d.salario_fuente);
  const cambios: Record<string, unknown> = {
    responsable_email: d.responsable_email,
    salario_base: d.salario_base,
    salario_vigencia_desde: d.salario_vigencia_desde,
    salario_fuente: d.salario_base == null ? null : d.salario_fuente,
    observaciones: d.observaciones,
    proxima_accion: d.proxima_accion,
    proxima_accion_fecha: d.proxima_accion_fecha,
  };
  if (salarioCambio) {
    cambios.salario_resuelto_por_email = d.salario_base == null ? null : actor.email;
    cambios.salario_resuelto_at = d.salario_base == null ? null : new Date().toISOString();
  }
  if (v.estado === "recibido") cambios.estado = "en_completar";

  await actualizarExpediente(id, version, cambios);
  const ajusteIds = await registrarAjustes(id, ajustes, actor.email ?? "desconocido");
  await bitacora(id, "expediente_completado", {
    responsable_email: v.responsable_email, salario_base: v.salario_base, salario_vigencia_desde: v.salario_vigencia_desde,
    salario_fuente: v.salario_fuente, proxima_accion: v.proxima_accion,
  }, { ...cambios, motivo: d.motivo }, actor.email);

  return recalcularSiEstabaLiquidado(id, v, actor, ajustes, ajusteIds);
}

export interface DatosHomologar {
  tipo_homologado: string | null;
  entidad_catalogo_id: string | null;
  modalidad_ajustada: "INICIAL" | "PRORROGA" | null;
  motivo: string | null;
}

/** Resolver o cambiar tipo, entidad y modalidad (nivel 1 de 12.18). */
export async function homologar(id: string, version: number, d: DatosHomologar, actor: Actor): Promise<ResultadoOperacion> {
  const v = await leerVista(id);
  exigirEditable(v);
  if (v.version !== version) throw new ConflictoVersion();
  const db = createAdminClient();

  let tipo: string | null = null;
  if (d.tipo_homologado) {
    const tipos = await listarTiposOrigen();
    tipo = d.tipo_homologado.toUpperCase();
    if (!tipos.some((t) => t.codigo === tipo)) throw new Error(`El tipo «${tipo}» no está en el catálogo ORIGEN.`);
  }
  let entidadNombre: string | null = null;
  if (d.entidad_catalogo_id) {
    const { data, error } = await db
      .from("ausentismo_catalogos")
      .select("id, nombre, activo")
      .eq("id", d.entidad_catalogo_id)
      .in("tipo", ["EPS", "ARL"])
      .maybeSingle();
    if (error) throw new Error(error.message);
    const e = data as { id: string; nombre: string; activo: boolean } | null;
    if (!e) throw new Error("La entidad no existe en el catálogo.");
    if (!e.activo) throw new Error(`La entidad ${e.nombre} está inactiva en el catálogo.`);
    entidadNombre = e.nombre;
  }

  const ajustes: AjustePendiente[] = [];
  ajusteSiCambia("tipo_homologado", v.tipo_homologado, tipo, d.motivo, ajustes);
  ajusteSiCambia("entidad_catalogo_id", v.entidad_catalogo_id, d.entidad_catalogo_id, d.motivo, ajustes);
  ajusteSiCambia("modalidad_ajustada", v.modalidad_ajustada, d.modalidad_ajustada, d.motivo, ajustes);
  // Fijar por primera vez una modalidad distinta de la que trae la matriz también es un ajuste.
  if (v.modalidad_ajustada == null && d.modalidad_ajustada != null && d.modalidad_ajustada !== (v.indicador_prorroga ?? "").toUpperCase()) {
    if (!motivoValido(d.motivo)) throw new Error("Cambiar la modalidad que trae la matriz es un ajuste: escribe el motivo (mínimo 5 caracteres).");
    if (!ajustes.some((a) => a.campo === "modalidad_ajustada")) {
      ajustes.push({ campo: "modalidad_ajustada", valorAnterior: v.indicador_prorroga, valorNuevo: d.modalidad_ajustada, motivo: d.motivo.replace(/\s+/g, " ").trim() });
    }
  }

  const cambios: Record<string, unknown> = {
    tipo_homologado: tipo,
    entidad_catalogo_id: d.entidad_catalogo_id,
    modalidad_ajustada: d.modalidad_ajustada,
    pendiente_homologacion: !(tipo && d.entidad_catalogo_id),
  };
  if (v.estado === "recibido") cambios.estado = "en_completar";

  await actualizarExpediente(id, version, cambios);
  const ajusteIds = await registrarAjustes(id, ajustes, actor.email ?? "desconocido");
  await bitacora(id, "expediente_homologado",
    { tipo_homologado: v.tipo_homologado, entidad: v.entidad_nombre, modalidad_ajustada: v.modalidad_ajustada },
    { tipo_homologado: tipo, entidad: entidadNombre, modalidad_ajustada: d.modalidad_ajustada, motivo: d.motivo },
    actor.email);

  return recalcularSiEstabaLiquidado(id, v, actor, ajustes, ajusteIds);
}

export interface DatosSobrescribir {
  dias_entidad_ajustados: number | null;
  valor_reclamado_ajustado: number | null;
  motivo: string | null;
}

/** Sobrescrituras del resultado (nivel 2 de 12.18): siempre con motivo, incluso para quitarlas. */
export async function sobrescribir(id: string, version: number, d: DatosSobrescribir, actor: Actor): Promise<ResultadoOperacion> {
  const v = await leerVista(id);
  exigirEditable(v);
  if (v.version !== version) throw new ConflictoVersion();

  const hayCambio = cambio(v.dias_entidad_ajustados, d.dias_entidad_ajustados) || cambio(v.valor_reclamado_ajustado, d.valor_reclamado_ajustado);
  if (!hayCambio) return { ajustes: [], recalculado: false, avisos: [] };
  if (!motivoValido(d.motivo)) throw new Error("Sobrescribir el cálculo exige un motivo (mínimo 5 caracteres).");
  const motivo = d.motivo.replace(/\s+/g, " ").trim();

  if (d.dias_entidad_ajustados != null) {
    if (!Number.isInteger(d.dias_entidad_ajustados) || d.dias_entidad_ajustados < 0) throw new Error("Los días a cargo ajustados deben ser un entero mayor o igual a cero.");
    if (v.dias_incapacidad != null && d.dias_entidad_ajustados > v.dias_incapacidad) {
      throw new Error(`Los días a cargo ajustados (${d.dias_entidad_ajustados}) superan los días de incapacidad (${v.dias_incapacidad}).`);
    }
  }
  if (d.valor_reclamado_ajustado != null && !(Number.isFinite(d.valor_reclamado_ajustado) && d.valor_reclamado_ajustado >= 0)) {
    throw new Error("El valor reclamado ajustado debe ser un número mayor o igual a cero.");
  }

  const ajustes: AjustePendiente[] = [];
  if (cambio(v.dias_entidad_ajustados, d.dias_entidad_ajustados)) {
    ajustes.push({ campo: "dias_entidad_ajustados", valorAnterior: v.dias_entidad_ajustados, valorNuevo: d.dias_entidad_ajustados, motivo });
  }
  if (cambio(v.valor_reclamado_ajustado, d.valor_reclamado_ajustado)) {
    ajustes.push({ campo: "valor_reclamado_ajustado", valorAnterior: v.valor_reclamado_ajustado, valorNuevo: d.valor_reclamado_ajustado, motivo });
  }

  const cambios: Record<string, unknown> = {
    dias_entidad_ajustados: d.dias_entidad_ajustados,
    valor_reclamado_ajustado: d.valor_reclamado_ajustado,
  };
  if (v.estado === "recibido") cambios.estado = "en_completar";
  await actualizarExpediente(id, version, cambios);
  const ajusteIds = await registrarAjustes(id, ajustes, actor.email ?? "desconocido");
  await bitacora(id, "ajuste_liquidacion",
    { dias_entidad_ajustados: v.dias_entidad_ajustados, valor_reclamado_ajustado: v.valor_reclamado_ajustado },
    { ...cambios, motivo }, actor.email);

  return recalcularSiEstabaLiquidado(id, v, actor, ajustes, ajusteIds);
}

async function recalcularSiEstabaLiquidado(
  id: string,
  antes: ExpedienteVista,
  actor: Actor,
  ajustes: AjustePendiente[],
  ajusteIds: string[]
): Promise<ResultadoOperacion> {
  const campos = ajustes.map((a) => a.campo);
  if (!antes.liquidacion_id) return { ajustes: campos, recalculado: false, avisos: [] };
  // Ya había liquidación: cada ajuste genera una nueva (12.18). Si ahora faltan
  // datos, la vigente se conserva y se avisa; no se deja el expediente sin cálculo.
  const v = await leerVista(id);
  const faltan = faltantesParaLiquidar(v);
  if (faltan.length > 0) {
    return { ajustes: campos, recalculado: false, avisos: [`La liquidación anterior sigue vigente porque ahora falta: ${faltan.map((f) => f.mensaje).join(" ")}`] };
  }
  const r = await liquidarExpediente(id, actor, { ajusteIds, origen: "ajuste" });
  return { ajustes: campos, recalculado: true, avisos: r.avisos };
}

export interface ResultadoLiquidar {
  liquidacionId: string;
  reglaCodigo: string;
  diasEntidad: number;
  valorEntidad: number;
  valorReclamado: number;
  avisos: string[];
}

/**
 * Liquida el expediente con la regla operativa. La liquidación anterior deja
 * de ser vigente pero no se borra. El expediente pasa a `liquidado` y su
 * `valor_reclamado` es el propuesto por el cálculo (o el ajustado a mano).
 */
export async function liquidarExpediente(
  id: string,
  actor: Actor,
  opts: { ajusteIds?: string[]; origen?: "manual" | "ajuste" } = {}
): Promise<ResultadoLiquidar> {
  const v = await leerVista(id);
  exigirEditable(v);
  const faltan = faltantesParaLiquidar(v);
  if (faltan.length > 0) throw new FaltanDatos(faltan);

  const regla = await leerReglaOperativa();
  const entrada = armarEntrada(v);
  const liq = liquidar(entrada, regla); // lanza IncidenciaMotor si los días no cuadran
  const res = aplicarSobrescrituras(liq, { diasEntidad: v.dias_entidad_ajustados, valorReclamado: v.valor_reclamado_ajustado });
  const l = res.liquidacion;
  const db = createAdminClient();

  const { error: e1 } = await db
    .from("incapacidad_liquidaciones")
    .update({ es_vigente: false })
    .eq("expediente_id", id)
    .eq("es_vigente", true);
  if (e1) throw new Error(e1.message);

  const { data, error: e2 } = await db
    .from("incapacidad_liquidaciones")
    .insert({
      expediente_id: id,
      regla_id: regla.id,
      regla_codigo: regla.codigo,
      entradas: { ...entrada, salarioDiario: l.salarioDiario, reglaParametros: regla.parametros },
      sobrescrituras: res.sobrescrituras,
      dias_incapacidad: l.diasIncapacidad,
      dias_entidad: l.diasEntidad,
      dias_empresa: l.diasEmpresa,
      factor: l.factor,
      valor_total: aDosDecimales(l.valorTotal),
      valor_entidad: aDosDecimales(l.valorEntidad),
      valor_empresa: aDosDecimales(l.valorEmpresa),
      redondeo: regla.parametros.redondeoValorEntidad,
      calculado_por_email: actor.email,
      es_vigente: true,
    })
    .select("id")
    .single();
  if (e2) throw new Error(e2.message);
  const liquidacionId = (data as { id: string }).id;

  const valorReclamado = aDosDecimales(res.valorReclamado);
  await actualizarExpediente(id, v.version, { valor_reclamado: valorReclamado, estado: "liquidado" });

  if (opts.ajusteIds && opts.ajusteIds.length > 0) {
    await db.from("incapacidad_ajustes_liquidacion").update({ liquidacion_id: liquidacionId }).in("id", opts.ajusteIds);
  }
  await bitacora(id, "liquidacion_calculada",
    v.liquidacion_id ? { liquidacion_id: v.liquidacion_id, valor_reclamado: v.valor_reclamado } : null,
    {
      liquidacion_id: liquidacionId, regla: regla.codigo, origen: opts.origen ?? "manual",
      dias_entidad: l.diasEntidad, valor_entidad: aDosDecimales(l.valorEntidad), valor_reclamado: valorReclamado,
      sobrescrituras: res.sobrescrituras, avisos: res.avisos,
    },
    actor.email);

  return { liquidacionId, reglaCodigo: regla.codigo, diasEntidad: l.diasEntidad, valorEntidad: aDosDecimales(l.valorEntidad), valorReclamado, avisos: res.avisos };
}
