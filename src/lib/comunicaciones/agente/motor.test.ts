import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARCA_AUTORIZACION, MARCA_TRANSFERIR, MAX_CARACTERES_WHATSAPP, NOTA_REVISION, construirHistorial, construirSistema, decidirRespuesta,
  interpretarRespuesta, pareceAvisoDeRevision, parsearFrases, parsearLista, pideHumano, reglasSeleccion, resumirRecibidos, textoReciente,
  type MensajeHistorial,
} from "./motor";
import { parsearModelosPermitidos } from "./proveedores";
import { CONFIG_POR_DEFECTO } from "./opciones";

const m = (direccion: "entrante" | "saliente", contenido: string, mediaTipo: string | null = null): MensajeHistorial => ({
  direccion, contenido, mediaTipo,
});

test("historial: une ráfagas del mismo lado y alterna user/assistant", () => {
  const turnos = construirHistorial([
    m("entrante", "Hola"),
    m("entrante", "¿Hay vacantes?"),
    m("saliente", "Sí, de conductor."),
    m("entrante", "Gracias"),
  ]);
  assert.deepEqual(turnos, [
    { role: "user", content: "Hola\n¿Hay vacantes?" },
    { role: "assistant", content: "Sí, de conductor." },
    { role: "user", content: "Gracias" },
  ]);
});

test("historial: descarta salientes antes del primer entrante (el modelo exige empezar por user)", () => {
  const turnos = construirHistorial([m("saliente", "Plantilla de bienvenida"), m("entrante", "Hola")]);
  assert.deepEqual(turnos, [{ role: "user", content: "Hola" }]);
});

test("historial: los medios se describen porque el modelo no los ve", () => {
  const turnos = construirHistorial([m("entrante", "", "audio"), m("entrante", "mi hoja de vida", "document")]);
  assert.equal(turnos[0].content, "[Envió un audio]\n[Envió un documento] mi hoja de vida");
});

test("historial: mensajes vacíos sin medio no cuentan", () => {
  assert.deepEqual(construirHistorial([m("entrante", "   ")]), []);
});

test("frases de transferencia: por frase completa, sin tildes ni mayúsculas", () => {
  const frases = parsearFrases("hablar con una persona\n\n  Asesor   Humano \n");
  assert.deepEqual(frases, ["hablar con una persona", "asesor humano"]);
  assert.ok(pideHumano("Quiero HABLAR con una PERSONA por favor", frases));
  assert.ok(pideHumano("me pasas con un asesor humano?", frases));
  // "recursos humanos" no es pedir un humano.
  assert.ok(!pideHumano("¿Dónde queda recursos humanos?", frases));
});

