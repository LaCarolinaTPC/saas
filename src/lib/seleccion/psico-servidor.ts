/**
 * Prueba psicosensotécnica en PsicoAlianza (24-nov-2026). Solo servidor; las
 * reglas están en ./psico-resultados. Quien llama revisa los permisos.
 *
 * 1. Por inscribir: aspirantes en curso con el correo confirmado. Se descarga
 *    la plantilla de carga masiva de la plataforma llena (Documento, Email) y,
 *    al subirla allá, se marcan inscritos (se les avisa por WhatsApp).
 * 2. Esperando el resultado: inscritos sin concepto todavía.
 * 3. Resultados: se suben los de la plataforma (Excel/CSV o el informe PDF de
 *    cada uno); una persona revisa la vista previa y queda en el proceso
 *    (apto, apto con observaciones o no apto), con el PDF en su carpeta.
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { extractText, getDocumentProxy } from "unpdf";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { ESTADOS_EN_CURSO } from "@/lib/contratacion/constants";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { guardarAdjuntoSeleccion } from "./carpeta-servidor";
import { marcarInscritoPsico } from "./correo-psico-servidor";
import { registrarPsicotecnicaExterna } from "./dia-contratacion-servidor";
import type { ResultadoPsicoExterna } from "./dia-contratacion";
import { registrarEvento } from "@/lib/contratacion/servidor";
import { leerAjustes, valorAjuste } from "./servidor";
import { COLUMNAS_PLANTILLA, ENTIDAD_PSICO, HOJA_PLANTILLA, combinarPruebas, cortesPsico, textoCortes, type CortesPsico, type EstadoPrueba, leerFilasResultados, leerInformePsicoAlianza, type FilaResultado, type InformePrueba } from "./psico-resultados";

export interface AspirantePsico {
  procesoId: string;
  nombre: string;
  cedula: string;
  correo: string | null;
  estado: string;
  prueba: boolean;
  validadoAt: string | null;
  inscritoAt: string | null;
  resultado: ResultadoPsicoExterna | null;
  fecha: string | null;
  puntaje: number | null;
  entidad: string | null;
  /** Veces que se volvió a inscribir porque no la presentó o no la terminó, y la última razón. */
  reprogramaciones: number;
  ultimaRazon: EstadoPrueba | null;
  /** Inscrito hace más de `diasParaPresentar` días y sin resultado. */
  demorado: boolean;
}

export interface ListasPsico {
  porInscribir: AspirantePsico[];
  esperando: AspirantePsico[];
  conResultado: AspirantePsico[];
  /** Días que se le dan para presentarla antes de resaltarlo (ajuste psico_dias_para_presentar). */
  diasParaPresentar: number;
  /** Cortes del porcentaje cuando el informe no trae el concepto escrito. */
  cortes: CortesPsico;
  /** Falta la migración del correo o la de la entrega 4. */
  error?: string;
}

const COLUMNAS =
  "id, nombre, cedula, estado, origen, correo, correo_estado, correo_validado_at, correo_inscrito_at, psicotecnica_resultado, psicotecnica_fecha, psicotecnica_puntaje, psicotecnica_entidad";

function aAspirante(p: Record<string, unknown>): AspirantePsico {
  return {
    procesoId: p.id as string,
    nombre: String(p.nombre ?? ""),
    cedula: String(p.cedula ?? ""),
    correo: (p.correo as string | null) ?? null,
    estado: String(p.estado ?? ""),
    prueba: p.origen === "chat_prueba",
    validadoAt: (p.correo_validado_at as string | null) ?? null,
    inscritoAt: (p.correo_inscrito_at as string | null) ?? null,
    resultado: (p.psicotecnica_resultado as ResultadoPsicoExterna | null) ?? null,
    fecha: (p.psicotecnica_fecha as string | null) ?? null,
    puntaje: p.psicotecnica_puntaje == null ? null : Number(p.psicotecnica_puntaje),
    entidad: (p.psicotecnica_entidad as string | null) ?? null,
    reprogramaciones: 0,
    ultimaRazon: null,
    demorado: false,
  };
}

