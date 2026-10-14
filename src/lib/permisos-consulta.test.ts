import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_SUBS, MODULE_SUBS } from "./permissions-shared";
import {
  clavePermiso,
  etiquetaPermiso,
  filtrarMatrizPermisos,
  partirEtiqueta,
  permisoDesdeClave,
  quienTienePermiso,
  type RolConsulta,
  type UsuarioConsulta,
} from "./permisos-consulta";

// ── Roles de prueba, calcados de los que siembran las migraciones ───────────

const ADMIN: RolConsulta = { key: "admin", nombre: "Administrador", modulos: ["dashboard"] };
const TESORERIA: RolConsulta = {
  key: "tesoreria",
  nombre: "Tesorería",
  modulos: ["dashboard", "tesoreria"],
  submodulos: { tesoreria: ["caja", "analisis", "entregas", "parametros"] },
};
const CONSULTA: RolConsulta = { key: "consulta", nombre: "Consulta", modulos: ["dashboard"] };
const ROLES = [ADMIN, TESORERIA, CONSULTA];

function usuario(p: Partial<UsuarioConsulta> & { id: string }): UsuarioConsulta {
  return {
    full_name: `Usuario ${p.id}`,
    email: `${p.id}@x.co`,
    user_type: "consulta",
    activo: true,
    permisos_individuales: {},
    ...p,
  };
}

// ── Etiquetas y claves ─────────────────────────────────────────────────────

test("partir la etiqueta de cada sub-función", () => {
  for (const sub of ALL_SUBS) {
    const { nombre } = partirEtiqueta(sub);
    assert.ok(nombre.length > 0, `${sub} sin nombre`);
    assert.ok(!nombre.includes("("), `${sub} arrastra el paréntesis: ${nombre}`);
    assert.equal(nombre, nombre.trim(), `${sub} con espacios sobrantes`);
  }
  // Con detalle entre paréntesis y sin él.
  assert.deepEqual(partirEtiqueta("caja").nombre, "Caja de devengados");
  assert.ok(partirEtiqueta("caja").detalle);
  assert.deepEqual(partirEtiqueta("inventada"), { nombre: "inventada", detalle: null });
});

test("resolver un permiso desde su clave", () => {
  assert.deepEqual(permisoDesdeClave("tesoreria"), { tipo: "modulo", modulo: "tesoreria" });
  assert.deepEqual(permisoDesdeClave("fin_datos"), {
    tipo: "sub",
    sub: "fin_datos",
    modulo: "financiera",
  });
  // "incapacidades" es módulo; "incap_recaudos", sub de ese módulo.
  assert.deepEqual(permisoDesdeClave("incapacidades"), {
    tipo: "modulo",
    modulo: "incapacidades",
  });
  assert.equal(permisoDesdeClave("inventado"), null);
  assert.equal(permisoDesdeClave(""), null);
});

test("etiqueta y clave van y vuelven", () => {
  for (const clave of [...Object.keys(MODULE_SUBS), ...ALL_SUBS]) {
    const p = permisoDesdeClave(clave);
    assert.ok(p, `${clave} no resolvió`);
    assert.equal(clavePermiso(p), clave);
    assert.ok(etiquetaPermiso(p).length > 0);
  }
  assert.ok(etiquetaPermiso({ tipo: "sub", sub: "caja", modulo: "tesoreria" }).includes("›"));
});

// ── Filtrado de la matriz ──────────────────────────────────────────────────

const SUBS_TESO = MODULE_SUBS.tesoreria as readonly string[];
const FILAS = [TESORERIA, CONSULTA].map((r) => ({
  key: r.key,
  nombre: r.nombre,
  descripcion: null,
}));

test("matriz: el filtro vacío no recorta nada", () => {
  const r = filtrarMatrizPermisos({
    filtro: "",
    modulo: "tesoreria",
    subs: SUBS_TESO,
    roles: FILAS,
  });
  assert.deepEqual(r.subs, [...SUBS_TESO]);
  assert.equal(r.roles.length, FILAS.length);
});

test("matriz: si coincide el módulo, se muestra entero", () => {
  for (const filtro of ["Tesorería", "tesoreria", "TESOR"]) {
    const r = filtrarMatrizPermisos({ filtro, modulo: "tesoreria", subs: SUBS_TESO, roles: FILAS });
    assert.deepEqual(r.subs, [...SUBS_TESO], `«${filtro}» recortó columnas`);
    assert.equal(r.roles.length, FILAS.length);
  }
});

