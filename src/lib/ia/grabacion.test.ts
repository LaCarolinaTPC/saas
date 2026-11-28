import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carpetaGrabacion, conGrabacion, huellaLlamada } from "./grabacion";

function conEntorno<T>(vars: Record<string, string | undefined>, f: () => Promise<T>): Promise<T> {
  const antes = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  return f().finally(() => {
    for (const [k, v] of Object.entries(antes)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
}

test("grabación: solo en desarrollo y con la carpeta", async () => {
  await conEntorno({ IA_GRABACION: "x", GESTIVO_ENTORNO: "produccion" }, async () => assert.equal(carpetaGrabacion(), null));
  await conEntorno({ IA_GRABACION: undefined, GESTIVO_ENTORNO: "desarrollo" }, async () => assert.equal(carpetaGrabacion(), null));
  await conEntorno({ IA_GRABACION: "x", GESTIVO_ENTORNO: "desarrollo" }, async () => assert.equal(carpetaGrabacion(), "x"));
});

test("grabación: la segunda llamada igual no llega al proveedor; una distinta sí", async () => {
  const carpeta = mkdtempSync(join(tmpdir(), "ia-grabacion-"));
  try {
    await conEntorno({ IA_GRABACION: carpeta, GESTIVO_ENTORNO: "desarrollo" }, async () => {
      let llamadas = 0;
      const llamar = async () => (llamadas++, { texto: "hola", tokens: 120 });
      const sinCosto = (r: { texto: string; tokens: number }) => ({ ...r, tokens: 0 });
      const a = await conGrabacion("chat", { prompt: "p1", bytes: new Uint8Array([1, 2]) }, llamar, { sinCosto });
      const b = await conGrabacion("chat", { prompt: "p1", bytes: new Uint8Array([1, 2]) }, llamar, { sinCosto });
      assert.equal(llamadas, 1);
      assert.deepEqual(a, { texto: "hola", tokens: 120 });
      assert.deepEqual(b, { texto: "hola", tokens: 0 }); // repetida: sin costo
      await conGrabacion("chat", { prompt: "p2", bytes: new Uint8Array([1, 2]) }, llamar);
      await conGrabacion("chat", { prompt: "p1", bytes: new Uint8Array([1, 3]) }, llamar); // otro archivo
      assert.equal(llamadas, 3);
      assert.equal(readdirSync(carpeta).length, 3);
    });
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});

test("grabación: lo que no se debe guardar se vuelve a pedir; sin carpeta, siempre llama", async () => {
  const carpeta = mkdtempSync(join(tmpdir(), "ia-grabacion-"));
  try {
    await conEntorno({ IA_GRABACION: carpeta, GESTIVO_ENTORNO: "desarrollo" }, async () => {
      let n = 0;
      const fallo = async () => (n++, { ok: false });
      await conGrabacion("audio", { a: 1 }, fallo, { guardable: (r) => r.ok });
      await conGrabacion("audio", { a: 1 }, fallo, { guardable: (r) => r.ok });
      assert.equal(n, 2);
    });
    await conEntorno({ IA_GRABACION: undefined }, async () => {
      let n = 0;
      await conGrabacion("chat", { a: 1 }, async () => n++);
      await conGrabacion("chat", { a: 1 }, async () => n++);
      assert.equal(n, 2);
    });
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});

test("grabación: la huella cambia con los bytes y no con el orden de llamada", () => {
  assert.equal(huellaLlamada({ b: new Uint8Array([1]) }), huellaLlamada({ b: new Uint8Array([1]) }));
  assert.notEqual(huellaLlamada({ b: new Uint8Array([1]) }), huellaLlamada({ b: new Uint8Array([2]) }));
});
