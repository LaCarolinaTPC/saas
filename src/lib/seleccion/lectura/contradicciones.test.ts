import { test } from "node:test";
import assert from "node:assert/strict";
import { claseDePie, conContradicciones, contradiccionesDocumento, lecturaSimulada, mismaEmpresa } from "./contradicciones";
import type { CampoLeido } from "./esquema";

const HOY = "2026-11-27";
const c = (campo: string, valor: unknown, extra: Partial<CampoLeido> = {}): CampoLeido => ({ campo, valor, confianza: "alta", evidencia: null, pagina: null, decision: null, valor_final: null, ...extra });
const aspirante = { nombre: "Pedro Luis Torres Mercado", cedula: "1129492533", fecha_nacimiento: "1986-05-10", ciudad_residencia: "Soledad", celular: "573001112233", experiencia_meses: 24 };

test("hoja de vida que coincide: sin avisos", () => {
  const campos = [c("nombre", "PEDRO LUIS TORRES"), c("cedula", "1.129.492.533"), c("fecha_nacimiento", "1986-05-10"), c("ciudad", "Soledad, Atlántico"), c("telefono", "300 111 2233")];
  assert.deepEqual(contradiccionesDocumento("hoja_vida", campos, aspirante, [], HOY), []);
});

test("hoja de vida de otra persona: nombre, cédula y fecha de nacimiento son avisos claros", () => {
  const campos = [c("nombre", "Carlos Ruiz Díaz"), c("cedula", "72000111"), c("fecha_nacimiento", "1990-01-01")];
  const r = conContradicciones("hoja_vida", campos, aspirante, [], HOY);
  assert.equal(r.avisos.length, 3);
  assert.ok(r.avisos.every((a) => a.startsWith("⚠")));
  assert.match(r.campos.find((x) => x.campo === "nombre")?.nota ?? "", /Carlos Ruiz Díaz/);
  assert.match(r.campos.find((x) => x.campo === "cedula")?.nota ?? "", /72000111/);
});

test("no pisa la nota que ya tenía el campo y no repite la cédula ya comparada", () => {
  const campos = [c("cedula", "72000111"), c("cedula_coincide", "no", { calculado: true, nota: "La leída (72000111) no es la del proceso (1129492533)" }), c("ciudad", "Medellín", { nota: "letra borrosa" })];
  const r = conContradicciones("hoja_vida", campos, aspirante, [], HOY);
  assert.equal(r.campos.find((x) => x.campo === "cedula")?.nota, undefined); // ya la avisa cedula_coincide
  assert.match(r.campos.find((x) => x.campo === "ciudad")?.nota ?? "", /^letra borrosa · La hoja de vida dice Medellín/);
  assert.ok(r.avisos.some((a) => /cédula/.test(a)));
});

test("ciudad, teléfono y menos experiencia de la que dijo son avisos suaves", () => {
  const campos = [c("ciudad", "Cartagena"), c("telefono", "3009998877"), c("experiencia_conduccion_meses", 6, { calculado: true })];
  const r = contradiccionesDocumento("hoja_vida", campos, aspirante, [], HOY);
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => x.nivel === "suave"));
});

test("sin fecha de nacimiento en el chat se compara con la edad", () => {
  const r = contradiccionesDocumento("cedula", [c("fecha_nacimiento", "2000-01-01")], { edad: 40 }, [], HOY);
  assert.match(r[0]?.texto ?? "", /tiene 26 años; en el chat dijo 40/);
});

test("carta laboral: a nombre de otro, fechas imposibles y contra la hoja de vida", () => {
  const hoja = { clase: "hoja_vida" as const, campos: [c("experiencias", [{ empresa: "Cootrasol S.A.S.", cargo: "Conductor", desde: "2018-01", hasta: "2020-06", vehiculo: "bus", conduccion: true, pagina: 1 }])] };
  const otra = contradiccionesDocumento("carta_laboral", [c("empresa", "Cootrasol"), c("nombre", "Ana Pérez Gómez"), c("desde", "2022-01-01"), c("hasta", "2021-01-01")], aspirante, [hoja], HOY);
  assert.ok(otra.some((x) => /a nombre de «Ana Pérez Gómez»/.test(x.texto)));
  assert.ok(otra.some((x) => /terminó .* antes de empezar/.test(x.texto)));
  assert.ok(otra.some((x) => /no coinciden en el inicio/.test(x.texto)));
  const futura = contradiccionesDocumento("carta_laboral", [c("empresa", "Cootrasol"), c("desde", "2018-01-01"), c("hasta", "2027-05-01")], aspirante, [hoja], HOY);
  assert.ok(futura.some((x) => /retiro futura/.test(x.texto)));
  const ajena = contradiccionesDocumento("carta_laboral", [c("empresa", "Sotracor Ltda"), c("desde", "2015-01-01"), c("hasta", "actual")], aspirante, [hoja], HOY);
  assert.match(ajena[0]?.texto ?? "", /no aparece en la experiencia de la hoja de vida/);
  const bien = contradiccionesDocumento("carta_laboral", [c("empresa", "COOTRASOL"), c("nombre", "Pedro Torres"), c("desde", "2018-02-01"), c("hasta", "2020-05-30")], aspirante, [hoja], HOY);
  assert.deepEqual(bien, []);
});

test("la hoja de vida que llega después revisa las cartas que ya estaban", () => {
  const carta = { clase: "carta_laboral" as const, campos: [c("empresa", "Transmetro"), c("desde", "2019-01-01"), c("hasta", "2021-01-01")] };
  const r = conContradicciones("hoja_vida", [c("experiencias", [{ empresa: "Cootrasol", cargo: "Conductor", desde: "2018-01", hasta: "2020-06", vehiculo: null, conduccion: true, pagina: 1 }])], aspirante, [carta], HOY);
  assert.match(r.campos.find((x) => x.campo === "experiencias")?.nota ?? "", /Transmetro/);
});

test("misma empresa sin S.A.S. ni «Transportes»", () => {
  assert.equal(mismaEmpresa("Transportes Cootrasol S.A.S.", "COOTRASOL"), true);
  assert.equal(mismaEmpresa("Transportes La Carolina", "Transportes Sobusa"), false);
});

test("documento simulado: el tipo sale del pie y se da por bueno", () => {
  assert.equal(claseDePie("te mando mi hoja de vida"), "hoja_vida");
  assert.equal(claseDePie("Carta laboral de Cootrasol"), "carta_laboral");
  assert.equal(claseDePie("certificado bancario"), "certificado_bancario");
  assert.equal(claseDePie("la licencia"), "licencia");
  assert.equal(claseDePie("foto de la cédula"), "cedula");
  assert.equal(claseDePie(""), "otro");
  assert.match(lecturaSimulada("hoja_vida"), /hoja de vida.*se da por bueno/);
});
