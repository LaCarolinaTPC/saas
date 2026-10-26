import { test } from "node:test";
import assert from "node:assert/strict";
import { esRutaMedio, formatoDuracion, nombreVisible, rutasParaMedio, tipoDeMime, validarDeclaracion } from "./medios-reglas";

const U = "11111111-1111-1111-1111-111111111111";

test("tipoDeMime distingue imagen y video; rechaza lo demás", () => {
  assert.equal(tipoDeMime("image/png"), "imagen");
  assert.equal(tipoDeMime("video/webm"), "video");
  assert.equal(tipoDeMime("video/quicktime"), null);
  assert.equal(tipoDeMime("image/gif"), null);
});

test("validarDeclaracion aplica el límite de cada tipo", () => {
  assert.equal(validarDeclaracion({ nombre: "a.jpg", mime: "image/jpeg", bytes: 3 * 1024 * 1024 }), null);
  assert.match(validarDeclaracion({ nombre: "a.jpg", mime: "image/jpeg", bytes: 5 * 1024 * 1024 }) ?? "", /4 MB/);
  assert.equal(validarDeclaracion({ nombre: "v.mp4", mime: "video/mp4", bytes: 149 * 1024 * 1024 }), null);
  assert.match(validarDeclaracion({ nombre: "v.mp4", mime: "video/mp4", bytes: 151 * 1024 * 1024 }) ?? "", /150 MB/);
  assert.match(validarDeclaracion({ nombre: "v.mov", mime: "video/quicktime", bytes: 10 }) ?? "", /MP4/);
  assert.match(validarDeclaracion({ nombre: "x", mime: "image/png", bytes: 0 }) ?? "", /vacío/);
});

test("rutasParaMedio genera póster solo para video", () => {
  assert.deepEqual(rutasParaMedio(U, "image/webp"), { path: `biblioteca/${U}.webp`, posterPath: null });
  assert.deepEqual(rutasParaMedio(U, "video/mp4"), { path: `biblioteca/${U}.mp4`, posterPath: `biblioteca/${U}.poster.jpg` });
  assert.throws(() => rutasParaMedio("../x", "video/mp4"));
  assert.throws(() => rutasParaMedio(U, "image/gif"));
});

test("esRutaMedio rechaza otras carpetas y rutas con ..", () => {
  assert.ok(esRutaMedio(`biblioteca/${U}.mp4`));
  assert.ok(esRutaMedio(`biblioteca/${U}.poster.jpg`));
  assert.ok(!esRutaMedio(`../biblioteca/${U}.mp4`));
  assert.ok(!esRutaMedio(`fotos/${U}.jpg`));
  assert.ok(!esRutaMedio(42));
});

test("nombreVisible y formatoDuracion", () => {
  assert.equal(nombreVisible("Logo_empresa.PNG"), "Logo empresa");
  assert.equal(nombreVisible(".mp4"), "Sin nombre");
  assert.equal(formatoDuracion(65.4), "1:05");
  assert.equal(formatoDuracion(null), "—");
});
