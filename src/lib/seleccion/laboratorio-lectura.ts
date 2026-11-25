/**
 * Mensajes del laboratorio (entrega 3, M3): lectura con el modelo del
 * asistente, avisos para confirmar y citas de exámenes (solo servidor; quien
 * llama revisa los permisos). Reglas puras en ./laboratorio.
 *
 * Cada mensaje de un contacto marcado como laboratorio queda como uno o
 * varios avisos en `seleccion_avisos_laboratorio`, con lo leído y el
 * aspirante sugerido. Al confirmarlo se registra el examen (como si lo
 * hubiera escrito una persona) y el archivo, si lo hay, pasa a la carpeta.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { configDocumentos, getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { generarRespuesta, leerImagen, type ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import { registrarConsumo, topeAlcanzado } from "./consumos-servidor";
import { guardarAdjuntoSeleccion, ADJUNTO_MIMES } from "./carpeta-servidor";
import { registrarExamen } from "./examenes-servidor";
import { esConversacionDeLaboratorio } from "./laboratorio-servidor";
import {
  asociarProceso, decidirResultado, faseDeEstado, frasesConDefecto, interpretarLecturaLaboratorio, lecturaSinModelo, resultadoPorFrase, sistemaLaboratorio,
  type FrasesLaboratorio, type LecturaLaboratorio, type ProcesoEnExamenes, type ResultadoLaboratorio,
} from "./laboratorio";

/** Lo registrado solo porque la respuesta traía la frase acordada (24-nov-2026). */
export interface ConfirmadoPorFrase {
  procesoId: string;
  fase: 1 | 2;
  resultado: ResultadoLaboratorio;
  /** El mensaje que le salió al aspirante (cita de la fase 2 o reconocimiento), para el chat de prueba. */
  texto?: string;
}

const ACTOR_FRASE: ActorProceso = { tipo: "sistema", userId: null, userEmail: "Laboratorio (frase acordada)" };

/** Las frases acordadas con el laboratorio; la de apto por defecto si no tiene (o falta la migración 20261124181735). */
async function frasesDeLaboratorio(laboratorioId: string | null | undefined): Promise<FrasesLaboratorio> {
  if (!laboratorioId) return frasesConDefecto(null);
  const { data, error } = await createAdminClient()
    .from("seleccion_laboratorios")
    .select("frase_apto, frase_no_apto, frase_aplazado")
    .eq("id", laboratorioId)
    .maybeSingle();
  if (error || !data) return frasesConDefecto(null);
  return frasesConDefecto({ apto: data.frase_apto as string | null, no_apto: data.frase_no_apto as string | null, aplazado: data.frase_aplazado as string | null });
}

/**
 * Responde solo con la frase (por WhatsApp, a la orden de un aspirante): si ese
 * laboratorio tiene un solo aspirante esperando resultado, es de él. La frase
 * de apto es la de la fase 1: para ella solo cuentan los que esperan la fase 1.
 */
async function unicoEsperando(
  laboratorioId: string | null | undefined,
  procesos: ProcesoEnExamenes[],
  resultado: ResultadoLaboratorio
): Promise<ProcesoEnExamenes | null> {
  const candidatos = resultado === "apto" ? procesos.filter((p) => faseDeEstado(p.estado) === 1) : procesos;
  if (!laboratorioId || !candidatos.length) return null;
  const { data } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id")
    .eq("laboratorio_id", laboratorioId)
    .in("id", candidatos.map((p) => p.id));
  const ids = new Set((data ?? []).map((x) => x.id as string));
  const delLab = candidatos.filter((p) => ids.has(p.id));
  return delLab.length === 1 ? delLab[0] : null;
}

const IMAGENES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 3_500_000;
/** Un PDF de resultados suele pesar menos; uno más grande queda para asignar a mano. */
const MAX_BYTES_PDF = 8_000_000;

async function procesosEnExamenes(): Promise<ProcesoEnExamenes[]> {
  const { data } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id, nombre, cedula, estado")
    .in("estado", ["en_examenes", "en_examenes_fase2"])
    .limit(500);
  return (data ?? []) as ProcesoEnExamenes[];
}