test("autorización: la marca se reemplaza por el texto legal exacto, una sola vez y en su párrafo", () => {
  const legal = "Para continuar necesitamos tu autorización para tratar tus datos personales (Ley 1581 de 2012). ¿Nos autorizas? Responde SÍ o NO.";
  assert.equal(interpretarRespuesta("¡Perfecto, gracias! [[AUTORIZACION]]", legal).texto, `¡Perfecto, gracias!\n\n${legal}`);
  // Con tilde, espacios o repetida: queda una sola vez.
  assert.equal(interpretarRespuesta("[[ AUTORIZACIÓN ]] y [[AUTORIZACION]]", legal).texto, `${legal}\n\ny`);
  // Sin texto configurado, la marca no llega al aspirante.
  assert.equal(interpretarRespuesta("Listo. [[AUTORIZACION]]", "").texto, "Listo.");
  // decidirRespuesta la aplica y no la confunde con una transferencia.
  assert.deepEqual(decidirRespuesta({ texto: "Gracias. [[AUTORIZACION]]", rechazo: false }, legal), { texto: `Gracias.\n\n${legal}`, motivo: null });
  // Red de seguridad: si la pidió con sus palabras, se cambia por el texto legal.
  const resumida = "¡Recibí bien tu hoja de vida! Ya tengo todo, Carlos. Ahora solo necesito que me digas si aceptas que tratemos tus datos para revisar tu caso: responde **SÍ** o **NO**.";
  assert.equal(interpretarRespuesta(resumida, legal).texto, `¡Recibí bien tu hoja de vida! Ya tengo todo, Carlos.\n\n${legal}`);
  assert.equal(interpretarRespuesta("¿Nos autorizas a consultar tus datos y antecedentes? Responde sí o no", legal).texto, legal);
  // Otra forma real (Qwen3.5 9B): «Escribe SÍ si estás de acuerdo para tratar tu información».
  const otra = "¡Entendido! La envías cuando puedas. Mientras tanto, ¿podrías enviarme una autorización? Escribe SÍ si estás de acuerdo para tratar tu información y continuar con el proceso. 😊";
  assert.equal(interpretarRespuesta(otra, legal).texto, `¡Entendido! La envías cuando puedas.\n\n${legal}`);
  // No toca lo que no es la autorización, ni la que ya va completa.
  assert.equal(interpretarRespuesta("Escribe sí si ya enviaste la hoja de vida.", legal).texto, "Escribe sí si ya enviaste la hoja de vida.");
  assert.equal(interpretarRespuesta("¿Tu licencia es C2? Responde sí o no.", legal).texto, "¿Tu licencia es C2? Responde sí o no.");
  assert.equal(interpretarRespuesta(`Gracias. ${legal}`, legal).texto, `Gracias. ${legal}`);
  assert.equal(interpretarRespuesta(resumida, "").texto, resumida);
  // El sistema le pide al modelo la marca, no copiar el texto.
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", legal));
  assert.ok(s.includes("escribe exactamente [[AUTORIZACION]]"));
  assert.ok(s.includes("No copies, resumas ni reformules"));
});

test("frases de transferencia: sin la h y pidiendo que lo llamen", () => {
  const frases = parsearFrases("hablar con un asesor\ncon un humano");
  assert.ok(pideHumano("Nececito ablar con un asesor", frases));
  assert.ok(pideHumano("quiero hablar con un umano", frases));
  assert.ok(pideHumano("Mejor llámenme, no me gusta escribir", frases));
  assert.ok(pideHumano("me pueden llamar al número de este chat?", frases));
  // Preguntar por el proceso no es pedir una persona.
  assert.ok(!pideHumano("¿Cuándo me llaman?", frases));
  assert.ok(!pideHumano("ya me llamaron la semana pasada", frases));
});

test("respuesta: separa la marca de transferencia del texto", () => {
  assert.deepEqual(interpretarRespuesta(`Te comunico con el equipo. ${MARCA_TRANSFERIR}`), {
    texto: "Te comunico con el equipo.",
    transferir: true,
  });
  assert.deepEqual(interpretarRespuesta("  Hola, ¿en qué te ayudo?  "), { texto: "Hola, ¿en qué te ayudo?", transferir: false });
  assert.deepEqual(interpretarRespuesta(MARCA_TRANSFERIR), { texto: "", transferir: true });
});

test("respuesta: se recorta al tope de WhatsApp", () => {
  assert.equal(interpretarRespuesta("a".repeat(5000)).texto.length, MAX_CARACTERES_WHATSAPP);
});

test("sistema: incluye el prompt, la marca, la fecha en Colombia y el contacto", () => {
  const s = construirSistema("Somos La Empresa. Horario: 8 a 5.", "Ana", new Date("2026-10-19T15:00:00Z"));
  assert.ok(s.includes("Somos La Empresa. Horario: 8 a 5."));
  assert.ok(s.includes(MARCA_TRANSFERIR));
  assert.ok(s.includes("10:00"), s);
  assert.ok(s.includes("Ana"));
  assert.ok(!s.includes("\n\n\n"));
});

test("sistema: sin prompt ni contacto sigue siendo válido", () => {
  const s = construirSistema("   ", null, new Date());
  assert.ok(s.includes("(Sin instrucciones adicionales.)"));
  assert.ok(!s.includes("aparece en WhatsApp"));
});

