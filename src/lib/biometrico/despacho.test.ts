import { test } from "node:test";
import assert from "node:assert/strict";
import { presenciaDelDia, salioARodar, type FilaDespacho } from "./despacho";

function fila(extra: Partial<FilaDespacho> = {}): FilaDespacho {
  return {
    conductor_ced: "72008791",
    hora_despacho: "03:55:00",
    codigo: "528",
    turno: 2,
    viaje: 1,
    estado: "DESPACHADO",
    ruta_programada: "A -- 16 MIRAMAR",
    timbradas: 47,
    ...extra,
  };
}

// ── Las dos trampas de los datos de GEMA ───────────────────────────────────

test("POR_DESPACHAR no salió: es el turno de más tarde del mismo día", () => {
  // Y trae hora 00:00:00 de relleno. Son 273 filas de las 6.560 de octubre.
  assert.equal(
    salioARodar(fila({ estado: "POR_DESPACHAR", hora_despacho: "00:00:00", timbradas: 0 })),
    false
  );
});

test("NO_DESPACHADO no salió AUNQUE traiga hora real", () => {
  // La trampa que importa: 1.255 de las 1.274 filas NO_DESPACHADO de octubre
  // traen hora, pero es la PLANEADA, y ninguna tiene timbradas. Fiarse de la
  // hora habría dado por presentes 1.255 viajes que nunca rodaron.
  assert.equal(
    salioARodar(fila({ estado: "NO_DESPACHADO", hora_despacho: "05:00:00", timbradas: 0 })),
    false
  );
});

test("los estados que sí salieron", () => {
  for (const estado of ["DESPACHADO", "NO_FINALIZADO", "PENDIENTE", "POR_LIQUIDAR"]) {
    assert.equal(salioARodar(fila({ estado, timbradas: 0 })), true, estado);
  }
});

test("las timbradas valen por sí solas: red para un estado nuevo de GEMA", () => {
  // Hoy ninguna fila entra solo por aquí (medido: 0 de 6.560). Está para que
  // un estado nuevo que sí rodó no aparezca como una ausencia falsa.
  assert.equal(salioARodar(fila({ estado: "ALGO_NUEVO", timbradas: 12 })), true);
  assert.equal(salioARodar(fila({ estado: "ALGO_NUEVO", timbradas: 0 })), false);
  assert.equal(salioARodar(fila({ estado: null, timbradas: null })), false);
});

test("el estado no distingue mayúsculas ni espacios", () => {
  assert.equal(salioARodar(fila({ estado: " despachado ", timbradas: 0 })), true);
});

// ── El primer viaje ────────────────────────────────────────────────────────

test("el primer viaje es el de menor hora entre los que salieron", () => {
  const { trabajaron } = presenciaDelDia([
    fila({ hora_despacho: "12:00:00", codigo: "600", turno: 9, viaje: 3 }),
    fila({ hora_despacho: "03:55:00", codigo: "528", turno: 2, viaje: 1 }),
    fila({ hora_despacho: "07:30:00", codigo: "528", turno: 2, viaje: 2 }),
  ]);
  const v = trabajaron.get("72008791");
  assert.ok(v);
  assert.equal(v.hora, "03:55:00");
  assert.equal(v.bus, "528");
  assert.equal(v.turno, 2);
  assert.equal(v.viaje, 1);
  assert.equal(v.viajes, 3);
});

test("un viaje que no salió no cuenta ni como primero ni en el total", () => {
  const { trabajaron } = presenciaDelDia([
    // Más temprano, pero no rodó: no puede ser el «primer viaje».
    fila({ hora_despacho: "03:00:00", estado: "NO_DESPACHADO", timbradas: 0, codigo: "999" }),
    fila({ hora_despacho: "05:10:00", codigo: "528" }),
  ]);
  const v = trabajaron.get("72008791");
  assert.ok(v);
  assert.equal(v.hora, "05:10:00");
  assert.equal(v.bus, "528");
  assert.equal(v.viajes, 1);
});

