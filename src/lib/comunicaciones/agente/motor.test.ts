import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARCA_AUTORIZACION, MARCA_SI_NO, MARCA_TRANSFERIR, MAX_CARACTERES_WHATSAPP, NOTA_REVISION, construirHistorial, construirSistema, decidirRespuesta, extraerReprogramacion,
  interpretarRespuesta, notaRevision, pareceAvisoDeRevision, parsearFrases, parsearLista, pideHumano, reglasBienvenida, reglasSeleccion, resumirRecibidos, textoReciente,
  SIN_SELECCION as SIN_SELECCION_PRUEBA, type MensajeHistorial,
} from "./motor";
import { parsearModelosPermitidos } from "./proveedores";
import { CONFIG_POR_DEFECTO, PROMPT_SELECCION_SUGERIDO } from "./opciones";

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

test("historial: el audio transcrito llega con lo que dijo (entrega 4)", () => {
  const audio = { ...m("entrante", "", "audio"), transcripcion: "Tengo licencia C2 y vivo en Soledad" };
  assert.equal(construirHistorial([audio])[0].content, "[Envió un audio] [Lo que dice el audio: «Tengo licencia C2 y vivo en Soledad»]");
});

test("historial: un [unsupported] (foto de «ver una vez») se explica como algo que no llegó", () => {
  const [t] = construirHistorial([m("entrante", "[unsupported]")]);
  assert.match(t.content, /no llegó ningún archivo/);
  assert.doesNotMatch(t.content, /^\[Envió una foto\]/);
});

test("historial: una foto sin copia local no cuenta como recibida, salvo que se haya leído", () => {
  const sin = { ...m("entrante", "mi cédula", "image"), sinArchivo: true };
  assert.equal(construirHistorial([sin])[0].content, "[Intentó enviar una foto, pero no se pudo descargar: no la tenemos] mi cédula");
  // Descartada después de leerla (borrosa o reemplazada): sí llegó.
  const leida = { ...sin, lectura: "cédula amarilla (frente); número 123456" };
  assert.match(construirHistorial([leida])[0].content, /^\[Envió una foto\] \[Lectura automática/);
});

test("sistema: no da por recibido un documento que no aparece en la conversación", () => {
  const s = construirSistema("", null, new Date());
  assert.match(s, /Solo recibiste un archivo si en la conversación aparece como «\[Envió …\]»/);
  assert.match(s, /no de «ver una vez»/);
});

test("fecha de expedición rechazada: se le vuelve a pedir sin decir con qué se verificó; tras varias, una persona", () => {
  const con = (intentos: number) =>
    construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", null, null, false, false, false, null, { fecha: "1997-11-07", intentos }));
  const s = con(1);
  assert.match(s, /La fecha de expedición que dio \(1997-11-07\) no coincide con el número de cédula que dio/);
  // Puede estar mal cualquiera de los dos: se le piden ambos.
  assert.match(s, /revise en su cédula los dos datos, el número y la fecha de expedición/);
  assert.match(s, /te los vuelva a enviar/);
  assert.match(s, /No menciones con qué registro, entidad o sistema se verificó/);
  assert.doesNotMatch(s, /RNMC|Policía/);
  assert.match(s, /otro número de cédula u otra fecha distinta de 1997-11-07/);
  const varias = con(3);
  assert.match(varias, /No se la vuelvas a pedir/);
  assert.doesNotMatch(varias, /te los vuelva a enviar/);
  // Sin rechazo, nada de esto.
  assert.doesNotMatch(construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "")), /no coincide con el número de cédula/);
});

test("verificación demorada (Croma no respondió): nunca «ya revisamos»; el seguimiento avisa sin preguntar", () => {
  const seg = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", null, null, true, false, false, null, null, true));
  assert.match(seg, /la verificación todavía no responde/);
  assert.match(seg, /No digas que ya revisamos o terminamos de revisar/);
  assert.match(seg, /no le hagas preguntas en este mensaje/);
  assert.doesNotMatch(seg, /Si arriba no dice nada de su licencia/);
  assert.match(notaRevision(null, true), /todavía no responde/);
  // Sin demora: la nota trae el resultado de la licencia (sin resultado todavía, que seguimos revisando).
  assert.match(notaRevision(null, false), /terminó la revisión de sus datos que le anunciaste\. Todavía no tenemos el resultado de su licencia/);
  // En los demás turnos: puede seguir con las preguntas, sin decir que ya revisamos.
  const normal = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", null, null, false, false, false, null, null, true));
  assert.match(normal, /Nunca digas que ya revisamos o terminamos de revisar sus datos/);
  // La fecha rechazada manda sobre la demora.
  assert.match(notaRevision({ fecha: "1997-12-11", intentos: 1 }, true), /no coincide con el número de cédula/);
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
  assert.deepEqual(decidirRespuesta({ texto: "Gracias. [[AUTORIZACION]]", rechazo: false }, legal), { texto: `Gracias.\n\n${legal}`, motivo: null, reprogramar: null, botones: null });
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
    reprogramar: null,
    botones: null,
  });
  assert.deepEqual(decidirRespuesta({ texto: `Te contactaremos. ${MARCA_TRANSFERIR}`, rechazo: false }), {
    texto: "Te contactaremos.",
    motivo: "marca",
    reprogramar: null,
    botones: null,
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
  // No apareció con la cédula y el apellido: se le piden los dos (o la foto).
  assert.ok(cedula.includes("no encontramos su licencia en el RUNT. Pídele con amabilidad que confirme los dos"));
  assert.ok(!cedula.includes("en el RUNT y no cumple"));
});

