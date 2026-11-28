import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_SIN_VOZ,
  PREFIJO_AUDIO_DUDOSO,
  audioParaModelo,
  calidadTranscripcion,
  leerTranscripcionGuardada,
  normalizarParaComparar,
  similitudTranscripciones,
  transcripcionParaGuardar,
} from "./calidad-audio";

// Transcripciones reales (gpt-4o-mini-transcribe y Whisper por OpenRouter) del 23-nov-2026,
// de una nota de voz con distintos niveles de ruido de fondo.
const CASOS: [string, string, string, string][] = [
  ["limpio", "Hola, tengo licencia C2, treinta y cuatro años y vivo en soledad. Manejé buseta tres años.", "Hola, tengo licencia C2, 34 años y vivo en soledad. Manejé buseta tres años.", "buena"],
  ["ruido 0 dB", "Hola, tengo licencia C2, treinta y cuatro años y vivo en Soledad. Maneje buseta tres años.", "Hola, tengo licencia G2, 34 años y vivo en Soledad. Manecié de cerca tres años.", "buena"],
  ["ruido -3 dB", "Hola, tengo cincuenta y dos, treinta y cuatro años vivo en Sevilla. Manegue Ruyseta Tresal.", "Hola, tengo licencia de 2, 34 años y vivo en salud. Manifé tu seta tres años.", "dudosa"],
  ["ruido -6 dB", "Hola, tengo un hijo de cuatro años y cinco meses. Manifiesto su depresión.", "Hola, tengo licencia, yo soy López, 34 años y yo soy López. Manece licencia a tres años.", "dudosa"],
  ["ruido -8 dB", "", "ein colote, al 202, 24 años y 18 años manному de una serrata", "sin_voz"],
  ["solo ruido", "", "Gracias por ver el video.", "sin_voz"],
  ["silencio", "", "Gracias.", "sin_voz"],
  ["«Sí»", "Sí.", "Sí.", "buena"],
  ["cortado", "Hola, tengo licencia C2, treinta y cuatro años y vivo...", "Hola, tengo licencia C2, 34 años y vivo en el país.", "buena"],
];

test("calidad del audio: los casos medidos con ruido de fondo", () => {
  for (const [nombre, principal, control, esperado] of CASOS) {
    assert.equal(calidadTranscripcion(principal, control), esperado, nombre);
  }
});

test("calidad del audio: inventos de los modelos y casos de borde", () => {
  // Whisper como principal: con solo ruido inventa «Gracias por ver el video».
  assert.equal(calidadTranscripcion("Gracias por ver el video.", ""), "sin_voz");
  assert.equal(calidadTranscripcion("Subtítulos realizados por la comunidad de Amara.org", "Hola"), "sin_voz");
  // Un «gracias» suelto: invento si el otro modelo no lo oyó, real si los dos lo oyen.
  assert.equal(calidadTranscripcion("Gracias.", ""), "sin_voz");
  assert.equal(calidadTranscripcion("Gracias.", "Gracias"), "buena");
  // Una o dos palabras que el otro no captó: se confía; una frase larga sin confirmar, no.
  assert.equal(calidadTranscripcion("C2", ""), "buena");
  assert.equal(calidadTranscripcion("Vivo en Sevilla y tengo cincuenta años", ""), "dudosa");
  // Sin segundo modelo (falló o no hay clave): como antes, se confía en la principal.
  assert.equal(calidadTranscripcion("Vivo en Soledad", null, false), "buena");
  assert.equal(calidadTranscripcion("...", "Hola"), "sin_voz");
});

test("calidad del audio: los números dichos en palabras se comparan como cifras", () => {
  assert.deepEqual(normalizarParaComparar("Treinta y cuatro años, C dos"), ["34", "anos", "c", "2"]);
  assert.equal(similitudTranscripciones("tengo treinta y cuatro años", "Tengo 34 años."), 1);
});

test("calidad del audio: se guarda con marca y se lee sin ella", () => {
  assert.equal(transcripcionParaGuardar("", "sin_voz"), AUDIO_SIN_VOZ);
  assert.equal(transcripcionParaGuardar("vivo en Sevilla", "dudosa"), `${PREFIJO_AUDIO_DUDOSO}vivo en Sevilla`);
  assert.equal(transcripcionParaGuardar("vivo en Soledad", "buena"), "vivo en Soledad");
  assert.deepEqual(leerTranscripcionGuardada(`${PREFIJO_AUDIO_DUDOSO}vivo en Sevilla`), { calidad: "dudosa", texto: "vivo en Sevilla" });
  assert.deepEqual(leerTranscripcionGuardada(AUDIO_SIN_VOZ), { calidad: "sin_voz", texto: "" });
  assert.equal(leerTranscripcionGuardada(""), null);
});

test("calidad del audio: lo que ven el asistente y la extracción", () => {
  assert.equal(audioParaModelo("Tengo licencia C2"), "[Lo que dice el audio: «Tengo licencia C2»]");
  // De un audio dudoso no se pasa lo transcrito (podría estar inventado).
  const dudoso = audioParaModelo(`${PREFIJO_AUDIO_DUDOSO}vivo en Sevilla`);
  assert.match(dudoso, /mucho ruido de fondo y no se entendió bien/);
  assert.ok(!dudoso.includes("Sevilla"));
  assert.match(audioParaModelo(AUDIO_SIN_VOZ), /no se entendió: no se oye una voz clara/);
  assert.equal(audioParaModelo(null), "");
});
