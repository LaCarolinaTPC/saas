/**
 * «Documentos leídos» (entrega 4, R5): lo que se leyó de los archivos del
 * aspirante y su revisión por una persona. Aceptar un campo lo aplica al
 * proceso solo si el dato estaba vacío (y marca su origen como «leído»), crea
 * las referencias, marca el documento como recibido en la carpeta y copia el
 * archivo a la carpeta. Solo servidor; quien llama revisa los permisos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { firmarMedios } from "@/lib/comunicaciones/medios";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { ADJUNTO_MIMES, estadosCarpeta, guardarAdjuntoSeleccion, itemsCarpeta, marcarItemCarpeta, tipoDeItem } from "../carpeta-servidor";
import { cambiosParaProceso, conCalculados, conCedulaAlDia, itemDeClase, referenciasAceptadas, valorAceptado } from "./interpretar";
import type { CampoLeido, ClaseDocumento, DecisionCampo, ExperienciaLeida } from "./esquema";
import { agregarExperienciaLeida, experienciaDeProceso, registrarCartaLaboral } from "../experiencia-servidor";
import { cartaParaValidarSola } from "../experiencia";
import { leerAjustes, valorAjuste } from "../servidor";

export interface ArchivoLeido {
  lecturaId: string;
  waMensajeId: string | null;
  url: string | null;
  mime: string | null;
  nombre: string | null;
  adjuntoId: string | null;
}

export interface DocumentoLeidoVista {
  /** Fila que lleva los campos (la primera del documento). */
  id: string;
  clase: ClaseDocumento;
  estado: "pendiente" | "leido" | "ilegible" | "error" | "omitido";
  resumen: string | null;
  error: string | null;
  campos: CampoLeido[];
  archivos: ArchivoLeido[];
  modelo: string | null;
  costoUsd: number;
  revisadoPor: string | null;
  revisadoAt: string | null;
  createdAt: string;
}

interface FilaLectura {
  id: string;
  wa_mensaje_id: string | null;
  adjunto_id: string | null;
  conversacion_id: string | null;
  proceso_id: string | null;
  grupo: string | null;
  clase: ClaseDocumento;
  estado: DocumentoLeidoVista["estado"];
  campos: CampoLeido[] | null;
  resumen: string | null;
  error: string | null;
  modelo: string | null;
  costo_usd: number | string | null;
  revisado_por: string | null;
  revisado_at: string | null;
  created_at: string;
}

async function conversacionesDe(procesoId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("wa_conversaciones").select("id").eq("proceso_id", procesoId).limit(5);
  return (data ?? []).map((c) => c.id as string);
}

/** Lo leído del proceso, por documento (las fotos de un mismo documento juntas). null si falta la migración. */
export async function lecturasDeProceso(procesoId: string): Promise<DocumentoLeidoVista[] | null> {
  // Va dentro de un filtro .or(): solo un UUID.
  if (!/^[0-9a-f-]{36}$/i.test(procesoId)) return [];
  const db = createAdminClient();
  const convs = await conversacionesDe(procesoId);
  const filtro = [`proceso_id.eq.${procesoId}`, ...(convs.length ? [`conversacion_id.in.(${convs.join(",")})`] : [])].join(",");
  const { data, error } = await db.from("seleccion_lecturas").select("*").or(filtro).order("created_at", { ascending: true }).limit(100);
  if (error) return null;
  const filas = (data ?? []) as FilaLectura[];
  const ids = filas.map((f) => f.wa_mensaje_id).filter((x): x is string => !!x);
  const { data: msgs } = ids.length
    ? await db.from("wa_mensajes").select("id, media_path, mime_type, nombre_archivo").in("id", ids)
    : { data: [] as { id: string; media_path: string | null; mime_type: string | null; nombre_archivo: string | null }[] };
  const porId = new Map((msgs ?? []).map((m) => [m.id as string, m]));
  const urls = await firmarMedios((msgs ?? []).map((m) => (m.media_path as string | null) ?? "").filter(Boolean));

  const docs = new Map<string, DocumentoLeidoVista>();
  for (const f of filas) {
    const clave = f.grupo ?? f.id;
    const m = f.wa_mensaje_id ? porId.get(f.wa_mensaje_id) : undefined;
    const archivo: ArchivoLeido = {
      lecturaId: f.id,
      waMensajeId: f.wa_mensaje_id,
      url: m?.media_path ? (urls.get(m.media_path as string) ?? null) : null,
      mime: (m?.mime_type as string | null) ?? null,
      nombre: (m?.nombre_archivo as string | null) ?? null,
      adjuntoId: f.adjunto_id,
    };
    const d = docs.get(clave);
    if (d) {
      d.archivos.push(archivo);
      d.costoUsd += Number(f.costo_usd) || 0;
      if (f.campos?.length && !d.campos.length) d.campos = f.campos;
      continue;
    }
    docs.set(clave, {
      id: f.id,
      clase: f.clase,
      estado: f.estado,
      resumen: f.resumen,
      error: f.error,
      campos: f.campos ?? [],
      archivos: [archivo],
      modelo: f.modelo,
      costoUsd: Number(f.costo_usd) || 0,
      revisadoPor: f.revisado_por,
      revisadoAt: f.revisado_at,
      createdAt: f.created_at,
    });
  }
  // R2: la cédula leída se compara con la que el proceso tiene hoy, no con la del
  // día de la lectura (la foto pudo llegar antes de que existiera el proceso).
  const { data: proc } = await db.from("procesos_contratacion").select("cedula").eq("id", procesoId).maybeSingle();
  const cedula = (proc?.cedula as string | null) ?? null;
  return [...docs.values()].reverse().map((d) => ({ ...d, campos: conCedulaAlDia(d.clase, d.campos, cedula) }));
}