test("sistema: ya no ofrece pasar a una persona por no saber o no entender", () => {
  const s = construirSistema("", null, new Date());
  assert.ok(!s.includes("ofrece pasar la conversación"));
  assert.ok(!s.includes("si no puedes ayudarla"));
  assert.ok(!s.includes("pídele que escriba lo que necesita"));
  assert.ok(s.includes("ve por pasos"));
  assert.ok(s.includes("2 veces seguidas"));
  assert.ok(s.includes("No son motivo para pasar la conversación"));
  assert.ok(s.includes("pide expresamente hablar con una persona"));
  assert.ok(s.includes("mandan sobre las instrucciones de la empresa"));
  // Sin proceso configurado no aparece la sección de selección.
  assert.ok(!s.includes("Proceso de selección"));
  assert.ok(!s.includes("Temas que no informas"));
});

test("sistema: proceso de selección con preguntas, documentos, temas reservados y recibidos", () => {
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "2 fotos"));
  assert.ok(s.includes("Proceso de selección de conductores:"));
  assert.ok(s.includes("  - Fecha de nacimiento (día, mes y año) o edad"));
  assert.ok(!s.includes("  - Nombre completo"));
  assert.ok(s.includes("  - Foto de la cédula por ambos lados"));
  assert.ok(s.includes("  - Salario o sueldo"));
  assert.ok(s.includes(CONFIG_POR_DEFECTO.respuestaReservada));
  assert.ok(s.includes("enviado en toda la conversación: 2 fotos."));
  // Por defecto ya no se pausa al completar: sigue activo y el chat queda «Listo para citar».
  assert.ok(!s.includes("completó el proceso de selección"));
  assert.ok(s.includes("No pases la conversación: si sigue escribiendo"));
  assert.ok(s.includes("3 veces seguidas"));
  assert.ok(!s.includes("\n\n\n"));
});

test("sistema: con la selección activa, otros temas se despiden sin pasar el chat; lo grave sí pasa", () => {
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, ""));
  assert.ok(s.includes("Este WhatsApp es solo para el proceso de selección"));
  assert.ok(s.includes("ofrece productos o servicios"));
  assert.ok(s.includes("acoso, accidente, amenaza, emergencia de salud"));
  // Ya no pasa a una persona por ser trabajador o pasajero.
  assert.ok(!s.includes("necesita que alguien lo atienda"));
  // Sin selección (agente genérico) se mantiene la regla anterior.
  const g = construirSistema("", null, new Date());
  assert.ok(g.includes("necesita que alguien lo atienda"));
  assert.ok(!g.includes("solo para el proceso de selección"));
});

test("sistema: sin transferir al completar, ni temas, y con intentos configurados", () => {
  const s = construirSistema(
    "",
    null,
    new Date(),
    reglasSeleccion({ ...CONFIG_POR_DEFECTO, transferirAlCompletar: true, temasReservados: " \n ", intentosSinEntender: 1 }, "")
  );
  // Con «pausar al completar» vuelve el comportamiento anterior.
  assert.ok(s.includes("completó el proceso de selección"));
  assert.ok(s.includes(`Gestión Humana lo contactará pronto para continuar y termina el mensaje con ${MARCA_TRANSFERIR}`));
  assert.ok(!s.includes("Temas que no informas"));
  assert.ok(s.includes("aclarar una vez"));
  // Sin recibidos no se escribe la línea.
  assert.ok(!s.includes("enviado en toda la conversación"));
});

test("listas configuradas: una por línea, sin vacías y sin normalizar", () => {
  assert.deepEqual(parsearLista("  Edad \n\nCédula   por ambos lados\n"), ["Edad", "Cédula por ambos lados"]);
});

test("recibidos: cuenta archivos de la persona por tipo, sin stickers ni salientes", () => {
  assert.equal(resumirRecibidos([]), "ninguno todavía");
  assert.equal(
    resumirRecibidos([
      m("entrante", "", "image"),
      m("entrante", "cédula", "image"),
      m("entrante", "", "document"),
      m("entrante", "", "sticker"),
      m("saliente", "", "image"),
      m("entrante", "hola"),
    ]),
    "2 fotos, 1 documento"
  );
  assert.equal(resumirRecibidos([m("entrante", "", "audio"), m("entrante", "", "location")]), "1 audio, 1 archivo");
});

