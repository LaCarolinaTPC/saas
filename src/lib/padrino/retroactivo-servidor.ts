/**
 * Publicación retroactiva: lectura de los referidos, cálculo y aplicación
 * (solo servidor, sin "use server"). La simulación y la publicación llaman a
 * `calcularRetroactivo`: lo que se ve en la simulación es lo que se aplica.
 * Quien llama ya verificó los permisos.
 */
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaDe, getPoliticas, validar, type Politica } from "./datos";
import { totalesEsquema, type LetraEsquema } from "./politica";
import { bloqueantesNoCumplidos, hitosPorBeneficiario, type DecisionEsquema, type Requisito, type Validacion } from "./reglas";
import { bitacora, cargarPermanencia, evaluarHitos } from "./servidor";
import {
  accionRetroactiva, conciliarHitos, estadoTrasRehacer, hitosActualesProyectados, hitosResultantes, totalesHitos,
  type Conciliacion, type FilaRetroactiva, type HitoExistente, type SimulacionRetroactiva,
} from "./retroactivo";

type Actor = { userId: string | null; userEmail: string | null };
type Admin = ReturnType<typeof createAdminClient>;

const fmt = (f: string) => f.split("-").reverse().join("/");
const texto = (r: Requisito) => `${r.codigo} ${r.titulo}: ${r.dato}`;
const enLotes = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Lo que hace falta para aplicar una fila, además de lo que se muestra. */
interface Calculo {
  fila: FilaRetroactiva;
  validacion?: Validacion;
  esquema?: DecisionEsquema;
  bloqueantes?: Requisito[];
  conciliacion?: Conciliacion;
  nombres?: { padrino: string | null; referido: string | null };
}

/** Qué versión se cierra o se reemplaza al publicar desde `fecha`. */
function versionQueCierra(politicas: Politica[], fecha: string) {
  const abierta = politicas.find((p) => p.estado === "publicada" && p.vigente_desde && p.vigente_hasta === null && p.vigente_desde <= fecha);
  if (!abierta) return { reemplaza: null, cierra: null };
  if (abierta.vigente_desde === fecha) return { reemplaza: abierta.version, cierra: null };
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { reemplaza: null, cierra: { version: abierta.version, hasta: d.toISOString().slice(0, 10) } };
}

/**
 * Qué le pasaría a cada referido si `politica` rigiera desde `fecha`. No
 * guarda nada. `hoy` fija la proyección de los hitos.
 */
