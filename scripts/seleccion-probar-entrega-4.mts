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
  diaContratacionDeProceso,
  registrarEntrevista,
  registrarInduccion,
  registrarPsicotecnicaExterna,
} from "@/lib/seleccion/dia-contratacion-servidor";
import { condicionesDeProceso } from "@/lib/seleccion/contratacion-servidor";
import { leerDocumentosPendientes, lecturasDocumentosDeConversacion } from "@/lib/seleccion/lectura/ejecutar";
import { lecturasDeProceso, revisarLectura } from "@/lib/seleccion/lectura/revision-servidor";
import { transcribirAudiosPendientes, transcripcionesDeConversacion } from "@/lib/seleccion/audios";
import { hayTranscripcion, transcribirAudio } from "@/lib/ia/transcripcion";
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
import { estadosCarpeta, validarReferencia } from "@/lib/seleccion/carpeta-servidor";
import { experienciaDeProceso, guardarEmpleo, marcarVerificacion } from "@/lib/seleccion/experiencia-servidor";
import { MIME_DOCX } from "@/lib/seleccion/lectura/docx";
import JSZip from "jszip";
import { construirHistorial } from "@/lib/comunicaciones/agente/motor";
import { carpetaGrabacion } from "@/lib/ia/grabacion";

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
const TELEFONO2 = "570000000498";
const TELEFONO3 = "570000000497";
async function limpiar() {
  const { data: contactos } = await db.from("wa_contactos").select("id, wa_conversaciones(id)").in("telefono", [TELEFONO, TELEFONO2, TELEFONO3]);
  const convs = (contactos ?? []).flatMap((c) => ((c.wa_conversaciones ?? []) as { id: string }[]).map((x) => x.id));
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
  if (contactos?.length) await db.from("wa_contactos").delete().in("id", contactos.map((c) => c.id as string));
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
  revisar("sin nada registrado: sin resultado de psicotécnica", v0.disponible && v0.psicotecnica.vigente.resultado === null);
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
  const v1 = await diaContratacionDeProceso(dia);
  revisar("la ficha lo muestra todo", !!v1.entrevista.at && v1.entrevista.nota === "Buena actitud" && !!v1.induccion.at, {
    entrevista: v1.entrevista,
    induccion: v1.induccion,
  });
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
  // Con IA_GRABACION (src/lib/ia/grabacion.ts) la lectura repetida no cuesta nada: se acepta cero.
  revisar("queda el costo de la lectura", docs.reduce((s, d) => s + d.costoUsd, 0) > 0 || !!carpetaGrabacion());
  const paraAsistente = await lecturasDocumentosDeConversacion(conv!.id as string);
  revisar("el asistente recibe lo leído junto a cada archivo", ids.every((id) => paraAsistente.has(id)) && /pendiente de revisión/.test(paraAsistente.get(ids[0]) ?? ""), [...paraAsistente.values()]);
  // Con «validar_documentos_auto» (27-nov-2026, encendido por defecto) la hoja de vida que coincide con el
  // aspirante se valida sola y aplica sus datos; apagado, nada se aplica antes de que una persona revise.
  const auto = (await db.from("seleccion_ajustes").select("valor").eq("clave", "validar_documentos_auto").maybeSingle()).data?.valor !== false;
  if (auto) revisar("validación automática: la hoja de vida que coincide ya aplicó sus datos", Number((await proceso(lec)).experiencia_meses) >= 58);
  else revisar("nada se aplica al proceso antes de revisar", (await proceso(lec)).experiencia_meses == null);

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
  revisar(
    auto ? "la hoja de vida queda validada (validación automática)" : "marca la hoja de vida como recibida (no validada)",
    carpeta.some((c) => /hoja de vida/i.test(c.item) && c.estado === (auto ? "validado" : "recibido")),
    carpeta
  );
  const { data: adj } = await db.from("seleccion_adjuntos").select("origen, wa_mensaje_id").eq("proceso_id", lec);
  revisar("copia el archivo a la carpeta, con origen WhatsApp", (adj ?? []).some((a) => a.origen === "whatsapp" && ids.includes(a.wa_mensaje_id as string)), adj);
  // Experiencia laboral: entra sin verificar.
  const exp1 = await experienciaDeProceso(lec);
  const conduc = exp1.items.filter((e) => e.conduccion);
  // 23-nov-2026: la carta de prueba coincide en todo con la hoja de vida, así que
  // Gestivo la valida sola al leerla (ajuste «validar_cartas_auto»); los demás empleos siguen sin verificar.
  const verificados = exp1.items.filter((e) => e.verificacion === "verificada");
  revisar(
    "los empleos de la hoja de vida quedan en el proceso; el de la carta que coincide, ya validado por Gestivo",
    conduc.length === 2 && verificados.length === 1 && verificados[0].verificada_por === "Gestivo (validación automática)",
    exp1.items.map((e) => [e.empresa, e.conduccion, e.verificacion, e.verificada_por])
  );
  revisar("estado: verificada en parte, a la espera de la otra carta o de la referencia", exp1.resumen.estado === "parcial" && exp1.resumen.mesesVerificados > 0, exp1.resumen);
  const revCarta = await revisarLectura(lec, cl!.id, (cl?.campos ?? []).filter((c) => !c.calculado).map((c) => ({ campo: c.campo, decision: "aceptado" as const })), actor);
  const { data: refs2 } = await db.from("seleccion_referencias").select("nombre").eq("proceso_id", lec);
  revisar("la carta no duplica la referencia que ya estaba", revCarta.ok && (refs2 ?? []).length <= (refs ?? []).length + 1, { antes: refs?.length, despues: refs2?.length });
  // La carta laboral de Transportes Ficticios verifica ese empleo; el otro sigue sin verificar.
  const exp2 = await experienciaDeProceso(lec);
  const tf = exp2.items.find((e) => /ficticios/i.test(e.empresa ?? ""));
  revisar("la carta laboral verifica el empleo de su empresa", tf?.verificacion === "verificada" && tf.como === "carta_laboral", tf);
  revisar("estado: verificada en parte (falta Rutas Imaginarias)", exp2.resumen.estado === "parcial" && exp2.resumen.mesesVerificados >= 29, exp2.resumen);
  // Llamar a una referencia laboral de la otra empresa la verifica.
  const { data: refNueva } = await db
    .from("seleccion_referencias")
    .insert({ proceso_id: lec, tipo: "laboral", nombre: "Jefe de Rutas Imaginarias", telefono: "3009998877", empresa: "Rutas Imaginarias Ltda.", registrada_por: actor.userEmail })
    .select("id")
    .single();
  revisar(
    "validar la referencia laboral verifica el empleo de esa empresa",
    (await validarReferencia(refNueva!.id as string, { habloCon: "Jefe de despacho", resultado: "Confirma que trabaja desde julio de 2024" }, actor)).ok &&
      (await experienciaDeProceso(lec)).resumen.estado === "verificada"
  );
  const ri = (await experienciaDeProceso(lec)).items.find((e) => /imaginarias/i.test(e.empresa ?? ""))!;
  revisar(
    "«No se confirmó» exige la nota y deja el estado con problema",
    !(await marcarVerificacion(lec, ri.id, { verificacion: "no_confirmada" }, actor)).ok &&
      (await marcarVerificacion(lec, ri.id, { verificacion: "no_confirmada", nota: "La empresa no lo reconoce" }, actor)).ok &&
      (await experienciaDeProceso(lec)).resumen.estado === "con_problema"
  );
  revisar(
    "un empleo escrito a mano entra sin verificar",
    (await guardarEmpleo(lec, { empresa: "Coolitoral", cargo: "Conductor", desde: "2018-01", hasta: "2019-12", conduccion: true }, actor)).ok &&
      (await experienciaDeProceso(lec)).items.some((e) => e.empresa === "Coolitoral" && e.origen === "manual" && e.verificacion === "sin_verificar")
  );
  const otro = await crear("pendiente");
  revisar("no se puede revisar una lectura desde otro proceso", !(await revisarLectura(otro, hv!.id, decisiones, actor)).ok);

  // ───────────────────────────────────────────────────────────────────────
  titulo("4b. Hoja de vida en dos páginas (como varias fotos) y en Word");
  const varias = await crear("pendiente");
  const pVarias = await proceso(varias);
  const { data: contacto2 } = await db.from("wa_contactos").insert({ telefono: TELEFONO2, nombre: "Prueba E4 b" }).select("id").single();
  const { data: conv2 } = await db.from("wa_conversaciones").insert({ contacto_id: contacto2!.id, proceso_id: varias }).select("id").single();
  const pagina1 = pdfConTexto(["HOJA DE VIDA (pagina 1 de 2)", `Nombre: ${pVarias.nombre}`, `Cedula: ${pVarias.cedula}`, "EXPERIENCIA LABORAL", "Sobusa S.A. - Conductor de bus - marzo 2021 a la fecha"]);
  const pagina2 = pdfConTexto(["(pagina 2 de 2)", "REFERENCIAS", "Laboral: Luis Despachador, Sobusa, tel 3011112222", "Personal: Ana Vecina, tel 3022223333"]);
  const subir = async (convId: string, nombre: string, datos: Buffer, mime: string) => {
    const ruta = `${convId}/prueba-e4-${Date.now()}-${nombre.replace(/\s+/g, "-")}`;
    await db.storage.from("whatsapp").upload(ruta, datos, { contentType: mime });
    await db.from("wa_mensajes").insert({ conversacion_id: convId, direccion: "entrante", contenido: "", media_tipo: "document", mime_type: mime, nombre_archivo: nombre, media_path: ruta, timestamp: new Date().toISOString() });
  };
  await subir(conv2!.id as string, "hoja-1.pdf", pagina1, "application/pdf");
  await subir(conv2!.id as string, "hoja-2.pdf", pagina2, "application/pdf");
  await leerDocumentosPendientes(conv2!.id as string);
  const docsVarias = (await lecturasDeProceso(varias)) ?? [];
  const hvVarias = docsVarias.find((d) => d.clase === "hoja_vida");
  revisar("las dos páginas salen como una sola hoja de vida", docsVarias.length === 1 && hvVarias?.archivos.length === 2, docsVarias.map((d) => [d.clase, d.archivos.length]));
  const refsVarias = hvVarias?.campos.find((c) => c.campo === "referencias")?.valor;
  revisar(
    "con la experiencia de la página 1 y las referencias de la página 2",
    !!hvVarias?.campos.find((c) => c.campo === "experiencias") && Array.isArray(refsVarias) && refsVarias.length >= 2,
    hvVarias?.campos.map((c) => c.campo)
  );

  const enWord = await crear("pendiente");
  const pWord = await proceso(enWord);
  const { data: contacto3 } = await db.from("wa_contactos").insert({ telefono: TELEFONO3, nombre: "Prueba E4 c" }).select("id").single();
  const { data: conv3 } = await db.from("wa_conversaciones").insert({ contacto_id: contacto3!.id, proceso_id: enWord }).select("id").single();
  const zip = new JSZip();
  const parrafo = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const lineasWord = [
    "HOJA DE VIDA",
    `Nombre: ${pWord.nombre}`,
    `Cedula: ${pWord.cedula}`,
    "Fecha de nacimiento: 1990-02-20",
    "EXPERIENCIA",
    "Coolitoral - Conductor de buseta - enero 2020 a diciembre 2023",
    "REFERENCIAS",
    "Laboral: Pedro Jefe, Coolitoral, tel 3033334444",
  ];
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${lineasWord.map(parrafo).join("")}</w:body></w:document>`);
  await subir(conv3!.id as string, "Hoja de vida.docx", await zip.generateAsync({ type: "nodebuffer" }), MIME_DOCX);
  await leerDocumentosPendientes(conv3!.id as string);
  const hvWord = ((await lecturasDeProceso(enWord)) ?? []).find((d) => d.clase === "hoja_vida");
  revisar("lee la hoja de vida en Word", !!hvWord && hvWord.campos.some((c) => c.campo === "fecha_nacimiento" && c.valor === "1990-02-20"), hvWord ? hvWord.campos.map((c) => [c.campo, c.valor]) : "sin lectura");
  revisar("con la experiencia en Coolitoral", JSON.stringify(hvWord?.campos.find((c) => c.campo === "experiencias")?.valor ?? "").includes("Coolitoral"));

  // ───────────────────────────────────────────────────────────────────────
  titulo("5. Audios (transcripción real por OpenRouter u OpenAI, con un audio de la voz de Windows)");
  const conClave = await hayTranscripcion();
  let wav = conClave ? audioSintetico("Hola, tengo licencia C dos, treinta y cuatro años y vivo en Soledad. Manejé buseta tres años.") : null;
  let motivo = conClave ? "sin voz de Windows en español" : "sin clave de OpenRouter ni de OpenAI";
  if (wav) {
    // Un ensayo directo: si el proveedor no tiene saldo, se dice eso en vez de marcar fallas.
    const ensayo = await transcribirAudio(wav, "audio/wav", "nota.wav");
    if (!ensayo.ok && /402|credit|saldo|quota/i.test(ensayo.error)) {
      motivo = `el proveedor no tiene saldo (${ensayo.error.slice(0, 120)})`;
      wav = null;
    }
  }
  if (!wav) {
    console.log(`  ! ${motivo}: se prueba con una transcripción ya guardada`);
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
    revisar("transcribe el audio", hechas === 1 && /soledad/i.test(texto), { hechas, texto });
    revisar("una segunda vez no lo vuelve a transcribir", (await transcribirAudiosPendientes(conv!.id as string)) === 0);
    const { data: consumo } = await db.from("seleccion_consumos").select("costo_usd").eq("conversacion_id", conv!.id).eq("concepto", "transcripcion");
    // 23-nov-2026: el audio se transcribe también con un segundo modelo, para saber si se entendió: dos costos.
    revisar("quedan los dos costos de la transcripción (el modelo principal y el de control)", (consumo ?? []).length === 2, consumo);
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
