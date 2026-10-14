import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_MODULES,
  ALL_SUBS,
  modulosEfectivos,
  MODULE_SUBS,
  normalizarIndividuales,
  origenSub,
  SUB_HOME,
  SUB_TO_MODULE,
  SUBMODULE_LABELS,
  SUBS_SENSIBLES,
  SUBS_SOLO_ADMIN,
  subAllowed,
} from "./permissions-shared";

// Los permisos individuales guardan las sub-funciones en un mapa PLANO
// ({"auditoria": true}), igual que se indexan SUBS_SENSIBLES, SUBS_SOLO_ADMIN,
// SUB_HOME y SUBMODULE_LABELS. Si un nombre se repitiera entre módulos, todos
// esos mapas se confundirían: de ahí los prefijos incap_ y fin_.
test("los nombres de sub-función son únicos entre módulos", () => {
  const todas = Object.values(MODULE_SUBS).flatMap((s) => [...(s as readonly string[])]);
  assert.equal(new Set(todas).size, todas.length);
  assert.equal(ALL_SUBS.length, todas.length);
});

test("cada sub-función tiene etiqueta, inicio y módulo", () => {
  for (const sub of ALL_SUBS) {
    assert.ok(SUBMODULE_LABELS[sub], `falta etiqueta de ${sub}`);
    assert.ok(SUB_HOME[sub], `falta ruta de inicio de ${sub}`);
    assert.ok(SUB_TO_MODULE[sub], `falta el módulo de ${sub}`);
  }
  // Y al contrario: nada en los conjuntos de reglas apunta a una sub que no exista.
  for (const sub of [...SUBS_SENSIBLES, ...SUBS_SOLO_ADMIN]) {
    assert.ok(ALL_SUBS.includes(sub), `${sub} no está en MODULE_SUBS`);
  }
});

test("módulos efectivos: el rol más lo concedido menos lo denegado", () => {
  const rol = ["dashboard", "tesoreria"];
  assert.deepEqual(modulosEfectivos(rol, {}), ["dashboard", "tesoreria"]);
  assert.deepEqual(modulosEfectivos(rol, { modulos: { conductores: true } }), [
    "dashboard",
    "conductores",
    "tesoreria",
  ]); // orden de ALL_MODULES, no el de llegada
  assert.deepEqual(modulosEfectivos(rol, { modulos: { tesoreria: false } }), ["dashboard"]);
  // Conceder algo que el rol ya da no lo duplica; denegar algo que no tiene no rompe.
  assert.deepEqual(modulosEfectivos(rol, { modulos: { tesoreria: true } }), [
    "dashboard",
    "tesoreria",
  ]);
  assert.deepEqual(modulosEfectivos(rol, { modulos: { riesgo: false } }), [
    "dashboard",
    "tesoreria",
  ]);
});

test("módulos efectivos: el orden es el de ALL_MODULES y es estable", () => {
  // El middleware redirige al primer módulo efectivo, así que el orden no puede
  // depender de cómo quedó guardado el array del rol.
  const a = modulosEfectivos(["tesoreria", "dashboard", "conductores"], {});
  const b = modulosEfectivos(["conductores", "tesoreria", "dashboard"], {});
  assert.deepEqual(a, b);
  assert.equal(a[0], "dashboard");
  assert.deepEqual(
    modulosEfectivos([...ALL_MODULES], {}),
    [...ALL_MODULES]
  );
});

test("módulos efectivos: tolera datos basura", () => {
  assert.deepEqual(modulosEfectivos(null, null), []);
  assert.deepEqual(modulosEfectivos(undefined, {}), []);
  assert.deepEqual(modulosEfectivos("tesoreria", {}), []); // no es un array
  // Una clave que no es un módulo conocido se ignora.
  assert.deepEqual(modulosEfectivos(["dashboard"], { modulos: { inventado: true } }), [
    "dashboard",
  ]);
});

test("sub-funciones: sin ajustes, la regla del rol es la de siempre", () => {
  // Rol Tesorería tal como lo dejó la migración 032.
  const rol = { tesoreria: ["caja", "analisis", "entregas", "parametros"] };
  assert.equal(subAllowed(rol, "tesoreria", "caja", false), true);
  assert.equal(subAllowed(rol, "tesoreria", "auditoria", false), false);
  // Módulo ausente del mapa = todas sus sub-funciones salvo las sensibles.
  assert.equal(subAllowed({}, "tesoreria", "caja", false), true);
  assert.equal(subAllowed({}, "tesoreria", "auditoria", false), false);
  assert.equal(subAllowed({}, "tesoreria", "simulador", false), false);
});