/**
 * Lee un mensaje entrante si la conversación es de un laboratorio. Lo llama el
 * webhook (después de guardar el mensaje). Nunca lanza: si el modelo falla, el
 * aviso queda igual, con lo que se pueda sacar del texto, para asignarlo a mano.
 */
export async function procesarMensajeLaboratorio(conversacionId: string, mensajeId: string): Promise<number> {
  if (!(await esConversacionDeLaboratorio(conversacionId))) return 0;
  const db = createAdminClient();
  const { data: m } = await db.from("wa_mensajes").select("id, contenido, media_tipo, media_path, mime_type, nombre_archivo").eq("id", mensajeId).maybeSingle();
  if (!m) return 0;
  const laboratorioId = await laboratorioDeConversacion(conversacionId);
  return (
    await leerYGuardarAvisos({
      texto: String(m.contenido ?? ""),
      mediaPath: (m.media_path as string | null) ?? null,
      mime: (m.mime_type as string | null) ?? null,
      nombreArchivo: (m.nombre_archivo as string | null) ?? null,
      waMensajeId: m.id as string,
      conversacionId,
      laboratorioId,
    })
  ).avisos;
}

/** El laboratorio configurado con el número de esta conversación, si lo hay. */
async function laboratorioDeConversacion(conversacionId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("wa_conversaciones").select("wa_contactos(telefono)").eq("id", conversacionId).maybeSingle();
  const tel = ((Array.isArray(data?.wa_contactos) ? data?.wa_contactos[0] : data?.wa_contactos) as { telefono?: string } | null)?.telefono ?? "";
  if (!tel) return null;
  const { data: labs, error } = await db.from("seleccion_laboratorios").select("id, whatsapp");
  if (error) return null;
  const ultimos = (v: string) => v.replace(/\D/g, "").slice(-10);
  return ((labs ?? []).find((l) => l.whatsapp && ultimos(l.whatsapp as string) === ultimos(tel))?.id as string | undefined) ?? null;
}

export interface EntradaLaboratorio {
  texto: string;
  /** Archivo ya guardado en el bucket «whatsapp». */
  mediaPath?: string | null;
  mime?: string | null;
  nombreArchivo?: string | null;
  waMensajeId?: string | null;
  conversacionId?: string | null;
  laboratorioId?: string | null;
  /** Lo creó el simulador de Selección (no llegó por WhatsApp). */
  simulado?: boolean;
}

/**
 * Lee lo que mandó el laboratorio (texto, foto o PDF) con el modelo del
 * asistente y deja un aviso por persona para que una persona lo confirme. Lo
 * usan el webhook y el simulador de Selección, para que el simulador pruebe
 * lo mismo. Nunca lanza.
 */