/** Las veces que se volvió a inscribir a cada uno (eventos `dato` con `psico_reprogramada`). */
async function reprogramacionesDe(ids: string[]): Promise<Map<string, { n: number; ultima: EstadoPrueba | null }>> {
  const m = new Map<string, { n: number; ultima: EstadoPrueba | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await createAdminClient()
      .from("procesos_contratacion_eventos")
      .select("proceso_id, detalle, created_at")
      .eq("tipo", "dato")
      .in("proceso_id", ids.slice(i, i + 200))
      .not("detalle->>psico_reprogramada", "is", null)
      .order("created_at", { ascending: true });
    for (const e of data ?? []) {
      const id = e.proceso_id as string;
      const x = m.get(id) ?? { n: 0, ultima: null };
      x.n++;
      x.ultima = ((e.detalle as Record<string, unknown>)?.psico_reprogramada as EstadoPrueba) ?? null;
      m.set(id, x);
    }
  }
  return m;
}

export async function listasPsico(): Promise<ListasPsico> {
  const db = createAdminClient();
  const hace60 = fechaBogota(new Date(Date.now() - 60 * 86_400_000).toISOString());
  const [pend, res] = await Promise.all([
    db.from("procesos_contratacion").select(COLUMNAS).in("correo_estado", ["validado", "inscrito"]).in("estado", ESTADOS_EN_CURSO).is("psicotecnica_resultado", null).order("correo_validado_at", { ascending: true }).limit(500),
    db.from("procesos_contratacion").select(COLUMNAS).not("psicotecnica_resultado", "is", null).gte("psicotecnica_fecha", hace60).order("psicotecnica_fecha", { ascending: false }).limit(200),
  ]);
  const ajustes = await leerAjustes().catch(() => []);
  const dias = Math.max(1, Number(valorAjuste<unknown>(ajustes, "psico_dias_para_presentar", 3)) || 3);
  const cortes = cortesPsico((k) => valorAjuste<unknown>(ajustes, k, undefined));
  if (pend.error || res.error) return { porInscribir: [], esperando: [], conResultado: [], diasParaPresentar: dias, cortes, error: "Falta aplicar las migraciones del correo para la psicosensotécnica o de la entrega 4." };
  const pendientes = (pend.data ?? []).map((p) => aAspirante(p as Record<string, unknown>));
  const veces = await reprogramacionesDe(pendientes.map((a) => a.procesoId)).catch(() => new Map());
  const limite = Date.now() - dias * 86_400_000;
  for (const a of pendientes) {
    const v = veces.get(a.procesoId);
    if (v) {
      a.reprogramaciones = v.n;
      a.ultimaRazon = v.ultima;
    }
    a.demorado = !!a.inscritoAt && new Date(a.inscritoAt).getTime() < limite;
  }
  return {
    diasParaPresentar: dias,
    cortes,
    porInscribir: pendientes.filter((a) => !a.inscritoAt),
    esperando: pendientes.filter((a) => a.inscritoAt).sort((a, b) => String(a.inscritoAt).localeCompare(String(b.inscritoAt))),
    conResultado: (res.data ?? []).map((p) => aAspirante(p as Record<string, unknown>)),
  };
}

/** La plantilla de carga masiva de PsicoAlianza, llena con esos aspirantes. */
export async function plantillaPsicoAlianza(procesoIds: string[]): Promise<{ ok: true; archivo: Buffer; filas: number } | { ok: false; error: string }> {
  if (!procesoIds.length) return { ok: false, error: "Elija al menos un aspirante." };
  const { data, error } = await createAdminClient().from("procesos_contratacion").select("id, cedula, correo, correo_estado").in("id", procesoIds.slice(0, 1000));
  if (error) return { ok: false, error: error.message };
  const filas = (data ?? []).filter((p) => p.cedula && p.correo && (p.correo_estado === "validado" || p.correo_estado === "inscrito"));
  if (!filas.length) return { ok: false, error: "Ninguno de los elegidos tiene el correo confirmado." };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(HOJA_PLANTILLA);
  ws.columns = [
    { header: COLUMNAS_PLANTILLA[0], key: "doc", width: 18, style: { numFmt: "@" } },
    { header: COLUMNAS_PLANTILLA[1], key: "email", width: 38 },
  ];
  ws.getRow(1).font = { bold: true };
  // El documento como texto: sin decimales ni notación científica, como lo espera la plataforma.
  for (const p of filas) ws.addRow({ doc: String(p.cedula).replace(/\D/g, ""), email: String(p.correo).trim().toLowerCase() });
  return { ok: true, archivo: Buffer.from(await wb.xlsx.writeBuffer()), filas: filas.length };
}