test("sub-funciones: el ajuste individual vence a lo que diga el rol", () => {
  const rol = { tesoreria: ["caja", "analisis", "entregas", "parametros"] };
  // Conceder una sensible que el rol no da: es el caso del simulador.
  assert.equal(subAllowed(rol, "tesoreria", "auditoria", false, { auditoria: true }), true);
  assert.equal(subAllowed({}, "tesoreria", "simulador", false, { simulador: true }), true);
  // Denegar una que el rol sí da.
  assert.equal(subAllowed(rol, "tesoreria", "caja", false, { caja: false }), false);
  // Una clave ausente sigue heredando del rol.
  assert.equal(subAllowed(rol, "tesoreria", "caja", false, { auditoria: true }), true);
});

test("sub-funciones: lo reservado al administrador no se concede ni individualmente", () => {
  for (const sub of SUBS_SOLO_ADMIN) {
    const modulo = SUB_TO_MODULE[sub];
    assert.equal(subAllowed({}, modulo, sub, false), false);
    assert.equal(subAllowed({}, modulo, sub, false, { [sub]: true }), false);
    // Ni listándola en el rol.
    assert.equal(subAllowed({ [modulo]: [sub] }, modulo, sub, false), false);
    // El administrador sí.
    assert.equal(subAllowed({}, modulo, sub, true), true);
  }
});

test("el administrador pasa siempre, incluso con una denegación guardada", () => {
  // getCurrentPermissions ya le pasa SIN_INDIVIDUALES, pero la regla tampoco
  // debe dejarlo fuera si alguna vez le llega un ajuste.
  assert.equal(subAllowed({}, "tesoreria", "auditoria", true, { auditoria: false }), true);
  assert.equal(subAllowed({ tesoreria: [] }, "tesoreria", "caja", true), true);
});

test("normalizar: descarta basura y conserva lo válido", () => {
  assert.deepEqual(normalizarIndividuales(undefined), {}); // migración sin aplicar
  assert.deepEqual(normalizarIndividuales(null), {});
  assert.deepEqual(normalizarIndividuales([]), {});
  assert.deepEqual(normalizarIndividuales("tesoreria"), {});
  assert.deepEqual(normalizarIndividuales({ modulos: [] }), {});
  assert.deepEqual(normalizarIndividuales({ submodulos: { auditoria: "si" } }), {});
  assert.deepEqual(normalizarIndividuales({ modulos: { inventado: true } }), {});
  assert.deepEqual(
    normalizarIndividuales({
      modulos: { tesoreria: true, inventado: true },
      submodulos: { auditoria: true, inventada: false },
    }),
    { modulos: { tesoreria: true }, submodulos: { auditoria: true } }
  );
  // meta se conserva pero no influye en ninguna regla.
  const conMeta = normalizarIndividuales({
    modulos: { tesoreria: true },
    meta: { email: "admin@x.co" },
  });
  assert.equal(conMeta.meta?.email, "admin@x.co");
  assert.deepEqual(modulosEfectivos(["dashboard"], conMeta), ["dashboard", "tesoreria"]);
});

test("origen del permiso: lo que explica la pantalla de permisos", () => {
  const rol = { tesoreria: ["caja"] };
  assert.deepEqual(origenSub(rol, {}, "tesoreria", "caja", false), {
    permitido: true,
    origen: "rol",
  });
  assert.deepEqual(
    origenSub(rol, { submodulos: { auditoria: true } }, "tesoreria", "auditoria", false),
    { permitido: true, origen: "concedido" }
  );
  assert.deepEqual(
    origenSub(rol, { submodulos: { caja: false } }, "tesoreria", "caja", false),
    { permitido: false, origen: "denegado" }
  );
  assert.deepEqual(origenSub({}, {}, "financiera", "fin_parametros", false), {
    permitido: false,
    origen: "reservado",
  });
  assert.deepEqual(origenSub({}, {}, "financiera", "fin_parametros", true), {
    permitido: true,
    origen: "admin",
  });
});
