import { test } from "node:test";
import assert from "node:assert/strict";
import { canalesPolitica, datosPolitica, seccionesPolitica } from "./politica-datos";

const texto = (s: ReturnType<typeof seccionesPolitica>) => s.flatMap((x) => [x.titulo, ...x.parrafos, ...(x.lista ?? [])]).join("\n");

test("política: sin datos configurados no deja huecos ni «undefined»", () => {
  const d = datosPolitica([]);
  const t = texto(seccionesPolitica(d));
  assert.match(t, /Metropolitana de Transportes La Carolina/);
  assert.doesNotMatch(t, /undefined|null|NIT ,|NIT\s*$|domicilio en ,|\{\w+\}/m);
  assert.match(t, /rige desde su publicación/);
  // Siempre queda al menos un canal: el WhatsApp de selección.
  assert.equal(canalesPolitica(d).length, 1);
});

test("política: usa los datos del responsable que configuró Gestión Humana", () => {
  const d = datosPolitica([
    { clave: "empresa_razon_social", valor: "Empresa de Prueba S.A.S." },
    { clave: "empresa_nit", valor: "900.123.456-7" },
    { clave: "empresa_domicilio", valor: "Calle 1 # 2-3, Soledad" },
    { clave: "empresa_correo_datos", valor: "datos@ejemplo.com" },
    { clave: "empresa_telefono_datos", valor: "605 000 0000" },
    { clave: "politica_vigencia", valor: "el 17 de noviembre de 2026" },
  ]);
  const t = texto(seccionesPolitica(d));
  assert.match(t, /Empresa de Prueba S\.A\.S\., NIT 900\.123\.456-7, domicilio en Calle 1 # 2-3, Soledad/);
  assert.match(t, /Correo electrónico: datos@ejemplo\.com/);
  assert.match(t, /Teléfono: 605 000 0000/);
  assert.match(t, /rige desde el 17 de noviembre de 2026\./);
  assert.equal(canalesPolitica(d).length, 4);
});

test("política: incluye lo que exige la Ley 1581 (finalidades, derechos, plazos, conservación)", () => {
  const t = texto(seccionesPolitica(datosPolitica([])));
  for (const re of [/futuros procesos/, /Superintendencia de Industria y Comercio/, /diez \(10\) días hábiles/, /quince \(15\) días hábiles/, /Revocar la autorización/, /datos sensibles/i, /Ley 1581 de 2012/]) {
    assert.match(t, re);
  }
});