export async function leerYGuardarAvisos(
  e: EntradaLaboratorio
): Promise<{ avisos: number; lecturas: LecturaLaboratorio[]; ids: string[]; confirmados: ConfirmadoPorFrase[] }> {
  const db = createAdminClient();
  const m = { id: e.waMensajeId ?? null, media_path: e.mediaPath ?? null, mime_type: e.mime ?? null, nombre_archivo: e.nombreArchivo ?? null };
  const conversacionId = e.conversacionId ?? undefined;
  const texto = String(e.texto ?? "").trim();
  const textos = [texto, String(m.nombre_archivo ?? "")].filter(Boolean);
  let lecturas: LecturaLaboratorio[] | null = null;
  // Las frases acordadas (la de apto por defecto): la IA también reconoce sus variantes.
  const frases = await frasesDeLaboratorio(e.laboratorioId);
  const sistema = sistemaLaboratorio(frases);

  if (!(await topeAlcanzado())) {
    try {
      // Los resultados del laboratorio se leen con la IA de «Documentos», también si llegan como texto.
      const { config: delChat, claves } = await getAgenteConClaves();
      const config = configDocumentos(delChat);
      const mime = String(m.mime_type ?? "").split(";")[0].trim().toLowerCase();
      let r: Awaited<ReturnType<typeof generarRespuesta>> | null = null;
      const esPdf = mime === "application/pdf";
      if (m.media_path && (IMAGENES.has(mime) || esPdf)) {
        const { data: archivo } = await db.storage.from("whatsapp").download(m.media_path as string);
        const bytes = archivo ? Buffer.from(await archivo.arrayBuffer()) : null;
        if (bytes && bytes.length <= (esPdf ? MAX_BYTES_PDF : MAX_BYTES)) {
          const entrada: ImagenEntrada = { tipo: mime as ImagenEntrada["tipo"], base64: bytes.toString("base64"), nombre: (m.nombre_archivo as string | null) ?? undefined };
          const que = esPdf ? "Este PDF" : "Esta imagen";
          r = await leerImagen(config, claves, sistema, `${que} lo mandó el laboratorio. Extrae los resultados con el formato indicado.${textos.length ? `\nTexto que vino con el archivo: ${textos.join(" · ")}` : ""}`, entrada);
        }
      }
      if (!r && textos.length) {
        r = await generarRespuesta(config, claves, sistema, [{ role: "user", content: textos.join("\n") }]);
      }
      if (r) {
        lecturas = interpretarLecturaLaboratorio(r.texto);
        await registrarConsumo({ concepto: "laboratorio", proveedor: config.proveedor, modelo: r.modeloUsado, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, costoUsd: r.costoUsd ?? undefined, conversacionId });
      }
    } catch (e) {
      console.error("[seleccion] lectura del laboratorio:", e);
    }
  }
  // Sin modelo, un archivo muy pesado o una respuesta que no se entendió: las cédulas del texto.
  if (!lecturas) lecturas = lecturaSinModelo(textos);
  const procesos = await procesosEnExamenes();
  // Respondió solo con la frase, sin nombre ni cédula: es del único aspirante que espera en ese laboratorio.
  // Si esperan varios, no se adivina: queda un aviso con el resultado para que una persona elija a quién es.
  let fraseSinAspirante: ResultadoLaboratorio | null = null;
  if (!lecturas.length && texto) {
    const r = resultadoPorFrase(texto, { nombre: null, cedula: null }, false, frases);
    const p = r ? await unicoEsperando(e.laboratorioId, procesos, r) : null;
    if (r && p) lecturas = [{ nombre: p.nombre, cedula: p.cedula, fase: faseDeEstado(p.estado), resultado: r, observacion: null }];
    else if (r) fraseSinAspirante = r;
  }
  // Un saludo o una pregunta sin archivo no es un aviso.
  if (!lecturas.length && !m.media_path && !fraseSinAspirante) return { avisos: 0, lecturas, ids: [], confirmados: [] };

  // La frase acordada y la regla de la fase 1 (24-nov-2026): apto solo con la frase
  // o una variante; «aplazado» si lo dice; cualquier otro resultado, no apto.
  const variasPersonas = lecturas.length > 1;
  const base: LecturaLaboratorio[] = lecturas.length ? lecturas : [{ nombre: null, cedula: null, fase: null, resultado: fraseSinAspirante, observacion: null }];
  const asociados = base.map((l) => asociarProceso(l, procesos));
  const conFrase = base.map((l, i) => {
    const d = decidirResultado(texto, l, variasPersonas, frases, asociados[i] ? faseDeEstado(asociados[i]!.estado) : null, { soloArchivo: !texto && !!m.media_path });
    return { l: { ...l, resultado: d.resultado }, porFrase: d.automatico };
  });
  const filas = conFrase.map(({ l, porFrase }, i) => {
    const p = asociados[i];
    return {
      wa_mensaje_id: m.id,
      proceso_id: p?.id ?? null,
      texto: (texto || (m.nombre_archivo as string | null) || "").slice(0, 2000) || null,
      nombre_leido: l.nombre,
      cedula_leida: l.cedula,
      fase: l.fase ?? (p ? faseDeEstado(p.estado) : null),
      resultado_propuesto: l.resultado,
      media_path: (m.media_path as string | null) ?? null,
      // La observación del laboratorio va al final del texto, para no perderla.
      ...(l.observacion ? { texto: `${texto}${texto ? "\n" : ""}Observación leída: ${l.observacion}`.slice(0, 2000) } : {}),
      ...(e.simulado ? { simulado: true } : {}),
      ...(e.laboratorioId ? { laboratorio_id: e.laboratorioId } : {}),
      ...(porFrase ? { por_frase: true } : {}),
    };
  });
  let { data: creados, error } = await db.from("seleccion_avisos_laboratorio").insert(filas).select("id");
  // Sin la migración 20261121194842 no existen simulado ni laboratorio_id.
  if (error && /column|schema cache/i.test(error.message)) {
    const sinNuevas = filas.map((f) => {
      const c = { ...f } as Record<string, unknown>;
      delete c.simulado;
      delete c.laboratorio_id;
      delete c.por_frase;
      return c;
    });
    ({ data: creados, error } = await db.from("seleccion_avisos_laboratorio").insert(sinNuevas).select("id"));
  }
  if (error && /por_frase/.test(error.message)) {
    // Sin la migración 20261124181735: sin la marca, pero el aviso queda.
    const sinMarca = filas.map((f) => {
      const c = { ...f } as Record<string, unknown>;
      delete c.por_frase;
      return c;
    });
    ({ data: creados, error } = await db.from("seleccion_avisos_laboratorio").insert(sinMarca).select("id"));
  }
  if (error) console.error("[seleccion] avisos del laboratorio:", error.message);
  const ids = (creados ?? []).map((c) => c.id as string);

  // Con la frase acordada y el aspirante reconocido en la fase que corresponde, se registra solo.
  const confirmados: ConfirmadoPorFrase[] = [];
  for (const [i, { l, porFrase }] of conFrase.entries()) {
    const p = asociados[i];
    const id = ids[i];
    const faseEsperada = p ? faseDeEstado(p.estado) : null;
    const fase = l.fase ?? faseEsperada;
    if (!porFrase || !p || !id || !l.resultado || !fase || fase !== faseEsperada) continue;
    const r = await confirmarAviso(id, { procesoId: p.id, fase, resultado: l.resultado }, ACTOR_FRASE);
    if (r.ok) confirmados.push({ procesoId: p.id, fase, resultado: l.resultado, texto: r.texto });
    else console.warn("[seleccion] aviso por frase sin registrar:", r.error);
  }
  // 24-nov-2026: el archivo que manda el laboratorio con el resultado (Rescate suele mandar la
  // radiografía en otro mensaje) queda en la carpeta del aspirante. Subirlo no es obligatorio:
  // lo obligatorio es saber si es apto o no.
  if (!error) {
    await guardarArchivoDelMensaje({ ids, conFrase, asociados, mediaPath: m.media_path as string | null, laboratorioId: e.laboratorioId ?? null, confirmados }).catch((err) =>
      console.error("[seleccion] archivo del laboratorio:", err)
    );
  }
  return { avisos: error ? 0 : filas.length, lecturas, ids, confirmados };
}

