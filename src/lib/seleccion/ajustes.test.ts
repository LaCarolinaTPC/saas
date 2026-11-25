import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictoDeHoras, mostrarValor, validarAjuste } from "./ajustes";

const a = (clave: string, unidad: string) => ({ clave, unidad, nombre: clave });

test("sí o no (por ejemplo, si el RNMC es obligatorio)", () => {
  assert.deepEqual(validarAjuste(a("rnmc_obligatorio", "si_no"), "false"), { ok: true, valor: false });
  assert.deepEqual(validarAjuste(a("rnmc_obligatorio", "si_no"), "Sí"), { ok: true, valor: true });
  assert.deepEqual(validarAjuste(a("rnmc_obligatorio", "si_no"), true), { ok: true, valor: true });
  assert.equal(validarAjuste(a("rnmc_obligatorio", "si_no"), "tal vez").ok, false);
  assert.equal(mostrarValor("si_no", false), "No");
  assert.equal(mostrarValor("si_no", true), "Sí");
});

test("horas en formato HH:MM", () => {
  assert.deepEqual(validarAjuste(a("recordatorio_cita_hora", "hora"), " 08:00 "), { ok: true, valor: "08:00" });
  assert.equal(validarAjuste(a("recordatorio_cita_hora", "hora"), "8 am").ok, false);
  assert.equal(validarAjuste(a("recordatorio_cita_hora", "hora"), "24:00").ok, false);
});

test("números dentro de su rango", () => {
  assert.deepEqual(validarAjuste(a("reactivacion_aviso1_horas", "horas"), "24"), { ok: true, valor: 24 });
  assert.equal(validarAjuste(a("reactivacion_aviso1_horas", "horas"), "0").ok, false);
  assert.equal(validarAjuste(a("reactivacion_aviso1_horas", "horas"), "").ok, false);
  assert.deepEqual(validarAjuste(a("simit_tope", "pesos"), "3.000.000"), { ok: true, valor: 3_000_000 });
});

test("edad mínima menor que la máxima", () => {
  const todos = [{ clave: "edad_minima", valor: 20 }, { clave: "edad_maxima", valor: 57 }];
  assert.equal(validarAjuste(a("edad_minima", "numero"), 60, todos).ok, false);
  assert.equal(validarAjuste(a("edad_maxima", "numero"), 19, todos).ok, false);
  assert.deepEqual(validarAjuste(a("edad_maxima", "numero"), 60, todos), { ok: true, valor: 60 });
});

test("listas: licencias válidas y ciudades sin repetir", () => {
  assert.deepEqual(validarAjuste(a("licencias", "lista"), "c2, C3, c2"), { ok: true, valor: ["C2", "C3"] });
  assert.equal(validarAjuste(a("licencias", "lista"), "C2, D1").ok, false);
  assert.deepEqual(validarAjuste(a("ciudades", "lista"), ["Barranquilla", " Soledad "]), { ok: true, valor: ["Barranquilla", "Soledad"] });
  assert.equal(validarAjuste(a("ciudades", "lista"), "").ok, false);
});

test("enlace de la política con https", () => {
  assert.equal(validarAjuste(a("enlace_politica", "texto"), "http://x.co").ok, false);
  assert.deepEqual(validarAjuste(a("enlace_politica", "texto"), "https://x.co/p"), { ok: true, valor: "https://x.co/p" });
  assert.deepEqual(validarAjuste(a("enlace_politica", "texto"), ""), { ok: true, valor: "" });
});

test("mostrar valores legibles", () => {
  assert.equal(mostrarValor("horas", 1), "1 hora");
  assert.equal(mostrarValor("dias", 7), "7 días");
  assert.equal(mostrarValor("pesos", 3000000), "$3.000.000");
  assert.equal(mostrarValor("lista", ["C2", "C3"]), "C2, C3");
  assert.equal(mostrarValor("texto", ""), "—");
});

test("nombre del asistente: no vacío, corto y sin llaves", () => {
  const a = { clave: "asistente_nombre", unidad: "texto", nombre: "Nombre del asistente de IA" };
  assert.deepEqual(validarAjuste(a, "  Angie "), { ok: true, valor: "Angie" });
  assert.equal(validarAjuste(a, "").ok, false);
  assert.equal(validarAjuste(a, "x".repeat(41)).ok, false);
  assert.equal(validarAjuste(a, "{nombre}").ok, false);
});