test("matriz: una sub-función recorta columnas y deja todas las filas", () => {
  const r = filtrarMatrizPermisos({
    filtro: "auditoria", // sin tilde a propósito
    modulo: "tesoreria",
    subs: SUBS_TESO,
    roles: FILAS,
  });
  assert.deepEqual(r.subs, ["auditoria"]);
  assert.equal(r.roles.length, FILAS.length);
});

test("matriz: un rol recorta filas y deja todas las columnas", () => {
  const r = filtrarMatrizPermisos({
    filtro: "consulta",
    modulo: "tesoreria",
    subs: SUBS_TESO,
    roles: FILAS,
  });
  assert.deepEqual(r.roles.map((x) => x.key), ["consulta"]);
  // Aunque "consulta" aparezca en el detalle de varias sub-funciones
  // ("Análisis quincenal (consulta)"), las columnas no se recortan: el detalle
  // es prosa y solo se compara el nombre corto.
  assert.deepEqual(r.subs, [...SUBS_TESO]);
});

test("matriz: el detalle entre paréntesis no cuenta como coincidencia", () => {
  // "imprimir" solo aparece en los detalles de caja y entregas, nunca en un
  // nombre corto ni en una clave: no debe recortar nada por sí solo.
  const r = filtrarMatrizPermisos({
    filtro: "imprimir",
    modulo: "tesoreria",
    subs: SUBS_TESO,
    roles: FILAS,
  });
  assert.deepEqual(r, { roles: [], subs: [] });
});

test("matriz: sin coincidencias, el tablero se oculta", () => {
  const r = filtrarMatrizPermisos({
    filtro: "zzzz",
    modulo: "tesoreria",
    subs: SUBS_TESO,
    roles: FILAS,
  });
  assert.deepEqual(r, { roles: [], subs: [] });
});

test("matriz: el resultado es siempre subconjunto de subs y conserva el orden", () => {
  for (const filtro of ["", "caja", "auditoria", "Tesorería", "consulta", "zzzz", "par"]) {
    const r = filtrarMatrizPermisos({ filtro, modulo: "tesoreria", subs: SUBS_TESO, roles: FILAS });
    for (const s of r.subs) assert.ok(SUBS_TESO.includes(s), `${s} no es del módulo`);
    const posiciones = r.subs.map((s) => SUBS_TESO.indexOf(s));
    assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b), `«${filtro}» reordenó`);
  }
});

// ── ¿Quién tiene este permiso? ─────────────────────────────────────────────

test("quién tiene: el permiso que da el rol", () => {
  const r = quienTienePermiso(permisoDesdeClave("tesoreria")!, ROLES, [
    usuario({ id: "a", user_type: "tesoreria" }),
    usuario({ id: "b", user_type: "consulta" }),
  ]);
  const a = r.usuarios.find((u) => u.id === "a")!;
  const b = r.usuarios.find((u) => u.id === "b")!;
  assert.deepEqual(
    { permitido: a.permitido, origen: a.origen },
    { permitido: true, origen: "rol" }
  );
  assert.equal(b.permitido, false);
  assert.equal(r.resumen.usuariosConAcceso, 1);
  assert.equal(r.resumen.porRol, 1);
});

test("quién tiene: concedido individualmente aunque el rol no lo dé", () => {
  const r = quienTienePermiso(permisoDesdeClave("tesoreria")!, ROLES, [
    usuario({ id: "a", user_type: "consulta", permisos_individuales: { modulos: { tesoreria: true } } }),
  ]);
  assert.deepEqual(
    { permitido: r.usuarios[0].permitido, origen: r.usuarios[0].origen },
    { permitido: true, origen: "concedido" }
  );
  assert.equal(r.resumen.concedidos, 1);
  assert.equal(r.resumen.porRol, 0);
});

test("quién tiene: denegado individualmente sobre un rol que sí lo da", () => {
  const r = quienTienePermiso(permisoDesdeClave("caja")!, ROLES, [
    usuario({
      id: "a",
      user_type: "tesoreria",
      permisos_individuales: { submodulos: { caja: false } },
    }),
  ]);
  assert.deepEqual(
    { permitido: r.usuarios[0].permitido, origen: r.usuarios[0].origen },
    { permitido: false, origen: "denegado" }
  );
  assert.equal(r.resumen.denegados, 1);
  assert.equal(r.resumen.usuariosConAcceso, 0);
});