test("texto reciente: lo que escribió la persona desde nuestra última respuesta", () => {
  assert.equal(
    textoReciente([m("entrante", "hola"), m("saliente", "¿Tu edad?"), m("entrante", "35"), m("entrante", "quiero hablar con una persona")]),
    "35\nquiero hablar con una persona"
  );
  assert.equal(textoReciente([m("entrante", "hola"), m("saliente", "Hola")]), "");
});

test("decisión de transferencia: marca, rechazo y vacío pasan con su motivo; lo normal no", () => {
  assert.deepEqual(decidirRespuesta({ texto: "¿Me envías tu cédula?", rechazo: false }), {
    texto: "¿Me envías tu cédula?",
    motivo: null,
  });
  assert.deepEqual(decidirRespuesta({ texto: `Te contactaremos. ${MARCA_TRANSFERIR}`, rechazo: false }), {
    texto: "Te contactaremos.",
    motivo: "marca",
  });
  assert.equal(decidirRespuesta({ texto: "No puedo", rechazo: true }).motivo, "rechazo");
  assert.equal(decidirRespuesta({ texto: "   ", rechazo: false }).motivo, "vacio");
});

test("modelos permitidos de OpenRouter: separados por coma o línea", () => {
  assert.deepEqual(parsearModelosPermitidos(" anthropic/*, google/*\nopenai/gpt-5-mini ,"), [
    "anthropic/*",
    "google/*",
    "openai/gpt-5-mini",
  ]);
  assert.deepEqual(parsearModelosPermitidos(null), []);
});

test("selección: con los requisitos, le dice con amabilidad a quien no cumple, sin pasar el chat", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req));
  assert.ok(s.includes("tener entre 20 y 57 años"));
  assert.ok(s.includes("vivir en Barranquilla o Soledad, o estar dispuesto a trasladarse"));
  assert.ok(s.includes("licencia de categoría C2 o C3"));
  assert.match(s, /díselo con amabilidad/);
  assert.match(s, /Nunca uses palabras como «descartado»/);
  // Sin requisitos (ajustes sin migrar) no se mencionan.
  assert.ok(!construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "")).includes("Requisitos del cargo"));
});

test("sistema: las faltas de ortografía, los audios y las fotos no cuentan como «no te entendí»", () => {
  const s = construirSistema("", null, new Date());
  assert.match(s, /escriben con faltas, abreviaturas/);
  assert.match(s, /Un audio, una foto o un sticker no cuentan/);
  assert.match(s, /aunque las instrucciones de la empresa lo pidan/);
});

test("selección: pide la autorización con el texto del catálogo y no pasa el chat si no autoriza", () => {
  const texto = "Para continuar necesitamos tu autorización (Ley 1581 de 2012). ¿Nos autorizas? Responde SÍ o NO.";
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", texto));
  assert.ok(s.includes(texto));
  assert.match(s, /Si sigue sin aceptar, no insistas/);
  assert.match(s, /No pases la conversación a una persona por eso/);
  // Sin texto de autorización (catálogo sin migrar) no se pide.
  const sin = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, ""));
  assert.doesNotMatch(sin, /Autorización de datos:/);
});

test("selección: no pregunta la vigencia ni da por registrado al aspirante con datos pendientes", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "texto legal", req));
  assert.match(s, /No preguntes la fecha de vencimiento de la licencia/);
  assert.match(s, /No digas que ya quedó registrado/);
  assert.match(s, /No le digas que cumple todos los requisitos mientras no sepas/);
  assert.match(s, /dice que no tiene licencia de conducción/);
  assert.match(s, /no «recibí la foto de tu licencia»/);
});

