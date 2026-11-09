import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarControl, estadoExamen, ordenarControl, pendientesDe, proximoExamen, resumirControl, sumarMeses, textoDias, validarExamen, validarPersona,
  type ExamenPeriodico, type PersonaExamen,
} from "./examenes";
import { fechaCelda, grupoPorArea, hojaControl, hojaMensual, leerLibroExamenes, periodicidadDesde, recomendacionesDe } from "./examenes-historico";

const HOY = "2026-11-05";

test("sumarMeses / proximoExamen: meses calendario, fin de mes", () => {
  assert.equal(sumarMeses("2025-01-31", 1), "2025-02-28");
  assert.equal(sumarMeses("2024-01-31", 1), "2024-02-29");
  assert.equal(proximoExamen("2025-11-05", 12), "2026-11-05");
  assert.equal(proximoExamen("2025-03-15", 36), "2028-03-15");
});

test("estadoExamen y textoDias: semáforo con 30 días de aviso", () => {
  assert.deepEqual(estadoExamen(null, HOY), { estado: "sin_examen", dias: null });
  assert.deepEqual(estadoExamen("2026-11-04", HOY), { estado: "vencido", dias: -1 });
  assert.deepEqual(estadoExamen("2026-11-05", HOY), { estado: "por_vencer", dias: 0 });
  assert.deepEqual(estadoExamen("2026-12-05", HOY), { estado: "por_vencer", dias: 30 });
  assert.deepEqual(estadoExamen("2026-12-06", HOY), { estado: "vigente", dias: 31 });
  assert.equal(textoDias(-3), "Vencido hace 3 días");
  assert.equal(textoDias(0), "Vence hoy");
  assert.equal(textoDias(1), "Faltan 1 día");
  assert.equal(textoDias(null), "Sin examen registrado");
});

const base = {
  cedula: "72.160.829", nombre: " Humberto Acosta ", cargo: "Conductor", grupo: "conductores",
  fechaAtencion: "2026-10-01", fechaEntrega: "2026-10-03", periodicidadMeses: "", recomendaciones: "  Uso de lentes ", observaciones: "",
};

test("validarExamen: normaliza y calcula el próximo examen", () => {
  const r = validarExamen(base, HOY);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.datos.cedula, "72160829");
  assert.equal(r.datos.nombre, "Humberto Acosta");
  assert.equal(r.datos.periodicidadMeses, 12);
  assert.equal(r.datos.proximoExamen, "2027-10-01");
  assert.equal(r.datos.recomendaciones, "Uso de lentes");
  assert.equal(r.datos.observaciones, null);
  const r24 = validarExamen({ ...base, periodicidadMeses: "24" }, HOY);
  assert.equal(r24.ok && r24.datos.proximoExamen, "2028-10-01");
});

test("validarExamen: rechaza lo inválido", () => {
  const err = (x: Record<string, unknown>) => {
    const r = validarExamen({ ...base, ...x }, HOY);
    return r.ok ? "" : r.error;
  };
  assert.match(err({ cedula: "12" }), /cédula/);
  assert.match(err({ nombre: " " }), /nombre/);
  assert.match(err({ grupo: "otro" }), /grupo/);
  assert.match(err({ fechaAtencion: "2026-11-06" }), /futura/);
  assert.match(err({ fechaAtencion: "01/10/2026" }), /atención no es válida/);
  assert.match(err({ fechaEntrega: "2026-09-30" }), /anterior a la atención/);
  assert.match(err({ periodicidadMeses: "3" }), /periodicidad/);
  assert.match(err({ periodicidadMeses: "12.5" }), /periodicidad/);
});

test("validarPersona: una persona inactiva exige motivo y toma hoy por defecto", () => {
  const p = { cedula: "1042422873", nombre: "Yonnatan Puerta", grupo: "conductores", activo: false, motivoInactivo: "" };
  const r = validarPersona(p, HOY);
  assert.equal(r.ok, false);
  const r2 = validarPersona({ ...p, motivoInactivo: "retirado" }, HOY);
  assert.equal(r2.ok && r2.datos.inactivoDesde, HOY);
  const r3 = validarPersona({ ...p, activo: true, motivoInactivo: "retirado" }, HOY);
  assert.equal(r3.ok && r3.datos.motivoInactivo, null);
});

const persona = (cedula: string, extra: Partial<PersonaExamen> = {}): PersonaExamen => ({
  cedula, nombre: `P ${cedula}`, cargo: null, grupo: "conductores", fechaIngreso: null, periodicidadMeses: 12, activo: true,
  motivoInactivo: null, inactivoDesde: null, observaciones: null, origen: "gestivo", ...extra,
});
const examen = (cedula: string, fecha: string, meses = 12): ExamenPeriodico => ({
  id: `${cedula}-${fecha}`, cedula, nombre: `P ${cedula}`, cargo: null, fechaAtencion: fecha, fechaEntrega: null,
  periodicidadMeses: meses, proximoExamen: proximoExamen(fecha, meses), recomendaciones: null, observaciones: null,
  origen: "gestivo", createdByEmail: null, createdAt: "", updatedByEmail: null, updatedAt: null,
});

