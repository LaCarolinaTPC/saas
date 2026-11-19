import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGLAS_POR_DEFECTO as R, categoriasDeLicencia, licenciaVerificadaDesdeRunt, notaCitacion, requiereLentes, restriccionAuditiva, causaPropuesta, cartaLaboralPendiente, debeAvanzarAAntecedentes,
  debeConsultarRunt, debeConsultarSimit, diceQueNoTieneLicencia, evaluarPreseleccion, reglasDesdeAjustes, type DatosPreseleccion,
} from "./preseleccion";

const AHORA = new Date("2026-11-13T15:00:00Z");
const datos = (extra: Partial<DatosPreseleccion> = {}): DatosPreseleccion => ({
  edad: 35,
  ciudad: "Barranquilla",
  dispuestoTraslado: null,
  licencia: "C2",
  licenciaVerificada: false,
  simitEstado: null,
  simitValor: null,
  simitVerificado: true,
  experienciaMeses: 24,
  ...extra,
});

test("todo en verde pasa a antecedentes", () => {
  const r = evaluarPreseleccion(datos({ simitValor: 0 }), R, AHORA);
  assert.equal(r.global, "pasa");
  assert.equal(r.incumplido, null);
  assert.equal(debeAvanzarAAntecedentes({ estado: "pendiente", autorizacion_datos: "si" }, r), true);
  // Sin autorización o fuera de preselección no avanza solo.
  assert.equal(debeAvanzarAAntecedentes({ estado: "pendiente", autorizacion_datos: null }, r), false);
  assert.equal(debeAvanzarAAntecedentes({ estado: "citado", autorizacion_datos: "si" }, r), false);
  // SIMIT opcional (Croma no respondió): pasa con los otros tres en verde; nunca con el SIMIT en rojo ni con otro requisito pendiente.
  const sinSimit = { ...r, simit: { color: "pendiente" as const, motivo: "Falta consultar el SIMIT.", origen: null }, global: "incompleto" as const };
  assert.equal(debeAvanzarAAntecedentes({ estado: "pendiente", autorizacion_datos: "si" }, sinSimit), false);
  assert.equal(debeAvanzarAAntecedentes({ estado: "pendiente", autorizacion_datos: "si" }, sinSimit, true), true);
  assert.equal(debeAvanzarAAntecedentes({ estado: "pendiente", autorizacion_datos: null }, sinSimit, true), false);
  assert.equal(debeAvanzarAAntecedentes({ estado: "pendiente", autorizacion_datos: "si" }, { ...sinSimit, simit: { color: "rojo" as const, motivo: "", origen: null }, global: "no_cumple" as const }, true), false);
  assert.equal(debeAvanzarAAntecedentes({ estado: "pendiente", autorizacion_datos: "si" }, { ...sinSimit, edad: { color: "pendiente" as const, motivo: "", origen: null } }, true), false);
});

test("edad fuera del rango propone cerrar con su causa", () => {
  const r = evaluarPreseleccion(datos({ edad: 60, simitValor: 0 }), R, AHORA);
  assert.equal(r.global, "no_cumple");
  assert.equal(r.incumplido, "edad");
  assert.equal(causaPropuesta(r), "Edad fuera del rango");
  assert.equal(evaluarPreseleccion(datos({ edad: 19 }), R, AHORA).edad.color, "rojo");
  assert.equal(evaluarPreseleccion(datos({ edad: 20 }), R, AHORA).edad.color, "verde");
  assert.equal(evaluarPreseleccion(datos({ edad: 57 }), R, AHORA).edad.color, "verde");
});

test("residencia: Soledad, traslado y fuera de zona", () => {
  assert.equal(evaluarPreseleccion(datos({ ciudad: "soledad atlántico" }), R, AHORA).residencia.color, "verde");
  assert.equal(evaluarPreseleccion(datos({ ciudad: "Santa Marta", dispuestoTraslado: true }), R, AHORA).residencia.color, "verde");
  assert.equal(evaluarPreseleccion(datos({ ciudad: "Santa Marta", dispuestoTraslado: false }), R, AHORA).residencia.color, "rojo");
  assert.equal(evaluarPreseleccion(datos({ ciudad: "Santa Marta" }), R, AHORA).residencia.color, "pendiente");
  assert.equal(evaluarPreseleccion(datos({ ciudad: null }), R, AHORA).residencia.color, "pendiente");
});

