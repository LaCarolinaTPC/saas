import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaRunt, interpretarRuntCroma, interpretarSimitCroma, interpretarTrabajoCroma, interpretarTrabajoRunt, textosRestriccion, interpretarPoliciaCroma, interpretarTrabajoPolicia, interpretarRnmcCroma, primerApellido, apellidosPosibles, nombresCoinciden, errorTransitorio, primerApellidoDeApellidos, consultarRuntConIdentidad, type ProveedorRunt } from "./proveedores";

test("SIMIT de Croma: sin cuenta, a paz y salvo y con deuda", () => {
  assert.deepEqual(interpretarSimitCroma({ found: false }).valor, 0);
  const limpio = interpretarSimitCroma({ found: true, clear: true, summary: { total: 0 } });
  assert.equal(limpio.estado, "ok");
  assert.equal(limpio.valor, 0);
  const deuda = interpretarSimitCroma({ found: true, clear: false, summary: { total: 1_250_000 } });
  assert.equal(deuda.estado, "hallazgo");
  assert.equal(deuda.valor, 1_250_000);
});

test("SIMIT de Croma: total nulo usa multas + acuerdos, o falla si no hay nada", () => {
  assert.equal(interpretarSimitCroma({ found: true, summary: { total: null, total_fines: 500_000, total_agreements: 200_000 } }).valor, 700_000);
  assert.equal(interpretarSimitCroma({ found: true, clear: true, summary: { total: null } }).valor, 0);
  assert.equal(interpretarSimitCroma({ found: true, summary: { total: null } }).estado, "error");
  assert.equal(interpretarSimitCroma(null).estado, "error");
  // La cédula nunca debe coincidir como placa.
  assert.equal(interpretarSimitCroma({ found: true, is_plate: true, summary: { total: 0 } }).estado, "error");
});

test("trabajo asíncrono de Croma: en curso, terminado y fallido", () => {
  const enCurso = interpretarTrabajoCroma({ job: { id: "job_1", status: "running" }, data: null, error: null });
  assert.equal(enCurso.estado, "pendiente");
  assert.equal(enCurso.trabajoId, "job_1");
  const listo = interpretarTrabajoCroma({ job: { id: "job_1", status: "completed" }, data: { found: true, summary: { total: 3_500_000 } }, error: null });
  assert.equal(listo.valor, 3_500_000);
  const fallo = interpretarTrabajoCroma({ job: { id: "job_1", status: "failed" }, data: null, error: { message: "upstream caído" } });
  assert.equal(fallo.estado, "error");
  assert.equal(fallo.error, "upstream caído");
});

test("RUNT de Croma: sin registro o sin licencias", () => {
  for (const data of [{ found: false }, { found: true, person: { has_licenses: false }, licenses: [] }, { found: true, licenses: [] }]) {
    const r = interpretarRuntCroma(data, "2026-11-14");
    assert.equal(r.estado, "ok");
    assert.equal(r.resumen?.tieneLicencia, false);
    // Sin registro no es lo mismo que sin licencia: la cédula puede estar mal escrita.
    assert.equal(r.resumen?.registrado, data.found !== false);
  }
  assert.equal(interpretarRuntCroma(null).estado, "error");
});

test("RUNT de Croma: categorías con su vencimiento y licencias que no están en firme", () => {
  const r = interpretarRuntCroma(
    {
      found: true,
      person: { has_licenses: true },
      licenses: [
        { status: "ACTIVA", is_retained: false, cancellation_date: null, categories: [{ category: "C2", expiry_date: "10/05/2029" }, { category: "B1", expiry_date: "2031-01-02T00:00:00" }] },
        { status: "CANCELADA", cancellation_date: "2020-01-01", categories: [{ category: "C3", expiry_date: "2027-01-01" }] },
        { status: "ACTIVA", suspension_start_date: "2026-10-01", suspension_end_date: "2027-04-01", categories: [{ category: "c-1", expiry_date: null, exam_expiry_date: "2028-03-03" }] },
      ],
    },
    "2026-11-14"
  );
  assert.equal(r.resumen?.tieneLicencia, true);
  assert.deepEqual(r.resumen?.categorias, [
    { categoria: "C2", vence: "2029-05-10", activa: true },
    { categoria: "B1", vence: "2031-01-02", activa: true },
    { categoria: "C3", vence: "2027-01-01", activa: false },
    { categoria: "C1", vence: "2028-03-03", activa: false },
  ]);
  assert.equal(fechaRunt("fecha rara"), null);
});

