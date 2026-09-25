import { test } from "node:test";
import assert from "node:assert/strict";
import { generarClaveProvisional, hashClave, problemaClaveNueva, verificarClave } from "./clave";
import { firmarSesion, leerSesion } from "./sesion";
import { rangoPedido } from "../tesoreria/detalle-afiliado";

const SECRETO = "s".repeat(40);

test("clave: el hash verifica la clave correcta y rechaza las demás", async () => {
  const h = await hashClave("Carolina2026");
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verificarClave("Carolina2026", h), true);
  assert.equal(await verificarClave("carolina2026", h), false);
  assert.equal(await verificarClave("Carolina2026", "texto-plano"), false);
  // Dos hashes de la misma clave difieren (sal aleatoria).
  assert.notEqual(h, await hashClave("Carolina2026"));
});

test("clave provisional legible y reglas de la clave nueva", () => {
  assert.match(generarClaveProvisional(), /^[A-HJKMNP-Z]{4}-[2-9]{4}-[A-HJKMNP-Z]{4}$/);
  assert.equal(problemaClaveNueva("corta1", "a@b.co"), "La contraseña debe tener al menos 8 caracteres.");
  assert.equal(problemaClaveNueva("solamenteletras", "a@b.co"), "Use letras y al menos un número.");
  assert.equal(problemaClaveNueva("juanperez99", "juanperez@correo.com"), "La contraseña no puede contener su correo.");
  assert.equal(problemaClaveNueva("Buseta501x", "juan@correo.com"), null);
});

test("sesión: firmada, vigente y a prueba de alteraciones", () => {
  const ahora = 1_800_000_000;
  const t = firmarSesion({ c: "cuenta-1", v: 2, e: ahora + 60 }, SECRETO);
  assert.deepEqual(leerSesion(t, SECRETO, ahora), { c: "cuenta-1", v: 2, e: ahora + 60 });
  assert.equal(leerSesion(t, SECRETO, ahora + 61), null); // vencida
  assert.equal(leerSesion(t, "otro".repeat(10), ahora), null); // otro secreto
  // Cambiar la cuenta dentro del token invalida la firma.
  const [, firma] = t.split(".");
  const falsa = Buffer.from(JSON.stringify({ c: "cuenta-2", v: 2, e: ahora + 60 })).toString("base64url");
  assert.equal(leerSesion(`${falsa}.${firma}`, SECRETO, ahora), null);
  assert.equal(leerSesion(`${t}.x`, SECRETO, ahora), null);
  assert.equal(leerSesion("", SECRETO, ahora), null);
  assert.equal(leerSesion(undefined, SECRETO, ahora), null);
});

test("rango pedido desde el portal: sin futuro y a lo sumo un año", () => {
  const def = { desde: "2026-09-14", hasta: "2026-09-20" };
  assert.deepEqual(rangoPedido(null, null, "2026-09-25", def), def);
  assert.deepEqual(rangoPedido("2026-09-01", "2026-12-31", "2026-09-25", def), { desde: "2026-09-01", hasta: "2026-09-25" });
  assert.deepEqual(rangoPedido("2020-01-01", "2026-09-25", "2026-09-25", def), { desde: "2025-09-25", hasta: "2026-09-25" });
  assert.deepEqual(rangoPedido("2026-09-20", "2026-09-10", "2026-09-25", def), { desde: "2026-09-10", hasta: "2026-09-10" });
  assert.deepEqual(rangoPedido("malo", "2026-09-10';--", "2026-09-25", def), def);
});
