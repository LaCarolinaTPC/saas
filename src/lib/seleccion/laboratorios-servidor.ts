/**
 * Laboratorios, órdenes de exámenes y documentos del aspirante (Salud
 * Ocupacional, 21-nov-2026). Solo servidor; quien llama revisa los permisos.
 * Reglas puras en ./laboratorios y el rellenado del Word en ./documento-word.
 *
 * - Cada aspirante tiene su laboratorio (procesos_contratacion.laboratorio_id,
 *   o el predeterminado); la fase 2 va al mismo.
 * - Al aspirante se le envían la orden de servicio y la carta del banco por
 *   WhatsApp como documentos. Con la ventana de 24 h cerrada quedan pendientes
 *   y salen cuando vuelva a escribir.
 * - Al laboratorio, la orden del día: por correo (todos los aspirantes en un
 *   correo, con sus órdenes adjuntas) o por WhatsApp (una plantilla por aspirante).
 * - Con candidatos del chat de prueba, o con `simular`, no sale nada: se
 *   devuelve lo que habría salido (simulador de Selección).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { horaBogota, ventanaAbierta } from "@/lib/comunicaciones/seguimiento";
import { enviarMedio, subirMedioAMeta } from "@/lib/comunicaciones/whatsapp";
import { normalizarTelefono, obtenerOCrearConversacion, registrarSaliente } from "@/lib/comunicaciones/registro";
import { correoConfigurado, enviarCorreo } from "@/lib/correo/enviar";
import { destinoDePrueba } from "@/lib/entorno-pruebas";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { fechaEnTexto, horaEnTexto, siguienteDiaHabil } from "./agenda";
import { conversacionDeProceso } from "./agenda-servidor";
import { BUCKET_SELECCION } from "./carpeta-servidor";
import { MIME_DOCX_DOCUMENTO, marcasDeDocx, rellenarDocx } from "./documento-word";
import { marcasDePdf, rellenarPdf, type FirmaCarta } from "./documento-pdf";
import { FIRMA_SELECCION, enviarMensajeSeleccion, prepararMensaje } from "./envio";
import { marcarTipoContacto } from "./laboratorio-servidor";
import {
  DIAS_SEMANA, cargoDocumentos, archivoCarta, archivoOrden, armarCorreoOrden, atiende, elegirLaboratorio, faltantesLaboratorio, laboratorioPorTurno, primeraFechaAtendida,
  type AspiranteOrden, type CorreoOrden, type Laboratorio, type ModoReparto,
} from "./laboratorios";
import { leerAjustes, leerMensaje, valorAjuste } from "./servidor";
import { primerNombre } from "./mensajes";

const COLUMNAS_BASE = "id, nombre, direccion, telefono_contacto, canal, whatsapp, correos, correos_copia, asunto, plantilla_orden_ruta, activo, predeterminado, orden";
/** Con el reparto y los días de atención (migración 20261121202736). */
const COLUMNAS = `${COLUMNAS_BASE}, dias_atencion, dias_preferidos, porcentaje`;
const RUTA_CARTA = "plantillas/carta-banco.docx";
// 23-nov-2026: la carta también puede subirse en PDF (el Word guardado como PDF, con las marcas) y sale en PDF.
const RUTA_CARTA_PDF = "plantillas/carta-banco.pdf";
const MIME_PDF = "application/pdf";
const esPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";
const rutaOrden = (labId: string) => `plantillas/laboratorios/${labId}.docx`;

// ── Laboratorios ─────────────────────────────────────────────────────────────

/** Todos los laboratorios, en su orden. Vacío si falta la migración 20261121194842. */
export async function leerLaboratorios(): Promise<Laboratorio[]> {
  const db = createAdminClient();
  const leer = (cols: string) => db.from("seleccion_laboratorios").select(cols).order("orden").order("nombre");
  let r = await leer(COLUMNAS);
  // Sin la migración 20261121202736: sin días ni porcentaje (atienden de lunes a sábado).
  if (r.error) r = await leer(COLUMNAS_BASE);
  if (r.error) return [];
  return (r.data ?? []) as unknown as Laboratorio[];
}

export async function laboratorioPorId(id: string | null | undefined): Promise<Laboratorio | null> {
  if (!id) return null;
  return (await leerLaboratorios()).find((l) => l.id === id) ?? null;
}

// ── Reparto y días de atención (21-nov-2026) ─────────────────────────────────

export async function modoReparto(): Promise<ModoReparto> {
  return String(valorAjuste<unknown>(await leerAjustes(), "laboratorio_reparto", "predeterminado")) === "porcentaje" ? "porcentaje" : "predeterminado";
}

export async function guardarReparto(modo: ModoReparto, usuario: string | null): Promise<{ ok: boolean; error?: string }> {
  if (modo !== "predeterminado" && modo !== "porcentaje") return { ok: false, error: "Reparto no válido." };
  const { data, error } = await createAdminClient().from("seleccion_ajustes").update({ valor: modo, actualizado_por: usuario }).eq("clave", "laboratorio_reparto").select("clave");
  if (error || !data?.length) return { ok: false, error: error?.message ?? "Falta aplicar la migración 20261121202736." };
  return { ok: true };
}

/** Aspirantes asignados a cada laboratorio en los últimos 30 días (citas de fase 1, sin el chat de prueba). */
export async function asignacionesRecientes(): Promise<Record<string, number>> {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("seleccion_citas")
    .select("proceso_id, procesos_contratacion!inner(laboratorio_id, origen)")
    .eq("tipo", "examen_f1")
    .gte("created_at", desde)
    .limit(5000);
  if (error) return {};
  const conteo: Record<string, number> = {};
  for (const c of data ?? []) {
    const p = (Array.isArray(c.procesos_contratacion) ? c.procesos_contratacion[0] : c.procesos_contratacion) as { laboratorio_id: string | null; origen: string | null } | null;
    if (!p?.laboratorio_id || p.origen === "chat_prueba") continue;
    conteo[p.laboratorio_id] = (conteo[p.laboratorio_id] ?? 0) + 1;
  }
  return conteo;
}

/** Laboratorio que le tocó al último aspirante de prueba (para repartirlos por turnos); null si no hay. */
async function ultimoLaboratorioDePrueba(excepto: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("procesos_contratacion_eventos")
    .select("proceso_id, created_at, procesos_contratacion!inner(laboratorio_id, origen)")
    .eq("tipo", "laboratorio")
    .eq("procesos_contratacion.origen", "chat_prueba")
    .neq("proceso_id", excepto)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return null;
  for (const e of data ?? []) {
    const p = (Array.isArray(e.procesos_contratacion) ? e.procesos_contratacion[0] : e.procesos_contratacion) as { laboratorio_id: string | null } | null;
    if (p?.laboratorio_id) return p.laboratorio_id;
  }
  return null;
}

/**
 * Fecha y laboratorio de la fase 1: si ese día no atiende ningún laboratorio,
 * la cita pasa al siguiente día hábil en que alguno atienda; después se elige
 * el laboratorio (preferido del día, predeterminado o por porcentaje).
 */
export async function planFase1(fechaPropuesta: string): Promise<{ fecha: string; laboratorio: Laboratorio | null; motivo: string }> {
  const labs = await leerLaboratorios();
  if (!labs.length) return { fecha: fechaPropuesta, laboratorio: null, motivo: "No hay laboratorios configurados." };
  const fecha = primeraFechaAtendida(fechaPropuesta, labs, siguienteDiaHabil) ?? fechaPropuesta;
  const e = elegirLaboratorio(labs, fecha, await modoReparto(), await asignacionesRecientes());
  const corrida = fecha !== fechaPropuesta ? ` La cita pasa al ${fechaEnTexto(fecha)} porque el ${fechaEnTexto(fechaPropuesta)} no atiende ningún laboratorio.` : "";
  return { fecha, laboratorio: e.laboratorio, motivo: `${e.motivo}${corrida}` };
}

