import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  ALL_MODULES,
  ALL_SUBS,
  MODULE_HOME,
  SUB_HOME,
  SUBS_SENSIBLES,
  SUBS_SOLO_ADMIN,
  hrefToModule,
  hrefToSubmodule,
} from "@/lib/permissions-shared";
import { NAV_TREE } from "@/lib/constants";
import { FUNCION_POR_VIEJA, MODULOS, MODULO_POR_CLAVE, PERMISOS, PERMISO_POR_CLAVE } from "./catalogo";
import { destinoDeRuta, inicioDe, menuVisible, permisosEfectivos, puede, rutaPermitida } from "./motor";
import { accesoViejo, efectivosDe, equivalencia, type RolViejo, type UsuarioViejo } from "./equivalencia";
import { HREFS_MENU, compararAcceso } from "./comparar";

// ── Rutas reales del panel ───────────────────────────────────────────────────

function rutasDelPanel(): string[] {
  const raiz = join(process.cwd(), "src", "app", "(dashboard)");
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (n === "page.tsx") {
        const partes = relative(raiz, dir)
          .split(sep)
          .filter((s) => s && !s.startsWith("("))
          .map((s) => s.replace(/^\[+\.*([^\]]+)\]+$/, "$1"));
        salida.push("/" + partes.join("/"));
      }
    }
  };
  recorrer(raiz);
  return salida.map((r) => (r === "/" ? "/" : r.replace(/\/$/, "")));
}

const RUTAS = [
  ...new Set([
    ...rutasDelPanel(),
    ...HREFS_MENU,
    ...Object.values(MODULE_HOME),
    ...Object.values(SUB_HOME),
    "/contratacion",
    "/integraciones/x",
    "/tesoreria/revision-cartulina/solicitudes-camaras",
  ]),
];

// ── Catálogo ─────────────────────────────────────────────────────────────────

test("catálogo: claves de permiso únicas", () => {
  assert.equal(new Set(PERMISOS.map((p) => p.clave)).size, PERMISOS.length);
});

test("catálogo: mismos módulos y sub-funciones que el sistema anterior", () => {
  assert.deepEqual(MODULOS.map((m) => m.clave), [...ALL_MODULES]);
  assert.deepEqual([...FUNCION_POR_VIEJA.keys()].sort(), [...ALL_SUBS].sort());
  for (const [vieja, { funcion }] of FUNCION_POR_VIEJA) {
    assert.equal(!!funcion.sensible, SUBS_SENSIBLES.has(vieja), `sensible ${vieja}`);
    assert.equal(!!funcion.soloSuper, SUBS_SOLO_ADMIN.has(vieja), `soloSuper ${vieja}`);
    assert.equal(funcion.inicio, SUB_HOME[vieja], `inicio ${vieja}`);
  }
  for (const m of MODULOS) assert.equal(m.inicio, MODULE_HOME[m.clave as keyof typeof MODULE_HOME], m.clave);
});

test("rutas: cada pantalla queda en el mismo módulo y función que hoy", () => {
  assert.ok(RUTAS.length > 80, `pocas rutas: ${RUTAS.length}`);
  for (const r of RUTAS) {
    const d = destinoDeRuta(r);
    const fun = d?.funcion ? MODULO_POR_CLAVE.get(d.modulo)!.funciones!.find((f) => f.clave === d.funcion)!.vieja : null;
    assert.equal(d?.modulo ?? null, hrefToModule(r), `módulo de ${r}`);
    // Lo viejo da sub-función aunque no haya módulo (/api/…); aquí solo pantallas.
    assert.equal(fun, hrefToModule(r) ? hrefToSubmodule(r) : null, `función de ${r}`);
  }
});

test("menú: toda opción tiene dueño", () => {
  for (const h of HREFS_MENU) assert.ok(destinoDeRuta(h), h);
});

// ── Motor ────────────────────────────────────────────────────────────────────

