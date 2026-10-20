import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fusionarPorClave,
  MAX_MARCACIONES,
  momentoDesdeLocal,
  normalizarCedula,
  validarLote,
} from "./lote";

/** Marcación mínima válida, para variar un campo a la vez. */
function marca(extra: Record<string, unknown> = {}) {
  return { id: 1, pin: "27", momento: "2026-10-13T06:42:10", ...extra };
}

test("normalizarCedula: el '0' del equipo no es una cédula", () => {
  assert.equal(normalizarCedula("0"), null);
  assert.equal(normalizarCedula("000"), null);
  assert.equal(normalizarCedula(""), null);
  assert.equal(normalizarCedula(null), null);
  assert.equal(normalizarCedula(undefined), null);
  // Demasiado corta o demasiado larga para ser cédula.
  assert.equal(normalizarCedula("123"), null);
  assert.equal(normalizarCedula("1".repeat(21)), null);
});

test("normalizarCedula: deja solo dígitos", () => {
  assert.equal(normalizarCedula("72197769"), "72197769");
  assert.equal(normalizarCedula(" 72.197.769 "), "72197769");
  assert.equal(normalizarCedula("CC 1042998276"), "1042998276");
  assert.equal(normalizarCedula(1042998276), "1042998276");
});

test("momentoDesdeLocal: hora del equipo -> momento con offset y día operativo", () => {
  assert.deepEqual(momentoDesdeLocal("2026-10-13T06:42:10"), {
    momento: "2026-10-13T06:42:10-05:00",
    fecha: "2026-10-13",
  });
  // Con espacio en vez de T, como lo escribe el proveedor OLE DB.
  assert.deepEqual(momentoDesdeLocal("2026-10-13 06:42:10"), {
    momento: "2026-10-13T06:42:10-05:00",
    fecha: "2026-10-13",
  });
  // Sin segundos.
  assert.deepEqual(momentoDesdeLocal("2026-10-13T06:42"), {
    momento: "2026-10-13T06:42:00-05:00",
    fecha: "2026-10-13",
  });
});

test("momentoDesdeLocal: rechaza lo que no es una fecha real", () => {
  for (const malo of [
    "2026-02-31T06:00:00", // febrero no tiene 31
    "2026-13-01T06:00:00", // mes 13
    "2026-10-13T25:00:00", // hora 25
    "2026-10-13T06:60:00", // minuto 60
    "13/10/2026 06:42", // otro formato
    "2026-10-13", // sin hora
    "",
    "ayer",
    1760000000,
    null,
    undefined,
  ]) {
    assert.equal(momentoDesdeLocal(malo), null, `deberia rechazar ${JSON.stringify(malo)}`);
  }
});

test("momentoDesdeLocal: una fecha anterior al equipo es basura", () => {
  assert.equal(momentoDesdeLocal("1899-10-13T06:00:00"), null);
  assert.equal(momentoDesdeLocal("2200-10-13T06:00:00"), null);
});