export async function calcularRetroactivo(politica: Politica, fecha: string, hoy: string, admin: Admin = createAdminClient()) {
  const politicas = await getPoliticas(admin, { borradores: true });
  const porId = new Map(politicas.map((p) => [p.id, p]));
  const { data: refs, error } = await admin.from("padrino_referidos").select("*").order("created_at");
  if (error) throw new Error(`No se pudieron leer los referidos: ${error.message}`);
  const todos = (refs ?? []) as Record<string, unknown>[];
  const afectados = todos.filter((r) => accionRetroactiva({ estado: r.estado as string, anulado: Boolean(r.anulado_at), fechaIngreso: (r.fecha_ingreso as string | null) ?? null }, fecha) !== "sin_cambio");

  const ids = afectados.map((r) => r.id as string);
  const hitos = new Map<string, HitoExistente[]>();
  for (const lote of enLotes(ids)) {
    const { data, error: eh } = await admin.from("padrino_hitos").select("id, referido_id, numero, beneficiario, valor, estado, fecha_causacion, descripcion").in("referido_id", lote);
    if (eh) throw new Error(`No se pudieron leer los hitos: ${eh.message}`);
    for (const h of data ?? []) {
      const lista = hitos.get(h.referido_id as string) ?? [];
      lista.push({
        id: h.id as string,
        numero: h.numero as number,
        beneficiario: h.beneficiario === "referido" ? "referido" : "padrino",
        valor: Number(h.valor),
        estado: h.estado as string,
        fecha_causacion: h.fecha_causacion as string,
        descripcion: h.descripcion as string,
      });
      hitos.set(h.referido_id as string, lista);
    }
  }
  const permanencia = await cargarPermanencia(afectados.map((r) => r.cedula_referido as string), afectados.map((r) => r.cedula_padrino as string), admin);
  const p = politica.parametros;
  const opcionesNuevas = { modoEmpleados: p.padrino.modo_empleados, padrinoDebeSeguirActivo: p.padrino.debe_seguir_activo_para_cobrar };

  const calculos: Calculo[] = [];
  for (const r of afectados) {
    const accion = accionRetroactiva({ estado: r.estado as string, anulado: false, fechaIngreso: (r.fecha_ingreso as string | null) ?? null }, fecha);
    const actualPol = porId.get(r.politica_id as string) ?? null;
    const fechaIngreso = (r.fecha_ingreso as string | null) ?? null;
    const base: FilaRetroactiva = {
      referidoId: r.id as string,
      referido: { nombre: (r.nombre_referido as string | null) ?? null, cedula: r.cedula_referido as string },
      padrino: { nombre: (r.nombre_padrino as string | null) ?? null, cedula: r.cedula_padrino as string },
      accion,
      estado: r.estado as string,
      estadoNuevo: r.estado as string,
      fechaIngreso,
      versionActual: actualPol?.version ?? null,
      esquemaActual: r.esquema as string,
      esquemaNuevo: r.esquema as string,
      esquemaDato: "",
      sinBonificacion: null,
      bloqueantes: [],
      observaciones: [],
      hitosActuales: [],
      hitosNuevos: [],
      actual: totalesHitos([]),
      nuevo: totalesHitos([]),
      potencial: null,
      ajustes: 0,
      sobrepago: 0,
      notas: [],
      error: null,
    };
    try {
      const v = await validar((r.proceso_id as string | null) ?? null, r.cedula_padrino as string, admin, {
        politica,
        referidoId: r.id as string,
        experienciaCertificada: r.certificado_validado_at ? Boolean(r.experiencia_certificada) : null,
        fechaIngreso,
        registradoEl: fechaDe(r.created_at as string),
        cedula: r.cedula_referido as string,
        nombre: (r.nombre_referido as string | null) ?? null,
      });
      const req = [...v.validacion.padrino, ...v.validacion.referido];
      const fila: FilaRetroactiva = { ...base, esquemaNuevo: v.esquema.esquema, esquemaDato: v.esquema.dato, sinBonificacion: v.esquema.sinBonificacion };
      const nombres = { padrino: v.padrino.conductor?.nombre ?? v.padrino.empleado?.nombre ?? base.padrino.nombre, referido: v.referido.nombre ?? base.referido.nombre };

      if (accion === "revalidar") {
        // Sin contratar: pesan los de la decisión de elegibilidad (momento «registro»).
        const decision = req.filter((x) => (x.momento ?? "registro") === "registro");
        fila.bloqueantes = bloqueantesNoCumplidos(decision).map(texto);
        fila.observaciones = decision.filter((x) => x.estado === "revisar" || (x.estado === "no_cumple" && x.bloquea === false)).map(texto);
        const esquemaActual = actualPol?.parametros.esquemas[r.esquema as LetraEsquema];
        fila.potencial = {
          actual: r.sin_bonificacion_motivo ? 0 : totalesEsquema(esquemaActual).total,
          nuevo: v.esquema.sinBonificacion ? 0 : totalesEsquema(p.esquemas[v.esquema.esquema]).total,
        };
        calculos.push({ fila, validacion: v.validacion, esquema: v.esquema, nombres });
        continue;
      }

      // Contratado desde la fecha: lo mismo que haría ajustarAlContratar con la versión nueva.
      const bloqueantes = bloqueantesNoCumplidos(req.filter((x) => x.momento === "contratacion"));
      fila.bloqueantes = bloqueantes.map(texto);
      fila.observaciones = req.filter((x) => (x.momento ?? "registro") === "registro" && x.estado === "no_cumple").map(texto);
      const nuevos = v.esquema.sinBonificacion || bloqueantes.length ? [] : hitosPorBeneficiario(p, v.esquema.esquema, fechaIngreso!);
      const existentes = hitos.get(r.id as string) ?? [];
      const conciliacion = conciliarHitos(existentes, nuevos, politica.version);
      const hechos = permanencia(r.cedula_referido as string, r.cedula_padrino as string);
      const ap = actualPol?.parametros;
      fila.hitosActuales = hitosActualesProyectados(existentes, fechaIngreso!, hechos, { modoEmpleados: ap?.padrino.modo_empleados ?? "lista_blanca", padrinoDebeSeguirActivo: ap?.padrino.debe_seguir_activo_para_cobrar ?? true }, hoy);
      fila.hitosNuevos = hitosResultantes(conciliacion, fechaIngreso!, hechos, opcionesNuevas, hoy);
      fila.actual = totalesHitos(fila.hitosActuales);
      fila.nuevo = totalesHitos(fila.hitosNuevos);
      fila.estadoNuevo = estadoTrasRehacer(fila.hitosNuevos);
      fila.ajustes = conciliacion.insertar.filter((h) => h.ajusteDe !== null).reduce((s, h) => s + h.valor, 0) + conciliacion.actualizar.filter((h) => h.ajusteDe !== null).reduce((s, h) => s + h.valor, 0);
      fila.sobrepago = conciliacion.sobrepago.padrino + conciliacion.sobrepago.referido;
      fila.notas = conciliacion.notas;
      if (bloqueantes.length) fila.notas.unshift("Al contratar no se cumple un requisito que bloquea: no se crean hitos.");
      calculos.push({ fila, validacion: v.validacion, esquema: v.esquema, bloqueantes, conciliacion, nombres });
    } catch (e) {
      calculos.push({ fila: { ...base, error: e instanceof Error ? e.message : String(e) } });
    }
  }
  const sim: SimulacionRetroactiva = {
    version: politica.version,
    fecha,
    hoy,
    ...versionQueCierra(politicas, fecha),
    filas: calculos.map((c) => c.fila),
    sinCambio: todos.length - afectados.length,
  };
  return { sim, calculos };
}