export async function marcarInscritos(procesoIds: string[], actor: ActorProceso): Promise<{ marcados: number; errores: { procesoId: string; error: string }[] }> {
  const r = { marcados: 0, errores: [] as { procesoId: string; error: string }[] };
  for (const id of procesoIds.slice(0, 500)) {
    const x = await marcarInscritoPsico(id, actor).catch((e: Error) => ({ ok: false, error: e.message }));
    if (x.ok) r.marcados++;
    else r.errores.push({ procesoId: id, error: x.error ?? "No se pudo marcar." });
  }
  return r;
}

/**
 * No la presentó o no la terminó (24-nov-2026): vuelve a «Por inscribir» para
 * subirlo otra vez en la plantilla de la plataforma; al marcarlo inscrito se le
 * vuelve a avisar. Queda en el historial con la razón y la vez.
 */
export async function reprogramarPsico(procesoId: string, razon: EstadoPrueba, actor: ActorProceso): Promise<{ ok: boolean; error?: string; vez?: number }> {
  if (razon !== "no_presento" && razon !== "incompleta") return { ok: false, error: "Razón no válida." };
  const db = createAdminClient();
  const { data: p } = await db.from("procesos_contratacion").select("estado, correo_estado, psicotecnica_resultado").eq("id", procesoId).maybeSingle();
  if (!p) return { ok: false, error: "El proceso no existe." };
  if (p.estado === "cierre" || p.estado === "contratado") return { ok: false, error: "El proceso está cerrado o contratado." };
  if (p.psicotecnica_resultado) return { ok: false, error: "Ya tiene resultado de la prueba." };
  if (p.correo_estado !== "inscrito" && p.correo_estado !== "validado") return { ok: false, error: "No estaba inscrito en la plataforma." };
  if (p.correo_estado === "inscrito") {
    const { data } = await db
      .from("procesos_contratacion")
      .update({ correo_estado: "validado", correo_inscrito_at: null, correo_inscrito_por: null })
      .eq("id", procesoId)
      .eq("correo_estado", "inscrito")
      .select("id");
    if (!data?.length) return { ok: false, error: "Alguien más ya lo cambió." };
  }
  const vez = ((await reprogramacionesDe([procesoId])).get(procesoId)?.n ?? 0) + 1;
  await registrarEvento(procesoId, { tipo: "dato", detalle: { psico_reprogramada: razon, vez } }, actor);
  return { ok: true, vez };
}

// ── Resultados ───────────────────────────────────────────────────────────────

export interface ArchivoSubido {
  nombre: string;
  mime: string;
  buffer: Buffer;
}

export interface FilaVista extends FilaResultado {
  /** «archivo#fila» o «cc:123»: para confirmar. */
  clave: string;
  archivo: number;
  nombreArchivo: string;
  esPdf: boolean;
  /** Los PDF de este aspirante (uno por prueba), para guardarlos en su carpeta. */
  archivos: number[];
  /** Cada prueba con su concepto y porcentaje (queda en el proceso como «entidad»). */
  detalle: string | null;
  /** Algún concepto salió del porcentaje (el informe lo trae como imagen): hay que confirmarlo. */
  deducido: boolean;
  procesoId: string | null;
  nombreProceso: string | null;
  estadoProceso: string | null;
  prueba: boolean;
  /** El concepto que ya tenía (se reemplaza al confirmar). */
  previo: ResultadoPsicoExterna | null;
  aviso: string | null;
}

const esPdf = (a: ArchivoSubido) => a.mime === "application/pdf" || /\.pdf$/i.test(a.nombre);
const esHoja = (a: ArchivoSubido) => /\.(xlsx|xls|csv)$/i.test(a.nombre) || /spreadsheet|excel|csv/i.test(a.mime);