test("selección: con la licencia verificada en el RUNT, no la pregunta; si no cumple, se lo dice enseguida", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const ok = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, { estado: "cumple", motivo: "Licencia C2 vigente hasta el 10 de mayo de 2029 (RUNT)." }));
  assert.ok(ok.includes("ya está verificada en el RUNT (Licencia C2 vigente hasta el 10 de mayo de 2029 (RUNT)): no le preguntes la categoría ni la vigencia"));
  const no = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, { estado: "no_cumple", motivo: "Licencia C2 vencida desde el 10 de marzo de 2025 según el RUNT." }));
  assert.ok(no.includes("verificó la licencia de esta persona en el RUNT y no cumple: Licencia C2 vencida desde el 10 de marzo de 2025 según el RUNT. En tu próximo mensaje dile con amabilidad que por ahora no fue preseleccionado"));
  assert.ok(no.includes("licencia C2 o C3 vigente"));
  assert.ok(!construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req)).includes("verificada en el RUNT"));
  const cedula = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, { estado: "confirmar_cedula", motivo: "La cédula no aparece en el RUNT." }));
  assert.ok(cedula.includes("no aparece en el RUNT. Pídele con amabilidad que lo confirme"));
  assert.ok(!cedula.includes("en el RUNT y no cumple"));
});

test("selección: la cédula y la autorización van primero; el nombre no se pregunta y se pide la fecha de nacimiento", () => {
  const legal = "Para continuar necesitamos tu autorización (Ley 1581 de 2012). ¿Nos autorizas? Responde SÍ o NO.";
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", legal));
  assert.ok(s.includes("Lo primero es la cédula y su fecha de expedición"));
  assert.ok(s.includes("apenas te dé la cédula"));
  assert.ok(s.includes("No preguntes el nombre"));
  assert.ok(s.includes("pide la fecha de nacimiento"));
  assert.ok(s.includes("Orden: primero la cédula y su fecha de expedición, enseguida la autorización"));
  assert.ok(!s.includes("incluidos su nombre completo y su cédula"));
  // El recordatorio no activa la red de seguridad (no repite el texto legal).
  const recordatorio = "Recuerda responderme la autorización que te envié arriba para poder revisar tus requisitos.";
  assert.equal(interpretarRespuesta(`¿En qué ciudad vives? ${recordatorio}`, legal).texto, `¿En qué ciudad vives? ${recordatorio}`);
});

test("selección: el asistente no usa nombres de fuentes externas (el RUNT puede traer a otra persona)", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, { estado: "cumple", motivo: "Licencia C2 vigente." }));
  assert.ok(!s.includes("Según el RUNT se llama"));
});

test("revisión: al autorizar avisa que revisa; el seguimiento cuenta el resultado y la fecha o la edad sirven", () => {
  const legal = "Para continuar necesitamos tu autorización (Ley 1581 de 2012). ¿Nos autorizas? Responde SÍ o NO.";
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", legal, req));
  assert.ok(s.includes("pídele que espere un momento mientras consultamos sus datos"));
  assert.ok(s.includes("fecha de nacimiento (día, mes y año) o, si lo prefiere, su edad"));
  assert.ok(!s.includes("Este mensaje lo escribes por tu cuenta"));
  const seg = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", legal, req, { estado: "cumple", motivo: "Licencia C2 vigente." }, true));
  assert.ok(seg.includes("Este mensaje lo escribes por tu cuenta"));
  assert.ok(seg.includes("dale la buena noticia"));
  assert.ok(NOTA_REVISION.includes("no la escribió la persona"));
  assert.equal(pareceAvisoDeRevision("¡Gracias, Pedro! Ya estoy revisando tus datos; en unos minutos te cuento si cumples la preselección."), true);
  assert.equal(pareceAvisoDeRevision("¿Cuál es tu fecha de nacimiento o tu edad?"), false);
  assert.equal(pareceAvisoDeRevision("¡Gracias! Espera un momento mientras consultamos tus datos; en unos minutos te contamos si cumples la preselección."), true);
  // El saludo no es un aviso de espera (si lo fuera, el asistente volvía a pedir la cédula solo).
  assert.equal(
    pareceAvisoDeRevision("Para empezar, ¿me compartes tu número de cédula y su fecha de expedición? Con ellos revisamos enseguida si cumples los requisitos."),
    false
  );
});