test("licencia: C2/C3 en cualquier forma escrita", () => {
  assert.deepEqual(categoriasDeLicencia("categoría c 2"), ["C2"]);
  assert.deepEqual(categoriasDeLicencia("B1 y C-3"), ["B1", "C3"]);
  assert.equal(evaluarPreseleccion(datos({ licencia: "B1 y C3" }), R, AHORA).licencia.color, "verde");
  assert.equal(evaluarPreseleccion(datos({ licencia: "B1" }), R, AHORA).licencia.color, "rojo");
  assert.equal(evaluarPreseleccion(datos({ licencia: null }), R, AHORA).licencia.color, "pendiente");
  assert.equal(evaluarPreseleccion(datos({ licenciaVerificada: true }), R, AHORA).licencia.origen, "verificado");
});

test("SIMIT: tope, sin consultar y deuda sin valor", () => {
  assert.equal(evaluarPreseleccion(datos({ simitValor: 3_000_000 }), R, AHORA).simit.color, "verde");
  assert.equal(evaluarPreseleccion(datos({ simitValor: 3_000_001 }), R, AHORA).simit.color, "rojo");
  assert.equal(evaluarPreseleccion(datos({ simitVerificado: false }), R, AHORA).simit.color, "pendiente");
  // El valor por defecto 0 de la columna no cuenta si nadie registró el estado.
  assert.equal(evaluarPreseleccion(datos({ simitVerificado: false, simitValor: 0 }), R, AHORA).simit.color, "pendiente");
  assert.equal(evaluarPreseleccion(datos({ simitVerificado: false, simitEstado: "ok", simitValor: 0 }), R, AHORA).simit.color, "verde");
  assert.equal(evaluarPreseleccion(datos({ simitVerificado: false, simitEstado: "deuda", simitValor: 0 }), R, AHORA).simit.color, "pendiente");
  assert.equal(evaluarPreseleccion(datos({ simitVerificado: false, simitEstado: "deuda", simitValor: 4_000_000 }), R, AHORA).simit.color, "rojo");
});

test("falta un dato: incompleto, sin proponer cierre", () => {
  const r = evaluarPreseleccion(datos({ edad: null, simitValor: 0 }), R, AHORA);
  assert.equal(r.global, "incompleto");
  assert.equal(causaPropuesta(r), null);
});

test("experiencia no bloquea (B2)", () => {
  assert.equal(cartaLaboralPendiente(3), true);
  assert.equal(cartaLaboralPendiente(null), true);
  assert.equal(cartaLaboralPendiente(6), false);
  const r = evaluarPreseleccion(datos({ experienciaMeses: 3, simitValor: 0 }), R, AHORA);
  assert.equal(r.global, "pasa");
});

test("SIMIT se consulta solo con autorización y si lo declarado no descarta", () => {
  const r = evaluarPreseleccion(datos({ simitVerificado: false }), R, AHORA);
  const base = { cedula: "1234567", autorizacion_datos: "si", simitConsultado: false };
  assert.equal(debeConsultarSimit(base, r), true);
  assert.equal(debeConsultarSimit({ ...base, autorizacion_datos: null }, r), false);
  assert.equal(debeConsultarSimit({ ...base, simitConsultado: true }, r), false);
  assert.equal(debeConsultarSimit({ ...base, cedula: "" }, r), false);
  const mayor = evaluarPreseleccion(datos({ edad: 70, simitVerificado: false }), R, AHORA);
  assert.equal(debeConsultarSimit(base, mayor), false);
});

test("reglas desde seleccion_ajustes, con respaldo por defecto", () => {
  const r = reglasDesdeAjustes([
    { clave: "edad_maxima", valor: 60 },
    { clave: "licencias", valor: ["c2", "c3", "b3"] },
    { clave: "simit_tope", valor: "no es número" },
  ]);
  assert.equal(r.edadMaxima, 60);
  assert.deepEqual(r.licencias, ["C2", "C3", "B3"]);
  assert.equal(r.simitTope, 3_000_000);
  assert.equal(r.edadMinima, 20);
});

test("ciudad con faltas pequeñas cuenta como la ciudad", async () => {
  const { nombraCiudad } = await import("./preseleccion");
  assert.equal(nombraCiudad("soleda", "Soledad"), true);
  assert.equal(nombraCiudad("barraquilla", "Barranquilla"), true);
  assert.equal(nombraCiudad("Soledad 2000", "Soledad"), true);
  assert.equal(nombraCiudad("Santa Marta", "Soledad"), false);
  assert.equal(nombraCiudad("Sole", "Soledad"), false);
});