/** Lee los archivos y arma la vista previa (no guarda nada). */
export async function vistaResultados(archivos: ArchivoSubido[]): Promise<{ filas: FilaVista[]; errores: string[] }> {
  const db = createAdminClient();
  const errores: string[] = [];
  const crudas: (FilaResultado & { archivo: number; archivos: number[]; detalle: string | null; deducido: boolean; alertas: string[] })[] = [];
  // (estadoPrueba viene en FilaResultado: «no_presento» o «incompleta»)
  const informes: (InformePrueba & { archivo: number })[] = [];
  // Las cédulas de quienes esperan resultado ayudan a encontrar la del PDF.
  const { data: espera } = await db.from("procesos_contratacion").select("cedula").in("correo_estado", ["validado", "inscrito"]).in("estado", ESTADOS_EN_CURSO);
  const conocidas = (espera ?? []).map((p) => String(p.cedula ?? "").replace(/\D/g, "")).filter(Boolean);
  const ajustes = await leerAjustes().catch(() => []);
  const cortes = cortesPsico((k) => valorAjuste<unknown>(ajustes, k, undefined));

  for (const [i, a] of archivos.entries()) {
    try {
      if (esPdf(a)) {
        const { text } = await extractText(await getDocumentProxy(new Uint8Array(a.buffer)), { mergePages: true });
        const r = leerInformePsicoAlianza(String(text), a.nombre, conocidas, cortes);
        if (!r.cedula && !r.resultado) errores.push(`«${a.nombre}»: no se encontró la cédula ni el resultado en el PDF (¿es una imagen escaneada?).`);
        informes.push({ ...r, archivo: i });
      } else if (esHoja(a)) {
        const wb = XLSX.read(a.buffer, { type: "buffer", cellDates: true });
        let algo = false;
        for (const nombreHoja of wb.SheetNames) {
          const filas = leerFilasResultados(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombreHoja], { header: 1, raw: true, defval: null, blankrows: false }));
          if (!filas) continue;
          algo = true;
          crudas.push(...filas.map((f) => ({ ...f, archivo: i, archivos: [], detalle: null, deducido: false, alertas: [] })));
        }
        if (!algo) errores.push(`«${a.nombre}»: no se encontraron las columnas de documento y resultado (concepto).`);
      } else {
        errores.push(`«${a.nombre}»: suba el Excel o CSV de resultados, o el informe en PDF.`);
      }
    } catch (e) {
      errores.push(`«${a.nombre}»: no se pudo leer (${e instanceof Error ? e.message : String(e)}).`);
    }
  }

  // Las pruebas de un mismo aspirante (Ethikos, Ten DISC…) en una sola fila.
  const grupos = new Map<string, (InformePrueba & { archivo: number })[]>();
  for (const x of informes) {
    const k = x.cedula ? `cc:${x.cedula}` : `pdf:${x.archivo}`;
    grupos.set(k, [...(grupos.get(k) ?? []), x]);
  }
  for (const g of grupos.values()) {
    const c = combinarPruebas(g);
    crudas.push({
      fila: 1,
      archivo: g[0].archivo,
      archivos: g.map((x) => x.archivo),
      cedula: g[0].cedula,
      nombre: g.find((x) => x.nombre)?.nombre ?? null,
      concepto: c.detalle,
      resultado: c.resultado,
      fecha: c.fecha,
      puntaje: c.puntaje,
      detalle: c.detalle,
      deducido: c.deducido,
      alertas: c.alertas,
      estadoPrueba: c.incompleta ? "incompleta" : null,
    });
  }

  // A qué proceso corresponde cada cédula: el abierto, si hay; si no, el más reciente.
  const cedulas = [...new Set(crudas.map((c) => c.cedula).filter((c): c is string => !!c))];
  const porCedula = new Map<string, Record<string, unknown>>();
  for (let k = 0; k < cedulas.length; k += 200) {
    const { data } = await db.from("procesos_contratacion").select("id, nombre, cedula, estado, origen, psicotecnica_resultado, created_at").in("cedula", cedulas.slice(k, k + 200)).order("created_at", { ascending: false });
    for (const p of data ?? []) {
      const c = String(p.cedula).replace(/\D/g, "");
      const actual = porCedula.get(c);
      const abierto = (ESTADOS_EN_CURSO as readonly string[]).includes(String(p.estado));
      if (!actual || (abierto && !(ESTADOS_EN_CURSO as readonly string[]).includes(String(actual.estado)))) porCedula.set(c, p as Record<string, unknown>);
    }
  }

  const filas: FilaVista[] = crudas.map((c) => {
    const p = c.cedula ? porCedula.get(c.cedula) : undefined;
    const avisos: string[] = [];
    if (!c.cedula) avisos.push("Sin cédula: elija a quién corresponde o descártelo.");
    else if (!p) avisos.push("No hay un proceso con esa cédula.");
    if (c.estadoPrueba) avisos.push(`${c.estadoPrueba === "incompleta" ? "No la terminó" : "No la presentó"}: se propone volver a inscribirlo en vez de guardar un resultado.`);
    else if (!c.resultado) avisos.push(c.archivos.length ? "Alguna prueba no trae resultado: elíjalo." : c.concepto ? `No se entiende el concepto «${c.concepto}»: elíjalo.` : "Sin concepto: elíjalo.");
    if (c.deducido) avisos.push(`El concepto de alguna prueba viene como imagen en el PDF: se dedujo del porcentaje (${textoCortes(cortes)}). Confírmelo con el informe y márquelo para guardar.`);
    avisos.push(...c.alertas);
    if (p && p.psicotecnica_resultado) avisos.push("Ya tenía un concepto: se reemplaza.");
    if (p && ["cierre", "contratado"].includes(String(p.estado))) avisos.push(`El proceso está ${p.estado === "cierre" ? "cerrado" : "contratado"}.`);
    return {
      ...c,
      clave: c.archivos.length && c.cedula ? `cc:${c.cedula}` : `${c.archivo}#${c.fila}`,
      nombreArchivo: c.archivos.length > 1 ? `${c.archivos.length} informes` : archivos[c.archivo].nombre,
      esPdf: esPdf(archivos[c.archivo]),
      procesoId: (p?.id as string | undefined) ?? null,
      nombreProceso: (p?.nombre as string | undefined) ?? c.nombre ?? null,
      estadoProceso: (p?.estado as string | undefined) ?? null,
      prueba: p?.origen === "chat_prueba",
      previo: (p?.psicotecnica_resultado as ResultadoPsicoExterna | undefined) ?? null,
      aviso: avisos.join(" ") || null,
    };
  });
  return { filas, errores };
}