test("RUNT de Croma: trabajo asíncrono", () => {
  assert.equal(interpretarTrabajoRunt({ job: { id: "j", status: "queued" } }).estado, "pendiente");
  assert.equal(interpretarTrabajoRunt({ job: { id: "j", status: "completed" }, data: { found: false } }).resumen?.tieneLicencia, false);
  assert.equal(interpretarTrabajoRunt({ job: { id: "j", status: "failed" }, error: { message: "RUNT caído" } }).error, "RUNT caído");
});

test("RUNT de Croma: nombre y restricciones de las licencias en firme", () => {
  const r = interpretarRuntCroma(
    {
      found: true,
      person: { full_name: "  carlos andrés   pérez gómez ", has_licenses: true },
      licenses: [
        { status: "ACTIVA", restrictions: "CONDUCIR CON LENTES", categories: [{ category: "C2", expiry_date: "2029-05-10", restrictions: ["Ninguna"] }] },
        { status: "INACTIVA", restrictions: [{ description: "AUDÍFONO" }], categories: [{ category: "B1", expiry_date: "2020-01-01" }] },
      ],
    },
    "2026-11-17"
  );
  assert.equal(r.resumen?.nombre, "CARLOS ANDRÉS PÉREZ GÓMEZ");
  assert.deepEqual(r.resumen?.restricciones, ["CONDUCIR CON LENTES"]);
  // Sin licencias igual trae el nombre.
  const sin = interpretarRuntCroma({ found: true, person: { full_name: "Ana Ruiz", has_licenses: false }, licenses: [] });
  assert.equal(sin.resumen?.nombre, "ANA RUIZ");
  assert.deepEqual(textosRestriccion(["SIN RESTRICCIONES", " ", { name: "Lentes" }, 5]), ["Lentes"]);
  assert.deepEqual(textosRestriccion(null), []);
});

test("Policía de Croma: nombre y antecedentes; trabajo en curso queda pendiente", () => {
  const r = interpretarPoliciaCroma({ full_name: " luis  díaz ", has_records: false, status: "NO TIENE ASUNTOS PENDIENTES CON LAS AUTORIDADES JUDICIALES" });
  assert.equal(r.estado, "ok");
  assert.equal(r.resumen?.nombre, "LUIS DÍAZ");
  assert.equal(r.resumen?.tieneAntecedentes, false);
  assert.equal(interpretarPoliciaCroma({ full_name: null }).resumen?.nombre, null);
  assert.equal(interpretarPoliciaCroma(null).estado, "error");
  assert.equal(interpretarTrabajoPolicia({ job: { id: "j1", status: "running" } }).trabajoId, "j1");
  assert.equal(interpretarTrabajoPolicia({ job: { status: "completed" }, data: { full_name: "Ana" } }).resumen?.nombre, "ANA");
});

test("RNMC de Croma: medidas pendientes y fecha de expedición que no coincide", () => {
  const limpio = interpretarRnmcCroma({ found: true, full_name: "Ana Ruiz", has_pending_measures: false, pending_measures: [], status: "NO TIENE MEDIDAS CORRECTIVAS PENDIENTES" });
  assert.equal(limpio.resumen?.fechaCoincide, true);
  assert.equal(limpio.resumen?.medidasPendientes, false);
  assert.equal(limpio.resumen?.cantidad, 0);
  const con = interpretarRnmcCroma({ found: true, has_pending_measures: true, pending_measures: [{}, {}] });
  assert.equal(con.resumen?.medidasPendientes, true);
  assert.equal(con.resumen?.cantidad, 2);
  const fecha = interpretarRnmcCroma({ found: false, has_pending_measures: null, message: "La fecha de expedición no corresponde" });
  assert.equal(fecha.resumen?.fechaCoincide, false);
  assert.match(fecha.resumen?.estadoTexto ?? "", /no corresponde/);
  assert.equal(interpretarRnmcCroma(null).estado, "error");
});