test("una hora de relleno no gana como primer viaje", () => {
  // No debería pasar (0 casos en octubre), pero si un viaje que rodó llegara
  // con 00:00:00 no puede desplazar a la hora real.
  const { trabajaron } = presenciaDelDia([
    fila({ hora_despacho: "06:00:00", codigo: "528" }),
    fila({ hora_despacho: "00:00:00", codigo: "999" }),
  ]);
  assert.equal(trabajaron.get("72008791")?.hora, "06:00:00");
  assert.equal(trabajaron.get("72008791")?.bus, "528");
});

test("si el relleno llega primero, la hora real lo reemplaza", () => {
  const { trabajaron } = presenciaDelDia([
    fila({ hora_despacho: "00:00:00", codigo: "999" }),
    fila({ hora_despacho: "06:00:00", codigo: "528" }),
  ]);
  assert.equal(trabajaron.get("72008791")?.hora, "06:00:00");
  assert.equal(trabajaron.get("72008791")?.bus, "528");
});

// ── Turno pendiente ────────────────────────────────────────────────────────

test("quien solo tiene viajes sin salir queda en porSalir, no en trabajaron", () => {
  const { trabajaron, porSalir } = presenciaDelDia([
    fila({ conductor_ced: "1", estado: "POR_DESPACHAR", hora_despacho: "00:00:00", timbradas: 0 }),
  ]);
  assert.equal(trabajaron.size, 0);
  assert.deepEqual([...porSalir], ["1"]);
});

test("quien ya rodó no queda también en porSalir", () => {
  const { trabajaron, porSalir } = presenciaDelDia([
    fila({ conductor_ced: "1", hora_despacho: "04:00:00" }),
    fila({ conductor_ced: "1", estado: "POR_DESPACHAR", hora_despacho: "00:00:00", timbradas: 0 }),
  ]);
  assert.equal(trabajaron.size, 1);
  assert.equal(porSalir.size, 0);
});

test("a quien se le cayeron todos los viajes NO se le esconde en porSalir", () => {
  // NO_DESPACHADO ya no va a salir. Dejarlo en «turno sin empezar» taparía una
  // posible ausencia: el bus se pudo varar, pero también pudo no presentarse.
  const { trabajaron, porSalir } = presenciaDelDia([
    fila({ conductor_ced: "1", estado: "NO_DESPACHADO", timbradas: 0 }),
    fila({ conductor_ced: "1", estado: "NO_DESPACHADO", timbradas: 0 }),
  ]);
  assert.equal(trabajaron.size, 0);
  assert.equal(porSalir.size, 0);
});

test("un viaje caído y otro por salir: sigue siendo turno sin empezar", () => {
  const { trabajaron, porSalir } = presenciaDelDia([
    fila({ conductor_ced: "1", estado: "NO_DESPACHADO", timbradas: 0 }),
    fila({ conductor_ced: "1", estado: "POR_DESPACHAR", hora_despacho: "00:00:00", timbradas: 0 }),
  ]);
  assert.equal(trabajaron.size, 0);
  assert.deepEqual([...porSalir], ["1"]);
});

test("una fila sin cédula se ignora: no se puede atribuir", () => {
  const { trabajaron, porSalir } = presenciaDelDia([
    fila({ conductor_ced: null }),
    fila({ conductor_ced: "   " }),
  ]);
  assert.equal(trabajaron.size, 0);
  assert.equal(porSalir.size, 0);
});

test("un bus despachado sin conductor no es una persona que vino", () => {
  // `99999999` sale en el despacho como «CONDUCTOR  SIN .»: 130 filas en 14
  // días, ninguna rodó. Aunque rodara, no es nadie.
  const { trabajaron, porSalir } = presenciaDelDia([
    fila({ conductor_ced: "99999999" }),
    fila({ conductor_ced: "999999991", estado: "POR_DESPACHAR", timbradas: 0 }),
  ]);
  assert.equal(trabajaron.size, 0);
  assert.equal(porSalir.size, 0);
});

test("día sin filas: los dos vacíos", () => {
  const { trabajaron, porSalir } = presenciaDelDia([]);
  assert.equal(trabajaron.size, 0);
  assert.equal(porSalir.size, 0);
});