test("selección: recomendado, ciudad, edad, cédula y autorización, experiencia, disponibilidad; la licencia no se pregunta", () => {
  const legal = "Para continuar necesitamos tu autorización (Ley 1581 de 2012). ¿Nos autorizas? Responde SÍ o NO.";
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", legal));
  // Orden de GH del 19-nov-2026. Antes de la autorización van la cédula, el primer
  // apellido y la fecha de expedición (o la foto por ambos lados), para no pedir nada después.
  assert.ok(s.includes("Orden de las preguntas (pedido de Gestión Humana): 1) en qué ciudad vive"));
  assert.ok(s.includes("2) su edad"));
  // Desde el 21-nov-2026, después de la cédula y antes de la autorización: si viene recomendado.
  assert.ok(s.includes("4) apenas los tenga, si viene recomendado por alguien que trabaja en la empresa, y enseguida la autorización"));
  assert.ok(s.includes("6) desde cuándo podría empezar a trabajar"));
  assert.ok(s.includes("La ciudad la preguntas desde tu primer mensaje, junto con el saludo."));
  // La licencia sale del RUNT con la cédula (Croma): no se pregunta.
  assert.ok(s.includes("La licencia no se pregunta"));
  assert.ok(s.includes("pídelos después de la edad"));
  // Aunque el saludo guardado por la empresa no mencione el apellido (visto el 18-nov-2026).
  assert.ok(s.includes("sin el primer apellido: pide siempre los tres"));
  // Si ya trabajó en la empresa se revisa con la cédula: no se pregunta aunque esté en la lista guardada (19-nov-2026).
  const conPregunta = reglasSeleccion({ ...CONFIG_POR_DEFECTO, preguntasRequisitos: "Ciudad donde vive\nSi ha trabajado antes en La Carolina\n¿Ya trabajó con nosotros?" }, "");
  assert.deepEqual(conPregunta.preguntas, ["Ciudad donde vive"]);
  assert.ok(s.includes("No preguntes si ha trabajado antes en La Carolina"));
  // Con la fecha de nacimiento leída en la foto no se pregunta la edad (19-nov-2026).
  assert.ok(s.includes("no le preguntes la fecha de nacimiento ni la edad: ya la tienes de su cédula"));
  assert.ok(s.includes("apenas tengas la cédula, el primer apellido y la fecha de expedición"));
  assert.ok(s.includes("pídeselo primero (o la foto del otro lado) y la autorización en el mensaje siguiente"));
  assert.ok(s.includes("No preguntes el nombre"));
  assert.ok(s.includes("pide la fecha de nacimiento"));
  assert.ok(s.includes("Orden: primero la ciudad (o si puede trasladarse y cuándo estaría en la ciudad), después la edad, después la cédula con el primer apellido y la fecha de expedición (o la foto por ambos lados), enseguida si viene recomendado y después la autorización"));
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
  assert.ok(seg.includes("Dale la buena noticia"));
  assert.ok(NOTA_REVISION.includes("no la escribió la persona"));
  assert.equal(pareceAvisoDeRevision("¡Gracias, Pedro! Ya estoy revisando tus datos; en unos minutos te cuento si cumples la preselección."), true);
  assert.equal(pareceAvisoDeRevision("¿Cuál es tu fecha de nacimiento o tu edad?"), false);
  assert.equal(pareceAvisoDeRevision("¡Gracias! Espera un momento mientras consultamos tus datos; en unos minutos te contamos si cumples la preselección."), true);
  // El saludo no es un aviso de espera (si lo fuera, el asistente volvía a pedir la cédula solo).
  assert.equal(
    pareceAvisoDeRevision("Para empezar, ¿me compartes tu número de cédula y su fecha de expedición? Con ellos revisamos enseguida si cumples los requisitos."),
    false
  );
  assert.equal(pareceAvisoDeRevision(PROMPT_SELECCION_SUGERIDO.split("\n").at(-1)!), false);
});