test("horas del día de la cita en orden: recordatorio < alerta < cita (N5, 25-nov-2026)", () => {
  const todos = [
    { clave: "recordatorio_cita_hora", valor: "08:00" },
    { clave: "alerta_no_confirmo_hora", valor: "11:00" },
    { clave: "cita_limite_mismo_dia", valor: "12:00" },
    { clave: "cita_hora_semana", valor: "13:00" },
    // El sábado va más temprano y no entra en la comparación.
    { clave: "cita_hora_sabado", valor: "08:00" },
  ];
  const hora = (clave: string, v: string) => validarAjuste(a(clave, "hora"), v, todos);
  // Los valores de hoy son válidos entre sí.
  for (const t of todos) assert.equal(hora(t.clave, t.valor).ok, true, t.clave);
  // El recordatorio no puede salir después de la alerta ni de la cita.
  assert.equal(hora("recordatorio_cita_hora", "11:30").ok, false);
  assert.equal(hora("recordatorio_cita_hora", "10:59").ok, true);
  // La alerta va entre el recordatorio y la cita.
  assert.equal(hora("alerta_no_confirmo_hora", "07:30").ok, false);
  assert.equal(hora("alerta_no_confirmo_hora", "13:00").ok, false);
  assert.equal(hora("alerta_no_confirmo_hora", "12:30").ok, true);
  // La cita no puede quedar antes de su alerta ni del límite para ofrecerla el mismo día.
  const mal = hora("cita_hora_semana", "10:00");
  assert.equal(mal.ok, false);
  assert.match(mal.ok ? "" : mal.error, /antes de la hora de la cita/);
  assert.equal(hora("cita_hora_semana", "14:00").ok, true);
  assert.equal(hora("cita_limite_mismo_dia", "13:30").ok, false);
  // La hora del sábado y las que no tienen orden no se comparan.
  assert.equal(hora("cita_hora_sabado", "07:00").ok, true);
  assert.equal(hora("laboratorio_hora", "06:30").ok, true);
  // Sin los demás ajustes (o mal guardados) no hay con qué comparar.
  assert.equal(validarAjuste(a("recordatorio_cita_hora", "hora"), "23:00").ok, true);
  assert.equal(conflictoDeHoras("recordatorio_cita_hora", "09:00", () => null), null);
});

test("cortes de la psicosensotécnica en orden", () => {
  const todos = [{ clave: "psico_corte_no_recomendado", valor: 50 }, { clave: "psico_corte_con_sugerencias", valor: 75 }];
  assert.equal(validarAjuste(a("psico_corte_no_recomendado", "porcentaje"), "80", todos).ok, false);
  assert.equal(validarAjuste(a("psico_corte_no_recomendado", "porcentaje"), "60", todos).ok, true);
  assert.equal(validarAjuste(a("psico_corte_con_sugerencias", "porcentaje"), "50", todos).ok, false);
  assert.equal(validarAjuste(a("psico_corte_con_sugerencias", "porcentaje"), "70", todos).ok, true);
});

test("opciones nuevas de antecedentes y la espera del cierre automático", () => {
  assert.deepEqual(validarAjuste(a("ant_rnmc_sin_respuesta", "opcion"), "pasa"), { ok: true, valor: "pasa" });
  assert.equal(validarAjuste(a("ant_rnmc_sin_respuesta", "opcion"), "tolera").ok, false);
  assert.equal(validarAjuste(a("ant_simit_accion", "opcion"), "tolera").ok, false);
  assert.equal(mostrarValor("opcion", "espera"), "Espera a que responda");
  assert.equal(mostrarValor("opcion", "revision"), "Revisión manual");
  assert.equal(validarAjuste(a("preseleccion_cierre_minutos", "minutos"), "3").ok, false);
  assert.deepEqual(validarAjuste(a("preseleccion_cierre_minutos", "minutos"), "45"), { ok: true, valor: 45 });
});