/** Minutos en que un archivo suelto y el resultado del laboratorio se toman como del mismo aspirante. */
const VENTANA_ARCHIVO_MIN = 20;
const ACTOR_ARCHIVO: ActorProceso = { tipo: "sistema", userId: null, userEmail: "Laboratorio (archivo)" };

/** Pasa un archivo del bucket «whatsapp» a la carpeta del aspirante (exámenes de esa fase). */
async function guardarArchivoEnCarpeta(mediaPath: string, procesoId: string, fase: 1 | 2, actor: ActorProceso): Promise<boolean> {
  const db = createAdminClient();
  const { data: archivo } = await db.storage.from("whatsapp").download(mediaPath);
  const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "";
  const mime = Object.keys(ADJUNTO_MIMES).find((k) => ADJUNTO_MIMES[k] === (ext === "jpeg" ? "jpg" : ext)) ?? "";
  if (!archivo || !mime) return false;
  const nombre = mediaPath.split("/").pop() ?? `laboratorio.${ADJUNTO_MIMES[mime]}`;
  try {
    await guardarAdjuntoSeleccion({ procesoId, tipo: `examen_f${fase}`, nombre, mime, buffer: Buffer.from(await archivo.arrayBuffer()), origen: "whatsapp" }, actor);
    return true;
  } catch (e) {
    console.error("[seleccion] archivo del laboratorio a la carpeta:", e);
    return false;
  }
}