test("motor: unión de roles, concedidos y quitados", () => {
  const ef = permisosEfectivos({
    roles: [{ permisos: ["ausentismo.ver", "ausentismo.editar"] }, { permisos: ["riesgo.ver"] }],
    concedidos: ["conductores.ver"],
    quitados: ["ausentismo.editar"],
  });
  assert.ok(puede(ef, "ausentismo.ver") && puede(ef, "riesgo.ver") && puede(ef, "conductores.ver"));
  assert.ok(!puede(ef, "ausentismo.editar"));
});

test("motor: concedido gana sobre quitado; desconocido y obsoleto no dan nada", () => {
  const ef = permisosEfectivos({ roles: [{ permisos: ["no.existe", "riesgo.ver"] }], concedidos: ["riesgo.ver"], quitados: ["riesgo.ver"] });
  assert.ok(puede(ef, "riesgo.ver"));
  assert.ok(!ef.permisos.has("no.existe"));
});

test("motor: lo reservado al super no se concede a nadie más", () => {
  const ef = permisosEfectivos({ roles: [{ permisos: ["incapacidades.ver"] }], concedidos: ["incapacidades.parametros.ver"] });
  assert.ok(!puede(ef, "incapacidades.parametros.ver"));
  const sup = permisosEfectivos({ roles: [{ super: true, permisos: [] }] });
  assert.ok(puede(sup, "incapacidades.parametros.ver") && rutaPermitida(sup, "/configuracion/usuarios"));
});

test("motor: una función implica entrar al módulo; una acción especial no", () => {
  const ef = permisosEfectivos({ roles: [{ permisos: ["tesoreria.caja.ver", "accidentabilidad.evaluar"] }] });
  assert.ok(rutaPermitida(ef, "/tesoreria/devengados"));
  assert.ok(!rutaPermitida(ef, "/tesoreria/devengados/auditoria"));
  assert.ok(!rutaPermitida(ef, "/accidentabilidad/consultar"));
  assert.ok(puede(ef, "accidentabilidad.evaluar"));
});

test("motor: menú sin grupos vacíos e inicio en la primera pantalla permitida", () => {
  const ef = permisosEfectivos({ roles: [{ permisos: ["registro_dano.ver"] }] });
  const menu = menuVisible(ef, NAV_TREE);
  assert.equal(menu.length, 1);
  assert.equal(menu[0].kind, "group");
  assert.deepEqual(menu[0].kind === "group" ? menu[0].items.map((i) => i.href) : [], ["/mantenimiento/registrar"]);
  assert.equal(inicioDe(ef), "/mantenimiento/registrar");
  assert.equal(inicioDe(permisosEfectivos({ roles: [] })), null);
});

// ── Equivalencia: nadie pierde nada ──────────────────────────────────────────

const ROLES: RolViejo[] = [
  { key: "admin", modulos: ["dashboard", "configuracion"], puede_editar: true, es_sistema: true },
  { key: "rrhh", modulos: ["dashboard", "ausentismo", "conductores", "candidatos", "incapacidades"], puede_editar: true },
  { key: "consulta", modulos: ["dashboard", "accidentabilidad", "financiera"], puede_editar: false },
  {
    key: "tesoreria",
    modulos: ["tesoreria", "liquidacion"],
    submodulos: { tesoreria: ["caja", "auditoria", "entregas"] },
    puede_editar: true,
  },
  { key: "solo_padrino", modulos: ["candidatos"], submodulos: { candidatos: ["padrino_consulta", "padrino_registro"] }, puede_editar: true },
];

const USUARIOS: UsuarioViejo[] = [
  { id: "a", user_type: "admin", role: "admin" },
  { id: "b", user_type: "rrhh", role: "rrhh" },
  { id: "c", user_type: "consulta" },
  { id: "d", user_type: "consulta", permisos_individuales: { modulos: { riesgo: true, financiera: false } } },
  { id: "e", user_type: "tesoreria", permisos_individuales: { submodulos: { simulador: true, caja: false } } },
  { id: "f", user_type: "rrhh", permisos_individuales: { submodulos: { padrino_consulta: true, incap_parametros: true } } },
  { id: "g", user_type: "solo_padrino" },
  { id: "h", user_type: null, role: "rrhh" },
  { id: "i", user_type: "borrado" },
  { id: "j", user_type: "tesoreria", permisos_individuales: { modulos: { tesoreria: false } } },
];

