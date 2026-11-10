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
  assert.ok(s.includes("no le entendiste"));
  assert.ok(s.includes("2 veces seguidas"));
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
  assert.ok(s.includes("completó el proceso de selección"));
  assert.ok(s.includes(`representante lo contactará pronto para continuar y termina el mensaje con ${MARCA_TRANSFERIR}`));
  assert.ok(!s.includes("\n\n\n"));
});

test("sistema: sin transferir al completar, ni temas, y con intentos configurados", () => {
  const s = construirSistema(
    "",
    null,
    new Date(),
    reglasSeleccion({ ...CONFIG_POR_DEFECTO, transferirAlCompletar: false, temasReservados: " \n ", intentosSinEntender: 1 }, "")
  );
  assert.ok(!s.includes("completó el proceso de selección"));
  assert.ok(s.includes("agradécele y dile que un representante lo contactará pronto para continuar."));
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