test("al empezar pregunta la ciudad; la cédula se pide con la opción de mandar la foto por ambos lados", () => {
  // Guion de GH del 19-nov-2026: el saludo pregunta la ciudad. Desde el 21-nov-2026 el saludo y el nombre no van en el
  // prompt (son el mensaje «Bienvenida» y el ajuste «Nombre del asistente»); si el saludo no pregunta la ciudad, el motor la pide.
  assert.doesNotMatch(PROMPT_SELECCION_SUGERIDO, /Angie|salúdala/);
  assert.match(reglasBienvenida("¡Hola! Te saluda Angie.", null).join("\n"), /si el saludo no pregunta en qué ciudad vive, pregúntaselo/);
  // La recomendación va después de la cédula (21-nov-2026).
  assert.match(CONFIG_POR_DEFECTO.preguntasRequisitos.split("\n")[3], /^Si viene recomendado por alguien que trabaja en la empresa/);
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, ""));
  assert.match(s, /si prefiere puede enviar una foto de su cédula por ambos lados \(frente y reverso\) en lugar de escribirlos/);
  assert.match(s, /Si mandó la foto de un solo lado, pídele la del otro lado/);
  assert.match(s, /también puede mandar la foto/);
});

test("recomendado: va después de la cédula y antes de la autorización, con botones de sí o no; la marca no llega al aspirante", () => {
  const legal = "Para continuar necesitamos tu autorización (Ley 1581 de 2012). ¿Nos autorizas? Responde SÍ o NO.";
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", legal));
  // Pedido de GH del 21-nov-2026: después del saludo y de la cédula (no tiene que ser la primera).
  assert.match(s, /Recomendación \(pedido de Gestión Humana, 21-nov-2026\): apenas tengas la cédula, el primer apellido y la fecha de expedición/);
  assert.ok(s.includes(`Termina ese mensaje con ${MARCA_SI_NO}`));
  // Va sola: con la autorización en el mismo mensaje un «sí» sería ambiguo.
  assert.match(s, /tampoco la autorización: un «sí» quedaría sin saber a qué responde\)\. La autorización va en tu siguiente mensaje, apenas responda/);
  assert.match(s, /y haya respondido si viene recomendado \(ver arriba: esa pregunta va sola, en el mensaje en que le agradeces la cédula\), pídele la autorización en tu siguiente mensaje/);
  // No se pregunta quién lo recomendó: lo completa Gestión Humana (Salud Ocupacional, 21-nov-2026).
  assert.match(s, /No le preguntes quién lo recomendó: eso lo completa Gestión Humana/);
  assert.doesNotMatch(s, /pregúntale también el nombre completo de quien lo recomendó/);
  // Un «no» no lo cambia el asistente: lo revisa Gestión Humana.
  assert.match(s, /Si respondió que no y después dice que sí venía recomendado, no lo cambies tú/);
  // Si responde con otra cosa no se da por recomendado (visto con Haiku el 21-nov-2026).
  assert.match(s, /no supongas que viene recomendado ni que un nombre que dé es el de quien lo recomendó/);
  assert.match(s, /no prometas nada por eso/);
  // El saludo vuelve a preguntar la ciudad y no la recomendación.
  const conSaludo = construirSistema("", null, new Date(), { ...reglasSeleccion(CONFIG_POR_DEFECTO, ""), bienvenida: "¡Hola! Para empezar: ¿vienes recomendado?" });
  assert.match(conSaludo, /si el saludo no pregunta en qué ciudad vive, pregúntaselo al final del mensaje\. No le preguntes todavía si viene recomendado \(va después de la cédula\): si el saludo trae esa pregunta, quítala de este mensaje/);
  assert.doesNotMatch(conSaludo, /Si viene recomendado lo preguntas en tu primer mensaje/);
  // A quien escribe por otro tema no se le copia el saludo: la regla va antes del texto (21-nov-2026).
  const [antes] = conSaludo.split("¡Hola! Para empezar");
  assert.match(antes, /Primero decide si escribe por el trabajo\. Si es claro que escribe por otro tema \(un número equivocado o un mensaje personal que claramente no es para la empresa[^)]*\), no uses este saludo/);
  // Sin proceso de selección no se pregunta.
  assert.doesNotMatch(construirSistema("", null, new Date()), /recomendado/);

  const pregunta = "¡Gracias, Carlos!\nAntes de seguir: ¿vienes recomendado por alguien que trabaja en Transportes La Carolina?";
  assert.deepEqual(decidirRespuesta({ texto: `${pregunta} ${MARCA_SI_NO}`, rechazo: false }), { texto: pregunta, motivo: null, reprogramar: null, botones: ["Sí", "No"] });
  // Tolera espacios y la tilde; sin la marca va como texto.
  assert.deepEqual(decidirRespuesta({ texto: `${pregunta} [[ SÍ_NO ]]`, rechazo: false }).botones, ["Sí", "No"]);
  assert.equal(decidirRespuesta({ texto: pregunta, rechazo: false }).botones, null);
  assert.equal(interpretarRespuesta(`${pregunta} ${MARCA_SI_NO}`).texto, pregunta);
  // Con la autorización en el mismo mensaje un «Sí» sería ambiguo: sin botones.
  assert.equal(decidirRespuesta({ texto: `Gracias. [[AUTORIZACION]] ${MARCA_SI_NO}`, rechazo: false }, legal).botones, null);
  // Si pasa a una persona, tampoco.
  assert.equal(decidirRespuesta({ texto: `Te comunico. ${MARCA_TRANSFERIR} ${MARCA_SI_NO}`, rechazo: false }).botones, null);
});