test("equivalencia: cada usuario conserva exactamente lo que tenía", () => {
  const { roles, usuarios } = equivalencia(ROLES, USUARIOS);
  const porClave = new Map(roles.map((r) => [r.clave, r]));
  const rolViejo = new Map(ROLES.map((r) => [r.key, r]));
  for (const u of USUARIOS) {
    const viejo = accesoViejo(u, (u.user_type && rolViejo.get(u.user_type)) || null);
    const nuevo = efectivosDe(usuarios.find((x) => x.userId === u.id)!, porClave);
    const dif = compararAcceso(viejo, nuevo, RUTAS);
    assert.deepEqual(dif.perdidos, [], `perdidos de ${u.id}`);
    if (u.user_type !== "admin") assert.deepEqual(dif.ganados, [], `ganados de ${u.id}`);
  }
});

test("equivalencia: sin ajustes no hay excepciones; con ajustes, solo las necesarias", () => {
  const { usuarios, roles } = equivalencia(ROLES, USUARIOS);
  const de = (id: string) => usuarios.find((x) => x.userId === id)!;
  assert.deepEqual([de("c").concedidos, de("c").quitados], [[], []]);
  assert.deepEqual(de("b").concedidos, ["accidentabilidad.evaluar"]);
  // Su rol no edita: el módulo concedido llega solo para ver.
  assert.deepEqual(de("d").concedidos, ["riesgo.exportar", "riesgo.ver"]);
  assert.ok(de("d").quitados.includes("financiera.ver"));
  assert.ok(de("e").concedidos.includes("tesoreria.simulador.ver"));
  assert.ok(de("e").quitados.includes("tesoreria.caja.ver"));
  // La reservada al super no se traslada aunque estuviera concedida.
  assert.ok(!de("f").concedidos.some((p) => p.startsWith("incapacidades.parametros")));
  assert.equal(roles.find((r) => r.clave === "admin")!.super, true);
  // Sin rol válido: nada, salvo evaluar accidentes si su role heredado lo daba.
  assert.deepEqual(de("h"), { userId: "h", roles: [], concedidos: ["accidentabilidad.evaluar"], quitados: [] });
  assert.deepEqual(de("i").roles, []);
});

test("equivalencia: el rol sin sub-funciones listadas da todas menos las sensibles", () => {
  const { roles } = equivalencia(ROLES, []);
  const rrhh = new Set(roles.find((r) => r.clave === "rrhh")!.permisos);
  assert.ok(rrhh.has("incapacidades.radicacion.editar"));
  assert.ok(!rrhh.has("candidatos.padrino_consulta.ver"));
  assert.ok(!rrhh.has("incapacidades.parametros.ver"));
  const consulta = new Set(roles.find((r) => r.clave === "consulta")!.permisos);
  assert.ok(consulta.has("financiera.tablero.ver") && !consulta.has("financiera.tablero.editar"));
  assert.ok(!consulta.has("accidentabilidad.editar"));
  for (const p of [...rrhh, ...consulta]) assert.ok(PERMISO_POR_CLAVE.has(p), p);
});

// ── Sincronización ───────────────────────────────────────────────────────────

import { huella, planCatalogo, planReconstruccion, planVacio, type PermisoBd } from "./sincronizar";
import { listarPermisos, type ModuloDef } from "./catalogo";

const bd = (p: ReturnType<typeof listarPermisos>[number], obsoleto = false): PermisoBd => ({
  clave: p.clave, modulo: p.modulo, funcion: p.funcion, accion: p.accion, nivel: p.nivel,
  etiqueta: p.etiqueta, sensible: p.sensible, solo_super: p.soloSuper, obsoleto,
});