/** Para la fase 2: la primera fecha (desde la propuesta) en que atiende el laboratorio del aspirante. */
export async function fechaFase2(procesoId: string, fechaPropuesta: string): Promise<string> {
  const lab = await laboratorioDeProceso(procesoId);
  if (!lab) return fechaPropuesta;
  return primeraFechaAtendida(fechaPropuesta, [{ ...lab, activo: true }], siguienteDiaHabil) ?? fechaPropuesta;
}

/** El laboratorio del aspirante: el suyo o, si no tiene, el predeterminado activo. */
export async function laboratorioDeProceso(procesoId: string): Promise<Laboratorio | null> {
  const db = createAdminClient();
  const { data: p, error } = await db.from("procesos_contratacion").select("laboratorio_id").eq("id", procesoId).maybeSingle();
  if (error) return null;
  const propio = await laboratorioPorId((p?.laboratorio_id as string | null) ?? null);
  if (propio) return propio;
  return (await leerLaboratorios()).find((l) => l.activo && l.predeterminado) ?? null;
}

/** Fija el laboratorio del aspirante (al citar la fase 1, o lo cambia una persona). */
export async function asignarLaboratorio(procesoId: string, laboratorioId: string | null, actor: ActorProceso): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  const lab = laboratorioId ? await laboratorioPorId(laboratorioId) : null;
  if (laboratorioId && !lab) return { ok: false, error: "El laboratorio no existe." };
  const { data: antes } = await db.from("procesos_contratacion").select("laboratorio_id").eq("id", procesoId).maybeSingle();
  if ((antes?.laboratorio_id ?? null) === laboratorioId) return { ok: true };
  // No se manda a un laboratorio que no atiende el día de su cita de exámenes.
  if (lab) {
    const { data: citas } = await db
      .from("seleccion_citas")
      .select("fecha, tipo")
      .eq("proceso_id", procesoId)
      .in("tipo", ["examen_f1", "examen_f2"])
      .in("estado", ["programada", "confirmada"])
      .gte("fecha", fechaBogota(new Date().toISOString()));
    const choca = (citas ?? []).find((c) => !atiende(lab, c.fecha as string));
    if (choca) return { ok: false, error: `${lab.nombre} no atiende el ${fechaEnTexto(choca.fecha as string)}, día de su cita de ${choca.tipo === "examen_f2" ? "la fase 2" : "la fase 1"}.` };
  }
  const { error } = await db.from("procesos_contratacion").update({ laboratorio_id: laboratorioId }).eq("id", procesoId);
  if (error) return { ok: false, error: `No se pudo guardar (${error.message}). ¿Falta la migración 20261121194842?` };
  await registrarEvento(procesoId, { tipo: "laboratorio", detalle: { laboratorio: lab?.nombre ?? null } }, actor);
  return { ok: true };
}

/**
 * Deja el laboratorio del aspirante para la cita de fase 1 en `fecha`. Si ya
 * tiene uno que atiende ese día, lo conserva; si no, lo elige el reparto
 * (preferido del día, predeterminado o por porcentaje).
 */
export async function asegurarLaboratorio(procesoId: string, actor: ActorProceso, fecha?: string): Promise<Laboratorio | null> {
  const r = await laboratorioQueLeToca(procesoId, fecha);
  if (!r) return null;
  if (!r.yaAsignado) await asignarLaboratorio(procesoId, r.laboratorio.id, actor);
  return r.laboratorio;
}

/**
 * El laboratorio que le toca al aspirante para una cita en `fecha`, sin asignar
 * nada (23-nov-2026: «Listo para exámenes» lo muestra antes de confirmar). El
 * suyo si atiende ese día; si no, el del reparto (por turnos en el chat de prueba).
 */
export async function laboratorioQueLeToca(procesoId: string, fecha?: string): Promise<{ laboratorio: Laboratorio; yaAsignado: boolean } | null> {
  const db = createAdminClient();
  const { data: p, error } = await db.from("procesos_contratacion").select("laboratorio_id, origen").eq("id", procesoId).maybeSingle();
  if (error) return null;
  const actual = await laboratorioPorId((p?.laboratorio_id as string | null) ?? null);
  if (actual && actual.activo && (!fecha || atiende(actual, fecha))) return { laboratorio: actual, yaAsignado: true };
  const labs = await leerLaboratorios();
  const elegido = !fecha
    ? labs.find((l) => l.activo && l.predeterminado) ?? null
    : p?.origen === "chat_prueba"
      ? laboratorioPorTurno(labs, fecha, await ultimoLaboratorioDePrueba(procesoId)).laboratorio
      : elegirLaboratorio(labs, fecha, await modoReparto(), await asignacionesRecientes()).laboratorio;
  return elegido ? { laboratorio: elegido, yaAsignado: false } : null;
}

export interface DatosLaboratorio {
  id?: string | null;
  nombre: string;
  direccion: string | null;
  telefono_contacto: string | null;
  canal: "whatsapp" | "correo";
  whatsapp: string | null;
  correos: string[];
  correos_copia: string[];
  asunto: string | null;
  activo: boolean;
  predeterminado: boolean;
  dias_atencion?: number[];
  dias_preferidos?: number[];
  porcentaje?: number;
  frase_apto?: string | null;
  frase_no_apto?: string | null;
  frase_aplazado?: string | null;
}