/** El aviso de un archivo queda resuelto: el archivo ya está en la carpeta de ese aspirante. */
async function marcarArchivoGuardado(avisoId: string, procesoId: string, fase: 1 | 2): Promise<void> {
  await createAdminClient()
    .from("seleccion_avisos_laboratorio")
    .update({ estado: "confirmado", proceso_id: procesoId, fase, resuelto_por: ACTOR_ARCHIVO.userEmail, resuelto_at: new Date().toISOString() })
    .eq("id", avisoId)
    .eq("estado", "pendiente");
}

/**
 * El único aspirante del que ese laboratorio habló en los últimos minutos (con
 * su fase). Si fueron varios, null: el archivo suelto lo asigna una persona.
 */
async function aspiranteRecienteDelLaboratorio(laboratorioId: string): Promise<{ procesoId: string; fase: 1 | 2 } | null> {
  const desde = new Date(Date.now() - VENTANA_ARCHIVO_MIN * 60_000).toISOString();
  const { data } = await createAdminClient()
    .from("seleccion_avisos_laboratorio")
    .select("proceso_id, fase, created_at")
    .eq("laboratorio_id", laboratorioId)
    .not("proceso_id", "is", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(20);
  const ids = new Set((data ?? []).map((a) => a.proceso_id as string));
  if (ids.size !== 1) return null;
  const a = data![0];
  return { procesoId: a.proceso_id as string, fase: a.fase === 2 ? 2 : 1 };
}

async function guardarArchivoDelMensaje(d: {
  ids: string[];
  conFrase: { l: LecturaLaboratorio; porFrase: boolean }[];
  asociados: (ProcesoEnExamenes | null)[];
  mediaPath: string | null;
  laboratorioId: string | null;
  confirmados: ConfirmadoPorFrase[];
}): Promise<void> {
  const db = createAdminClient();
  // 1. Un archivo de un solo aspirante.
  if (d.mediaPath && d.ids.length === 1) {
    const p = d.asociados[0];
    const l = d.conFrase[0].l;
    if (p && !l.resultado && !d.confirmados.some((c) => c.procesoId === p.id)) {
      // Se le reconoce el nombre (la radiografía lo trae) pero no trae resultado: va a su carpeta.
      const fase = l.fase ?? faseDeEstado(p.estado) ?? 1;
      if (await guardarArchivoEnCarpeta(d.mediaPath, p.id, fase, ACTOR_ARCHIVO)) await marcarArchivoGuardado(d.ids[0], p.id, fase);
      return;
    }
    if (!p && d.laboratorioId) {
      // Sin nombre: es del aspirante cuyo resultado mandó ese laboratorio hace un momento.
      const reciente = await aspiranteRecienteDelLaboratorio(d.laboratorioId);
      if (reciente && (await guardarArchivoEnCarpeta(d.mediaPath, reciente.procesoId, reciente.fase, ACTOR_ARCHIVO))) {
        await marcarArchivoGuardado(d.ids[0], reciente.procesoId, reciente.fase);
      }
      return;
    }
  }
  // 2. Al revés: el resultado llega después del archivo suelto (sin nombre) de hace un momento.
  if (!d.laboratorioId || !d.asociados.some(Boolean)) return;
  const reciente = await aspiranteRecienteDelLaboratorio(d.laboratorioId);
  if (!reciente) return;
  const desde = new Date(Date.now() - VENTANA_ARCHIVO_MIN * 60_000).toISOString();
  const { data: sueltos } = await db
    .from("seleccion_avisos_laboratorio")
    .select("id, media_path")
    .eq("laboratorio_id", d.laboratorioId)
    .eq("estado", "pendiente")
    .is("proceso_id", null)
    .not("media_path", "is", null)
    .gte("created_at", desde);
  for (const a of sueltos ?? []) {
    if (await guardarArchivoEnCarpeta(a.media_path as string, reciente.procesoId, reciente.fase, ACTOR_ARCHIVO)) {
      await marcarArchivoGuardado(a.id as string, reciente.procesoId, reciente.fase);
    }
  }
}

export interface AvisoLaboratorio {
  id: string;
  createdAt: string;
  texto: string | null;
  nombreLeido: string | null;
  cedulaLeida: string | null;
  fase: 1 | 2 | null;
  resultado: ResultadoLaboratorio | null;
  procesoId: string | null;
  procesoNombre: string | null;
  candidateId: string | null;
  tieneArchivo: boolean;
  urlArchivo: string | null;
  /** Lo creó el simulador de Selección: no llegó por WhatsApp. */
  simulado: boolean;
}

/** Avisos sin resolver, del más nuevo al más viejo. null si falta la migración. */
export async function avisosPendientes(): Promise<{ avisos: AvisoLaboratorio[]; procesos: ProcesoEnExamenes[] } | null> {
  const db = createAdminClient();
  const columnas = "id, created_at, texto, nombre_leido, cedula_leida, fase, resultado_propuesto, proceso_id, media_path, procesos_contratacion(nombre, candidate_id)";
  const consulta = (cols: string) => db.from("seleccion_avisos_laboratorio").select(cols).eq("estado", "pendiente").order("created_at", { ascending: false }).limit(100);
  let { data, error } = await consulta(`${columnas}, simulado`);
  // Sin la migración 20261121194842 no existe «simulado».
  if (error) ({ data, error } = await consulta(columnas));
  if (error) return null;
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const rutas = filas.map((a) => a.media_path as string | null).filter((r): r is string => !!r);
  const urls = new Map<string, string>();
  if (rutas.length) {
    const { data: firmadas } = await db.storage.from("whatsapp").createSignedUrls(rutas, 3600);
    for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }
  return {
    procesos: await procesosEnExamenes(),
    avisos: filas.map((a) => {
      const p = (Array.isArray(a.procesos_contratacion) ? a.procesos_contratacion[0] : a.procesos_contratacion) as { nombre?: string; candidate_id?: string | null } | null;
      return {
        id: a.id as string,
        createdAt: a.created_at as string,
        texto: (a.texto as string | null) ?? null,
        nombreLeido: (a.nombre_leido as string | null) ?? null,
        cedulaLeida: (a.cedula_leida as string | null) ?? null,
        fase: (a.fase as 1 | 2 | null) ?? null,
        resultado: (a.resultado_propuesto as ResultadoLaboratorio | null) ?? null,
        procesoId: (a.proceso_id as string | null) ?? null,
        procesoNombre: p?.nombre ?? null,
        candidateId: p?.candidate_id ?? null,
        tieneArchivo: !!a.media_path,
        urlArchivo: a.media_path ? (urls.get(a.media_path as string) ?? null) : null,
        simulado: (a as { simulado?: boolean }).simulado === true,
      };
    }),
  };
}

/**
 * Una persona confirma el aviso: registra el examen del aspirante (con lo que
 * propuso el laboratorio o lo que ella corrija) y pasa el archivo a la carpeta.
 */
export async function confirmarAviso(
  avisoId: string,
  d: { procesoId: string; fase: 1 | 2; resultado: ResultadoLaboratorio },
  actor: ActorProceso
): Promise<{ ok: boolean; error?: string; texto?: string; envio?: string }> {
  const db = createAdminClient();
  const { data: a } = await db.from("seleccion_avisos_laboratorio").select("id, estado, texto, media_path").eq("id", avisoId).maybeSingle();
  if (!a || a.estado !== "pendiente") return { ok: false, error: "El aviso ya no está pendiente." };
  // Lo que escribió el laboratorio queda como observación del examen.
  const observacion = String(a.texto ?? "").slice(0, 1000) || "Según el aviso del laboratorio";
  const r = await registrarExamen(d.procesoId, { fase: d.fase, resultado: d.resultado, observacion }, actor);
  if (!r.ok) return r;
  await db.from("seleccion_examenes").update({ propuesto_por_laboratorio: true }).eq("proceso_id", d.procesoId).eq("fase", d.fase);
  if (a.media_path) {
    try {
      const { data: archivo } = await db.storage.from("whatsapp").download(a.media_path as string);
      const ext = String(a.media_path).split(".").pop()?.toLowerCase() ?? "";
      const mime = Object.keys(ADJUNTO_MIMES).find((k) => ADJUNTO_MIMES[k] === (ext === "jpeg" ? "jpg" : ext)) ?? "";
      if (archivo && mime) {
        const nombre = String(a.media_path).split("/").pop() ?? `laboratorio.${ADJUNTO_MIMES[mime]}`;
        await guardarAdjuntoSeleccion({ procesoId: d.procesoId, tipo: `examen_f${d.fase}`, nombre, mime, buffer: Buffer.from(await archivo.arrayBuffer()) }, actor);
      }
    } catch (e) {
      console.error("[seleccion] archivo del laboratorio:", e);
    }
  }
  await db
    .from("seleccion_avisos_laboratorio")
    .update({ estado: "confirmado", proceso_id: d.procesoId, fase: d.fase, resultado_propuesto: d.resultado, resuelto_por: actor.userEmail, resuelto_at: new Date().toISOString() })
    .eq("id", avisoId);
  // El mensaje de la fase 2 (si lo hubo), para que el chat de prueba lo muestre.
  return { ok: true, texto: r.texto, envio: r.envio };
}

export async function descartarAviso(avisoId: string, actor: ActorProceso): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await createAdminClient()
    .from("seleccion_avisos_laboratorio")
    .update({ estado: "descartado", resuelto_por: actor.userEmail, resuelto_at: new Date().toISOString() })
    .eq("id", avisoId)
    .eq("estado", "pendiente")
    .select("id");
  if (error) return { ok: false, error: error.message };
  return data?.length ? { ok: true } : { ok: false, error: "El aviso ya no está pendiente." };
}

