// Batería de la hoja de vida y las cartas laborales con el modelo real, contra la base de .env.local (desarrollo).
// Lee una hoja de vida en Word y tres cartas laborales en PDF (ficticias) con el modelo del asistente (Haiku), como
// si llegaran por WhatsApp; las acepta como lo haría Gestión Humana en «Documentos leídos» y revisa que queden la
// experiencia, las referencias, la constatación de cada carta con la hoja de vida y los documentos en la carpeta.
// Lee con la IA de «Documentos» de Candidatos › IA (Haiku 5.5 por defecto). Borra lo que crea (queda el registro
// del costo de la llamada al modelo, que fue real).
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-hoja-vida.mts [--preciso]
// Con --preciso pone Sonnet 5.5 en «Documentos» mientras corre, para comparar, y lo deja como estaba.
import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { leerDocumentosPendientes } from "@/lib/seleccion/lectura/ejecutar";
import { lecturasDeProceso, revisarLectura } from "@/lib/seleccion/lectura/revision-servidor";
import { experienciaDeProceso } from "@/lib/seleccion/experiencia-servidor";

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-hoja-vida@gestivo.test" };
let ok = 0;
const fallos: string[] = [];
let seccion = "";
const titulo = (t: string) => {
  seccion = t;
  console.log(`\n── ${t}`);
};
const revisar = (nombre: string, condicion: unknown, detalle?: unknown) => {
  const d = detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 600)}` : "";
  if (condicion) {
    ok++;
    console.log(`  ✔ ${nombre}`);
  } else {
    fallos.push(`${seccion}: ${nombre}${d}`);
    console.log(`  ✘ ${nombre}${d}`);
  }
};

const PREFIJO = "99900051";
const CEDULA = `${PREFIJO}01`;
const NOMBRE = "CARLOS ANDRES GOMEZ RUIZ";
const TELEFONO = "570000000519";
const preciso = process.argv.includes("--preciso");

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
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(salida, "latin1");
}

async function docxConTexto(parrafos: string[]): Promise<Buffer> {
  const zip = new JSZip();
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function limpiar() {
  const { data: contactos } = await db.from("wa_contactos").select("id, wa_conversaciones(id)").eq("telefono", TELEFONO);
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
}

const { data: iaAntes, error: eIa } = await db.from("wa_agente").select("documentos_proveedor, documentos_modelo").eq("id", 1).maybeSingle();
if (preciso && eIa) {
  console.error("Para --preciso falta aplicar la migración 20261121213622 (IA por separado para chat, documentos y voz).");
  process.exit(1);
}
await limpiar();
try {
  if (preciso) await db.from("wa_agente").update({ documentos_proveedor: "anthropic", documentos_modelo: "claude-sonnet-5-5" }).eq("id", 1);
  titulo(`Lectura con ${preciso ? "Sonnet 5.5" : `la IA de «Documentos» (${iaAntes?.documentos_modelo ?? "la del chat"})`}`);
  const { data: proc, error } = await db
    .from("procesos_contratacion")
    .insert({ fecha_creacion: "2026-11-21", nombre: NOMBRE, cedula: CEDULA, reingreso: false, estado: "pendiente", medio_postulacion: "whatsapp", origen: "chat_prueba", simit_valor: 0, autorizacion_datos: "si", experiencia_meses: null, fecha_nacimiento: null, edad: null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const pid = proc.id as string;
  const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TELEFONO, nombre: "Prueba hoja de vida" }).select("id").single();
  const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: pid }).select("id").single();

  const hoja = await docxConTexto([
    "HOJA DE VIDA",
    "Carlos Andrés Gómez Ruiz",
    `C.C. ${CEDULA} de Barranquilla`,
    "Fecha de nacimiento: 12 de agosto de 1987",
    "Dirección: Calle 45 # 20-31, Soledad. Celular: 3005551234",
    "PERFIL: Conductor con licencia C2, más de 5 años en transporte urbano de pasajeros.",
    "EXPERIENCIA LABORAL",
    "Transportes Coolitoral S.A. — Conductor de bus urbano. Marzo de 2019 a agosto de 2022. Rutas en Barranquilla y Soledad.",
    "Sobusa S.A. — Conductor de buseta. Enero de 2017 a febrero de 2019.",
    "Almacenes Éxito — Auxiliar de bodega. Febrero de 2015 a diciembre de 2016.",
    "REFERENCIAS LABORALES",
    "Jorge Pérez, jefe de operaciones, Transportes Coolitoral S.A., celular 3014445566",
    "REFERENCIAS PERSONALES",
    "Luz Marina Ortiz, vecina, celular 3027778899",
  ]);
  const cartaCoincide = pdfConTexto([
    "TRANSPORTES COOLITORAL S.A. - NIT 890.100.000-1",
    "EL SUSCRITO JEFE DE TALENTO HUMANO CERTIFICA QUE:",
    `El senor CARLOS ANDRES GOMEZ RUIZ, identificado con cedula ${CEDULA},`,
    "laboro en esta empresa en el cargo de CONDUCTOR desde el 1 de marzo de 2019",
    "hasta el 31 de agosto de 2022, con contrato a termino fijo.",
    "Se expide a solicitud del interesado. Telefono: 6053851111",
    "Mario Restrepo - Jefe de Talento Humano",
  ]);
  const cartaOtrasFechas = pdfConTexto([
    "SOBUSA S.A.",
    "CERTIFICACION LABORAL",
    `Certificamos que CARLOS ANDRES GOMEZ RUIZ, C.C. ${CEDULA},`,
    "presto sus servicios como CONDUCTOR desde el 10 de junio de 2017",
    "hasta el 15 de octubre de 2018.",
    "Barranquilla. Firma: Andrea Molina, Coordinadora de Personal. Tel 6053402222",
  ]);
  const cartaOtraPersona = pdfConTexto([
    "TRANSPORTES COOLITORAL S.A.",
    "CERTIFICA QUE:",
    "El senor PEDRO JOSE MARTINEZ DIAZ, identificado con cedula 72111222,",
    "laboro como CONDUCTOR desde el 5 de enero de 2020 hasta el 20 de diciembre de 2021.",
    "Mario Restrepo - Jefe de Talento Humano",
  ]);
  const archivos: [string, Buffer, string][] = [
    ["hoja_de_vida_carlos.docx", hoja, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["carta_coolitoral.pdf", cartaCoincide, "application/pdf"],
    ["certificado_sobusa.pdf", cartaOtrasFechas, "application/pdf"],
    ["carta_coolitoral_2.pdf", cartaOtraPersona, "application/pdf"],
  ];
  for (const [nombre, contenido, mime] of archivos) {
    const ruta = `${conv!.id}/prueba-hv-${Date.now()}-${nombre}`;
    await db.storage.from("whatsapp").upload(ruta, contenido, { contentType: mime });
    await db.from("wa_mensajes").insert({ conversacion_id: conv!.id, direccion: "entrante", contenido: "", media_tipo: "document", mime_type: mime, nombre_archivo: nombre, media_path: ruta, timestamp: new Date().toISOString() });
  }
  const t1 = Date.now();
  const leidos = await leerDocumentosPendientes(conv!.id as string);
  console.log(`  (lectura de ${leidos} archivos: ${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  revisar("lee los cuatro archivos en una sola llamada", leidos === 4, leidos);
  const { data: lecs } = await db.from("seleccion_lecturas").select("modelo, costo_usd, estado").eq("conversacion_id", conv!.id);
  const modelo = String(lecs?.[0]?.modelo ?? "");
  revisar(`la leyó ${preciso ? "Sonnet" : "Haiku"}`, preciso ? /sonnet/i.test(modelo) : /haiku/i.test(modelo), { modelo, costo: lecs?.reduce((s, l) => s + Number(l.costo_usd ?? 0), 0) });
  const docs = (await lecturasDeProceso(pid)) ?? [];
  const hv = docs.find((d) => d.clase === "hoja_vida");
  const cartas = docs.filter((d) => d.clase === "carta_laboral");
  revisar("clasifica una hoja de vida y tres cartas laborales", hv && cartas.length === 3, docs.map((d) => [d.clase, d.estado, d.error]));

  titulo("Lo que leyó de la hoja de vida");
  const campo = (d: typeof hv, k: string) => d?.campos.find((c) => c.campo === k)?.valor;
  revisar("fecha de nacimiento", String(campo(hv, "fecha_nacimiento") ?? "").startsWith("1987-08-12"), campo(hv, "fecha_nacimiento"));
  const exps = (campo(hv, "experiencias") ?? []) as { empresa: string; desde: string; hasta: string; conduccion: boolean }[];
  revisar("los tres empleos, dos de conducción", Array.isArray(exps) && exps.length === 3 && exps.filter((e) => e.conduccion).length === 2, exps);
  const cool = exps.find((e) => /coolitoral/i.test(e.empresa));
  revisar("Coolitoral de 2019-03 a 2022-08", cool?.desde === "2019-03" && cool?.hasta === "2022-08", cool);
  const refs = (campo(hv, "referencias") ?? []) as { nombre: string; tipo: string; telefono: string }[];
  revisar("las dos referencias, laboral y personal, con teléfono", Array.isArray(refs) && refs.length === 2 && refs.some((r) => r.tipo === "laboral") && refs.some((r) => r.tipo === "personal") && refs.every((r) => /\d{10}/.test(String(r.telefono ?? "").replace(/\D/g, ""))), refs);
  revisar("experiencia en conducción calculada (unos 67 meses)", Math.abs(Number(campo(hv, "experiencia_meses_conduccion") ?? hv?.campos.find((c) => /meses/.test(c.campo))?.valor ?? 0) - 67) <= 3, hv?.campos.filter((c) => c.calculado).map((c) => [c.campo, c.valor]));

  titulo("Lo que leyó de las cartas");
  const cartaDe = (re: RegExp) => cartas.find((c) => re.test(String(campo(c, "empresa") ?? "")) && !/pedro/i.test(String(campo(c, "nombre") ?? "")));
  const cCool = cartaDe(/coolitoral/i);
  const cSob = cartaDe(/sobusa/i);
  const cOtra = cartas.find((c) => /pedro/i.test(String(campo(c, "nombre") ?? "")));
  revisar("Coolitoral: a nombre de Carlos, conductor, 2019-03-01 a 2022-08-31", cCool && /carlos/i.test(String(campo(cCool, "nombre"))) && String(campo(cCool, "desde")).startsWith("2019-03") && String(campo(cCool, "hasta")).startsWith("2022-08"), cCool?.campos.map((c) => [c.campo, c.valor]));
  revisar("Sobusa: 2017-06 a 2018-10", cSob && String(campo(cSob, "desde")).startsWith("2017-06") && String(campo(cSob, "hasta")).startsWith("2018-10"), cSob?.campos.map((c) => [c.campo, c.valor]));
  revisar("la tercera está a nombre de Pedro José Martínez", Boolean(cOtra), cartas.map((c) => campo(c, "nombre")));

  // 23-nov-2026: con el ajuste «validar_cartas_auto» (en «sí» por defecto), la carta que coincide en todo se valida sola al leerla.
  titulo("Validación automática: la carta que coincide se valida sola");
  const { data: lecRev } = await db.from("seleccion_lecturas").select("id, revisado_por").in("id", [cCool!.id, cSob!.id, cOtra!.id]);
  const revisadaPor = new Map((lecRev ?? []).map((l) => [l.id as string, l.revisado_por as string | null]));
  revisar("Coolitoral (coincide) la validó Gestivo", revisadaPor.get(cCool!.id) === "Gestivo (validación automática)", Object.fromEntries(revisadaPor));
  revisar("Sobusa (otras fechas) y la de otra persona siguen esperando a una persona", !revisadaPor.get(cSob!.id) && !revisadaPor.get(cOtra!.id), Object.fromEntries(revisadaPor));
  const exp0 = await experienciaDeProceso(pid);
  revisar(
    "entran los empleos de la hoja de vida leída; Coolitoral ya verificado con la carta y los demás sin verificar",
    exp0.items.length === 3 &&
      exp0.items.filter((e) => e.verificacion === "verificada").map((e) => e.empresa).join().match(/coolitoral/i) != null &&
      exp0.items.filter((e) => e.verificacion === "verificada").length === 1 &&
      exp0.items.find((e) => /coolitoral/i.test(e.empresa ?? ""))?.como === "carta_laboral",
    exp0.items.map((e) => [e.empresa, e.verificacion])
  );

  titulo("Gestión Humana acepta la hoja de vida");
  const aceptar = (d: NonNullable<typeof hv>) => d.campos.filter((c) => !c.calculado).map((c) => ({ campo: c.campo, decision: "aceptado" as const }));
  const rHv = await revisarLectura(pid, hv!.id, aceptar(hv!), actor);
  revisar("se aplica", rHv.ok, rHv);
  const exp1 = await experienciaDeProceso(pid);
  revisar(
    "quedan los tres empleos: Coolitoral sigue verificada (sin duplicarse) y los otros dos sin verificar",
    exp1.items.length === 3 &&
      exp1.items.filter((e) => e.verificacion === "verificada").length === 1 &&
      exp1.items.find((e) => e.verificacion === "verificada")?.empresa?.match(/coolitoral/i) != null,
    exp1.items.map((e) => [e.empresa, e.verificacion])
  );
  const { data: refsGuardadas } = await db.from("seleccion_referencias").select("nombre, tipo, telefono").eq("proceso_id", pid);
  revisar("quedan las tres referencias: las dos de la hoja de vida y la de la carta", (refsGuardadas ?? []).length === 3, refsGuardadas);
  const { data: p1 } = await db.from("procesos_contratacion").select("fecha_nacimiento, experiencia_meses").eq("id", pid).maybeSingle();
  revisar("se llenan la fecha de nacimiento y los meses de experiencia (estaban vacíos)", p1?.fecha_nacimiento === "1987-08-12" && Number(p1?.experiencia_meses) > 0, p1);

  titulo("Gestión Humana acepta las cartas: se constatan con la hoja de vida");
  const rCool = await revisarLectura(pid, cCool!.id, aceptar(cCool!), actor);
  revisar("Coolitoral: coincide", rCool.ok && rCool.aplicados?.some((a) => /coincide/.test(a)), rCool.aplicados);
  const rSob = await revisarLectura(pid, cSob!.id, aceptar(cSob!), actor);
  revisar("Sobusa: verificada con diferencias", rSob.ok && rSob.aplicados?.some((a) => /diferencias/.test(a)), rSob.aplicados);
  const rOtra = await revisarLectura(pid, cOtra!.id, aceptar(cOtra!), actor);
  revisar("la de otra persona: no verifica nada", rOtra.ok && rOtra.aplicados?.some((a) => /otra persona/.test(a)), rOtra.aplicados);
  const exp2 = await experienciaDeProceso(pid);
  const eCool = exp2.items.find((e) => /coolitoral/i.test(e.empresa ?? ""));
  const eSob = exp2.items.find((e) => /sobusa/i.test(e.empresa ?? ""));
  revisar("Coolitoral verificada con carta, sin diferencias", eCool?.verificacion === "verificada" && eCool.como === "carta_laboral" && !eCool.diferencias, eCool);
  revisar("Sobusa verificada, con las diferencias anotadas y las fechas de la carta", eSob?.verificacion === "verificada" && /inicio/.test(eSob.diferencias ?? "") && /fin/.test(eSob.diferencias ?? "") && eSob.desde === "2017-06" && eSob.hasta === "2018-10", eSob);
  revisar("el resumen avisa que una carta no coincide", /no coincide/.test(exp2.resumen.texto) && exp2.resumen.estado === "verificada", exp2.resumen);
  revisar("los meses verificados salen de las fechas de las cartas (unos 59)", Math.abs(exp2.resumen.mesesVerificados - 59) <= 2, exp2.resumen);

  titulo("Los documentos quedan guardados en la carpeta del candidato");
  const { data: adj } = await db.from("seleccion_adjuntos").select("tipo, nombre, ruta, origen").eq("proceso_id", pid);
  revisar("los cuatro documentos, con su tipo", (adj ?? []).length === 4 && adj!.some((a) => /hoja/.test(String(a.tipo))) && adj!.filter((a) => /carta/.test(String(a.tipo))).length === 3, adj?.map((a) => [a.tipo, a.nombre]));
  const primero = adj?.find((a) => /hoja/.test(String(a.tipo)));
  const { data: bajado } = primero ? await db.storage.from("seleccion").download(primero.ruta as string) : { data: null };
  revisar("y se pueden descargar", bajado && bajado.size > 0);
  const { data: carpeta } = await db.from("seleccion_carpeta_items").select("item, estado").eq("proceso_id", pid);
  revisar("la carpeta marca la hoja de vida y las cartas como recibidas", (carpeta ?? []).some((c) => /hoja/i.test(c.item) && c.estado === "recibido") && (carpeta ?? []).some((c) => /carta|certific/i.test(c.item) && c.estado === "recibido"), carpeta);
} catch (e) {
  fallos.push(`excepción: ${e instanceof Error ? e.stack : String(e)}`);
  console.error(e);
} finally {
  if (preciso && iaAntes) await db.from("wa_agente").update(iaAntes).eq("id", 1);
  await limpiar();
  const quedan = (await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`)).count;
  revisar("no quedan datos de prueba y el ajuste vuelve a como estaba", quedan === 0);
}
console.log(`\n${ok} bien, ${fallos.length} mal.`);
for (const f of fallos) console.log(`  · ${f}`);
process.exit(fallos.length ? 1 : 0);