/**
 * Pasa a `politica` (ya publicada desde `fecha`) a los referidos que
 * corresponda, con el mismo cálculo de la simulación, y evalúa los hitos
 * vencidos. Idempotente: se puede volver a correr si algo falló.
 */
export async function aplicarRetroactivo(politica: Politica, fecha: string, hoy: string, actor: Actor) {
  const admin = createAdminClient();
  const { calculos } = await calcularRetroactivo(politica, fecha, hoy, admin);
  const fallidos: { referido: string; error: string }[] = [];
  let aplicados = 0;
  const ahora = () => new Date().toISOString();

  for (const c of calculos) {
    const f = c.fila;
    const nombre = f.referido.nombre ?? f.referido.cedula;
    if (f.error || !c.validacion || !c.esquema) {
      fallidos.push({ referido: nombre, error: f.error ?? "Sin cálculo." });
      continue;
    }
    try {
      const esquema = {
        politica_id: politica.id,
        esquema: c.esquema.esquema,
        tipo_ingreso: c.esquema.tipoIngreso,
        meses_fuera: c.esquema.mesesFuera,
        sin_bonificacion_motivo: c.esquema.sinBonificacion,
      };
      if (f.accion === "revalidar") {
        const { error } = await admin.from("padrino_referidos").update({ ...esquema, validacion: c.validacion, validacion_at: ahora(), updated_at: ahora() }).eq("id", f.referidoId);
        if (error) throw new Error(error.message);
        await bitacora(f.referidoId, "politica_retroactiva", { politica: politica.version, desde: fecha, accion: "revalidar", esquema_antes: f.esquemaActual, esquema_despues: c.esquema.esquema, validacion: c.validacion }, actor);
        aplicados++;
        continue;
      }

      const conc = c.conciliacion!;
      // 1. Hitos: reescribir los reemplazables, cancelar los que sobran e insertar los nuevos.
      for (const h of conc.actualizar) {
        const { error } = await admin
          .from("padrino_hitos")
          .update({
            descripcion: h.descripcion,
            meses: h.meses,
            valor: h.valor,
            requiere_desempeno: h.requiere_desempeno,
            fecha_causacion: h.fechaCausacion,
            estado: "pendiente",
            motivo: null,
            evaluacion: null,
            evaluado_at: null,
            updated_at: ahora(),
          })
          .eq("id", h.id)
          .not("estado", "in", "(aprobado,pagado,rechazado)");
        if (error) throw new Error(`hito ${h.numero}: ${error.message}`);
      }
      if (conc.cancelar.length) {
        const { error } = await admin
          .from("padrino_hitos")
          .update({ estado: "cancelado", motivo: `Reemplazado: la versión ${politica.version} de la política no tiene este hito.`, evaluado_at: ahora(), updated_at: ahora() })
          .in("id", conc.cancelar)
          .not("estado", "in", "(aprobado,pagado,rechazado)");
        if (error) throw new Error(`cancelar hitos: ${error.message}`);
      }
      if (conc.insertar.length) {
        const { error } = await admin.from("padrino_hitos").insert(
          conc.insertar.map((h) => ({
            referido_id: f.referidoId,
            numero: h.numero,
            descripcion: h.descripcion,
            meses: h.meses,
            valor: h.valor,
            requiere_desempeno: h.requiere_desempeno,
            fecha_causacion: h.fechaCausacion,
            beneficiario: h.beneficiario,
            cedula_beneficiario: h.beneficiario === "padrino" ? f.padrino.cedula : f.referido.cedula,
            nombre_beneficiario: h.beneficiario === "padrino" ? c.nombres?.padrino ?? null : c.nombres?.referido ?? null,
          }))
        );
        if (error) throw new Error(`insertar hitos: ${error.message}`);
      }
      // 2. El referido: versión, esquema, requisitos al contratar y estado.
      const { data: filas } = await admin.from("padrino_hitos").select("estado").eq("referido_id", f.referidoId);
      const estado = estadoTrasRehacer(filas ?? []);
      const bloq = c.bloqueantes ?? [];
      const { error } = await admin
        .from("padrino_referidos")
        .update({
          ...esquema,
          validacion_contratacion: c.validacion,
          hitos_bloqueados_motivo: bloq.length ? `Al contratar no se cumple: ${bloq.map((b) => `${b.codigo} ${b.titulo} (${b.dato})`).join("; ")}` : null,
          estado,
          updated_at: ahora(),
        })
        .eq("id", f.referidoId);
      if (error) throw new Error(error.message);
      await bitacora(
        f.referidoId,
        "politica_retroactiva",
        {
          politica: politica.version,
          desde: fecha,
          accion: "rehacer",
          version_antes: f.versionActual,
          esquema_antes: f.esquemaActual,
          esquema_despues: c.esquema.esquema,
          sin_bonificacion: c.esquema.sinBonificacion,
          estado_antes: f.estado,
          estado_despues: estado,
          hitos_antes: f.hitosActuales.map((h) => ({ numero: h.numero, beneficiario: h.beneficiario, valor: h.valor, estado: h.estado })),
          reescritos: conc.actualizar.map((h) => ({ numero: h.numero, beneficiario: h.beneficiario, valor: h.valor })),
          insertados: conc.insertar.map((h) => ({ numero: h.numero, beneficiario: h.beneficiario, valor: h.valor, ajuste_de: h.ajusteDe })),
          cancelados: conc.cancelar.length,
          sobrepago: conc.sobrepago,
          notas: conc.notas,
        },
        actor
      );
      aplicados++;
    } catch (e) {
      fallidos.push({ referido: nombre, error: e instanceof Error ? e.message : String(e) });
    }
  }
  // Los hitos reescritos que ya vencieron se evalúan ahora (y el estado de cada referido se recalcula).
  const evaluacion = await evaluarHitos(hoy, actor);
  console.info(`[padrino] política ${politica.version} retroactiva desde ${fmt(fecha)}: ${aplicados} referido(s) ajustados, ${fallidos.length} con error.`);
  revalidatePath("/candidatos/plan-padrino");
  return { aplicados, fallidos, evaluacion };
}