test("licencia del RUNT: vencida pregunta si renueva, no cumple dice «no fue preseleccionado», auditiva sin diagnóstico, lentes a la prueba", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const sis = (lv: Parameters<typeof reglasSeleccion>[4]) => construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, lv));
  const vencida = sis({ estado: "vencida", motivo: "Licencia C2 vencida desde el 10 de marzo de 2025 según el RUNT: falta saber si la va a renovar.", renovara: null });
  assert.ok(vencida.includes("Pregúntale con amabilidad si la va a renovar"));
  assert.ok(vencida.includes("no fue preseleccionado"));
  const renueva = sis({ estado: "vencida", motivo: "Licencia C2 vencida.", renovara: true });
  assert.ok(renueva.includes("ya dijo que la va a renovar: no se lo vuelvas a preguntar"));
  const noCumple = sis({ estado: "no_cumple", motivo: "En el RUNT tiene licencia B1: se pide C2 o C3." });
  assert.ok(noCumple.includes("no fue preseleccionado para el cargo de conductor"));
  const auditiva = sis({ estado: "no_cumple", motivo: "La licencia tiene una restricción por pérdida auditiva en el RUNT.", auditiva: true });
  assert.ok(auditiva.includes("No menciones diagnósticos"));
  assert.ok(!auditiva.includes("pérdida auditiva"));
  const lentes = sis({ estado: "cumple", motivo: "Licencia C2 vigente.", lentes: true });
  assert.ok(lentes.includes("debe traer sus lentes a la prueba"));
});

test("residencia: antes de decir que no cumple, hasta dos intentos para animarlo a trasladarse", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req));
  assert.ok(s.includes("haz hasta dos intentos amables, uno por mensaje, para animarlo"));
  assert.ok(s.includes("quedarse con un familiar o un conocido en Barranquilla o Soledad"));
  assert.ok(!s.includes("o vive fuera y dijo que no se traslada)"));
});

test("antecedentes en revisión: el asistente dice que una persona lo contactará y no habla de antecedentes", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const con = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, null, false, true));
  assert.ok(con.includes("Una persona de Gestión Humana va a revisar el proceso de esta persona"));
  assert.ok(con.includes("Nunca le hables de antecedentes"));
  const sin = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req));
  assert.ok(!sin.includes("va a revisar el proceso de esta persona"));
});

test("cerrado por antecedentes: solo que no pasó el proceso, sin el motivo", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, null, false, false, true));
  assert.ok(s.includes("no pasó el proceso de selección"));
  assert.ok(s.includes("Nunca le digas por qué"));
  assert.ok(!s.includes("va a revisar el proceso de esta persona"));
});

test("foto de la cédula leída: el asistente la ve y pide confirmar en vez de preguntar", () => {
  const turnos = construirHistorial([{ direccion: "entrante", contenido: "", mediaTipo: "image", lectura: "cédula; número 72009959, expedida el 1997-11-07" }]);
  assert.match(turnos[0].content, /\[Lectura automática de la foto: cédula; número 72009959/);
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req));
  assert.ok(s.includes("no le pidas los datos que ya se leyeron"));
  assert.ok(s.includes("pídele que confirme si están bien"));
});

test("vínculo con la empresa: al activo se le dice que ya trabaja aquí; al retirado, que una persona revisará", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const activo = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, null, false, false, false, "activo"));
  assert.ok(activo.includes("ya hace parte de la empresa como conductor"));
  assert.ok(activo.includes("No le pidas la autorización"));
  const retirado = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, null, false, false, false, "retirado"));
  assert.ok(retirado.includes("ya trabajó con nosotros como conductor"));
  assert.ok(retirado.includes("no le menciones su retiro"));
  assert.ok(retirado.includes("una persona de Gestión Humana revisará su proceso"));
  const ninguno = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req));
  assert.ok(!ninguno.includes("registros de la empresa"));
});

test("autorización: si el modelo pone la marca y además copia el texto legal, va una sola vez", () => {
  const legal = "Para continuar necesitamos tu autorización (Ley 1581 de 2012). ¿Nos autorizas? Responde SÍ o NO.";
  const { texto } = interpretarRespuesta(`¡Gracias! ${MARCA_AUTORIZACION}\n\n${legal}`, legal);
  assert.equal(texto.split(legal).length - 1, 1);
  assert.ok(texto.startsWith("¡Gracias!"));
  const doble = interpretarRespuesta(`${legal}\n\n${legal}`, legal).texto;
  assert.equal(doble, legal);
});