test("quién tiene: el admin puede, incluso con una denegación guardada", () => {
  const r = quienTienePermiso(permisoDesdeClave("auditoria")!, ROLES, [
    usuario({
      id: "a",
      user_type: "admin",
      permisos_individuales: { modulos: { tesoreria: false }, submodulos: { auditoria: false } },
    }),
  ]);
  assert.deepEqual(
    { permitido: r.usuarios[0].permitido, origen: r.usuarios[0].origen },
    { permitido: true, origen: "admin" }
  );
  // Y el rol admin figura entre los que lo dan.
  assert.equal(r.roles.find((x) => x.key === "admin")?.permitido, true);
});

test("quién tiene: una sub concedida sin su módulo no sirve", () => {
  const r = quienTienePermiso(permisoDesdeClave("auditoria")!, ROLES, [
    usuario({
      id: "a",
      user_type: "tesoreria",
      permisos_individuales: { modulos: { tesoreria: false }, submodulos: { auditoria: true } },
    }),
  ]);
  assert.equal(r.usuarios[0].permitido, false);
  assert.equal(r.usuarios[0].bloqueadoPorModulo, true);
});

test("quién tiene: lo reservado al administrador no se concede a nadie más", () => {
  const r = quienTienePermiso(permisoDesdeClave("fin_parametros")!, ROLES, [
    usuario({
      id: "a",
      user_type: "tesoreria",
      permisos_individuales: {
        modulos: { financiera: true },
        submodulos: { fin_parametros: true },
      },
    }),
    usuario({ id: "admin", user_type: "admin" }),
  ]);
  assert.equal(r.reservadoAdmin, true);
  assert.equal(r.usuarios.find((u) => u.id === "a")!.permitido, false);
  assert.equal(r.usuarios.find((u) => u.id === "admin")!.permitido, true);
});

test("quién tiene: una sensible no la da un rol que no la lista", () => {
  // El rol Tesorería tiene el módulo pero no lista "auditoria" (sensible).
  const r = quienTienePermiso(permisoDesdeClave("auditoria")!, ROLES, [
    usuario({ id: "a", user_type: "tesoreria" }),
  ]);
  assert.equal(r.sensible, true);
  assert.equal(r.usuarios[0].permitido, false);
});

test("quién tiene: usuario sin rol, y rol eliminado", () => {
  const r = quienTienePermiso(permisoDesdeClave("tesoreria")!, ROLES, [
    usuario({ id: "a", user_type: null }),
    usuario({ id: "b", user_type: "borrado" }),
    // Sin rol pero con el módulo concedido individualmente: el servidor se lo
    // concede, así que aquí también.
    usuario({ id: "c", user_type: null, permisos_individuales: { modulos: { tesoreria: true } } }),
  ]);
  assert.equal(r.usuarios.find((u) => u.id === "a")!.rolNombre, "sin rol");
  assert.equal(r.usuarios.find((u) => u.id === "b")!.rolNombre, "sin rol");
  assert.equal(r.usuarios.find((u) => u.id === "a")!.permitido, false);
  assert.equal(r.usuarios.find((u) => u.id === "c")!.permitido, true);
});

test("quién tiene: los desactivados se marcan y no cuentan como acceso", () => {
  const r = quienTienePermiso(permisoDesdeClave("tesoreria")!, ROLES, [
    usuario({ id: "a", user_type: "tesoreria", activo: false }),
    usuario({ id: "b", user_type: "tesoreria" }),
  ]);
  assert.equal(r.resumen.usuariosConAcceso, 1);
  assert.equal(r.resumen.usuariosTotal, 1); // los desactivados no entran al total
  assert.equal(r.resumen.inactivosConAcceso, 1);
  // Orden: con acceso primero y, dentro, los activos antes.
  assert.deepEqual(r.usuarios.map((u) => u.id), ["b", "a"]);
});

test("quién tiene: los contadores son coherentes", () => {
  const r = quienTienePermiso(permisoDesdeClave("caja")!, ROLES, [
    usuario({ id: "rol", user_type: "tesoreria" }),
    usuario({ id: "conc", user_type: "consulta", permisos_individuales: { modulos: { tesoreria: true }, submodulos: { caja: true } } }),
    usuario({ id: "deneg", user_type: "tesoreria", permisos_individuales: { submodulos: { caja: false } } }),
    usuario({ id: "inact", user_type: "tesoreria", activo: false }),
    usuario({ id: "nada", user_type: "consulta" }),
  ]);
  assert.equal(r.resumen.porRol, 1);
  assert.equal(r.resumen.concedidos, 1);
  assert.equal(r.resumen.denegados, 1);
  assert.equal(r.resumen.inactivosConAcceso, 1);
  assert.equal(r.resumen.usuariosConAcceso, r.resumen.porRol + r.resumen.concedidos);
  assert.equal(r.resumen.rolesTotal, ROLES.length);
});