/**
 * Para el tablero (R2, 25-nov-2026): de esos procesos, los que tienen un documento
 * leído (cédula, hoja de vida o certificado bancario) cuya cédula no es la del
 * proceso y que nadie ha revisado todavía. Se compara con la cédula que el proceso
 * tiene hoy. Dos consultas para todo el tablero; vacío si falta la migración de la entrega 4.
 */
export async function procesosConCedulaDistinta(procesos: readonly { id: string; cedula: string | null }[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!procesos.length) return out;
  const db = createAdminClient();
  const cedulaDe = new Map(procesos.map((p) => [p.id, p.cedula]));
  // Las lecturas sin revisar de los últimos 90 días (no se filtra por proceso: con cientos de
  // procesos la dirección de la consulta no cabría); se cruzan aquí.
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: lecturas, error } = await db
    .from("seleccion_lecturas")
    .select("proceso_id, conversacion_id, clase, campos")
    .eq("estado", "leido")
    .is("revisado_at", null)
    .in("clase", ["cedula", "hoja_vida", "certificado_bancario"])
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error || !lecturas?.length) return out;
  // Las lecturas de antes de que existiera el proceso solo traen la conversación.
  const convIds = [...new Set(lecturas.filter((f) => !f.proceso_id && f.conversacion_id).map((f) => f.conversacion_id as string))].slice(0, 200);
  const { data: convs } = convIds.length ? await db.from("wa_conversaciones").select("id, proceso_id").in("id", convIds) : { data: [] as { id: string; proceso_id: string | null }[] };
  const procesoDeConv = new Map((convs ?? []).map((c) => [c.id as string, (c.proceso_id as string | null) ?? null]));
  for (const f of lecturas) {
    const procesoId = (f.proceso_id as string | null) ?? procesoDeConv.get(String(f.conversacion_id ?? "")) ?? null;
    if (!procesoId || !cedulaDe.has(procesoId)) continue;
    const campos = conCedulaAlDia(f.clase as ClaseDocumento, (f.campos as CampoLeido[] | null) ?? [], cedulaDe.get(procesoId));
    if (campos.some((c) => c.campo === "cedula_coincide" && c.valor === "no")) out.add(procesoId);
  }
  return out;
}

export interface DecisionEntrada {
  campo: string;
  decision: DecisionCampo;
  valor_final?: unknown;
}

/**
 * Guarda la revisión de un documento y aplica lo aceptado. `procesoId` es el
 * de la ficha (la lectura puede ser de antes de que existiera el proceso).
 */
