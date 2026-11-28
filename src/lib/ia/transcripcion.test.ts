import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarExt } from "./transcripcion";

test("normalizarExt: las notas de voz de WhatsApp van como ogg", () => {
  assert.equal(normalizarExt("audio/ogg; codecs=opus"), "ogg");
  assert.equal(normalizarExt("audio/opus"), "ogg");
  assert.equal(normalizarExt("audio/mpeg"), "mp3");
  assert.equal(normalizarExt("audio/x-m4a"), "m4a");
  assert.equal(normalizarExt("audio/x-wav"), "wav");
  assert.equal(normalizarExt("", "nota.aac"), "aac");
  // Sin pista: webm, el que graba el navegador.
  assert.equal(normalizarExt("", ""), "webm");
});
