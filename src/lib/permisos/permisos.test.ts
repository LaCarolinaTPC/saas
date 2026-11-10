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
import { destinoDeRuta, hrefsDelMenu, inicioDe, menuVisible, permisosEfectivos, puede, rutaPermitida } from "./motor";

/** Los href del menú de hoy. */
const HREFS_MENU: string[] = hrefsDelMenu(NAV_TREE);

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

// ── Sincronización ───────────────────────────────────────────────────────────

import { huella, planCatalogo, type PermisoBd } from "./sincronizar";
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