test("armarControl: sin exámenes, el primero se cuenta desde la fecha de ingreso", () => {
  const [f5, f6] = armarControl([persona("5", { fechaIngreso: "2026-01-20" }), persona("6", { fechaIngreso: "2024-03-01", periodicidadMeses: 36 })], [], HOY);
  assert.deepEqual([f5.proximo, f5.base, f5.estado], ["2027-01-20", "ingreso", "vigente"]);
  assert.deepEqual([f6.proximo, f6.base, f6.estado], ["2027-03-01", "ingreso", "vigente"]);
});

test("armarControl / resumirControl: manda el último examen y cuentan solo los activos", () => {
  const filas = armarControl(
    [persona("1", { fechaIngreso: "2020-01-01" }), persona("2"), persona("3"), persona("4", { activo: false, motivoInactivo: "retirado" })],
    [examen("1", "2024-01-10"), examen("1", "2026-01-10"), examen("2", "2025-10-20"), examen("4", "2020-01-01")],
    HOY
  );
  const f1 = filas.find((f) => f.persona.cedula === "1")!;
  assert.equal(f1.ultimo?.fechaAtencion, "2026-01-10");
  assert.equal(f1.estado, "vigente");
  assert.equal(f1.base, "examen");
  assert.equal(filas.find((f) => f.persona.cedula === "2")!.estado, "vencido");
  assert.equal(filas.find((f) => f.persona.cedula === "3")!.estado, "sin_examen");
  const r = resumirControl(filas, HOY);
  assert.deepEqual(r, { activos: 3, vencido: 1, por_vencer: 0, sin_examen: 1, vigente: 1, atendidosAnio: 1 });
  assert.deepEqual(ordenarControl(filas).map((f) => f.persona.cedula), ["2", "3", "1", "4"]);
});

test("armarControl: si volvió a ingresar después de su último examen, cuenta desde el ingreso", () => {
  const [f] = armarControl([persona("7", { fechaIngreso: "2026-06-01" })], [examen("7", "2023-02-01")], HOY);
  assert.deepEqual([f.proximo, f.base, f.ultimo?.fechaAtencion], ["2027-06-01", "ingreso", "2023-02-01"]);
});

test("pendientesDe: entrega, recomendaciones y cargo", () => {
  assert.deepEqual(pendientesDe({ fechaEntrega: null, recomendaciones: "  ", cargo: null }), ["entrega", "recomendaciones", "cargo"]);
  assert.deepEqual(pendientesDe({ fechaEntrega: "2026-10-03", recomendaciones: "Lentes", cargo: "Cajero" }), []);
});

// ── Histórico ───────────────────────────────────────────────────────────────

test("fechaCelda: serie, ISO, d/m/aaaa y año truncado", () => {
  assert.deepEqual(fechaCelda(45674), { fecha: "2025-01-17", corregida: false });
  assert.deepEqual(fechaCelda("2026-09-01"), { fecha: "2026-09-01", corregida: false });
  assert.deepEqual(fechaCelda("27/05/2025"), { fecha: "2025-05-27", corregida: false });
  assert.deepEqual(fechaCelda("27/05/202", 2026), { fecha: "2026-05-27", corregida: true });
  assert.deepEqual(fechaCelda("REPETIR GLICEMIA"), { fecha: null, corregida: false });
  assert.deepEqual(fechaCelda(0.5), { fecha: null, corregida: false });
});

test("hojas, grupos por área, recomendaciones y periodicidad", () => {
  assert.deepEqual(hojaMensual("JUNIO 25 "), { anio: 2025, mes: 6 });
  assert.deepEqual(hojaMensual("ABRIL25"), { anio: 2025, mes: 4 });
  assert.equal(hojaMensual("COND LA CAROLINA."), null);
  assert.equal(hojaControl("COND LA CAROLINA."), "conductores");
  assert.equal(hojaControl("ANAYA GIRALDO."), "anaya_giraldo");
  assert.equal(grupoPorArea("REUBICADO - APOYO EN RUTA"), "reubicados");
  assert.equal(grupoPorArea("CONDUCTOR - COBRADOR"), "conductores");
  assert.equal(grupoPorArea("VIGILANTE"), "anaya_giraldo");
  assert.equal(grupoPorArea("ASISTENTE CONTABLE"), "administrativos");
  assert.equal(recomendacionesDe("•\tUsar lentes.\n•\tAudiometría  en un año\n\n"), "Usar lentes.\nAudiometría en un año");
  assert.equal(periodicidadDesde("2025-06-01", "2026-05-20"), 12);
  assert.equal(periodicidadDesde("2025-06-01", "2028-06-01"), 36);
  assert.equal(periodicidadDesde("2025-06-01", null), 12);
});

