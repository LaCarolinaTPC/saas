// Batería de la Entrega 4 de Selección contra la base de .env.local (desarrollo): indicadores, día de
// contratación, lectura de documentos (una llamada REAL al modelo con dos PDF ficticios) y su revisión,
// y transcripciones en el historial del asistente.
// Solo crea candidatos ficticios «chat_prueba», un contacto de WhatsApp ficticio (no sale ningún mensaje)
// y lo borra todo al terminar (queda el registro del costo de la llamada al modelo, que fue real).
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-entrega-4.mts
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { leerIndicadoresSeleccion } from "@/lib/seleccion/indicadores-servidor";
import { rangoUltimosDias } from "@/lib/comunicaciones/indicadores";
import {
  citarPsicotecnica,
  diaContratacionDeProceso,
  registrarEntrevista,
  registrarInduccion,
  registrarPsicotecnicaExterna,
} from "@/lib/seleccion/dia-contratacion-servidor";
import { condicionesDeProceso } from "@/lib/seleccion/contratacion-servidor";
import { leerDocumentosPendientes, lecturasDocumentosDeConversacion } from "@/lib/seleccion/lectura/ejecutar";
import { lecturasDeProceso, revisarLectura } from "@/lib/seleccion/lectura/revision-servidor";
import { transcribirAudiosPendientes, transcripcionesDeConversacion } from "@/lib/seleccion/audios";
import { getOpenAIKey } from "@/lib/settings";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Un audio en español con la voz de Windows (System.Speech). null fuera de Windows o sin voz en español. */
function audioSintetico(frase: string): Buffer | null {
  if (process.platform !== "win32") return null;
  const dir = mkdtempSync(join(tmpdir(), "e4-audio-"));
  const wav = join(dir, "nota.wav");
  try {
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'es-*' } | Select-Object -First 1; if (-not $v) { exit 2 }; $s.SelectVoice($v.VoiceInfo.Name); $s.SetOutputToWaveFile('${wav}'); $s.Speak('${frase.replace(/'/g, "''")}'); $s.Dispose()`;
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore", timeout: 60_000 });
    return readFileSync(wav);
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
import { estadosCarpeta } from "@/lib/seleccion/carpeta-servidor";
import { construirHistorial } from "@/lib/comunicaciones/agente/motor";

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-e4@gestivo.test" };
let ok = 0;
const fallos: string[] = [];
let seccion = "";
const titulo = (t: string) => {
  seccion = t;
  console.log(`\n── ${t}`);
};
const revisar = (nombre: string, condicion: unknown, detalle?: unknown) => {
  if (condicion) {
    ok++;
    console.log(`  ✔ ${nombre}`);
  } else {
    fallos.push(`${seccion}: ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
    console.log(`  ✘ ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
  }
};

const PREFIJO = "99900004";
const TELEFONO = "570000000499";
async function limpiar() {
  const { data: contacto } = await db.from("wa_contactos").select("id, wa_conversaciones(id)").eq("telefono", TELEFONO).maybeSingle();
  const convs = ((contacto?.wa_conversaciones ?? []) as { id: string }[]).map((c) => c.id);
  if (convs.length) {
    const { data: msjs } = await db.from("wa_mensajes").select("media_path").in("conversacion_id", convs).not("media_path", "is", null);
    const rutas = (msjs ?? []).map((m) => m.media_path as string);
    if (rutas.length) await db.storage.from("whatsapp").remove(rutas);
    await db.from("seleccion_lecturas").delete().in("conversacion_id", convs);
  }
  const { data } = await db.from("procesos_contratacion").select("id").eq("origen", "chat_prueba").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((x) => x.id as string);
  for (const id of ids) {
    const { data: carpetas } = await db.storage.from("seleccion").list(id, { limit: 100 });
    for (const c of carpetas ?? []) {
      const { data: dentro } = await db.storage.from("seleccion").list(`${id}/${c.name}`, { limit: 100 });
      const rutas = (dentro ?? []).map((f) => `${id}/${c.name}/${f.name}`);
      if (rutas.length) await db.storage.from("seleccion").remove(rutas);
    }
  }
  if (ids.length) {
    await db.from("seleccion_lecturas").delete().in("proceso_id", ids);
    await db.from("procesos_contratacion").delete().in("id", ids);
  }
  if (contacto) await db.from("wa_contactos").delete().eq("id", contacto.id);
  return ids.length;
}
let n = 0;
async function crear(estado: string, extra: Record<string, unknown> = {}): Promise<string> {
  n++;
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({
      fecha_creacion: "2026-11-21",
      nombre: `PRUEBA E4 ${String(n).padStart(2, "0")}`,
      cedula: `${PREFIJO}${String(n).padStart(2, "0")}`,
      reingreso: false,
      estado,
      medio_postulacion: "whatsapp",
      origen: "chat_prueba",
      simit_valor: 0,
      autorizacion_datos: "si",
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(`crear proceso: ${error.message}`);
  return data.id as string;
}
const proceso = async (id: string) => (await db.from("procesos_contratacion").select("*").eq("id", id).single()).data as Record<string, unknown>;

function pdfConTexto(lineas: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const flujo = `BT /F1 11 Tf 50 760 Td 15 TL ${lineas.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(flujo)} >>\nstream\n${flujo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let salida = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(Buffer.byteLength(salida));
    salida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(salida);
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(salida, "latin1");
}

console.log(`Limpieza previa: ${await limpiar()} candidatos ficticios de una corrida anterior.`);
try {
  // ───────────────────────────────────────────────────────────────────────
  titulo("1. Indicadores");
  const t0 = Date.now();
  const { ind, gasto } = await leerIndicadoresSeleccion(rangoUltimosDias(30));
  revisar("se calculan sin columnas faltantes", ind.faltantes.length === 0, ind.faltantes);
  revisar("el embudo empieza con todos los aspirantes", ind.embudo[0]?.n === ind.aspirantes, { embudo: ind.embudo[0], aspirantes: ind.aspirantes });
  revisar("trae el gasto del mes frente al tope", gasto != null && gasto.topeCop > 0, gasto);
  revisar("en menos de 15 s", Date.now() - t0 < 15_000, Date.now() - t0);

  // ───────────────────────────────────────────────────────────────────────
  titulo("2. Día de contratación");
  const dia = await crear("reconocimiento_ruta");
  const v0 = await diaContratacionDeProceso(dia);
  revisar("sin nada registrado: sin concepto de psicología", v0.disponible && v0.psicotecnica.vigente.resultado === null);
  const cond0 = await condicionesDeProceso(dia);
  const psic0 = cond0.condiciones.find((c) => c.id === "psicotecnica");
  revisar("la psicotécnica es condición para contratar (ajuste encendido) y falta", psic0 && !psic0.cumple, cond0.condiciones.map((c) => c.id));
  revisar("una fecha futura no se acepta", !(await registrarPsicotecnicaExterna(dia, { resultado: "apto", fecha: "2099-01-01" }, actor)).ok);
  const ext = await registrarPsicotecnicaExterna(dia, { resultado: "apto_con_observaciones", fecha: "2026-11-20", puntaje: "78,5", entidad: "IPS de prueba" }, actor);
  revisar("se registra el resultado de una IPS", ext.ok, ext);
  const cond1 = await condicionesDeProceso(dia);
  const psic1 = cond1.condiciones.find((c) => c.id === "psicotecnica");
  revisar("apto con observaciones cumple la condición y dice de dónde salió", psic1?.cumple && /IPS de prueba/.test(psic1.detalle), psic1);
  revisar("se registra la entrevista con nota", (await registrarEntrevista(dia, { cuando: "2026-11-21T09:30", nota: "Buena actitud" }, actor)).ok);
  revisar("se registra la inducción (ahora)", (await registrarInduccion(dia, "", actor)).ok);
  const manana = new Date(Date.now() + 19 * 3_600_000).toISOString().slice(0, 10);
  revisar("se cita a la psicotécnica con lugar", (await citarPsicotecnica(dia, { fecha: manana, hora: "07:00", lugar: "IPS de prueba, calle 1" }, actor)).ok);
  revisar("una fecha pasada no se cita", !(await citarPsicotecnica(dia, { fecha: "2020-01-01", hora: "07:00" }, actor)).ok);
  const v1 = await diaContratacionDeProceso(dia);
  revisar("la ficha lo muestra todo", !!v1.entrevista.at && v1.entrevista.nota === "Buena actitud" && !!v1.induccion.at && v1.cita?.lugar === "IPS de prueba, calle 1", {
    entrevista: v1.entrevista,
    induccion: v1.induccion,
    cita: v1.cita?.lugar,
  });
  revisar("al volver a citar queda una sola cita en pie", (await citarPsicotecnica(dia, { fecha: manana, hora: "08:00" }, actor)).ok &&
    (await db.from("seleccion_citas").select("id").eq("proceso_id", dia).eq("tipo", "psicotecnica").in("estado", ["programada", "confirmada"])).data?.length === 1);
  revisar("borrar el resultado de la IPS vuelve a dejar la condición sin cumplir", (await registrarPsicotecnicaExterna(dia, null, actor)).ok &&
    !(await condicionesDeProceso(dia)).condiciones.find((c) => c.id === "psicotecnica")?.cumple);

  // ───────────────────────────────────────────────────────────────────────
  titulo("3. Lectura de documentos (una llamada real al modelo con dos PDF ficticios)");
  const lec = await crear("pendiente", { experiencia_meses: null, fecha_nacimiento: null, edad: null });
  const pLec = await proceso(lec);
  const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TELEFONO, nombre: "Prueba E4" }).select("id").single();
  const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: lec }).select("id").single();
  const hoja = pdfConTexto([
    "HOJA DE VIDA",
    `Nombre: ${pLec.nombre}`,
    `Cedula: ${pLec.cedula}`,
    "Fecha de nacimiento: 1988-05-10",
    "Ciudad: Barranquilla",
    "EXPERIENCIA LABORAL",
    "Transportes Ficticios SAS - Conductor de bus urbano - enero 2022 a junio 2024",
    "Rutas Imaginarias Ltda - Conductor de buseta - julio 2024 a la fecha",
    "Bodegas Inventadas - Auxiliar de bodega - enero 2019 a diciembre 2021",
    "REFERENCIAS",
    "Laboral: Carlos Ficticio, Transportes Ficticios SAS, tel 3001112233",
    "Personal: Maria Inventada, tel 3004445566",
  ]);
  const carta = pdfConTexto([
    "TRANSPORTES FICTICIOS SAS",
    "CERTIFICA QUE:",
    `${pLec.nombre}, identificado con cedula ${pLec.cedula},`,
    "laboro en esta empresa como Conductor desde el 15 de enero de 2022",
    "hasta el 30 de junio de 2024.",
    "Para mayor informacion: 6053334444",
    "Ana Gerente - Directora de Talento Humano",
  ]);
  const ids: string[] = [];
  for (const [nombre, pdf] of [["hoja_de_vida.pdf", hoja], ["carta.pdf", carta]] as const) {
    const ruta = `${conv!.id}/prueba-e4-${Date.now()}-${nombre}`;
    await db.storage.from("whatsapp").upload(ruta, pdf, { contentType: "application/pdf" });
    const { data: m } = await db
      .from("wa_mensajes")
      .insert({ conversacion_id: conv!.id, direccion: "entrante", contenido: "", media_tipo: "document", mime_type: "application/pdf", nombre_archivo: nombre, media_path: ruta, timestamp: new Date().toISOString() })
      .select("id")
      .single();
    ids.push(m!.id as string);
  }
  const t1 = Date.now();
  const leidos = await leerDocumentosPendientes(conv!.id as string);
  console.log(`  (lectura: ${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  revisar("lee los dos archivos en una llamada", leidos === 2, leidos);
  revisar("una segunda vez no los vuelve a leer", (await leerDocumentosPendientes(conv!.id as string)) === 0);
  const docs = (await lecturasDeProceso(lec)) ?? [];
  const hv = docs.find((d) => d.clase === "hoja_vida");
  const cl = docs.find((d) => d.clase === "carta_laboral");
  revisar("clasifica la hoja de vida y la carta laboral", !!hv && !!cl, docs.map((d) => [d.clase, d.estado, d.error]));
  const val = (k: string) => hv?.campos.find((c) => c.campo === k)?.valor;
  revisar("calcula unos 59 meses de conducción (ene 2022 – nov 2026, sin la bodega)", [58, 59, 60].includes(Number(val("experiencia_conduccion_meses"))), val("experiencia_conduccion_meses"));
  revisar("la cédula leída coincide con la del proceso", val("cedula_coincide") === "sí", val("cedula_coincide"));
  revisar("lee las dos referencias", Array.isArray(val("referencias")) && (val("referencias") as unknown[]).length >= 2, val("referencias"));
  revisar("la carta trae la empresa", /ficticios/i.test(String(cl?.campos.find((c) => c.campo === "empresa")?.valor ?? "")), cl?.campos.map((c) => [c.campo, c.valor]));
  revisar("queda el costo de la lectura", docs.reduce((s, d) => s + d.costoUsd, 0) > 0);
  const paraAsistente = await lecturasDocumentosDeConversacion(conv!.id as string);
  revisar("el asistente recibe lo leído junto a cada archivo", ids.every((id) => paraAsistente.has(id)) && /pendiente de revisión/.test(paraAsistente.get(ids[0]) ?? ""), [...paraAsistente.values()]);
  revisar("nada se aplica al proceso antes de revisar", (await proceso(lec)).experiencia_meses == null);

  // ───────────────────────────────────────────────────────────────────────
  titulo("4. Revisión en «Documentos leídos»");
  const decisiones = (hv?.campos ?? []).filter((c) => !c.calculado).map((c) => ({ campo: c.campo, decision: "aceptado" as const }));
  const rev = await revisarLectura(lec, hv!.id, decisiones, actor);
  revisar("se guarda la revisión", rev.ok, rev);
  const p2 = await proceso(lec);
  revisar("llena la experiencia y la fecha de nacimiento (estaban vacías)", Number(p2.experiencia_meses) >= 58 && p2.fecha_nacimiento === "1988-05-10", { exp: p2.experiencia_meses, nac: p2.fecha_nacimiento });
  revisar("marca el origen como leído", (p2.datos_origen as Record<string, string>)?.experiencia_meses === "leido", p2.datos_origen);
  const { data: refs } = await db.from("seleccion_referencias").select("nombre, tipo").eq("proceso_id", lec);
  revisar("crea las referencias", (refs ?? []).length >= 2, refs);
  const carpeta = await estadosCarpeta(lec);
  revisar("marca la hoja de vida como recibida (no validada)", carpeta.some((c) => /hoja de vida/i.test(c.item) && c.estado === "recibido"), carpeta);
  const { data: adj } = await db.from("seleccion_adjuntos").select("origen, wa_mensaje_id").eq("proceso_id", lec);
  revisar("copia el archivo a la carpeta, con origen WhatsApp", (adj ?? []).some((a) => a.origen === "whatsapp" && ids.includes(a.wa_mensaje_id as string)), adj);
  const revCarta = await revisarLectura(lec, cl!.id, (cl?.campos ?? []).filter((c) => !c.calculado).map((c) => ({ campo: c.campo, decision: "aceptado" as const })), actor);
  const { data: refs2 } = await db.from("seleccion_referencias").select("nombre").eq("proceso_id", lec);
  revisar("la carta no duplica la referencia que ya estaba", revCarta.ok && (refs2 ?? []).length <= (refs ?? []).length + 1, { antes: refs?.length, despues: refs2?.length });
  const otro = await crear("pendiente");
  revisar("no se puede revisar una lectura desde otro proceso", !(await revisarLectura(otro, hv!.id, decisiones, actor)).ok);

  // ───────────────────────────────────────────────────────────────────────
  titulo("5. Audios (transcripción real con OpenAI si hay voz de Windows para crear el audio)");
  const conClave = !!(await getOpenAIKey());
  const wav = conClave ? audioSintetico("Hola, tengo licencia C dos, treinta y cuatro años y vivo en Soledad. Manejé buseta tres años.") : null;
  if (!conClave) console.log("  ! no hay clave de OpenAI en Configuración → IA: los audios no se transcriben (pendiente de La Carolina)");
  if (!wav) {
    console.log(`  (${conClave ? "sin voz de Windows en español" : "sin clave"}: se prueba con una transcripción ya guardada)`);
    const { data: audio } = await db
      .from("wa_mensajes")
      .insert({ conversacion_id: conv!.id, direccion: "entrante", contenido: "", media_tipo: "audio", mime_type: "audio/ogg", timestamp: new Date().toISOString(), transcripcion: "Tengo licencia C2 y vivo en Soledad", transcripcion_at: new Date().toISOString() })
      .select("id")
      .single();
    revisar("se lee la transcripción guardada", (await transcripcionesDeConversacion(conv!.id as string)).get(audio!.id as string) === "Tengo licencia C2 y vivo en Soledad");
  } else {
    const ruta = `${conv!.id}/prueba-e4-${Date.now()}.wav`;
    await db.storage.from("whatsapp").upload(ruta, wav, { contentType: "audio/wav" });
    const { data: audio } = await db
      .from("wa_mensajes")
      .insert({ conversacion_id: conv!.id, direccion: "entrante", contenido: "", media_tipo: "audio", mime_type: "audio/wav", nombre_archivo: "nota.wav", media_path: ruta, timestamp: new Date().toISOString() })
      .select("id")
      .single();
    const t2 = Date.now();
    const hechas = await transcribirAudiosPendientes(conv!.id as string);
    console.log(`  (transcripción: ${((Date.now() - t2) / 1000).toFixed(1)} s)`);
    const texto = (await transcripcionesDeConversacion(conv!.id as string)).get(audio!.id as string) ?? "";
    revisar("transcribe el audio (clave de OpenAI vigente)", hechas === 1 && /soledad/i.test(texto), { hechas, texto });
    revisar("una segunda vez no lo vuelve a transcribir", (await transcribirAudiosPendientes(conv!.id as string)) === 0);
    const { data: consumo } = await db.from("seleccion_consumos").select("costo_usd").eq("conversacion_id", conv!.id).eq("concepto", "transcripcion");
    revisar("queda el costo de la transcripción", (consumo ?? []).length === 1, consumo);
    const [turno] = construirHistorial([{ direccion: "entrante", contenido: "", mediaTipo: "audio", transcripcion: texto }]);
    revisar("el asistente la recibe junto al audio", /Lo que dice el audio: «.*Soledad/i.test(turno.content), turno.content);
  }
  const [manual] = construirHistorial([{ direccion: "entrante", contenido: "", mediaTipo: "audio", transcripcion: "Tengo licencia C2" }]);
  revisar("el historial del asistente lleva la transcripción", /Lo que dice el audio: «Tengo licencia C2»/.test(manual.content), manual.content);
} catch (e) {
  fallos.push(`${seccion}: EXCEPCIÓN ${e instanceof Error ? e.stack : String(e)}`);
  console.log(`  ✘ EXCEPCIÓN ${e instanceof Error ? e.message : String(e)}`);
} finally {
  const borrados = await limpiar();
  const quedan = (await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`)).count;
  console.log(`\nLimpieza: ${borrados} candidatos ficticios borrados; quedan ${quedan}.`);
}
console.log(`\nRESULTADO: ${ok} correctas, ${fallos.length} con problema.`);
for (const f of fallos) console.log(` ✘ ${f}`);