export async function revisarLectura(
  procesoId: string,
  lecturaId: string,
  decisiones: DecisionEntrada[],
  actor: ActorProceso
): Promise<{ ok: boolean; error?: string; aplicados?: string[] }> {
  const db = createAdminClient();
  const { data: fila, error } = await db.from("seleccion_lecturas").select("*").eq("id", lecturaId).maybeSingle();
  if (error || !fila) return { ok: false, error: "No se encontró la lectura." };
  const f = fila as FilaLectura;
  const convs = await conversacionesDe(procesoId);
  if (f.proceso_id !== procesoId && !(f.conversacion_id && convs.includes(f.conversacion_id))) return { ok: false, error: "Esa lectura no es de este proceso." };

  const decididos = new Map(decisiones.map((d) => [d.campo, d]));
  const decidido: CampoLeido[] = (f.campos ?? []).map((c) => {
    const d = decididos.get(c.campo);
    if (c.calculado || !d || !["aceptado", "corregido", "rechazado"].includes(d.decision)) return c;
    const valorFinal = d.decision === "corregido" ? (typeof d.valor_final === "string" ? d.valor_final.trim().slice(0, 500) : d.valor_final) : null;
    return { ...c, decision: d.decision, valor_final: valorFinal };
  });
  const campos = conCalculados(decidido);
  const ahora = new Date().toISOString();
  const filasGrupo = f.grupo
    ? (((await db.from("seleccion_lecturas").select("id, wa_mensaje_id, adjunto_id").eq("grupo", f.grupo)).data ?? []) as Pick<FilaLectura, "id" | "wa_mensaje_id" | "adjunto_id">[])
    : [{ id: f.id, wa_mensaje_id: f.wa_mensaje_id, adjunto_id: f.adjunto_id }];
  await db.from("seleccion_lecturas").update({ campos, proceso_id: procesoId, revisado_por: actor.userEmail, revisado_at: ahora, updated_at: ahora }).eq("id", f.id);
  if (f.grupo) await db.from("seleccion_lecturas").update({ proceso_id: procesoId, revisado_por: actor.userEmail, revisado_at: ahora }).eq("grupo", f.grupo).neq("id", f.id);

  const aplicados: string[] = [];
  const algunoAceptado = campos.some((c) => c.decision === "aceptado" || c.decision === "corregido");

  // 1. Datos del proceso, solo los vacíos.
  const { data: proc } = await db
    .from("procesos_contratacion")
    .select("fecha_nacimiento, cedula_fecha_expedicion, experiencia_meses, licencia_restricciones, edad, datos_origen")
    .eq("id", procesoId)
    .maybeSingle();
  if (proc) {
    const { cambios, origen } = cambiosParaProceso(f.clase, campos, proc as Parameters<typeof cambiosParaProceso>[2], fechaBogota(ahora));
    if (Object.keys(cambios).length) {
      const datosOrigen = { ...((proc.datos_origen as Record<string, string> | null) ?? {}), ...origen };
      const { error: eProc } = await db.from("procesos_contratacion").update({ ...cambios, datos_origen: datosOrigen, updated_at: ahora }).eq("id", procesoId);
      if (!eProc) aplicados.push(...Object.keys(cambios));
    }
  }

  // 2. Referencias (sin repetir las que ya están por nombre o teléfono).
  const refs = referenciasAceptadas(campos);
  if (refs.length) {
    const { data: existentes } = await db.from("seleccion_referencias").select("nombre, telefono").eq("proceso_id", procesoId);
    const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const tel = (s: unknown) => String(s ?? "").replace(/\D/g, "");
    let nuevas = 0;
    for (const r of refs) {
      const repetida = (existentes ?? []).some((e) => (r.nombre && norm(e.nombre) === norm(r.nombre)) || (tel(r.telefono).length >= 7 && tel(e.telefono) === tel(r.telefono)));
      if (repetida) continue;
      const { error: eRef } = await db.from("seleccion_referencias").insert({
        proceso_id: procesoId,
        tipo: r.tipo,
        nombre: String(r.nombre ?? r.telefono ?? "Sin nombre").slice(0, 120),
        telefono: r.telefono ? String(r.telefono).slice(0, 30) : null,
        empresa: r.empresa ? String(r.empresa).slice(0, 120) : null,
        origen: f.clase === "carta_laboral" ? "carta laboral (leída)" : "hoja de vida (leída)",
        registrada_por: actor.userEmail,
      });
      if (!eRef) nuevas++;
    }
    if (nuevas) aplicados.push(`${nuevas} referencias`);
  }

  // 2b. Experiencia laboral: los empleos de la hoja de vida entran sin verificar;
  // la carta laboral verifica el de su empresa (o lo agrega ya verificado).
  if (f.clase === "hoja_vida") {
    const exp = campos.find((c) => c.campo === "experiencias");
    const lista = exp ? valorAceptado(exp) : null;
    if (Array.isArray(lista) && lista.length) {
      const n = await agregarExperienciaLeida(procesoId, lista as ExperienciaLeida[], actor);
      if (n) aplicados.push(`${n} empleos sin verificar`);
    }
  }
  if (f.clase === "carta_laboral") {
    const v = (k: string) => {
      const c = campos.find((x) => x.campo === k);
      const val = c ? valorAceptado(c) : null;
      return typeof val === "string" && val.trim() ? val.trim() : null;
    };
    const r = await registrarCartaLaboral(procesoId, { empresa: v("empresa"), cargo: v("cargo"), desde: v("desde"), hasta: v("hasta"), nombre: v("nombre") }, actor);
    const TEXTO_CARTA: Record<string, string> = {
      verificada: "experiencia verificada con la carta: coincide con la hoja de vida",
      con_diferencias: "experiencia verificada con la carta, con diferencias frente a la hoja de vida (revíselas en Experiencia)",
      agregada: "empleo agregado y verificado con la carta (no estaba en la hoja de vida)",
      otro_nombre: "la carta está a nombre de otra persona: no se verificó nada",
    };
    if (r) aplicados.push(TEXTO_CARTA[r]);
  }

  // 3. Carpeta: recibido (validar sigue siendo de una persona, a propósito) y copia del archivo.
  if (algunoAceptado || f.clase !== "otro") {
    const items = await itemsCarpeta();
    const item = itemDeClase(f.clase, items);
    if (item && algunoAceptado) {
      const actual = (await estadosCarpeta(procesoId)).find((e) => e.item === item)?.estado;
      if (!actual || actual === "pendiente") {
        const r = await marcarItemCarpeta(procesoId, item, "recibido", "Recibido por WhatsApp y revisado en «Documentos leídos»", actor);
        if (r.ok) aplicados.push(`«${item}» recibido`);
      }
    }
    if (algunoAceptado) {
      for (const g of filasGrupo) {
        if (g.adjunto_id || !g.wa_mensaje_id) continue;
        const { data: m } = await db.from("wa_mensajes").select("media_path, mime_type, nombre_archivo").eq("id", g.wa_mensaje_id).maybeSingle();
        const mime = String(m?.mime_type ?? "").split(";")[0].trim().toLowerCase();
        if (!m?.media_path || !(mime in ADJUNTO_MIMES)) continue;
        const { data: archivo } = await db.storage.from("whatsapp").download(m.media_path as string);
        if (!archivo) continue;
        try {
          const adjuntoId = await guardarAdjuntoSeleccion(
            {
              procesoId,
              tipo: item ? tipoDeItem(item) : "otro",
              nombre: (m.nombre_archivo as string | null) ?? `${f.clase}.${ADJUNTO_MIMES[mime]}`,
              mime,
              buffer: Buffer.from(await archivo.arrayBuffer()),
              origen: "whatsapp",
              waMensajeId: g.wa_mensaje_id,
            },
            actor
          );
          await db.from("seleccion_lecturas").update({ adjunto_id: adjuntoId }).eq("id", g.id);
        } catch (e) {
          console.error("[seleccion] copia del documento leído:", e);
        }
      }
    }
  }

  await registrarEvento(
    procesoId,
    {
      tipo: "carpeta",
      detalle: {
        lectura: f.clase,
        aceptados: campos.filter((c) => c.decision === "aceptado" || c.decision === "corregido").length,
        rechazados: campos.filter((c) => c.decision === "rechazado").length,
        aplicados,
      },
    },
    actor
  );
  return { ok: true, aplicados };
}