export interface CitaExamen {
  id: string;
  procesoId: string;
  candidateId: string | null;
  nombre: string;
  tipo: "examen_f1" | "examen_f2";
  fecha: string;
  hora: string;
  estado: string;
  estadoProceso: string;
}

/** Citas de exámenes en pie entre dos fechas (no salen en la agenda de la prueba de manejo). */
export async function citasDeExamenes(desde: string, hasta: string): Promise<CitaExamen[]> {
  const { data, error } = await createAdminClient()
    .from("seleccion_citas")
    .select("id, proceso_id, tipo, fecha, hora, estado, procesos_contratacion!inner(nombre, estado, origen, candidate_id)")
    .in("tipo", ["examen_f1", "examen_f2"])
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .not("estado", "in", "(reprogramada,cancelada)")
    .order("fecha")
    .order("hora");
  if (error) return [];
  return (data ?? [])
    .map((c) => {
      const p = (Array.isArray(c.procesos_contratacion) ? c.procesos_contratacion[0] : c.procesos_contratacion) as { nombre: string; estado: string; origen: string | null; candidate_id: string | null };
      return { c, p };
    })
    .filter(({ p }) => p.origen !== "chat_prueba")
    .map(({ c, p }) => ({
      id: c.id as string,
      procesoId: c.proceso_id as string,
      candidateId: p.candidate_id,
      nombre: p.nombre,
      tipo: c.tipo as CitaExamen["tipo"],
      fecha: c.fecha as string,
      hora: String(c.hora).slice(0, 5),
      estado: c.estado as string,
      estadoProceso: p.estado,
    }));
}