test("catálogo → base: crea lo nuevo, marca obsoleto lo retirado y reactiva lo que vuelve", () => {
  const antes: ModuloDef[] = [{ clave: "x", etiqueta: "X", inicio: "/x", rutas: ["/x"] }, { clave: "y", etiqueta: "Y", inicio: "/y", rutas: ["/y"] }];
  const existentes = listarPermisos(antes).map((p) => bd(p, p.modulo === "y"));
  // Ahora: x sigue, y vuelve, z es nuevo; "x.viejo" ya no está.
  existentes.push({ ...existentes[0], clave: "x.viejo", accion: "viejo" });
  const ahora = listarPermisos([...antes, { clave: "z", etiqueta: "Z", inicio: "/z", rutas: ["/z"] }]);
  const plan = planCatalogo(ahora, existentes, []);
  assert.deepEqual(plan.obsoletar, ["x.viejo"]);
  assert.deepEqual(plan.guardar.map((p) => p.clave).sort(), ["y.editar", "y.exportar", "y.ver", "z.editar", "z.exportar", "z.ver"]);
  // Sin cambios: nada que escribir.
  assert.equal(planCatalogo(ahora, ahora.map((p) => bd(p)), []).guardar.length, 0);
});

test("catálogo → base: una acción nueva la heredan quienes ya tenían ese nivel en el módulo", () => {
  const antes: ModuloDef[] = [{
    clave: "x", etiqueta: "X", inicio: "/x", rutas: ["/x"],
    acciones: [{ clave: "ver", etiqueta: "Ver", nivel: "ver" }, { clave: "editar", etiqueta: "Editar", nivel: "editar" }],
  }];
  const despues: ModuloDef[] = [{
    ...antes[0],
    acciones: [
      { clave: "ver", etiqueta: "Ver", nivel: "ver" },
      { clave: "editar", etiqueta: "Editar", nivel: "editar" },
      { clave: "eliminar", etiqueta: "Eliminar", nivel: "editar" },
      { clave: "exportar", etiqueta: "Exportar", nivel: "ver" },
      { clave: "aprobar", etiqueta: "Aprobar", nivel: "especial" },
    ],
  }];
  const plan = planCatalogo(listarPermisos(despues), listarPermisos(antes).map((p) => bd(p)), [
    { rol: "edita", permiso: "x.editar" },
    { rol: "edita", permiso: "x.ver" },
    { rol: "mira", permiso: "x.ver" },
  ]);
  // Eliminar (nivel editar) solo a quien editaba; exportar (nivel ver) a los dos.
  assert.deepEqual(
    plan.herencia.map((h) => `${h.rol}:${h.permiso}`).sort(),
    ["edita:x.eliminar", "edita:x.exportar", "mira:x.exportar"]
  );
});

test("reconstrucción: escribe solo la diferencia y deja de escribir cuando cuadra", () => {
  const deseado = equivalencia(ROLES, USUARIOS);
  const vacio = { roles: [], rolPermisos: [], usuarioRoles: [], usuarioPermisos: [] };
  const plan = planReconstruccion(deseado, vacio);
  assert.equal(plan.rolesGuardar.length, ROLES.length);
  assert.ok(plan.usuarioPermisosGuardar.length > 0);
  // Aplicado el plan, el siguiente está vacío.
  const aplicado = {
    roles: plan.rolesGuardar,
    rolPermisos: plan.rolPermisosAgregar,
    usuarioRoles: plan.usuarioRolesAgregar,
    usuarioPermisos: plan.usuarioPermisosGuardar,
  };
  assert.ok(planVacio(planReconstruccion(deseado, aplicado)));
  // Un rol que desaparece y un permiso que cambia de sentido.
  const cambiado = planReconstruccion(equivalencia(ROLES.filter((r) => r.key !== "solo_padrino"), USUARIOS), {
    ...aplicado,
    usuarioPermisos: aplicado.usuarioPermisos.map((x, i) => (i === 0 ? { ...x, concedido: !x.concedido } : x)),
  });
  assert.deepEqual(cambiado.rolesBorrar, ["solo_padrino"]);
  assert.equal(cambiado.usuarioPermisosGuardar.length, 1);
  assert.equal(cambiado.usuarioPermisosQuitar.length, 0);
});

test("huella: estable y sensible al cambio", () => {
  assert.equal(huella({ a: 1, b: [1, 2] }), huella({ a: 1, b: [1, 2] }));
  assert.notEqual(huella({ a: 1 }), huella({ a: 2 }));
});