const runt = (categorias: { categoria: string; vence: string | null; activa?: boolean }[], tieneLicencia = true) => ({
  tieneLicencia,
  categorias: categorias.map((c) => ({ activa: true, ...c })),
  consultadoEl: "2026-11-14T00:00:00Z",
});

test("licencia por el RUNT: vigente, vencida, otra categoría, sin licencia y suspendida", () => {
  const ev = (d: Partial<DatosPreseleccion>, r = R) => evaluarPreseleccion(datos(d), r, AHORA).licencia;
  const vigente = ev({ licencia: "B1", licenciaRunt: runt([{ categoria: "C2", vence: "2029-05-10" }]) });
  assert.equal(vigente.color, "verde");
  assert.equal(vigente.origen, "verificado");
  assert.match(vigente.motivo, /vigente hasta el 10 de mayo de 2029/);
  // Lo del RUNT manda sobre lo declarado.
  // Vencida: no descarta enseguida; se le pregunta si la renueva (pendiente).
  const vencida = ev({ licencia: "C2", licenciaRunt: runt([{ categoria: "C2", vence: "2025-03-10" }]) });
  assert.equal(vencida.color, "pendiente");
  assert.match(vencida.motivo, /vencida desde el 10 de marzo de 2025.*falta saber si la va a renovar/);
  assert.match(ev({ licenciaRunt: runt([{ categoria: "B1", vence: "2030-01-01" }]) }).motivo, /tiene licencia B1: se pide C2 o C3/);
  assert.equal(ev({ licenciaRunt: runt([], false) }).motivo, "No tiene licencia de conducción en el RUNT.");
  // La cédula no aparece en el RUNT: queda pendiente (confirmar el número), no en rojo.
  const sinRegistro = ev({ licenciaRunt: { ...runt([], false), registrado: false } });
  assert.equal(sinRegistro.color, "pendiente");
  assert.match(sinRegistro.motivo, /confirmar el número/);
  assert.equal(ev({ licenciaRunt: runt([{ categoria: "C3", vence: "2030-01-01", activa: false }]) }).color, "rojo");
  // Si alguna categoría aceptada sigue en firme, vale la que más dura.
  assert.equal(ev({ licenciaRunt: runt([{ categoria: "C2", vence: "2024-01-01" }, { categoria: "C3", vence: "2028-01-01" }]) }).color, "verde");
  // Con meses mínimos de vigencia.
  const conMinimo = { ...R, licenciaVigenciaMinimaMeses: 6 };
  assert.equal(ev({ licenciaRunt: runt([{ categoria: "C2", vence: "2027-02-01" }]) }, conMinimo).color, "rojo");
  assert.equal(ev({ licenciaRunt: runt([{ categoria: "C2", vence: "2027-06-01" }]) }, conMinimo).color, "verde");
  // Rojo de licencia: no se cita.
  assert.equal(evaluarPreseleccion(datos({ licenciaRunt: runt([{ categoria: "B1", vence: "2030-01-01" }]) }), R, AHORA).global, "no_cumple");
});

test("licencia declarada: «no tengo licencia» es rojo; en trámite no", () => {
  assert.equal(diceQueNoTieneLicencia("ninguna"), true);
  assert.equal(diceQueNoTieneLicencia("No tengo licencia todavía"), true);
  assert.equal(diceQueNoTieneLicencia("C2 en trámite"), false);
  assert.equal(diceQueNoTieneLicencia("no tengo, la estoy sacando"), false);
  assert.equal(evaluarPreseleccion(datos({ licencia: "ninguna" }), R, AHORA).licencia.color, "rojo");
  assert.equal(evaluarPreseleccion(datos({ licencia: null }), R, AHORA).licencia.color, "pendiente");
});

