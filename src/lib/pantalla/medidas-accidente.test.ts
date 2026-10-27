import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIDA_GENERAL, medidaDeHipotesis, medidaPreventiva } from "./medidas-accidente";

const h = (codigo: string, categoria: string | null, texto = "x") => ({ codigo, categoria, texto });

test("medida propia del código, o la de su categoría", () => {
  assert.match(medidaDeHipotesis(h("103", "conductor"))!, /adelantado completo/);
  assert.match(medidaDeHipotesis(h("121", "conductor"))!, /tres segundos/);
  // 157 «Otra» no tiene medida propia: la del conductor.
  assert.equal(medidaDeHipotesis(h("157", "conductor")), MEDIDA_GENERAL);
  assert.match(medidaDeHipotesis(h("217", "vehiculo"))!, /preoperacional/);
  assert.equal(medidaDeHipotesis(h("999", null)), null);
});

test("medidaPreventiva: prefiere lo del conductor y el bus sobre terceros", () => {
  // El accidente del 22-oct: pasajero que bajó en marcha (502) y ciclista (092).
  assert.match(medidaPreventiva([h("092", "ciclista"), h("502", "pasajero")]), /bus detenido/);
  // Conductor antes que vía.
  assert.match(medidaPreventiva([h("304", "via"), h("119", "conductor")]), /frene con suavidad/);
  // A igual categoría, la que tiene medida propia.
  assert.match(medidaPreventiva([h("157", "conductor"), h("139", "conductor")]), /Maniobre con calma/);
  assert.equal(medidaPreventiva([]), MEDIDA_GENERAL);
});

test("todas las medidas son textos cortos para leer en el TV", async () => {
  const codigos = ["101", "103", "112", "121", "122", "139", "154", "201", "304", "502"];
  for (const c of codigos) {
    const m = medidaDeHipotesis(h(c, "conductor"))!;
    assert.ok(m.length > 20 && m.length <= 130, `${c}: ${m}`);
  }
});