test("seguimiento: una sola instrucción según el RUNT, también en la nota final (caso B1 del 18-nov)", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const b1 = { estado: "no_cumple" as const, motivo: "En el RUNT tiene licencia B1: se pide C2 o C3.", lentes: true };
  const s = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, b1, true));
  assert.match(s, /Resultado: según el RUNT su licencia no sirve para el cargo \(En el RUNT tiene licencia B1: se pide C2 o C3\)\. Dile con amabilidad que por ahora no fue preseleccionado/);
  // Ya no está la alternativa genérica que el modelo elegía.
  assert.doesNotMatch(s, /Si arriba no dice nada de su licencia/);
  const nota = notaRevision(null, false, b1, req.licencias);
  assert.match(nota, /no fue preseleccionado/);
  assert.match(nota, /no digas que Gestión Humana sigue revisando/);
  // Cumple: buena noticia y la fecha de expedición si falta.
  const cumple = notaRevision(null, false, { estado: "cumple", motivo: "Licencia C2 vigente." });
  assert.match(cumple, /pídele la fecha de expedición de su cédula si todavía no la tienes/);
  // Vencida sin respuesta: solo la pregunta de si la renueva.
  assert.match(notaRevision(null, false, { estado: "vencida", motivo: "Vencida.", renovara: null }), /Pregúntale con amabilidad si la va a renovar/);
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

test("cita: la marca de reprogramar se quita del mensaje y trae el día; las reglas solo la permiten si no puede", () => {
  assert.deepEqual(decidirRespuesta({ texto: "Listo, te esperamos el viernes 20 a la 1:00 p. m. [[REPROGRAMAR:2026-11-20]]", rechazo: false }), {
    texto: "Listo, te esperamos el viernes 20 a la 1:00 p. m.",
    motivo: null,
    reprogramar: "2026-11-20",
    botones: null,
  });
  assert.deepEqual(extraerReprogramacion("Hola [[ reprogramar : 2026-11-21 ]]"), { texto: "Hola", fecha: "2026-11-21" });
  assert.equal(extraerReprogramacion("Sin marca").fecha, null);

  const base = reglasSeleccion(CONFIG_POR_DEFECTO, "");
  const cita = {
    fecha: "jueves 19 de noviembre",
    hora: "1:00 p. m.",
    direccion: "Calle 1",
    confirmada: true,
    pideOtraFecha: false,
    noAsistio: false,
    opciones: [{ fecha: "2026-11-20", texto: "viernes 20 de noviembre", hora: "1:00 p. m." }],
    puedeReprogramar: true,
  };
  const s1 = construirSistema("", null, new Date("2026-11-18T15:00:00Z"), { ...base, cita });
  // Pedido de GH del 22-nov-2026: primero por qué no puede, un intento de que vaya y solo el siguiente día hábil.
  assert.match(s1, /Primero pregúntale con amabilidad por qué no puede ir/);
  assert.match(s1, /intenta una sola vez que mantenga la cita/);
  assert.match(s1, /ofrécele solo el siguiente día disponible: viernes 20 de noviembre a las 1:00 p\. m\. \(2026-11-20\)/);
  assert.match(s1, /No le ofrezcas otros días ni le preguntes qué día prefiere/);
  assert.match(s1, /\[\[REPROGRAMAR:2026-11-20\]\]/);
  assert.match(s1, /Si ese día tampoco puede, no propongas más fechas/);
  assert.match(s1, /Nunca ofrezcas cambiar la fecha/);
  assert.doesNotMatch(s1, /qué día sí puede/);
  // Sin reprogramaciones disponibles, lo acuerda una persona.
  const s2 = construirSistema("", null, new Date("2026-11-18T15:00:00Z"), { ...base, cita: { ...cita, puedeReprogramar: false } });
  assert.doesNotMatch(s2, /REPROGRAMAR:AAAA/);
  assert.match(s2, /ya cambió la cita varias veces/);
  // No llegó: se le ofrece reprogramar.
  const s3 = construirSistema("", null, new Date("2026-11-18T15:00:00Z"), { ...base, cita: { ...cita, noAsistio: true } });
  assert.match(s3, /pero no llegó/);
  assert.match(s3, /qué pasó, por qué no pudo llegar/);
  // Salida de reconocimiento de ruta: las mismas reglas, con su nombre.
  const s4 = construirSistema("", null, new Date("2026-11-18T15:00:00Z"), { ...base, cita: { ...cita, tipo: "reconocimiento" as const, hora: "9:00 a. m." } });
  assert.match(s4, /Cita al reconocimiento de ruta:/);
  assert.match(s4, /citada a la salida de reconocimiento de ruta el jueves 19 de noviembre/);
  assert.match(s4, /ofrécele solo el siguiente día disponible/);
  assert.doesNotMatch(s4, /zapatos cerrados/);
  // Sin cita, nada de esto.
  assert.doesNotMatch(construirSistema("", null, new Date("2026-11-18T15:00:00Z"), base), /Cita a la prueba de manejo/);
});