export interface ResultadoAConfirmar {
  clave: string;
  procesoId: string;
  resultado: ResultadoPsicoExterna;
  fecha: string | null;
  puntaje: number | null;
  /** Índices de los PDF subidos de este aspirante, para guardarlos en su carpeta. */
  archivos: number[];
  /** Detalle por prueba («Ethikos: Recomendado (82 %) · Ten DISC: …»). */
  detalle?: string | null;
}

/** Guarda los resultados que la persona confirmó (y el PDF en la carpeta). */
export async function guardarResultados(
  filas: ResultadoAConfirmar[],
  archivos: ArchivoSubido[],
  actor: ActorProceso
): Promise<{ guardados: number; errores: { clave: string; error: string }[] }> {
  const hoy = fechaBogota(new Date().toISOString());
  const r = { guardados: 0, errores: [] as { clave: string; error: string }[] };
  for (const f of filas.slice(0, 500)) {
    const entidad = f.detalle ? `${ENTIDAD_PSICO} · ${f.detalle}`.slice(0, 120) : ENTIDAD_PSICO;
    const x = await registrarPsicotecnicaExterna(f.procesoId, { resultado: f.resultado, fecha: f.fecha ?? hoy, puntaje: f.puntaje ?? "", entidad }, actor);
    if (!x.ok) {
      r.errores.push({ clave: f.clave, error: x.error ?? "No se pudo guardar." });
      continue;
    }
    r.guardados++;
    for (const i of f.archivos ?? []) {
      const a = archivos[i];
      if (!a || !esPdf(a)) continue;
      await guardarAdjuntoSeleccion({ procesoId: f.procesoId, tipo: "psicotecnica", nombre: a.nombre, mime: "application/pdf", buffer: a.buffer }, actor).catch((e) =>
        r.errores.push({ clave: f.clave, error: `El concepto quedó, pero «${a.nombre}» no se guardó en la carpeta (${e instanceof Error ? e.message : String(e)}).` })
      );
    }
  }
  return r;
}