test("primer apellido del nombre del registro civil", () => {
  assert.equal(primerApellido("ALEXANDER ARDILA MARTINEZ"), "ARDILA");
  assert.equal(primerApellido("JHOONYS ALFONSO GONZALEZ CARRILLO"), "GONZALEZ");
  assert.equal(primerApellido("MARIA DE LA HOZ PEREZ"), "DE LA HOZ");
  assert.equal(primerApellido("JUAN PEREZ"), "PEREZ");
  assert.equal(primerApellido("PEDRO"), null);
  assert.equal(primerApellido(null), null);
  // Símbolos fuera, texto continuo (regla del RUNT).
  assert.equal(primerApellido("PEDRO D'ALEMAN RUIZ"), "DALEMAN");
  assert.equal(primerApellido("ANA GARCÍA-PÉREZ LÓPEZ"), "GARCÍAPÉREZ");
  assert.equal(primerApellido("LUIS O´NEILL. DÍAZ"), "ONEILL");
  // Segundo apellido con partícula: antes salía «DE» o «DE LA» (18-nov-2026).
  assert.equal(primerApellido("ROSARIO ELENA MARTINEZ DE AVILA"), "MARTINEZ");
  assert.equal(primerApellido("LUIS MARTINEZ DE LA HOZ"), "MARTINEZ");
  assert.equal(primerApellido("CARLOS DE LA CRUZ"), "DE LA CRUZ");
  assert.equal(primerApellido("MARIA DE LOS ANGELES PEREZ GOMEZ"), "PEREZ");
});

test("primer apellido desde el campo «Apellidos» de la cédula (foto o escrito)", () => {
  assert.equal(primerApellidoDeApellidos("MANJARRES DE AVILA"), "MANJARRES");
  assert.equal(primerApellidoDeApellidos("DE LA HOZ PEREZ"), "DE LA HOZ");
  assert.equal(primerApellidoDeApellidos("pérez"), "PÉREZ");
  assert.equal(primerApellidoDeApellidos(""), null);
  assert.equal(primerApellidoDeApellidos(null), null);
});

test("RUNT con el apellido conocido (foto o escrito): va primero y no se consulta sin apellido", async () => {
  const yo = { found: true, person: { full_name: "RODOLFO ENRIQUE MANJARRES DE AVILA", has_licenses: false }, licenses: [] };
  const p = falso({ MANJARRES: yo });
  const { resultado } = await consultarRuntConIdentidad(p, "1", "MANJARRES", "MANJARRES");
  assert.deepEqual(p.llamadas, ["MANJARRES"]);
  assert.equal(resultado.resumen?.registrado, true);
  assert.equal(resultado.resumen?.nombreNoCoincide, false);
});

test("errores transitorios de Croma (se reintentan) vs respuestas sobre la persona", () => {
  assert.equal(errorTransitorio("The operation was aborted due to timeout (fecha de expedición 1990-01-11)"), true);
  assert.equal(errorTransitorio("fetch failed"), true);
  assert.equal(errorTransitorio("Croma respondió 503."), true);
  // 503 de Croma con la fuente ocupada (18-nov-2026).
  assert.equal(errorTransitorio("Procuraduría is busy. Try again in 1 seconds."), true);
  assert.equal(errorTransitorio("Croma: límite de consultas alcanzado; se reintenta más tarde."), true);
  assert.equal(errorTransitorio("La fecha de expedición 1997-12-11 no coincide con la cédula según el RNMC."), false);
  assert.equal(errorTransitorio("Croma rechazó la clave (CROMA_API_KEY)."), false);
  assert.equal(errorTransitorio(null), false);
});

test("apellidos posibles: el más probable primero y, por si tiene un solo apellido, el último", () => {
  assert.deepEqual(apellidosPosibles("JUAN CARLOS PEREZ"), ["CARLOS", "PEREZ"]);
  assert.deepEqual(apellidosPosibles("ANA MARIA DE LA HOZ PEREZ"), ["DE LA HOZ", "PEREZ"]);
  assert.deepEqual(apellidosPosibles("ROSARIO ELENA MARTINEZ DE AVILA"), ["MARTINEZ", "DE AVILA"]);
  assert.deepEqual(apellidosPosibles("LUIS DE LA HOZ MARTINEZ"), ["DE LA HOZ", "MARTINEZ"]);
  // Ambiguo («DEL CARMEN» puede ser nombre o apellido): el segundo intento cubre el otro caso.
  assert.deepEqual(apellidosPosibles("MARIA DEL CARMEN DE LA HOZ"), ["DEL CARMEN", "DE LA HOZ"]);
  assert.deepEqual(apellidosPosibles("JUAN PEREZ"), ["PEREZ"]);
  assert.deepEqual(apellidosPosibles("PEDRO"), []);
});