// ── Toda Server Action revisa permisos ───────────────────────────────────────

import { readFileSync } from "node:fs";

/**
 * Las Server Actions se pueden invocar desde cualquier ruta: el proxy no las
 * protege. Cada acción exportada tiene que revisar permisos ella misma (o
 * delegar en una función que lo haga). Excepciones, con su porqué:
 */
const SIN_GUARDIA_JUSTIFICADO: Record<string, string> = {
  // Públicas por diseño: sin cuenta de Gestivo.
  "src/app/(publico)/reportar-dano/actions.ts": "formulario público del conductor (valida la cédula)",
  "src/app/(portal)/portal-afiliados/actions.ts": "portal de afiliados con sesión propia",
  // Delegan en una función que sí revisa.
  "src/app/(dashboard)/configuracion/usuarios/actions.ts#createRole": "delega en crearRol (solo admin)",
  "src/app/(dashboard)/configuracion/usuarios/actions.ts#updateRole": "delega en editarRol (solo admin)",
  "src/app/(dashboard)/incapacidades/[id]/actions.ts#accionAceptarSugerencia": "delega en accionCompletar (exigirEdicion)",
  "src/app/(dashboard)/mantenimiento/actions.ts#crearReporteMantenimiento": "requireRegistroDano",
};

const GUARDIA =
  /getCurrentPermissions|exigir|assert[A-Z]\w*\(|faltaPermiso|conAcceso|requireTesoreriaSub|requireRegistroDano|tieneAcceso\w*\(|permiso\w*\(|requireEditor|requireAdmin|soloAdmin|puede\w*\(/;

test("toda Server Action exportada revisa permisos", () => {
  const faltan: string[] = [];
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts")) {
        const texto = readFileSync(p, "utf8");
        if (!/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(texto)) continue;
        const rel = relative(process.cwd(), p).split(sep).join("/");
        if (SIN_GUARDIA_JUSTIFICADO[rel]) continue;
        const funciones = [...texto.matchAll(/^export async function (\w+)/gm)];
        funciones.forEach((m, i) => {
          const cuerpo = texto.slice(m.index, funciones[i + 1]?.index ?? texto.length);
          if (!GUARDIA.test(cuerpo) && !SIN_GUARDIA_JUSTIFICADO[`${rel}#${m[1]}`]) faltan.push(`${rel}#${m[1]}`);
        });
      }
    }
  };
  recorrer(join(process.cwd(), "src"));
  assert.deepEqual(faltan, [], "Server Actions sin revisión de permisos");
});

test("los permisos que se exigen en el código existen en el catálogo", () => {
  const usados = new Set<string>();
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts")) {
        const texto = readFileSync(p, "utf8");
        for (const m of texto.matchAll(/(?:exigirPermiso|faltaPermiso|exigirPermisoApi|tienePermiso\(\s*\w+(?:\.\w+)?\s*,|puede\(|SiPuede permiso=)\s*\(?([^)\n]*)/g)) {
          for (const c of m[1].matchAll(/"([a-z_]+\.[a-z_.]+)"/g)) usados.add(c[1]);
        }
      }
    }
  };
  recorrer(join(process.cwd(), "src"));
  assert.ok(usados.size >= 10, `pocos permisos encontrados: ${usados.size}`);
  const desconocidos = [...usados].filter((c) => !PERMISO_POR_CLAVE.has(c));
  assert.deepEqual(desconocidos, []);
});

// ── Pantalla de usuarios y roles ─────────────────────────────────────────────

import { aplicarNivel, arbolDePermisos, nivelDelModulo, permisosDeNivel, permisosQuePierde, quienTiene, type RolDatos } from "./arbol";

test("árbol: agrupado como el menú y con todos los permisos del catálogo", () => {
  const arbol = arbolDePermisos();
  const grupos = arbol.map((g) => g.clave);
  for (const g of ["financiera", "operativo", "mantenimiento", "rrhh", "config"]) assert.ok(grupos.includes(g), g);
  const tes = arbol.flatMap((g) => g.modulos).find((m) => m.clave === "tesoreria")!;
  assert.equal(arbol.find((g) => g.modulos.includes(tes))!.clave, "financiera");
  const todas = arbol.flatMap((g) => g.modulos).flatMap((m) => [...m.acciones, ...m.funciones.flatMap((f) => f.acciones)]).map((a) => a.clave);
  assert.deepEqual(todas.sort(), PERMISOS.map((p) => p.clave).sort());
});

