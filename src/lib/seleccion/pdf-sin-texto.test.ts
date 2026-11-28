import { test } from "node:test";
import assert from "node:assert/strict";
import { quitarTexto } from "./pdf-sin-texto";

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const texto = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");
const limpiar = (s: string) => texto(quitarTexto(bytes(s)));

test("quita Tj y TJ con sus operandos y deja lo demás", () => {
  const r = limpiar("q 1 0 0 1 0 0 cm /Im1 Do Q BT /F1 12 Tf 72 700 Td (Hola {nombre}) Tj [(Bue) -20 (nas)] TJ ET 0 0 1 rg 10 10 50 50 re f");
  assert.ok(!r.includes("Hola") && !r.includes("Bue") && !r.includes("Tj") && !r.includes("TJ"));
  for (const queda of ["/Im1 Do", "BT", "/F1 12 Tf", "72 700 Td", "ET", "0 0 1 rg", "10 10 50 50 re f"]) assert.ok(r.includes(queda), `falta «${queda}»`);
});

test("cadenas con paréntesis anidados, escapes y hexadecimales", () => {
  const r = limpiar("BT (a \\) b (c) d) Tj <48656C6C6F> Tj [<0041> 5 (x\\(y)] TJ ET");
  assert.equal(r.replace(/\s+/g, " ").trim(), "BT ET");
});

test("' y \" conservan el salto de renglón y los espacios", () => {
  assert.equal(limpiar("BT (uno) ' ET").replace(/\s+/g, " ").trim(), "BT T* ET");
  assert.equal(limpiar('BT 2 0.5 (dos) " ET').replace(/\s+/g, " ").trim(), "BT 2 Tw 0.5 Tc T* ET");
});

test("los diccionarios de contenido marcado y las imágenes en línea no se tocan", () => {
  const r = limpiar("/P <</MCID 0>> BDC BT (x) Tj ET EMC BI /W 2 /H 1 /BPC 8 /CS /G ID \x00(Tj)\xff EI Q");
  assert.ok(r.includes("/P <</MCID 0>> BDC") && r.includes("EMC") && r.includes("ID \x00(Tj)\xff EI"));
  assert.ok(!r.includes("(x)"));
});

test("sin texto devuelve lo mismo", () => {
  const s = bytes("q 0 0 1 rg 0 0 10 10 re f Q");
  assert.equal(quitarTexto(s), s);
});
