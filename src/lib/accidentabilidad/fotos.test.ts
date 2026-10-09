import { test } from "node:test";
import assert from "node:assert/strict";
import { rutasDeFotos } from "./fotos";

const id = "0b9f3c2e-6a1d-4e8b-9c7a-2f5d1e3b4a6c";

test("rutasDeFotos acepta solo fotos/<uuid> con extensión de imagen", () => {
  assert.deepEqual(
    rutasDeFotos([`fotos/${id}.jpg`, `firmas/${id}.png`, `fotos/../audio/${id}.webm`, "fotos/x.jpg", 7, null]),
    [`fotos/${id}.jpg`],
  );
});

test("rutasDeFotos quita repetidas y tolera valores que no son lista", () => {
  assert.deepEqual(rutasDeFotos([`fotos/${id}.webp`, `fotos/${id}.webp`]), [`fotos/${id}.webp`]);
  assert.deepEqual(rutasDeFotos(undefined), []);
  assert.deepEqual(rutasDeFotos("fotos/a.jpg"), []);
});