test("bienvenida: el saludo del catálogo va en la primera respuesta, con sus saltos de línea y el nombre", () => {
  const base = reglasSeleccion(CONFIG_POR_DEFECTO, "");
  const texto = "¡Hola, {nombre}! Te saluda Angie.\nPara empezar, envíame tu cédula.";
  const s = construirSistema("", "carlos andrés 🚌", new Date(), { ...base, bienvenida: texto });
  assert.match(s, /Saludo de bienvenida:/);
  assert.match(s, /  ¡Hola, Carlos! Te saluda Angie\.\n  Para empezar, envíame tu cédula\./);
  // Sin nombre usable, la variable desaparece con su coma.
  assert.match(construirSistema("", null, new Date(), { ...base, bienvenida: texto }), /  ¡Hola! Te saluda Angie\./);
  // Sin texto, al volver tras un cierre o en el seguimiento de la revisión, no va.
  assert.doesNotMatch(construirSistema("", null, new Date(), base), /Saludo de bienvenida/);
  assert.doesNotMatch(construirSistema("", null, new Date(), { ...base, bienvenida: texto, regreso: "edad" }), /Saludo de bienvenida/);
  assert.doesNotMatch(construirSistema("", null, new Date(), { ...base, bienvenida: texto, seguimientoRevision: true }), /Saludo de bienvenida/);
  // Sin proceso de selección (agente genérico), tampoco.
  assert.doesNotMatch(construirSistema("", null, new Date(), { ...SIN_SELECCION_PRUEBA, bienvenida: texto }), /Saludo de bienvenida/);
});

test("nombre del asistente: se presenta con el configurado, si lo hay", () => {
  const base = reglasSeleccion(CONFIG_POR_DEFECTO, "");
  assert.match(construirSistema("Eres Angie.", null, new Date(), { ...base, nombreAsistente: "Valentina" }), /Te llamas Valentina: preséntate con ese nombre/);
  assert.doesNotMatch(construirSistema("Eres Angie.", null, new Date(), base), /Te llamas/);
});

test("respuestas de Gestión Humana: van con su texto y cuándo usarlas", () => {
  const base = reglasSeleccion(CONFIG_POR_DEFECTO, "");
  const s = construirSistema("", null, new Date(), {
    ...base,
    respuestas: [
      { cuando: "Si pregunta qué vehículos se manejan", texto: "Buses y busetas.\nChevrolet, Foton y Yutong." },
      { cuando: "Vacía", texto: "  " },
    ],
  });
  assert.match(s, /Respuestas de Gestión Humana para casos frecuentes:/);
  assert.match(s, /- Si pregunta qué vehículos se manejan: «Buses y busetas\. Chevrolet, Foton y Yutong\.»/);
  assert.doesNotMatch(s, /Vacía/);
  assert.doesNotMatch(construirSistema("", null, new Date(), base), /Respuestas de Gestión Humana/);
});