test("lote válido: normaliza marcaciones y personas", () => {
  const r = validarLote({
    agente: "PC-ZK/1.0",
    personas: [
      { pin: "27", userid: 634, identificacion: "72197769", cardNo: "72197769", ssn: "0", nombre: "Alexander", apellido: "Lechuga Cerda", departamentoId: 48 },
      { pin: "999", userid: 700, identificacion: null, cardNo: "", ssn: "0", nombre: "Sin", apellido: "Identificacion", departamentoId: 47 },
    ],
    marcaciones: [marca({ id: 31891320, deviceId: 7, deviceName: "Entrada", verificado: 6, punto: "Entrada-1" })],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.agente, "PC-ZK/1.0");
  assert.equal(r.lote.personas.length, 2);
  assert.equal(r.lote.personas[0].cedula, "72197769");
  // Sin identificación en ningún campo: la persona queda sin cédula, pero el
  // lote sigue siendo válido.
  assert.equal(r.lote.personas[1].cedula, null);
  assert.deepEqual(r.lote.marcaciones[0], {
    idZk: 31891320,
    pin: "27",
    momento: "2026-10-13T06:42:10-05:00",
    fecha: "2026-10-13",
    deviceId: 7,
    deviceName: "Entrada",
    deviceSn: "",
    verificado: 6,
    punto: "Entrada-1",
    origen: "access",
    recibidoAt: null,
  });
  assert.equal(r.lote.origen, "access");
  assert.equal(r.lote.repetidasEnLote, 0);
});

test("lote vacío es válido: sirve de latido", () => {
  const r = validarLote({ agente: "PC-ZK", marcaciones: [] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.marcaciones.length, 0);
  assert.equal(r.lote.personas.length, 0);
});

test("la cédula sale de CardNo, que es el campo que usa ZKAccess", () => {
  // El «N.º de identificación» de la interfaz es CardNo; SSN quedó en "0".
  const r = validarLote({
    personas: [{ pin: "940", cardNo: "72250850", ssn: "0" }],
    marcaciones: [],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.personas[0].cedula, "72250850");
});

/**
 * El caso que viene: de aquí en adelante, a quien enrolen desde la interfaz de
 * ZKAccess le queda la cédula SOLO en `CardNo` —la interfaz no escribe `SSN`,
 * que se queda en el "0" de fábrica—. Si el servidor no la resolviera, cada
 * persona nueva entraría sin cédula y sus marcaciones quedarían sin dueño.
 *
 * Los dos objetos de abajo NO están escritos a mano: son el JSON literal que
 * emitió el binario compilado del agente (`LeerPersonas` y `LeerMarcaciones`
 * por reflexión, Newtonsoft) leyendo un `Access.mdb` real donde se insertó una
 * persona igual que lo hace la interfaz. Pegarlos aquí fija la costura: si
 * alguien renombra una propiedad en `Datos/LectorZk.cs`, esto lo cae.
 */
test("persona nueva de la interfaz: cédula solo en CardNo, SSN en el «0» de fábrica", () => {
  const r = validarLote({
    agente: "PRUEBA-LECTOR",
    personas: [
      {
        pin: "9001",
        userid: 1737,
        identificacion: "1234567890",
        cardNo: "1234567890",
        ssn: "0",
        nombre: "NUEVO",
        apellido: "ENROLADO HOY",
        departamentoId: 48,
      },
    ],
    marcaciones: [
      {
        id: 88,
        pin: "57",
        momento: "2022-07-06T13:30:23",
        deviceId: 3,
        deviceName: "Entrada Principal",
        deviceSn: null,
        verificado: 6,
        punto: "Entrada Principal-1",
      },
    ],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.personas[0].cedula, "1234567890");
  assert.equal(r.lote.marcaciones[0].idZk, 88);
  assert.equal(r.lote.marcaciones[0].momento, "2022-07-06T13:30:23-05:00");
  assert.equal(r.lote.marcaciones[0].fecha, "2022-07-06");
  // El SN ya no puede ser null: es parte de la llave natural y con NULL dos
  // filas iguales nunca chocarían. La vía Access puede no traerlo (estas filas
  // de 2022 del lector anterior), y entonces queda en cadena vacía.
  assert.equal(r.lote.marcaciones[0].deviceSn, "");
  assert.equal(r.lote.marcaciones[0].origen, "access");
});

test("precedencia: identificacion > cardNo > cedula > ssn", () => {
  const caso = (p: Record<string, unknown>) => {
    const r = validarLote({ personas: [{ pin: "1", ...p }], marcaciones: [] });
    return r.ok ? r.lote.personas[0].cedula : "ERROR";
  };
  assert.equal(caso({ identificacion: "11111111", cardNo: "22222222", ssn: "33333333" }), "11111111");
  assert.equal(caso({ cardNo: "22222222", ssn: "33333333" }), "22222222");
  // CardNo vacío o en el "0" de fábrica: cae al siguiente campo con valor.
  assert.equal(caso({ cardNo: "0", ssn: "33333333" }), "33333333");
  assert.equal(caso({ cardNo: "", ssn: "33333333" }), "33333333");
  // Un agente viejo que solo mande ssn sigue funcionando.
  assert.equal(caso({ ssn: "33333333" }), "33333333");
  assert.equal(caso({}), null);
});

test("acepta claves con guion bajo (las que manda el agente tal cual)", () => {
  const r = validarLote({
    marcaciones: [
      { id: 5, pin: "27", momento: "2026-10-13T06:00:00", device_id: 7, device_name: "Entrada", device_sn: "AHID22", verified: 6 },
    ],
    personas: [{ pin: "27", userid: 1, card_no: "72197769", departamento_id: 48 }],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.marcaciones[0].deviceId, 7);
  assert.equal(r.lote.marcaciones[0].deviceSn, "AHID22");
  assert.equal(r.lote.marcaciones[0].verificado, 6);
  assert.equal(r.lote.personas[0].departamentoId, 48);
});

test("el error dice el índice y el id, para poder arreglarlo", () => {
  const r = validarLote({
    marcaciones: [marca({ id: 1 }), marca({ id: 2, momento: "2026-13-01T06:00:00" })],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.estado, 400);
  assert.match(r.error, /marcaciones\[1\]/);
  assert.match(r.error, /id 2/);
  assert.match(r.error, /momento/);
});

test("rechaza el lote entero: id cero, negativo o no entero", () => {
  for (const id of [0, -3, "abc", 1.5]) {
    const r = validarLote({ marcaciones: [{ pin: "27", momento: "2026-10-13T06:00:00", id }] });
    assert.equal(r.ok, false, `deberia rechazar id ${JSON.stringify(id)}`);
  }
});

/**
 * El cambio de contrato: antes «id ausente» era un error. Ahora significa que
 * la huella la leyó el agente DEL LECTOR por el SDK, donde ese id no existe, y
 * entonces la identidad es (deviceSn, pin, momento): sin SN no se puede ni
 * deduplicar ni atribuir, así que el lote se rechaza.
 */
test("sin id la marcación viene del equipo, y entonces deviceSn es obligatorio", () => {
  for (const id of [undefined, null, ""]) {
    const sinSn = validarLote({
      marcaciones: [{ pin: "27", momento: "2026-10-13T06:00:00", id }],
    });
    assert.equal(sinSn.ok, false, `sin deviceSn debería rechazar id ${JSON.stringify(id)}`);
    if (!sinSn.ok) assert.match(sinSn.error, /deviceSn/);

    const conSn = validarLote({
      marcaciones: [
        { pin: "27", momento: "2026-10-13T06:00:00", id, deviceSn: "AHID222860036" },
      ],
    });
    assert.ok(conSn.ok, `con deviceSn debería aceptar id ${JSON.stringify(id)}`);
    if (!conSn.ok) return;
    assert.equal(conSn.lote.origen, "equipo");
    assert.equal(conSn.lote.marcaciones[0].idZk, null);
    assert.equal(conSn.lote.marcaciones[0].deviceSn, "AHID222860036");
  }
});

test("un lote no puede mezclar las dos vías", () => {
  // El agente nunca mezcla: si llegan juntas es un error suyo, y aceptarlo
  // haría que el origen de cada fila dejara de ser deducible.
  const r = validarLote({
    marcaciones: [
      marca({ id: 31891320 }),
      { pin: "89", momento: "2026-10-13T07:00:00", deviceSn: "AHID222860036" },
    ],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.estado, 400);
  assert.match(r.error, /mezcla/);
});

test("recibidoAt: válido pasa a ISO, inválido tumba el lote", () => {
  const ok = validarLote({
    marcaciones: [
      {
        pin: "27",
        momento: "2026-10-13T06:00:00",
        deviceSn: "AHID222860036",
        recibidoAt: "2026-10-13T06:00:02-05:00",
      },
    ],
  });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.lote.marcaciones[0].recibidoAt, "2026-10-13T11:00:02.000Z");

  const malo = validarLote({
    marcaciones: [
      { pin: "27", momento: "2026-10-13T06:00:00", deviceSn: "X", recibidoAt: "ayer" },
    ],
  });
  assert.equal(malo.ok, false);
  if (malo.ok) return;
  assert.match(malo.error, /recibidoAt/);
});

/**
 * La misma huella puede venir varias veces en un lote de la vía Access: el
 * mismo lector está registrado cuatro veces en la historia de ZKAccess y cada
 * re-registro volvió a descargar su memoria completa (57.577 filas de más
 * entre 2022 y 2024). Se colapsan en vez de rechazar el lote, porque
 * rechazarlo atascaría la marca de avance de ese tramo para siempre.
 */
test("fusionarPorClave colapsa la misma huella y se queda con el menor id", () => {
  const base = {
    pin: "82",
    momento: "2023-01-02T06:15:19-05:00",
    fecha: "2023-01-02",
    deviceId: 7,
    deviceName: "Entrada",
    deviceSn: "AHID222860036",
    verificado: 6,
    punto: "Entrada-1",
    origen: "access" as const,
    recibidoAt: null,
  };
  const { lista, repetidas } = fusionarPorClave([
    { ...base, idZk: 900 },
    { ...base, idZk: 300 },
    { ...base, idZk: 1200 },
    { ...base, idZk: 700 },
  ]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].idZk, 300);
  assert.equal(repetidas, 3);
});

test("fusionarPorClave: distinto lector con el mismo pin y hora son dos huellas", () => {
  const base = {
    pin: "82",
    momento: "2023-01-02T06:15:19-05:00",
    fecha: "2023-01-02",
    deviceId: 7,
    deviceName: "Entrada",
    verificado: 6,
    punto: "Entrada-1",
    origen: "access" as const,
    recibidoAt: null,
  };
  const { lista, repetidas } = fusionarPorClave([
    { ...base, idZk: 1, deviceSn: "AHID222860036" },
    { ...base, idZk: 2, deviceSn: "AHID211660104" },
  ]);
  assert.equal(lista.length, 2);
  assert.equal(repetidas, 0);
});

test("fusionarPorClave: el id de Access gana sobre una fila sin id", () => {
  // Pasaría solo si un lote mezclara vías (ya rechazado), pero la regla debe
  // ser determinista: la fila con id es la que puede completar el histórico.
  const base = {
    pin: "27",
    momento: "2026-10-13T06:42:10-05:00",
    fecha: "2026-10-13",
    deviceId: 7,
    deviceName: "Entrada",
    deviceSn: "AHID222860036",
    verificado: 6,
    punto: "Entrada-1",
    origen: "equipo" as const,
    recibidoAt: null,
  };
  const { lista } = fusionarPorClave([{ ...base, idZk: null }, { ...base, idZk: 55 }]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].idZk, 55);
});

test("el validador ya entrega las repetidas colapsadas y contadas", () => {
  const r = validarLote({
    marcaciones: [marca({ id: 10 }), marca({ id: 11 }), marca({ id: 12 })],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  // Las tres son la MISMA huella (igual pin y momento por defecto de `marca`).
  assert.equal(r.lote.marcaciones.length, 1);
  assert.equal(r.lote.marcaciones[0].idZk, 10);
  assert.equal(r.lote.repetidasEnLote, 2);
});

test("rechaza pin vacío y objetos que no son objetos", () => {
  assert.equal(validarLote({ marcaciones: [marca({ pin: "" })] }).ok, false);
  assert.equal(validarLote({ marcaciones: [marca({ pin: "   " })] }).ok, false);
  assert.equal(validarLote({ marcaciones: ["no soy objeto"] }).ok, false);
  assert.equal(validarLote({ marcaciones: [null] }).ok, false);
});

test("rechaza un id repetido dentro del mismo lote", () => {
  const r = validarLote({ marcaciones: [marca({ id: 7 }), marca({ id: 7 })] });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /dos veces/);
});

test("rechaza un pin repetido en el snapshot de personas", () => {
  const r = validarLote({
    personas: [
      { pin: "27", userid: 1, cardNo: "72197769" },
      { pin: "27", userid: 2, cardNo: "72162708" },
    ],
    marcaciones: [],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /viene dos veces/);
});

test("pasa de MAX_MARCACIONES -> 413, no 400", () => {
  const muchas = Array.from({ length: MAX_MARCACIONES + 1 }, (_, i) =>
    marca({ id: i + 1 })
  );
  const r = validarLote({ marcaciones: muchas });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.estado, 413);
});

test("cuerpo que no es objeto, o listas que no son listas", () => {
  assert.equal(validarLote(null).ok, false);
  assert.equal(validarLote("texto").ok, false);
  assert.equal(validarLote([]).ok, false);
  assert.equal(validarLote({ marcaciones: "no es lista" }).ok, false);
  assert.equal(validarLote({ personas: 5, marcaciones: [] }).ok, false);
});

test("campos opcionales malos invalidan el lote (son del esquema del equipo)", () => {
  assert.equal(validarLote({ marcaciones: [marca({ deviceId: "siete" })] }).ok, false);
  assert.equal(validarLote({ marcaciones: [marca({ verificado: "huella" })] }).ok, false);
  // Ausentes sí son válidos: quedan en null.
  const r = validarLote({ marcaciones: [marca()] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.marcaciones[0].deviceId, null);
  assert.equal(r.lote.marcaciones[0].verificado, null);
});