test("niveles: los atajos y el nivel que se lee de vuelta", () => {
  const tes = arbolDePermisos().flatMap((g) => g.modulos).find((m) => m.clave === "tesoreria")!;
  const ver = new Set(permisosDeNivel(tes, "ver"));
  assert.ok(ver.has("tesoreria.ver") && ver.has("tesoreria.caja.ver") && !ver.has("tesoreria.caja.editar"));
  // Las sensibles no entran en los atajos de ver ni editar.
  assert.ok(!ver.has("tesoreria.auditoria.ver"));
  assert.ok(new Set(permisosDeNivel(tes, "todo")).has("tesoreria.auditoria.ver"));
  for (const n of ["ninguno", "ver", "editar", "todo"] as const) {
    assert.equal(nivelDelModulo(tes, aplicarNivel(tes, new Set(["riesgo.ver"]), n)), n);
  }
  const casi = aplicarNivel(tes, new Set(), "ver");
  casi.delete("tesoreria.caja.ver");
  assert.equal(nivelDelModulo(tes, casi), "personalizado");
  // Aplicar un nivel no toca otros módulos.
  assert.ok(aplicarNivel(tes, new Set(["riesgo.ver"]), "ninguno").has("riesgo.ver"));
  const inc = arbolDePermisos().flatMap((g) => g.modulos).find((m) => m.clave === "incapacidades")!;
  assert.ok(!new Set(permisosDeNivel(inc, "todo")).has("incapacidades.parametros.ver"));
});

test("quién tiene y qué pierde al cambiar roles", () => {
  const roles = new Map<string, RolDatos>([
    ["admin", { clave: "admin", nombre: "Administrador", super: true, activo: true, permisos: [] }],
    ["rrhh", { clave: "rrhh", nombre: "RRHH", super: false, activo: true, permisos: ["ausentismo.ver", "ausentismo.editar"] }],
    ["lector", { clave: "lector", nombre: "Lector", super: false, activo: true, permisos: ["ausentismo.ver"] }],
    ["viejo", { clave: "viejo", nombre: "Viejo", super: false, activo: false, permisos: ["riesgo.ver"] }],
  ]);
  const usuarios = [
    { id: "a", roles: ["admin"], concedidos: [], quitados: [] },
    { id: "b", roles: ["rrhh", "lector"], concedidos: [], quitados: [] },
    { id: "c", roles: ["lector"], concedidos: ["ausentismo.editar"], quitados: [] },
    { id: "d", roles: ["rrhh"], concedidos: [], quitados: ["ausentismo.editar"] },
    { id: "e", roles: ["viejo"], concedidos: [], quitados: [] },
  ];
  const t = quienTiene("ausentismo.editar", usuarios, roles);
  assert.deepEqual(t.map((x) => x.userId), ["a", "b", "c"]);
  assert.deepEqual(t.find((x) => x.userId === "c")!.origen, ["individual"]);
  assert.deepEqual(quienTiene("riesgo.ver", usuarios, roles).map((x) => x.userId), ["a"]);
  assert.deepEqual(permisosQuePierde(usuarios[1], { ...usuarios[1], roles: ["lector"] }, roles), ["ausentismo.editar"]);
  assert.deepEqual(permisosQuePierde(usuarios[0], { ...usuarios[0], roles: ["lector"] }, roles), ["todo (deja de ser super)"]);
});

// ── Incidencias y métricas (viejo vs. nuevo en paralelo) ─────────────────────

import {
  agruparIncidencias,
  agruparMetricas,
  evaluar,
  huellaIncidencia,
  listoParaNuevo,
  resumir,
  SEVERIDAD,
  type Chequeo,
  type Incidencia,
} from "./incidencias";

const ef = (permisos: string[], superUsuario = false) => permisosEfectivos({ roles: [{ super: superUsuario, permisos }] });

