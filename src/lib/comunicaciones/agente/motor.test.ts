import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARCA_TRANSFERIR, MAX_CARACTERES_WHATSAPP, construirHistorial, construirSistema, decidirRespuesta,
  interpretarRespuesta, parsearFrases, parsearLista, pideHumano, reglasSeleccion, resumirRecibidos, textoReciente,
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
  assert.ok(s.includes("escribiendo exactamente [[AUTORIZACION]]"));
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
  assert.ok(s.includes("  - Edad"));
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
  assert.match(s, /No le digas que cumple los requisitos mientras no sepas/);
  assert.match(s, /dice que no tiene licencia de conducción/);
  assert.match(s, /no «recibí la foto de tu licencia»/);
});

test("selección: con la licencia verificada en el RUNT, no la pregunta; si no cumple, se lo dice enseguida", () => {
  const req = { edadMinima: 20, edadMaxima: 57, ciudades: ["Barranquilla", "Soledad"], licencias: ["C2", "C3"] };
  const ok = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, { estado: "cumple", motivo: "Licencia C2 vigente hasta el 10 de mayo de 2029 (RUNT)." }));
  assert.ok(ok.includes("ya está verificada en el RUNT (Licencia C2 vigente hasta el 10 de mayo de 2029 (RUNT)): no le preguntes la categoría ni la vigencia"));
  const no = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, { estado: "no_cumple", motivo: "Licencia C2 vencida desde el 10 de marzo de 2025 según el RUNT." }));
  assert.ok(no.includes("verificó la licencia de esta persona en el RUNT y no cumple: Licencia C2 vencida desde el 10 de marzo de 2025 según el RUNT. En tu próximo mensaje díselo"));
  assert.ok(no.includes("licencia C2 o C3 vigente"));
  assert.ok(!construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req)).includes("verificada en el RUNT"));
  const cedula = construirSistema("", null, new Date(), reglasSeleccion(CONFIG_POR_DEFECTO, "", "", req, { estado: "confirmar_cedula", motivo: "La cédula no aparece en el RUNT." }));
  assert.ok(cedula.includes("no aparece en el RUNT. Pídele con amabilidad que lo confirme"));
  assert.ok(!cedula.includes("en el RUNT y no cumple"));
});
