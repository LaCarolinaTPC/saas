import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarConsulta } from "./interpretacion";

test("interpretación por fuente: lo principal y los hallazgos resaltados", () => {
  const pol = interpretarConsulta("policia", { full_name: "ANA RUIZ", has_records: true, status: "TIENE ASUNTOS PENDIENTES" });
  assert.deepEqual(pol.find((d) => d.etiqueta.startsWith("¿Asuntos"))?.valor, "Sí");
  assert.equal(pol.find((d) => d.etiqueta.startsWith("¿Asuntos"))?.alerta, true);
  const con = interpretarConsulta("contraloria", { is_fiscal_responsible: false, records: [], status: "NO SE ENCUENTRA REPORTADO" });
  assert.equal(con.find((d) => d.etiqueta === "Procesos reportados")?.valor, "0");
  const rnmc = interpretarConsulta("rnmc", { found: false, message: "La fecha no corresponde" });
  assert.equal(rnmc[0].alerta, true);
  const proc = interpretarConsulta("procuraduria", { found: false });
  assert.equal(proc.find((d) => d.etiqueta.startsWith("¿Antecedentes"))?.valor, "No (no registrado)");
  assert.deepEqual(interpretarConsulta("runt", null), []);
});