const diasValidos = (d: number[] | undefined) => [...new Set((d ?? []).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();

/** Crea o actualiza un laboratorio. Su número de WhatsApp queda marcado como laboratorio. */
export async function guardarLaboratorio(d: DatosLaboratorio, usuario: string | null): Promise<{ ok: boolean; error?: string; id?: string }> {
  const nombre = d.nombre.trim();
  const whatsapp = d.whatsapp?.trim() ? normalizarTelefono(d.whatsapp) : null;
  if (d.whatsapp?.trim() && !whatsapp) return { ok: false, error: "El número de WhatsApp no es válido." };
  const fila = {
    nombre,
    direccion: d.direccion?.trim() || null,
    telefono_contacto: d.telefono_contacto?.trim() || null,
    canal: (d.canal === "whatsapp" ? "whatsapp" : "correo") as Laboratorio["canal"],
    whatsapp,
    correos: d.correos,
    correos_copia: d.correos_copia,
    asunto: d.asunto?.trim() || null,
    activo: d.activo,
    predeterminado: d.predeterminado && d.activo,
    actualizado_por: usuario,
    updated_at: new Date().toISOString(),
  };
  const falta = d.activo ? faltantesLaboratorio(fila) : [];
  if (falta.length) return { ok: false, error: `Falta ${falta.join(" y ")}.` };
  const reparto = d.dias_atencion
    ? { dias_atencion: diasValidos(d.dias_atencion), dias_preferidos: diasValidos(d.dias_preferidos), porcentaje: Math.min(100, Math.max(0, Math.round(Number(d.porcentaje) || 0))) }
    : null;
  if (reparto && d.activo && !reparto.dias_atencion.length) return { ok: false, error: "Marque al menos un día de atención." };
  if (reparto) {
    const fuera = reparto.dias_preferidos.filter((x) => !reparto.dias_atencion.includes(x));
    if (fuera.length) return { ok: false, error: `No puede ser el preferido un día que no atiende (${fuera.map((x) => DIAS_SEMANA[x].toLowerCase()).join(", ")}).` };
  }
  const db = createAdminClient();
  // Uno solo predeterminado.
  if (fila.predeterminado) await db.from("seleccion_laboratorios").update({ predeterminado: false }).eq("predeterminado", true).neq("id", d.id ?? "00000000-0000-0000-0000-000000000000");
  const frases =
    d.frase_apto !== undefined || d.frase_no_apto !== undefined || d.frase_aplazado !== undefined
      ? {
          frase_apto: d.frase_apto?.trim().slice(0, 200) || null,
          frase_no_apto: d.frase_no_apto?.trim().slice(0, 200) || null,
          frase_aplazado: d.frase_aplazado?.trim().slice(0, 200) || null,
        }
      : null;
  const conReparto = { ...fila, ...(reparto ?? {}), ...(frases ?? {}) };
  const guardar = (valores: Record<string, unknown>) =>
    d.id
      ? db.from("seleccion_laboratorios").update(valores).eq("id", d.id).select("id").single()
      : db.from("seleccion_laboratorios").insert(valores).select("id").single();
  let r = await guardar(conReparto);
  // Sin la migración 20261124181735 no existen las frases: se guarda lo demás y se avisa.
  if (r.error && frases && /frase_/.test(r.error.message)) {
    r = await guardar(reparto ? { ...fila, ...reparto } : fila);
    if (!r.error) return { ok: false, error: "Se guardó el laboratorio, pero las frases no: falta aplicar la migración 20261124181735." };
  }
  if (r.error) return { ok: false, error: /duplicate|unique/i.test(r.error.message) ? "Ya hay un laboratorio con ese nombre." : r.error.message };
  if (whatsapp) {
    // Lo que escriba desde ese número se lee como resultados, y el asistente no le contesta.
    await obtenerOCrearConversacion(whatsapp, nombre);
    await marcarTipoContacto(whatsapp, "laboratorio");
  }
  return { ok: true, id: r.data.id as string };
}

// ── Plantillas en Word ───────────────────────────────────────────────────────

async function descargar(ruta: string | null | undefined): Promise<Buffer | null> {
  if (!ruta) return null;
  const { data } = await createAdminClient().storage.from(BUCKET_SELECCION).download(ruta);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

async function subir(ruta: string, contenido: Buffer): Promise<string | null> {
  const { error } = await createAdminClient().storage.from(BUCKET_SELECCION).upload(ruta, contenido, { contentType: esPdf(contenido) ? MIME_PDF : MIME_DOCX_DOCUMENTO, upsert: true });
  return error ? error.message : null;
}

/** Revisa que sea un .docx (o, si se permite, un PDF) con marcas conocidas; devuelve las marcas o el error. */
async function validarPlantilla(contenido: Buffer, permitirPdf = false): Promise<{ marcas: string[] } | { error: string }> {
  if (esPdf(contenido) && !permitirPdf) return { error: "Esta plantilla va en Word (.docx)." };
  try {
    const marcas = esPdf(contenido) ? await marcasDePdf(new Uint8Array(contenido)) : await marcasDeDocx(contenido);
    if (!marcas.includes("nombre") || !marcas.includes("cedula")) return { error: "La plantilla debe tener al menos las marcas {nombre} y {cedula}." };
    return { marcas };
  } catch {
    return { error: "El archivo no es un Word .docx (si es .doc, ábralo en Word y guárdelo como .docx)." };
  }
}

export async function subirPlantillaOrden(labId: string, contenido: Buffer, usuario: string | null): Promise<{ ok: boolean; error?: string; marcas?: string[] }> {
  const v = await validarPlantilla(contenido);
  if ("error" in v) return { ok: false, error: v.error };
  const ruta = rutaOrden(labId);
  const e = await subir(ruta, contenido);
  if (e) return { ok: false, error: e };
  await createAdminClient().from("seleccion_laboratorios").update({ plantilla_orden_ruta: ruta, actualizado_por: usuario, updated_at: new Date().toISOString() }).eq("id", labId);
  return { ok: true, marcas: v.marcas };
}

export async function subirPlantillaCarta(contenido: Buffer, usuario: string | null): Promise<{ ok: boolean; error?: string; marcas?: string[] }> {
  const v = await validarPlantilla(contenido, true);
  if ("error" in v) return { ok: false, error: v.error };
  const ruta = esPdf(contenido) ? RUTA_CARTA_PDF : RUTA_CARTA;
  const e = await subir(ruta, contenido);
  if (e) return { ok: false, error: e };
  await createAdminClient().from("seleccion_ajustes").update({ valor: ruta, actualizado_por: usuario }).eq("clave", "carta_banco_ruta");
  return { ok: true, marcas: v.marcas };
}

// ── Firma de la carta del banco (24-nov-2026) ──────────────────────────────
// Nombre y cargo de quien firma: ajustes carta_firmante y carta_firmante_cargo.
// La firma y el sello: imágenes en el bucket de Selección, en rutas fijas.

export type ImagenCarta = "firma" | "sello";
const RUTA_IMAGEN: Record<ImagenCarta, string> = { firma: "plantillas/carta-firma", sello: "plantillas/carta-sello" };

/** Quién firma y las imágenes, para escribir la carta. Lo que falte queda como está en la plantilla. */
export async function firmaCarta(): Promise<FirmaCarta> {
  const ajustes = await leerAjustes().catch(() => []);
  const [firma, sello] = await Promise.all([descargar(RUTA_IMAGEN.firma), descargar(RUTA_IMAGEN.sello)]);
  return {
    nombre: String(valorAjuste(ajustes, "carta_firmante", "") ?? "").trim() || null,
    cargo: String(valorAjuste(ajustes, "carta_firmante_cargo", "") ?? "").trim() || null,
    firma: firma ? new Uint8Array(firma) : null,
    sello: sello ? new Uint8Array(sello) : null,
  };
}

/** Para la pantalla: el nombre, el cargo y las imágenes (como data URL, para verlas). */
export async function estadoFirmaCarta(): Promise<{ nombre: string; cargo: string; firma: string | null; sello: string | null }> {
  const f = await firmaCarta();
  const dataUrl = (b: Uint8Array | null | undefined) => (b ? `data:${b[0] === 0x89 ? "image/png" : "image/jpeg"};base64,${Buffer.from(b).toString("base64")}` : null);
  return { nombre: f.nombre ?? "", cargo: f.cargo ?? "", firma: dataUrl(f.firma), sello: dataUrl(f.sello) };
}

export async function guardarFirmante(nombre: string, cargo: string, usuario: string | null): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  for (const [clave, valor, etiqueta, orden] of [
    ["carta_firmante", nombre.trim().slice(0, 120), "Nombre de quien firma la carta del banco", 321],
    ["carta_firmante_cargo", cargo.trim().slice(0, 120), "Cargo de quien firma la carta del banco", 322],
  ] as const) {
    const { error } = await db
      .from("seleccion_ajustes")
      .upsert({ clave, grupo: "dato", nombre: etiqueta, orden, valor, valor_sugerido: "", unidad: "texto", origen: "Gestión Humana, 24-nov-2026", entrega: 3, actualizado_por: usuario, updated_at: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Sube la firma o el sello: PNG (mejor con fondo transparente) o JPG, hasta 1,5 MB. */
export async function subirImagenCarta(tipo: ImagenCarta, contenido: Buffer): Promise<{ ok: boolean; error?: string }> {
  const png = contenido[0] === 0x89 && contenido[1] === 0x50;
  const jpg = contenido[0] === 0xff && contenido[1] === 0xd8;
  if (!png && !jpg) return { ok: false, error: "La imagen debe ser PNG o JPG." };
  if (contenido.length > 1_500_000) return { ok: false, error: "La imagen pesa más de 1,5 MB." };
  const { error } = await createAdminClient().storage.from(BUCKET_SELECCION).upload(RUTA_IMAGEN[tipo], contenido, { contentType: png ? "image/png" : "image/jpeg", upsert: true });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function quitarImagenCarta(tipo: ImagenCarta): Promise<{ ok: boolean; error?: string }> {
  const { error } = await createAdminClient().storage.from(BUCKET_SELECCION).remove([RUTA_IMAGEN[tipo]]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Ruta de la carta del banco (ajuste carta_banco_ruta). */
async function rutaCarta(): Promise<string | null> {
  const r = String(valorAjuste(await leerAjustes(), "carta_banco_ruta", "") ?? "").trim();
  return r || null;
}

/** Qué plantillas hay y sus marcas (para la pantalla de configuración). */
export async function estadoPlantillas(): Promise<{ carta: string[] | null; ordenes: Record<string, string[] | null> }> {
  const labs = await leerLaboratorios();
  const marcas = async (ruta: string | null) => {
    const b = await descargar(ruta);
    return b ? (esPdf(b) ? marcasDePdf(new Uint8Array(b)) : marcasDeDocx(b)).catch(() => null) : null;
  };
  const ordenes: Record<string, string[] | null> = {};
  for (const l of labs) ordenes[l.id] = await marcas(l.plantilla_orden_ruta);
  return { carta: await marcas(await rutaCarta()), ordenes };
}

// ── Documentos del aspirante ─────────────────────────────────────────────────

interface ProcesoDoc {
  id: string;
  nombre: string;
  cedula: string;
  origen: string | null;
  celular: string | null;
  cargo: string;
}

/** Cargo de la carta y la orden: ajuste «cargo_documentos» o CONDUCTOR - COBRADOR. */
async function cargoConfigurado(): Promise<string> {
  return cargoDocumentos(valorAjuste<unknown>(await leerAjustes(), "cargo_documentos", ""));
}

async function procesoParaDocumentos(procesoId: string): Promise<ProcesoDoc | null> {
  const { data } = await createAdminClient().from("procesos_contratacion").select("id, nombre, cedula, origen, celular").eq("id", procesoId).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    nombre: String(data.nombre ?? "").trim().toUpperCase(),
    cedula: String(data.cedula ?? "").trim(),
    origen: (data.origen as string | null) ?? null,
    celular: (data.celular as string | null) ?? null,
    cargo: await cargoConfigurado(),
  };
}

const ddmmaaaa = (f: string) => f.split("-").reverse().join("/");
const fechaLarga = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

function valoresDocumento(p: ProcesoDoc, lab: Laboratorio | null, cita: { fecha: string; hora: string } | null): Record<string, string> {
  const hoy = fechaBogota(new Date().toISOString());
  return {
    nombre: p.nombre,
    cedula: p.cedula,
    cargo: p.cargo,
    fecha: ddmmaaaa(hoy),
    fecha_larga: fechaLarga(hoy),
    fecha_cita: cita ? fechaEnTexto(cita.fecha) : "",
    hora: cita ? horaEnTexto(cita.hora) : "",
    laboratorio: lab?.nombre ?? "",
    laboratorio_direccion: lab?.direccion ?? "",
    laboratorio_telefono: lab?.telefono_contacto ?? "",
  };
}

export interface DocumentoGenerado {
  tipo: "orden" | "carta";
  nombre: string;
  contenido: Buffer;
  /** Word o, para la carta con plantilla en PDF, PDF. */
  mime: string;
  faltan: string[];
}

/** La orden de servicio y la carta del banco del aspirante, con sus datos. Sin plantilla, no se genera esa. */
export async function documentosAspirante(procesoId: string, cita: { fecha: string; hora: string } | null = null): Promise<{ documentos: DocumentoGenerado[]; avisos: string[] }> {
  const p = await procesoParaDocumentos(procesoId);
  if (!p) return { documentos: [], avisos: ["El proceso no existe."] };
  const lab = await laboratorioDeProceso(procesoId);
  const valores = valoresDocumento(p, lab, cita);
  const avisos: string[] = [];
  const documentos: DocumentoGenerado[] = [];
  const plantillaOrden = await descargar(lab?.plantilla_orden_ruta);
  if (plantillaOrden) {
    const r = await rellenarDocx(plantillaOrden, valores);
    documentos.push({ tipo: "orden", nombre: archivoOrden(p), contenido: r.docx, mime: MIME_DOCX_DOCUMENTO, faltan: r.faltan });
  } else {
    avisos.push(lab ? `El laboratorio ${lab.nombre} no tiene la plantilla de la orden (Candidatos › Selección › Laboratorios).` : "El aspirante no tiene laboratorio y no hay uno predeterminado.");
  }
  const plantillaCarta = await descargar(await rutaCarta());
  const firma = plantillaCarta ? await firmaCarta() : null;
  if (firma?.nombre) valores.firmante = firma.nombre;
  if (firma?.cargo) valores.firmante_cargo = firma.cargo;
  if (plantillaCarta && esPdf(plantillaCarta)) {
    const r = await rellenarPdf(new Uint8Array(plantillaCarta), valores, { firma });
    documentos.push({ tipo: "carta", nombre: archivoCarta(p, "pdf"), contenido: Buffer.from(r.pdf), mime: MIME_PDF, faltan: r.faltan });
  } else if (plantillaCarta) {
    const r = await rellenarDocx(plantillaCarta, valores);
    documentos.push({ tipo: "carta", nombre: archivoCarta(p), contenido: r.docx, mime: MIME_DOCX_DOCUMENTO, faltan: r.faltan });
  } else {
    avisos.push("No se ha subido la plantilla de la carta del banco (Candidatos › Selección › Laboratorios).");
  }
  return { documentos, avisos };
}

export type EnvioDocumentos = "enviado" | "pendiente_ventana" | "prueba" | "sin_documentos" | "sin_conversacion" | "fallido" | "ya_enviado";

export interface ResultadoDocumentos {
  resultado: EnvioDocumentos;
  documentos: { tipo: "orden" | "carta"; nombre: string }[];
  avisos: string[];
}

const TEXTO_DOCUMENTOS: Record<"orden" | "carta", string> = {
  orden: "Orden de exámenes médicos: llévala al laboratorio.",
  carta: "Carta de autorización para abrir su cuenta de ahorros en el Banco de Bogotá: llévela impresa con su documento de identidad.",
};

/**
 * Le envía al aspirante la carta del banco por WhatsApp (cita de fase 1).
 * Desde el 23-nov-2026 la orden de exámenes ya no se le envía: va solo al
 * laboratorio (trae sus datos). Con la ventana cerrada quedan pendientes; con el chat de prueba o
 * `simular`, no sale nada. Marca la cita como enviada para no repetirla.
 */
export async function enviarDocumentosAspirante(citaId: string, opciones: { simular?: boolean; forzar?: boolean } = {}): Promise<ResultadoDocumentos> {
  const db = createAdminClient();
  const { data: cita } = await db.from("seleccion_citas").select("id, proceso_id, fecha, hora, orden_aspirante_at").eq("id", citaId).maybeSingle();
  if (!cita) return { resultado: "fallido", documentos: [], avisos: ["La cita no existe."] };
  if (cita.orden_aspirante_at && !opciones.forzar && !opciones.simular) return { resultado: "ya_enviado", documentos: [], avisos: [] };
  const procesoId = cita.proceso_id as string;
  const p = await procesoParaDocumentos(procesoId);
  const generados = await documentosAspirante(procesoId, { fecha: cita.fecha as string, hora: String(cita.hora) });
  // Al aspirante, solo la carta del banco: la orden es para el laboratorio.
  const documentos = generados.documentos.filter((d) => d.tipo === "carta");
  const avisos = generados.avisos.filter((a) => !/orden/i.test(a));
  const lista = documentos.map((d) => ({ tipo: d.tipo, nombre: d.nombre }));
  if (!documentos.length) return { resultado: "sin_documentos", documentos: lista, avisos };
  if (opciones.simular || p?.origen === "chat_prueba") {
    if (!opciones.simular) await db.from("seleccion_citas").update({ orden_aspirante_at: new Date().toISOString() }).eq("id", citaId);
    return { resultado: "prueba", documentos: lista, avisos };
  }
  const conv = p ? await conversacionDeProceso({ id: p.id, celular: p.celular, origen: p.origen, nombre: p.nombre }) : null;
  if (!conv) return { resultado: "sin_conversacion", documentos: lista, avisos };
  // Un documento solo sale con la ventana de 24 h abierta: si no, sale cuando el aspirante escriba.
  if (!ventanaAbierta(conv.ultimoEntranteAt, new Date())) return { resultado: "pendiente_ventana", documentos: lista, avisos };
  for (const d of documentos) {
    const subido = await subirMedioAMeta(d.contenido, d.mime, d.nombre);
    if (!subido.ok) return { resultado: "fallido", documentos: lista, avisos: [...avisos, `No se pudo subir ${d.nombre}: ${subido.error}`] };
    const caption = TEXTO_DOCUMENTOS[d.tipo];
    const envio = await enviarMedio(conv.telefono, { mediaId: subido.mediaId, tipo: "document", caption, nombreArchivo: d.nombre });
    await registrarSaliente(conv.id, envio, { contenido: caption, mediaTipo: "document", mediaId: subido.mediaId, mimeType: d.mime, nombreArchivo: d.nombre }, FIRMA_SELECCION, { automatico: true });
    if (!envio.ok) return { resultado: "fallido", documentos: lista, avisos: [...avisos, `WhatsApp rechazó ${d.nombre}: ${envio.errorMensaje ?? ""}`] };
  }
  await db.from("seleccion_citas").update({ orden_aspirante_at: new Date().toISOString() }).eq("id", citaId);
  await registrarEvento(procesoId, { tipo: "laboratorio", detalle: { documentos_enviados: lista.map((d) => d.nombre) } }, { tipo: "sistema", userId: null, userEmail: "Sistema" });
  return { resultado: "enviado", documentos: lista, avisos };
}

/**
 * El aspirante acaba de escribir: si tenía documentos pendientes (la ventana
 * estaba cerrada cuando se citó), salen ahora. Lo llama el webhook. Nunca lanza.
 */
export async function enviarDocumentosPendientes(conversacionId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: conv } = await db.from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
    if (!conv?.proceso_id) return;
    // Desde el 24-nov-2026 la carta es solo para quien dijo que no tiene cuenta en el Banco de Bogotá.
    const { data: banco, error: eBanco } = await db.from("procesos_contratacion").select("banco_cuenta, banco_preguntado_at").eq("id", conv.proceso_id).maybeSingle();
    if (!eBanco && banco?.banco_preguntado_at && banco.banco_cuenta !== "no") return;
    const { data: citas, error } = await db
      .from("seleccion_citas")
      .select("id")
      .eq("proceso_id", conv.proceso_id)
      .eq("tipo", "examen_f1")
      .is("orden_aspirante_at", null)
      .in("estado", ["programada", "confirmada"])
      .gte("fecha", fechaBogota(new Date().toISOString()))
      .limit(1);
    if (error || !citas?.length) return;
    await enviarDocumentosAspirante(citas[0].id as string);
  } catch (e) {
    console.error("[seleccion] documentos pendientes del aspirante:", e);
  }
}

// ── Orden al laboratorio ─────────────────────────────────────────────────────

/** Citas de exámenes del día en ese laboratorio (las del predeterminado incluyen a quien no tiene). */
export async function aspirantesDeOrden(labId: string, fecha: string, opciones: { incluirEnviadas?: boolean; incluirPrueba?: boolean } = {}): Promise<AspiranteOrden[]> {
  const db = createAdminClient();
  const cargo = await cargoConfigurado();
  const lab = await laboratorioPorId(labId);
  if (!lab) return [];
  const { data, error } = await db
    .from("seleccion_citas")
    .select("id, proceso_id, tipo, fecha, hora, orden_laboratorio_at, procesos_contratacion!inner(nombre, cedula, origen, laboratorio_id)")
    .in("tipo", ["examen_f1", "examen_f2"])
    .eq("fecha", fecha)
    .not("estado", "in", "(reprogramada,cancelada)")
    .order("hora");
  if (error) return [];
  type Fila = { id: string; proceso_id: string; tipo: string; fecha: string; hora: string; orden_laboratorio_at: string | null; procesos_contratacion: unknown };
  return ((data ?? []) as Fila[])
    .map((c) => ({ c, p: (Array.isArray(c.procesos_contratacion) ? c.procesos_contratacion[0] : c.procesos_contratacion) as { nombre: string; cedula: string; origen: string | null; laboratorio_id: string | null } }))
    .filter(({ p }) => (p.laboratorio_id ?? (lab.predeterminado ? lab.id : null)) === lab.id)
    .filter(({ c }) => opciones.incluirEnviadas || !c.orden_laboratorio_at)
    .filter(({ p }) => opciones.incluirPrueba || p.origen !== "chat_prueba")
    .map(({ c, p }) => {
      return {
        procesoId: c.proceso_id,
        citaId: c.id,
        nombre: String(p.nombre ?? "").toUpperCase(),
        cedula: String(p.cedula ?? ""),
        cargo,
        fase: c.tipo === "examen_f2" ? 2 : 1,
        fecha: fechaEnTexto(c.fecha),
        hora: horaEnTexto(String(c.hora)),
        prueba: p.origen === "chat_prueba",
      } satisfies AspiranteOrden;
    });
}

export interface VistaOrden {
  laboratorio: Pick<Laboratorio, "id" | "nombre" | "canal" | "whatsapp">;
  aspirantes: AspiranteOrden[];
  faltantes: string[];
  /** Por correo: el correo que saldría y los adjuntos. */
  correo: (CorreoOrden & { adjuntos: string[]; smtp: boolean }) | null;
  /** Por WhatsApp: un mensaje por aspirante y si hay plantilla aprobada (la ventana con un laboratorio casi nunca está abierta). */
  whatsapp: { telefono: string | null; mensajes: string[]; plantillaAprobada: boolean } | null;
}

/** Lo que saldría al enviar la orden del día a un laboratorio (vista previa y simulador). */
export async function vistaOrden(labId: string, fecha: string, opciones: { incluirEnviadas?: boolean; incluirPrueba?: boolean; citaIds?: string[] } = {}): Promise<VistaOrden | null> {
  const lab = await laboratorioPorId(labId);
  if (!lab) return null;
  let aspirantes = await aspirantesDeOrden(labId, fecha, opciones);
  if (opciones.citaIds?.length) aspirantes = aspirantes.filter((a) => opciones.citaIds!.includes(a.citaId));
  const faltantes = faltantesLaboratorio(lab);
  if (!lab.plantilla_orden_ruta && lab.canal === "correo") faltantes.push("la plantilla de la orden en Word (se adjunta al correo)");
  const base = { laboratorio: { id: lab.id, nombre: lab.nombre, canal: lab.canal, whatsapp: lab.whatsapp }, aspirantes, faltantes };
  if (lab.canal === "correo") {
    const correo = armarCorreoOrden(lab, aspirantes, new Date());
    return { ...base, correo: { ...correo, adjuntos: aspirantes.map(archivoOrden), smtp: correoConfigurado() }, whatsapp: null };
  }
  const { m } = await mensajeOrden();
  const mensajes = m ? aspirantes.map((a) => prepararMensaje(m, valoresWhatsApp(a)).texto) : [];
  return { ...base, correo: null, whatsapp: { telefono: lab.whatsapp, mensajes, plantillaAprobada: Boolean(m?.plantilla_estado === "APPROVED") } };
}

async function mensajeOrden() {
  const m = await leerMensaje("orden_laboratorio").catch(() => null);
  return { m };
}

const valoresWhatsApp = (a: AspiranteOrden): Record<string, string> => ({
  fecha: a.fecha,
  hora: a.hora,
  nombre: a.nombre,
  cedula: a.cedula,
  cargo: a.cargo,
  fase: String(a.fase),
  primer_nombre: primerNombre(a.nombre),
});

export interface ResultadoOrden {
  ok: boolean;
  error?: string;
  /** No salió nada: es una simulación o todos son del chat de prueba. */
  simulado: boolean;
  enviados: number;
  vista: VistaOrden | null;
  detalle: string[];
}

/**
 * Envía la orden del día al laboratorio. Los candidatos del chat de prueba (o
 * todo, con `simular`) no salen: se devuelve la vista de lo que habría salido.
 */
export async function enviarOrdenLaboratorio(
  labId: string,
  fecha: string,
  actor: ActorProceso,
  opciones: { simular?: boolean; citaIds?: string[] } = {}
): Promise<ResultadoOrden> {
  const db = createAdminClient();
  const vista = await vistaOrden(labId, fecha, { incluirPrueba: true, citaIds: opciones.citaIds, incluirEnviadas: opciones.simular });
  if (!vista) return { ok: false, error: "El laboratorio no existe.", simulado: false, enviados: 0, vista: null, detalle: [] };
  if (!vista.aspirantes.length) return { ok: false, error: "No hay aspirantes citados ese día en este laboratorio sin la orden enviada.", simulado: false, enviados: 0, vista, detalle: [] };
  const lab = (await laboratorioPorId(labId))!;
  // Entorno de pruebas con el laboratorio apuntando a un correo o número de prueba
  // (24-nov-2026): la orden de los candidatos de prueba también sale de verdad.
  const aDestinoDePrueba = !opciones.simular && (await destinoDePrueba(lab)) != null;
  const reales = opciones.simular ? [] : vista.aspirantes.filter((a) => !a.prueba || aDestinoDePrueba);
  const simulados = opciones.simular ? vista.aspirantes : vista.aspirantes.filter((a) => a.prueba && !aDestinoDePrueba);
  const marcar = async (citas: string[]) => {
    if (citas.length) await db.from("seleccion_citas").update({ orden_laboratorio_at: new Date().toISOString() }).in("id", citas);
  };
  // Lo simulado (chat de prueba o «Simular envío») queda en el registro como lo que habría salido.
  if (simulados.length) await registrarEnviosSimulados(lab, simulados, actor);
  if (!opciones.simular) await marcar(simulados.map((a) => a.citaId));
  if (!reales.length) return { ok: true, simulado: true, enviados: 0, vista, detalle: ["Simulación: no se envió nada."] };
  if (vista.faltantes.length) return { ok: false, error: `Al laboratorio le falta ${vista.faltantes.join(" y ")}.`, simulado: false, enviados: 0, vista, detalle: [] };

  const detalle: string[] = [];
  if (lab.canal === "correo") {
    if (!correoConfigurado()) return { ok: false, error: "El correo de salida no está configurado (SMTP_* en el servidor). Use la vista previa mientras tanto.", simulado: false, enviados: 0, vista, detalle };
    const adjuntos = [];
    for (const a of reales) {
      const { documentos, avisos } = await documentosAspirante(a.procesoId);
      const orden = documentos.find((d) => d.tipo === "orden");
      if (!orden) return { ok: false, error: avisos.join(" ") || `No se pudo generar la orden de ${a.nombre}.`, simulado: false, enviados: 0, vista, detalle };
      adjuntos.push({ nombre: orden.nombre, contenido: orden.contenido, mime: orden.mime });
    }
    const correo = armarCorreoOrden(lab, reales, new Date());
    const r = await enviarCorreo({ para: correo.para, copia: correo.copia, asunto: correo.asunto, texto: correo.texto, html: correo.html, adjuntos });
    await registrarEnvio({
      laboratorio_id: lab.id, canal: "correo", para: correo.para, copia: correo.copia, asunto: correo.asunto, cuerpo: correo.texto,
      adjuntos: adjuntos.map((a) => a.nombre), cita_ids: reales.map((a) => a.citaId), proceso_ids: reales.map((a) => a.procesoId),
      resultado: r.ok ? "enviado" : "fallido", error: r.ok ? null : r.error, enviado_por: actor.userEmail,
    });
    if (!r.ok) return { ok: false, error: `No se pudo enviar el correo: ${r.error}`, simulado: false, enviados: 0, vista, detalle };
    await marcar(reales.map((a) => a.citaId));
    detalle.push(`Correo enviado a ${correo.para.join(", ")}${correo.copia.length ? ` (copia: ${correo.copia.join(", ")})` : ""} con ${adjuntos.length} orden(es).`);
  } else {
    const telefono = normalizarTelefono(lab.whatsapp ?? "");
    const { m } = await mensajeOrden();
    if (!telefono || !m) return { ok: false, error: "Falta el número de WhatsApp del laboratorio o el mensaje «orden_laboratorio» (migración 20261121194842).", simulado: false, enviados: 0, vista, detalle };
    const conversacionId = await obtenerOCrearConversacion(telefono, lab.nombre);
    if (!conversacionId) return { ok: false, error: "No se pudo abrir la conversación con el laboratorio.", simulado: false, enviados: 0, vista, detalle };
    await marcarTipoContacto(telefono, "laboratorio");
    const { data: conv } = await db.from("wa_conversaciones").select("ultimo_entrante_at").eq("id", conversacionId).maybeSingle();
    for (const a of reales) {
      const r = await enviarMensajeSeleccion({ conversacionId, telefono, ultimoEntranteAt: (conv?.ultimo_entrante_at as string | null) ?? null, mensaje: m, valores: valoresWhatsApp(a) });
      await registrarEnvio({
        laboratorio_id: lab.id, canal: "whatsapp", para: [telefono], copia: [], asunto: null, cuerpo: prepararMensaje(m, valoresWhatsApp(a)).texto,
        adjuntos: [], cita_ids: [a.citaId], proceso_ids: [a.procesoId], resultado: r === "enviado" ? "enviado" : "fallido",
        error: r === "enviado" ? null : r, enviado_por: actor.userEmail,
      });
      detalle.push(`${a.nombre}: ${r === "enviado" ? "enviado" : r === "sin_plantilla" ? "no salió (falta la plantilla aprobada por Meta y la ventana está cerrada)" : r}`);
      if (r === "enviado") await marcar([a.citaId]);
    }
  }
  const enviados = detalle.filter((d) => !/no salió|fallido|borrador/.test(d)).length;
  for (const a of reales) await registrarEvento(a.procesoId, { tipo: "laboratorio", detalle: { orden_laboratorio: lab.nombre, canal: lab.canal } }, actor);
  return { ok: true, simulado: false, enviados: lab.canal === "correo" ? reales.length : enviados, vista, detalle };
}

// ── Registro de envíos y conversación con el laboratorio ────────────────────

interface FilaEnvio {
  laboratorio_id: string;
  canal: "whatsapp" | "correo";
  para: string[];
  copia: string[];
  asunto: string | null;
  cuerpo: string;
  adjuntos: string[];
  cita_ids: string[];
  proceso_ids: string[];
  resultado: "enviado" | "simulado" | "fallido";
  error: string | null;
  enviado_por: string | null;
}

/** Deja constancia del envío. Nunca lanza (sin la migración 20261121204148 no hay tabla). */
async function registrarEnvio(f: FilaEnvio): Promise<void> {
  const { error } = await createAdminClient().from("seleccion_envios_laboratorio").insert(f);
  if (error) console.warn("[seleccion] registro de envíos al laboratorio:", error.message);
}

/** Lo que habría salido para los aspirantes simulados: un correo con todos, o un WhatsApp por aspirante. */
async function registrarEnviosSimulados(lab: Laboratorio, aspirantes: AspiranteOrden[], actor: ActorProceso): Promise<void> {
  if (lab.canal === "correo") {
    const c = armarCorreoOrden(lab, aspirantes, new Date());
    await registrarEnvio({
      laboratorio_id: lab.id, canal: "correo", para: c.para, copia: c.copia, asunto: c.asunto, cuerpo: c.texto, adjuntos: aspirantes.map(archivoOrden),
      cita_ids: aspirantes.map((a) => a.citaId), proceso_ids: aspirantes.map((a) => a.procesoId), resultado: "simulado", error: null, enviado_por: actor.userEmail,
    });
    return;
  }
  const { m } = await mensajeOrden();
  for (const a of aspirantes) {
    await registrarEnvio({
      laboratorio_id: lab.id, canal: "whatsapp", para: lab.whatsapp ? [lab.whatsapp] : [], copia: [], asunto: null,
      cuerpo: m ? prepararMensaje(m, valoresWhatsApp(a)).texto : `Orden de ${a.nombre}, C.C. ${a.cedula}, fase ${a.fase}, ${a.fecha} ${a.hora}`,
      adjuntos: [], cita_ids: [a.citaId], proceso_ids: [a.procesoId], resultado: "simulado", error: null, enviado_por: actor.userEmail,
    });
  }
}

export interface MensajeHiloLaboratorio {
  id: string;
  direccion: "saliente" | "entrante";
  at: string;
  /** Saliente: la orden (correo o WhatsApp). */
  canal?: "whatsapp" | "correo";
  para?: string[];
  copia?: string[];
  asunto?: string | null;
  texto: string;
  adjuntos?: { nombre: string; procesoId: string }[];
  /**
   * Saliente: los aspirantes de la orden, con la fase y si siguen esperando ese
   * resultado (para responder rápido como el laboratorio en el chat de prueba).
   */
  aspirantes?: { procesoId: string; nombre: string; cedula: string; fase: 1 | 2; esperando: boolean }[];
  resultado?: "enviado" | "simulado" | "fallido";
  error?: string | null;
  /** Entrante: lo que leyó Gestivo y si ya se confirmó. */
  aviso?: {
    estado: string;
    nombre: string | null;
    cedula: string | null;
    fase: 1 | 2 | null;
    resultado: string | null;
    procesoId: string | null;
    procesoNombre: string | null;
    simulado: boolean;
  };
}

/**
 * La conversación con un laboratorio: las órdenes que se le enviaron (o
 * simularon) y lo que respondió, de lo más viejo a lo más nuevo. Con
 * `soloPrueba`, solo lo de los candidatos del chat de prueba y lo simulado.
 */
export async function hiloLaboratorio(labId: string, opciones: { soloPrueba?: boolean; dias?: number } = {}): Promise<MensajeHiloLaboratorio[]> {
  const db = createAdminClient();
  const desde = new Date(Date.now() - (opciones.dias ?? 30) * 86_400_000).toISOString();
  const [{ data: envios }, avisosR] = await Promise.all([
    db.from("seleccion_envios_laboratorio").select("*").eq("laboratorio_id", labId).gte("created_at", desde).order("created_at").limit(200),
    db
      .from("seleccion_avisos_laboratorio")
      .select("id, created_at, texto, nombre_leido, cedula_leida, fase, resultado_propuesto, proceso_id, estado, simulado, procesos_contratacion(nombre, origen)")
      .eq("laboratorio_id", labId)
      .gte("created_at", desde)
      .order("created_at")
      .limit(200),
  ]);
  // En el chat de prueba: lo simulado y lo que salió de verdad a un destino de prueba (se filtra abajo por los candidatos).
  const filasEnvio = (envios ?? []) as Record<string, unknown>[];
  // Aspirantes de cada orden: nombre, cédula, fase de la cita y si aún esperan ese resultado.
  const citaIds = [...new Set(filasEnvio.flatMap((e) => (e.cita_ids as string[]) ?? []))];
  const { data: citasOrden } = citaIds.length
    ? await db.from("seleccion_citas").select("id, tipo, proceso_id, procesos_contratacion(nombre, cedula, estado, origen)").in("id", citaIds)
    : { data: [] as Record<string, unknown>[] };
  const aspiranteDeCita = new Map(
    ((citasOrden ?? []) as Record<string, unknown>[]).map((c) => {
      const p = (Array.isArray(c.procesos_contratacion) ? c.procesos_contratacion[0] : c.procesos_contratacion) as { nombre?: string; cedula?: string; estado?: string; origen?: string | null } | null;
      const fase: 1 | 2 = c.tipo === "examen_f2" ? 2 : 1;
      return [
        c.id as string,
        {
          procesoId: c.proceso_id as string,
          nombre: String(p?.nombre ?? "").toUpperCase(),
          cedula: String(p?.cedula ?? ""),
          fase,
          esperando: p?.estado === (fase === 1 ? "en_examenes" : "en_examenes_fase2"),
          prueba: p?.origen === "chat_prueba",
        },
      ] as const;
    })
  );
  const deCandidatosDePrueba = (e: Record<string, unknown>) => {
    const ids = (e.cita_ids as string[]) ?? [];
    return ids.length > 0 && ids.every((id) => aspiranteDeCita.get(id)?.prueba);
  };
  const salientes: MensajeHiloLaboratorio[] = filasEnvio
    .filter((e) => !opciones.soloPrueba || e.resultado === "simulado" || deCandidatosDePrueba(e))
    .map((e) => {
      const procesos = (e.proceso_ids as string[]) ?? [];
      const nombres = (e.adjuntos as string[]) ?? [];
      const aspirantes = ((e.cita_ids as string[]) ?? [])
        .map((id) => aspiranteDeCita.get(id))
        .filter((a) => a != null)
        .map((a) => ({ procesoId: a.procesoId, nombre: a.nombre, cedula: a.cedula, fase: a.fase, esperando: a.esperando }));
      return {
        aspirantes,
        id: `e-${e.id as string}`,
        direccion: "saliente",
        at: e.created_at as string,
        canal: e.canal as "whatsapp" | "correo",
        para: (e.para as string[]) ?? [],
        copia: (e.copia as string[]) ?? [],
        asunto: (e.asunto as string | null) ?? null,
        texto: e.cuerpo as string,
        adjuntos: nombres.map((nombre, i) => ({ nombre, procesoId: procesos[i] ?? procesos[0] ?? "" })),
        resultado: e.resultado as "enviado" | "simulado" | "fallido",
        error: (e.error as string | null) ?? null,
      };
    });
  const entrantes: MensajeHiloLaboratorio[] = ((avisosR.data ?? []) as Record<string, unknown>[])
    .map((a) => ({ a, p: (Array.isArray(a.procesos_contratacion) ? a.procesos_contratacion[0] : a.procesos_contratacion) as { nombre?: string; origen?: string | null } | null }))
    .filter(({ a, p }) => !opciones.soloPrueba || a.simulado === true || p?.origen === "chat_prueba")
    .map(({ a, p }) => ({
      id: `a-${a.id as string}`,
      direccion: "entrante",
      at: a.created_at as string,
      texto: (a.texto as string | null) ?? "",
      aviso: {
        estado: a.estado as string,
        nombre: (a.nombre_leido as string | null) ?? null,
        cedula: (a.cedula_leida as string | null) ?? null,
        fase: (a.fase as 1 | 2 | null) ?? null,
        resultado: (a.resultado_propuesto as string | null) ?? null,
        procesoId: (a.proceso_id as string | null) ?? null,
        procesoNombre: p?.nombre ?? null,
        simulado: a.simulado === true,
      },
    }));
  return [...salientes, ...entrantes].sort((x, y) => x.at.localeCompare(y.at));
}

/** Citas de exámenes de candidatos de prueba en ese laboratorio sin la orden enviada (para el chat de prueba). */
export async function pendientesPrueba(labId: string): Promise<{ fecha: string; citaIds: string[]; nombres: string[] }[]> {
  const db = createAdminClient();
  const lab = await laboratorioPorId(labId);
  if (!lab) return [];
  const { data, error } = await db
    .from("seleccion_citas")
    .select("id, fecha, tipo, procesos_contratacion!inner(nombre, origen, laboratorio_id)")
    .in("tipo", ["examen_f1", "examen_f2"])
    .is("orden_laboratorio_at", null)
    .not("estado", "in", "(reprogramada,cancelada)")
    .gte("fecha", fechaBogota(new Date().toISOString()))
    .order("fecha");
  if (error) return [];
  const porFecha = new Map<string, { citaIds: string[]; nombres: string[] }>();
  for (const c of data ?? []) {
    const p = (Array.isArray(c.procesos_contratacion) ? c.procesos_contratacion[0] : c.procesos_contratacion) as { nombre: string; origen: string | null; laboratorio_id: string | null };
    if (p.origen !== "chat_prueba" || (p.laboratorio_id ?? (lab.predeterminado ? lab.id : null)) !== lab.id) continue;
    const g = porFecha.get(c.fecha as string) ?? { citaIds: [], nombres: [] };
    g.citaIds.push(c.id as string);
    g.nombres.push(`${p.nombre} (fase ${c.tipo === "examen_f2" ? 2 : 1})`);
    porFecha.set(c.fecha as string, g);
  }
  return [...porFecha.entries()].map(([fecha, g]) => ({ fecha, ...g }));
}

// ── Envío automático de la orden (23-nov-2026) ──────────────────────────────

/** Ajustes del envío automático: sí por defecto, correo diario a las 17:00. */
async function ajustesOrdenAutomatica(): Promise<{ automatica: boolean; hora: string }> {
  const a = await leerAjustes().catch(() => []);
  const hora = String(valorAjuste<unknown>(a, "orden_laboratorio_hora", "17:00") ?? "17:00").trim();
  return { automatica: valorAjuste<unknown>(a, "orden_laboratorio_automatica", true) !== false, hora: /^\d{2}:\d{2}$/.test(hora) ? hora : "17:00" };
}

/**
 * Al citar a exámenes (fase 1 o 2), con el envío automático: al laboratorio por
 * WhatsApp le sale la orden enseguida; al de correo, la manda el cron en el
 * correo del día (enviarOrdenesDelDia). Los candidatos del chat de prueba van
 * enseguida por cualquier canal (simulado), para no esperar la hora. Nunca lanza.
 */
export async function enviarOrdenAlCitar(citaId: string | null, actor: ActorProceso): Promise<void> {
  if (!citaId) return;
  try {
    if (!(await ajustesOrdenAutomatica()).automatica) return;
    const { data: c } = await createAdminClient()
      .from("seleccion_citas")
      .select("id, fecha, proceso_id, orden_laboratorio_at, procesos_contratacion!inner(origen)")
      .eq("id", citaId)
      .maybeSingle();
    if (!c || c.orden_laboratorio_at) return;
    const p = (Array.isArray(c.procesos_contratacion) ? c.procesos_contratacion[0] : c.procesos_contratacion) as { origen: string | null } | null;
    const lab = await laboratorioDeProceso(c.proceso_id as string);
    if (!lab) return;
    if (lab.canal === "whatsapp" || p?.origen === "chat_prueba") {
      const r = await enviarOrdenLaboratorio(lab.id, c.fecha as string, actor, { citaIds: [citaId] });
      if (!r.ok) console.warn("[seleccion] orden automática al laboratorio:", r.error);
    }
  } catch (e) {
    console.error("[seleccion] orden automática al laboratorio:", e);
  }
}

/**
 * Cron: con el envío automático, desde la hora del ajuste, a cada laboratorio
 * por correo le sale un correo con los citados del siguiente día hábil que aún
 * no tienen la orden (uno por fecha). Si ese día ya falló un envío a ese
 * laboratorio, no se reintenta solo (para no repetir correos fallidos cada 15
 * minutos): queda para «Enviar» a mano. Sin candidatos del chat de prueba.
 */
export async function enviarOrdenesDelDia(ahora: Date = new Date()): Promise<{ correos: number; errores: string[] }> {
  const { automatica, hora } = await ajustesOrdenAutomatica();
  if (!automatica || horaBogota(ahora) < hora) return { correos: 0, errores: [] };
  const db = createAdminClient();
  const hoy = fechaBogota(ahora.toISOString());
  const hasta = siguienteDiaHabil(hoy);
  const { data: citas, error } = await db
    .from("seleccion_citas")
    .select("id, fecha, procesos_contratacion!inner(origen, laboratorio_id)")
    .in("tipo", ["examen_f1", "examen_f2"])
    .in("estado", ["programada", "confirmada"])
    .is("orden_laboratorio_at", null)
    .gt("fecha", hoy)
    .lte("fecha", hasta)
    .limit(500);
  if (error || !citas?.length) return { correos: 0, errores: [] };
  const labs = (await leerLaboratorios()).filter((l) => l.activo);
  const predeterminado = labs.find((l) => l.predeterminado) ?? null;
  // Por laboratorio (solo los de correo) y fecha.
  const grupos = new Map<string, { lab: Laboratorio; fecha: string; citaIds: string[] }>();
  for (const c of citas) {
    const p = (Array.isArray(c.procesos_contratacion) ? c.procesos_contratacion[0] : c.procesos_contratacion) as { origen: string | null; laboratorio_id: string | null } | null;
    if (!p || p.origen === "chat_prueba") continue;
    const lab = labs.find((l) => l.id === p.laboratorio_id) ?? predeterminado;
    if (!lab || lab.canal !== "correo") continue;
    const k = `${lab.id}|${c.fecha}`;
    const g = grupos.get(k) ?? { lab, fecha: c.fecha as string, citaIds: [] };
    g.citaIds.push(c.id as string);
    grupos.set(k, g);
  }
  let correos = 0;
  const errores: string[] = [];
  const inicioHoy = new Date(`${hoy}T05:00:00Z`).toISOString();
  for (const g of grupos.values()) {
    const { count } = await db
      .from("seleccion_envios_laboratorio")
      .select("id", { count: "exact", head: true })
      .eq("laboratorio_id", g.lab.id)
      .eq("resultado", "fallido")
      .gte("created_at", inicioHoy);
    if (count) continue;
    const r = await enviarOrdenLaboratorio(g.lab.id, g.fecha, ACTOR_SISTEMA, { citaIds: g.citaIds });
    if (r.ok && !r.simulado) correos++;
    else if (!r.ok) errores.push(`${g.lab.nombre}: ${r.error ?? "no se pudo enviar"}`);
  }
  return { correos, errores };
}