test("leerLibroExamenes: funde mensual con control, repetidos, retirados y citas futuras", () => {
  const r = leerLibroExamenes(
    [
      {
        nombre: "ENERO 25",
        filas: [
          [null, null, "CEDULA", "NOMBRE COMPLETO", "AREA", "FECHA DE ATENCION", "FECHA DE ENTREGA", "RECOMENDACIONES"],
          [null, 1, 72160829, "ACOSTA GALINDO HUMBERTO   ", "CONDUCTOR", 45674, 45675, "•\tUsar lentes"],
          [null, 2, 18928607, "MEZA CHARRIS MARIANO", "CONDUCTOR", "17/01/202", "PENDIENTE HC", null],
          [null, 3, 5678281, "BUENO MORENO ALBARO", "ASISTENTE CONTABLE", null, null, null],
        ],
      },
      {
        nombre: "FEBRERO 25",
        filas: [
          [null, "CEDULA", "NOMBRE COMPLETO", "AREA", "FECHA DE ATENCION", "FECHA DE ENTREGA", "RECOMENDACIONES"],
          ["PROTEGER", 72160829, "ACOSTA GALINDO HUMBERTO", "CONDUCTOR", 45674, null, null],
          [null, 1042422873, "PUERTA BARRIOS YONNATAN", "REUBICADO", 46200, null, null],
          [null, 1234567, "CITA FUTURA", "CONDUCTOR", 46400, null, null],
        ],
      },
      {
        nombre: "COND LA CAROLINA.",
        filas: [
          ["CONTROL EXAMENES PERIODICOS CONDUCTORES CAROLINA"],
          ["CEDULA", "NOMBRE COMPLETO", "CARGO", "FECHA DE INGRESO", "AÑOS", null, null, "FECHA DEL PROXIMO EXAMEN ", "DIAS RESTANTES ", "ALERTAS"],
          [null, null, null, null, 2023, 2024, 2025, null, null, null],
          [null, null, null, null, "FECHA DE REALIZACION", "FECHA DE REALIZACION", "FECHA DE REALIZACION"],
          [72160829, "ACOSTA GALINDO HUMBERTO", "CONDUCTOR", "2020-03-01", 45000, "INCAP", 45680, 46039, -2, "Vencido hace 2 días"],
          [18928607, "MEZA CHARRIS MARIANO", "CONDUCTOR", null, null, "RETIRADO", "RETIRADO", null, null, "Faltan  días"],
        ],
      },
      { nombre: "Hoja1", filas: [["nada"]] },
    ],
    "2026-11-05"
  );
  // La atención del 2025-01-17 estaba en enero y febrero, y en el control como 2025-01-23: es una sola.
  const acosta = r.examenes.filter((e) => e.cedula === "72160829");
  assert.deepEqual(acosta.map((e) => e.fechaAtencion), ["2023-03-15", "2025-01-17"]);
  const ultimo = acosta[1];
  assert.equal(ultimo.fechaEntrega, "2025-01-18");
  assert.equal(ultimo.recomendaciones, "Usar lentes");
  assert.match(ultimo.observaciones ?? "", /PROTEGER/);
  assert.equal(ultimo.historicoRef, "ENERO 25:2");
  assert.equal(ultimo.periodicidadMeses, 12);
  assert.equal(ultimo.proximoExamen, "2026-01-17");
  // Año truncado y entrega en texto.
  const meza = r.examenes.find((e) => e.cedula === "18928607")!;
  assert.equal(meza.fechaAtencion, "2025-01-17");
  assert.equal(meza.observaciones, "Entrega: PENDIENTE HC");
  // Personas: retirado desde 2024, y el reubicado que solo está en una hoja mensual.
  const pMeza = r.personas.find((p) => p.cedula === "18928607")!;
  assert.equal(pMeza.activo, false);
  assert.equal(pMeza.inactivoDesde, "2024-01-01");
  assert.equal(r.personas.find((p) => p.cedula === "72160829")?.periodicidadMeses, 12);
  assert.equal(r.personas.find((p) => p.cedula === "1042422873")?.grupo, "reubicados");
  assert.equal(r.control.get("72160829")?.alerta, "Vencido hace 2 días");
  assert.equal(r.control.get("18928607")?.alerta, null);
  // La cita sin fecha se rechaza; la de 2027 (serie 46400) es futura y no crea persona.
  assert.ok(r.rechazadas.some((x) => x.ref === "ENERO 25:4" && /cita programada/.test(x.motivo)));
  assert.ok(r.rechazadas.some((x) => x.ref === "FEBRERO 25:4" && /futura/.test(x.motivo)));
  assert.equal(r.personas.some((p) => p.cedula === "1234567"), false);
  assert.ok(r.avisos.some((x) => /INCAP/.test(x.aviso)));
  assert.equal(r.hojas.find((h) => h.nombre === "Hoja1")?.tipo, "ignorada");
});