test("¿los nombres son de la misma persona?", () => {
  assert.equal(nombresCoinciden("JHOONYS ALFONSO GONZALEZ CARRILLO", "ALEXANDER ARDILA MARTINEZ"), false);
  assert.equal(nombresCoinciden("ALEXANDER ARDILA MARTINEZ", "Alexander Ardila Martínez"), true);
  assert.equal(nombresCoinciden("ALEXANDER ARDILA", "ALEXANDER ARDILA MARTINEZ"), true);
  assert.equal(nombresCoinciden(null, "ALEXANDER ARDILA MARTINEZ"), true);
});

/** Proveedor falso: responde según el apellido con que se consulte. */
const falso = (porApellido: Record<string, unknown>): ProveedorRunt & { llamadas: (string | null)[] } => {
  const llamadas: (string | null)[] = [];
  return {
    nombre: "falso",
    llamadas,
    async consultarRunt(_cedula, apellido) {
      llamadas.push(apellido ?? null);
      return interpretarRuntCroma(porApellido[apellido ?? ""] as never, "2026-11-17");
    },
    async consultarTrabajoRunt() {
      throw new Error("no");
    },
  };
};

test("RUNT con identidad: sin apellido abría a otra persona (caso real del 17-nov); con el apellido del RNMC no aparece", async () => {
  const otro = { found: true, person: { full_name: "JHOONYS ALFONSO GONZALEZ CARRILLO", has_licenses: false }, licenses: [] };
  const p = falso({ ARDILA: { found: false }, MARTINEZ: { found: false }, "": otro });
  const { resultado, intentos } = await consultarRuntConIdentidad(p, "72009959", "ALEXANDER ARDILA MARTINEZ");
  // Siempre con apellido: el más probable y el otro posible, nunca sin apellido.
  assert.deepEqual(p.llamadas, ["ARDILA", "MARTINEZ"]);
  assert.equal(intentos.length, 2);
  assert.equal(resultado.resumen?.registrado, false);
  assert.equal(resultado.resumen?.identidadVerificada, true);
  assert.equal(resultado.resumen?.nombreRegistro, "ALEXANDER ARDILA MARTINEZ");
});

test("RUNT con identidad: aparece con el apellido; y sin nombre del registro, una sola consulta", async () => {
  const yo = { found: true, person: { full_name: "ALEXANDER ARDILA MARTINEZ", has_licenses: true }, licenses: [{ status: "ACTIVA", categories: [{ category: "C2", expiry_date: "2029-01-01" }] }] };
  const p = falso({ ARDILA: yo });
  const { resultado } = await consultarRuntConIdentidad(p, "72009959", "ALEXANDER ARDILA MARTINEZ");
  assert.deepEqual(p.llamadas, ["ARDILA"]);
  assert.equal(resultado.resumen?.nombreNoCoincide, false);
  assert.equal(resultado.resumen?.tieneLicencia, true);
  const q = falso({ "": yo });
  const sin = await consultarRuntConIdentidad(q, "72009959", null);
  assert.deepEqual(q.llamadas, [null]);
  assert.equal(sin.resultado.resumen?.identidadVerificada, undefined);
  // Un solo apellido («JUAN CARLOS PEREZ»): con «CARLOS» no aparece; con «PEREZ» sí.
  const r = falso({ CARLOS: { found: false }, PEREZ: { ...yo, person: { full_name: "JUAN CARLOS PEREZ", has_licenses: false }, licenses: [] } });
  const uno = await consultarRuntConIdentidad(r, "1", "JUAN CARLOS PEREZ");
  assert.deepEqual(r.llamadas, ["CARLOS", "PEREZ"]);
  assert.equal(uno.resultado.resumen?.registrado, true);
  assert.equal(uno.resultado.resumen?.nombreNoCoincide, false);
});