test("¿se consulta el RUNT? con autorización y cédula, una vez, y no si ya descartó por edad o residencia", () => {
  const base = evaluarPreseleccion(datos(), R, AHORA);
  assert.equal(debeConsultarRunt({ cedula: "1045678901", autorizacion_datos: "si", runtConsultado: false }, base), true);
  assert.equal(debeConsultarRunt({ cedula: "1045678901", autorizacion_datos: null, runtConsultado: false }, base), false);
  assert.equal(debeConsultarRunt({ cedula: "1045678901", autorizacion_datos: "si", runtConsultado: true }, base), false);
  assert.equal(debeConsultarRunt({ cedula: null, autorizacion_datos: "si", runtConsultado: false }, base), false);
  const mayor = evaluarPreseleccion(datos({ edad: 70 }), R, AHORA);
  assert.equal(debeConsultarRunt({ cedula: "1045678901", autorizacion_datos: "si", runtConsultado: false }, mayor), false);
  // Declaró B1: igual se consulta, el RUNT puede decir otra cosa.
  const b1 = evaluarPreseleccion(datos({ licencia: "B1" }), R, AHORA);
  assert.equal(debeConsultarRunt({ cedula: "1045678901", autorizacion_datos: "si", runtConsultado: false }, b1), true);
  assert.equal(reglasDesdeAjustes([{ clave: "licencia_vigencia_minima_meses", valor: 6 }]).licenciaVigenciaMinimaMeses, 6);
  assert.equal(reglasDesdeAjustes([]).licenciaVigenciaMinimaMeses, 0);
});

test("licencia vencida: pregunta si la renueva; si no, no queda preseleccionado; pérdida auditiva no; lentes sí, con aviso", () => {
  const ev = (d: Partial<DatosPreseleccion>) => evaluarPreseleccion(datos(d), R, AHORA).licencia;
  const vencida = runt([{ categoria: "C2", vence: "2025-03-10" }]);
  assert.equal(ev({ licenciaRunt: vencida, licenciaRenovara: true }).color, "pendiente");
  assert.match(ev({ licenciaRunt: vencida, licenciaRenovara: true }).motivo, /dijo que la va a renovar/);
  const noRenueva = evaluarPreseleccion(datos({ licenciaRunt: vencida, licenciaRenovara: false }), R, AHORA);
  assert.equal(noRenueva.licencia.color, "rojo");
  assert.equal(noRenueva.global, "no_cumple");
  assert.equal(licenciaVerificadaDesdeRunt(vencida, R, AHORA)?.estado, "vencida");
  assert.equal(licenciaVerificadaDesdeRunt(vencida, R, AHORA, true)?.renovara, true);
  assert.equal(licenciaVerificadaDesdeRunt(vencida, R, AHORA, false)?.estado, "no_cumple");

  const auditiva = { ...runt([{ categoria: "C2", vence: "2029-05-10" }]), restricciones: ["CONDUCIR CON AUDÍFONO - PÉRDIDA AUDITIVA"] };
  assert.equal(ev({ licenciaRunt: auditiva }).color, "rojo");
  const lvAud = licenciaVerificadaDesdeRunt(auditiva, R, AHORA);
  assert.equal(lvAud?.estado, "no_cumple");
  assert.equal(lvAud?.auditiva, true);

  const lentes = { ...runt([{ categoria: "C2", vence: "2029-05-10" }]), restricciones: ["CONDUCIR CON LENTES"] };
  assert.equal(ev({ licenciaRunt: lentes }).color, "verde");
  assert.match(ev({ licenciaRunt: lentes }).motivo, /Debe traer los lentes a la prueba/);
  assert.equal(licenciaVerificadaDesdeRunt(lentes, R, AHORA)?.lentes, true);
  assert.match(notaCitacion(lentes) ?? "", /tráelos a la prueba de manejo/);
  assert.equal(notaCitacion(runt([{ categoria: "C2", vence: "2029-05-10" }])), null);
  assert.equal(requiereLentes(["Gafas correctoras"]), true);
  assert.equal(restriccionAuditiva(["Hipoacusia"]), true);
  assert.equal(restriccionAuditiva(["CONDUCIR CON LENTES"]), false);
});

test("RUNT sin registro: con identidad verificada es «sin licencia»; sin verificar, confirmar la cédula", () => {
  const ev = (d: Partial<DatosPreseleccion>) => evaluarPreseleccion(datos(d), R, AHORA).licencia;
  const sinRegistro = { ...runt([], false), registrado: false };
  assert.equal(ev({ licenciaRunt: sinRegistro }).color, "pendiente");
  const verificado = ev({ licenciaRunt: { ...sinRegistro, identidadVerificada: true } });
  assert.equal(verificado.color, "rojo");
  assert.match(verificado.motivo, /no tiene licencia/);
  assert.equal(licenciaVerificadaDesdeRunt({ ...sinRegistro, identidadVerificada: true }, R, AHORA)?.estado, "no_cumple");
});