test("incidencias: decide siempre el motor activo aunque el otro difiera", () => {
  const viejo = ef(["ausentismo.ver"]);
  const nuevo = ef([]);
  // En sombra decide el viejo: deja pasar y anota «perdido».
  const r1 = evaluar(viejo, { viejo, nuevo }, "ausentismo.ver");
  assert.deepEqual([r1.decide, r1.viejo, r1.nuevo, r1.divergencia], [true, true, false, "perdido"]);
  // En nuevo decide el nuevo: no deja pasar, misma divergencia.
  const r2 = evaluar(nuevo, { viejo, nuevo }, "ausentismo.ver");
  assert.deepEqual([r2.decide, r2.divergencia], [false, "perdido"]);
});

test("incidencias: lo que gana el nuevo es «ganado»; sin contraste no hay divergencia", () => {
  const viejo = ef([]);
  const nuevo = ef(["ausentismo.ver"]);
  assert.equal(evaluar(viejo, { viejo, nuevo }, "ausentismo.ver").divergencia, "ganado");
  const sin = evaluar(viejo, null, "ausentismo.ver");
  assert.deepEqual([sin.viejo, sin.nuevo, sin.divergencia], [null, null, null]);
  const otroFalla = evaluar(viejo, { viejo, nuevo: null }, "ausentismo.ver");
  assert.equal(otroFalla.divergencia, null);
});

test("incidencias: el admin (super en el viejo) no genera divergencias", () => {
  const viejo = ef([], true);
  const nuevo = ef([], true);
  assert.equal(evaluar(viejo, { viejo, nuevo }, "lo.que.sea").divergencia, null);
});

test("incidencias: la huella deduplica por tipo, persona, permiso y origen", () => {
  const base: Incidencia = { tipo: "denegado", userId: "u1", clave: "a.ver", origen: "proxy", motor: "sombra" };
  assert.equal(huellaIncidencia(base), "denegado|u1|a.ver|proxy");
  assert.equal(huellaIncidencia({ ...base, userId: null }), "denegado|-|a.ver|proxy");
  const filas = agruparIncidencias([base, { ...base, ruta: "/a/1" }, { ...base, origen: "server" }]);
  assert.equal(filas.length, 2);
  const proxy = filas.find((f) => f.origen === "proxy")!;
  assert.equal(proxy.veces, 2);
  assert.equal(proxy.ruta, "/a/1");
  assert.equal(proxy.severidad, SEVERIDAD.denegado);
});

test("incidencias: métricas agregadas y criterio de paso", () => {
  const c = (x: Partial<Chequeo>): Chequeo => ({
    dia: "2026-10-28",
    motor: "sombra",
    origen: "server",
    clave: "a.ver",
    viejo: true,
    nuevo: true,
    decide: true,
    esGuardia: false,
    ...x,
  });
  const filas = agruparMetricas([
    c({}),
    c({ nuevo: false }),
    c({ viejo: false, nuevo: true, decide: false, esGuardia: true }),
    c({ viejo: null, nuevo: null, decide: false }),
  ]);
  assert.equal(filas.length, 1);
  assert.deepEqual(
    { ...filas[0], dia: undefined, motor: undefined, origen: undefined, clave: undefined },
    { dia: undefined, motor: undefined, origen: undefined, clave: undefined, chequeos: 4, comparados: 3, coinciden: 1, perdidos: 1, ganados: 1, denegados: 1 }
  );
  const r = resumir(filas);
  assert.equal(r.coincidencia, 1 / 3);
  assert.equal(listoParaNuevo(r, 0).listo, false);
  assert.equal(listoParaNuevo(resumir([{ chequeos: 1000, comparados: 1000, coinciden: 1000, perdidos: 0, ganados: 0, denegados: 3 }]), 0).listo, true);
  assert.equal(listoParaNuevo(resumir([{ chequeos: 10, comparados: 10, coinciden: 10, perdidos: 0, ganados: 0, denegados: 0 }]), 1).listo, false);
  assert.equal(listoParaNuevo(resumir([]), 0).listo, false);
});