/** Quien valida sola una carta laboral (queda en la experiencia y en el historial). */
export const ACTOR_VALIDACION_AUTOMATICA: ActorProceso = { tipo: "sistema", userId: null, userEmail: "Gestivo (validación automática)" };

/**
 * Valida solas las cartas laborales leídas que coinciden con la hoja de vida
 * (pedido del 23-nov-2026, ajuste `validar_cartas_auto`, en «sí» por defecto):
 * se aceptan como lo haría Gestión Humana en «Documentos leídos», con lo que el
 * empleo queda verificado, la carta en la carpeta y sus referencias anotadas.
 * Solo cuando todo coincide y la IA leyó con confianza la empresa, el nombre,
 * el cargo y el inicio; lo demás sigue esperando a una persona. Se llama al
 * terminar cada lectura, así no importa si llegó antes la carta o la hoja de vida.
 * Devuelve cuántas validó.
 */
export async function validarCartasAutomaticas(procesoId: string): Promise<number> {
  if (!/^[0-9a-f-]{36}$/i.test(procesoId)) return 0;
  const ajustes = await leerAjustes().catch(() => []);
  if (valorAjuste<unknown>(ajustes, "validar_cartas_auto", true) === false) return 0;
  const db = createAdminClient();
  const convs = await conversacionesDe(procesoId);
  const filtro = [`proceso_id.eq.${procesoId}`, ...(convs.length ? [`conversacion_id.in.(${convs.join(",")})`] : [])].join(",");
  const { data, error } = await db
    .from("seleccion_lecturas")
    .select("*")
    .or(filtro)
    .is("revisado_at", null)
    .in("clase", ["hoja_vida", "carta_laboral"])
    .limit(50);
  if (error || !data?.length) return 0;
  const filas = data as FilaLectura[];
  const campo = (f: FilaLectura, k: string) => f.campos?.find((c) => c.campo === k);
  const cartas = filas.filter((f) => f.clase === "carta_laboral" && f.estado === "leido" && f.campos?.length);
  if (!cartas.length) return 0;
  // Los empleos de la hoja de vida leída que todavía nadie aceptó.
  const deHojaDeVida = filas
    .filter((f) => f.clase === "hoja_vida" && f.estado === "leido")
    .flatMap((f) => {
      const v = campo(f, "experiencias")?.valor;
      return Array.isArray(v) ? (v as ExperienciaLeida[]) : [];
    });
  const { data: p } = await db.from("procesos_contratacion").select("nombre").eq("id", procesoId).maybeSingle();
  const nombre = (p?.nombre as string | null) ?? null;

  let validadas = 0;
  for (const f of cartas) {
    const confiable = ["empresa", "nombre", "cargo", "desde"].every((k) => {
      const c = campo(f, k);
      return c != null && c.confianza !== "baja";
    });
    if (!confiable) continue;
    const texto = (k: string) => {
      const v = campo(f, k)?.valor;
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const carta = { empresa: texto("empresa"), cargo: texto("cargo"), desde: texto("desde"), hasta: texto("hasta"), nombre: texto("nombre") };
    const exp = await experienciaDeProceso(procesoId);
    if (!exp.disponible) return validadas;
    const decision = cartaParaValidarSola(exp.items, deHojaDeVida, carta, nombre);
    if (!decision.ok) continue;
    // El empleo que confirma todavía no estaba en la experiencia: entran todos los
    // de la hoja de vida leída (los demás sin verificar), para que la carta lo
    // verifique y el resumen no diga «toda verificada» mientras faltan los otros.
    if (decision.empleoNuevo) await agregarExperienciaLeida(procesoId, deHojaDeVida, ACTOR_VALIDACION_AUTOMATICA);
    const decisiones = (f.campos ?? []).filter((c) => !c.calculado).map((c) => ({ campo: c.campo, decision: "aceptado" as const }));
    const r = await revisarLectura(procesoId, f.id, decisiones, ACTOR_VALIDACION_AUTOMATICA);
    if (!r.ok) continue;
    validadas++;
    await registrarEvento(procesoId, { tipo: "dato", detalle: { carta_validada_sola: carta.empresa } }, ACTOR_VALIDACION_AUTOMATICA);
  }
  return validadas;
}

/** Cambia la clase de un documento mal clasificado (los campos se conservan). */
export async function cambiarClaseLectura(procesoId: string, lecturaId: string, clase: ClaseDocumento, actor: ActorProceso): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  const { data: f } = await db.from("seleccion_lecturas").select("grupo, proceso_id, conversacion_id").eq("id", lecturaId).maybeSingle();
  if (!f) return { ok: false, error: "No se encontró la lectura." };
  if (f.proceso_id !== procesoId && !(await conversacionesDe(procesoId)).includes(f.conversacion_id as string)) return { ok: false, error: "Esa lectura no es de este proceso." };
  const q = db.from("seleccion_lecturas").update({ clase, updated_at: new Date().toISOString() });
  const { error } = f.grupo ? await q.eq("grupo", f.grupo) : await q.eq("id", lecturaId);
  if (error) return { ok: false, error: error.message };
  await registrarEvento(procesoId, { tipo: "carpeta", detalle: { lectura_clase: clase } }, actor);
  return { ok: true };
}
