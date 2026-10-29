import { test } from "node:test";
import assert from "node:assert/strict";
import { filasTerminal } from "./cartulina-hoy";
import { EVENTO_ENTRADA, EVENTO_SALIDA, avisosPuntosVirtuales } from "./revision-timbradas-reglas";

const fila = (x: Record<string, unknown>) => ({
  Numero: 35300001, IMEI: "860000000000001", Vehiculo: "WGB055", Codigo: "624", Registradora: 120,
  FechaHora: "2026-10-29 13:28:18", Fecha: "2026-10-29", Hora: "13:28:18", Descripcion: EVENTO_SALIDA,
  isBase: 1, subidas: 10, bajadas: 2, ...x,
});

test("filasTerminal: solo salidas y entradas del terminal del día, sin repetidos", () => {
  const filas = filasTerminal(
    [
      fila({}),
      fila({ Numero: 35300002 }), // GEMA repite la misma fila con otro número provisional
      fila({ Descripcion: EVENTO_ENTRADA, FechaHora: "2026-10-29 14:10:00", Hora: "14:10:00" }),
      fila({ isBase: 0 }), // fuera del terminal
      fila({ Descripcion: "Paso por punto virtual" }),
      fila({ Fecha: "2026-10-28", FechaHora: "2026-10-28 23:59:00" }), // otro día
    ],
    "2026-10-29",
  );
  assert.equal(filas.length, 2);
  assert.deepEqual(filas.map((f) => f.descripcion).sort(), [EVENTO_ENTRADA, EVENTO_SALIDA].sort());
  assert.equal(filas[0].numero_provisional, 35300002); // el último visto, solo informativo
  assert.equal(filas[0].placa, "WGB055");
});

test("avisosPuntosVirtuales: sin aviso nocturno si el día siguiente ya viene del día en curso", () => {
  const viajes = [{ horaDespacho: "22:30:00", horaLlegada: "00:40:00" }];
  assert.equal(avisosPuntosVirtuales({ fecha: "2026-10-28", marcadorPv: "2026-10-29", viajes, eventosDelDia: 4 }).length, 1);
  assert.equal(
    avisosPuntosVirtuales({ fecha: "2026-10-28", marcadorPv: "2026-10-29", viajes, eventosDelDia: 4, diasProvisionales: ["2026-10-29"] }).length,
    0,
  );
});
