import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PERMISOS, PERMISO_POR_CLAVE } from "@/lib/permisos/catalogo";
import { destinoDeRuta, permisoDeRuta, type PermisosEfectivos } from "@/lib/permisos/motor";
import { AJUSTES, EXCLUIR } from "./ajustes";
import { FUENTES, filtroDePalabra, fuentesPermitidas } from "./fuentes";
import { construirPantallas, pantallasVisibles, rutaVisible } from "./pantallas";
import generadas from "./pantallas.generated.json";
import { coincide, debeAnclarse, normalizar, palabrasDe, patronDe } from "./texto";

const PANEL = join(process.cwd(), "src", "app", "(dashboard)");
const existePagina = (ruta: string) => existsSync(join(PANEL, ...ruta.split("/").filter(Boolean), "page.tsx"));

const nadie: PermisosEfectivos = { super: false, permisos: new Set() };
const superUsuario: PermisosEfectivos = { super: true, permisos: new Set() };
const con = (...claves: string[]): PermisosEfectivos => ({ super: false, permisos: new Set(claves) });

// ── Índice de pantallas ──────────────────────────────────────────────────────

test("índice: cubre las páginas estáticas reales", () => {
  assert.ok(generadas.length > 80, `pocas pantallas: ${generadas.length}`);
  for (const p of generadas) assert.ok(existePagina(p.href), `no existe ${p.href}: corra npm run buscador:generar`);
});

test("ajustes: toda excepción apunta a una página real", () => {
  for (const r of [...EXCLUIR, ...Object.keys(AJUSTES)]) assert.ok(existePagina(r), `no existe ${r}`);
});

test("ajustes: los permisos exigidos existen en el catálogo", () => {
  for (const [ruta, a] of Object.entries(AJUSTES)) {
    for (const c of a.exige ?? []) assert.ok(PERMISO_POR_CLAVE.has(c), `${ruta}: no existe ${c}`);
  }
});

test("pantallas: todas tienen dueño en el catálogo de permisos", () => {
  for (const p of construirPantallas(generadas)) assert.ok(destinoDeRuta(p.href), `${p.href} sin dueño`);
});

test("pantallas: sin duplicar destino ni combinación de título y grupo", () => {
  const lista = construirPantallas(generadas);
  assert.equal(new Set(lista.map((p) => p.href)).size, lista.length);
  const titulos = lista.map((p) => normalizar(`${p.titulo}|${p.grupo}`));
  const repetidos = titulos.filter((t, i) => titulos.indexOf(t) !== i);
  assert.deepEqual(repetidos, []);
});

test("pantallas: las que solo redirigen no aparecen y las pestañas sí", () => {
  const hrefs = pantallasVisibles(superUsuario).map((p) => p.href);
  for (const r of EXCLUIR) assert.ok(!hrefs.includes(r), r);
  assert.ok(hrefs.includes("/financiera/flota/rentabilidad"));
  assert.ok(hrefs.includes("/cambiar-contrasena"));
});

test("pantallas: un título repetido lleva su último segmento", () => {
  const paginas = [
    { href: "/mantenimiento/camaras/tablero", titulo: "Cámaras y sensores", soloAdmin: false },
    { href: "/mantenimiento/camaras/historial", titulo: "Cámaras y sensores", soloAdmin: false },
  ];
  const titulos = construirPantallas(paginas).filter((p) => !p.deMenu).map((p) => p.titulo);
  assert.deepEqual(titulos, ["Cámaras y sensores · Tablero", "Cámaras y sensores · Historial"]);
});

// ── Permisos ─────────────────────────────────────────────────────────────────

test("permisos: sin permisos no se ve nada, salvo las opciones personales", () => {
  assert.deepEqual(pantallasVisibles(nadie).map((p) => p.href), ["/cambiar-contrasena"]);
  assert.deepEqual(fuentesPermitidas(nadie), []);
});

test("permisos: el super ve todas las pantallas y fuentes", () => {
  assert.equal(pantallasVisibles(superUsuario).length, construirPantallas(generadas).length + 1);
  assert.equal(fuentesPermitidas(superUsuario).length, FUENTES.length);
});

test("permisos: una ruta sin dueño no se muestra, aunque rutaPermitida la deje pasar", () => {
  assert.equal(rutaVisible(superUsuario, "/ruta-que-no-existe"), false);
});

test("permisos: una página solo de administrador no se muestra sin serlo", () => {
  const conUsuarios = con("configuracion.ver");
  assert.equal(pantallasVisibles(conUsuarios).some((p) => p.href === "/configuracion/usuarios"), false);
  assert.equal(pantallasVisibles(superUsuario).some((p) => p.href === "/configuracion/usuarios"), true);
});

test("permisos: respeta lo que la página exige de más", () => {
  const soloVer = con("vacantes.ver");
  assert.equal(pantallasVisibles(soloVer).some((p) => p.href === "/vacantes/nueva"), false);
  assert.equal(pantallasVisibles(soloVer).some((p) => p.href === "/vacantes"), true);
  assert.equal(pantallasVisibles(con("vacantes.ver", "vacantes.crear")).some((p) => p.href === "/vacantes/nueva"), true);
});

test("permisos: cada usuario solo consulta las fuentes de sus módulos", () => {
  const claves = (ef: PermisosEfectivos) => fuentesPermitidas(ef).map((f) => f.fuente.clave);
  assert.deepEqual(claves(con("vacantes.ver")), ["vacantes"]);
  assert.deepEqual(claves(con("empleados.ver")), ["empleados"]);
});

test("permisos: incapacidades exige el permiso de expedientes, no solo el módulo", () => {
  const f = FUENTES.find((x) => x.clave === "incapacidades")!;
  assert.equal(permisoDeRuta(f.fichas[0].ruta), "incapacidades.expedientes.ver");
  const claves = (ef: PermisosEfectivos) => fuentesPermitidas(ef).map((x) => x.fuente.clave);
  assert.deepEqual(claves(con("incapacidades.ver")), []);
  assert.deepEqual(claves(con("incapacidades.ver", "incapacidades.expedientes.ver")), ["incapacidades"]);
});

test("permisos: el conductor abre la ficha que el usuario puede ver", () => {
  const ficha = (ef: PermisosEfectivos) => fuentesPermitidas(ef).find((x) => x.fuente.clave === "conductores")?.ficha;
  const fila = { cedula: "123" };
  assert.equal(ficha(con("conductores.ver"))?.href(fila), "/conductores/123");
  assert.equal(ficha(con("rotacion.ver"))?.href(fila), "/rotacion/conductores/123");
  assert.equal(ficha(superUsuario)?.href(fila), "/conductores/123");
});

test("catálogo: los permisos usados en las pruebas siguen existiendo", () => {
  const usados = ["configuracion.ver", "vacantes.ver", "vacantes.crear", "empleados.ver", "incapacidades.ver", "incapacidades.expedientes.ver", "conductores.ver", "rotacion.ver"];
  const todas = new Set(PERMISOS.map((p) => p.clave));
  for (const c of usados) assert.ok(todas.has(c), c);
});

// ── Fuentes ──────────────────────────────────────────────────────────────────

test("fuentes: cada ficha es una página real con dueño", () => {
  for (const f of FUENTES) {
    assert.ok(f.fichas.length > 0, f.clave);
    for (const ficha of f.fichas) {
      assert.ok(existePagina(ficha.pagina), `${f.clave}: no existe ${ficha.pagina}`);
      assert.ok(destinoDeRuta(ficha.ruta), `${f.clave}: ${ficha.ruta} sin dueño`);
    }
  }
});

test("fuentes: nunca buscan ni devuelven columnas sensibles", () => {
  const prohibida = /diagnostico|cie10|descripcion|resumen|peaton|motivo|estado/;
  for (const clave of ["incapacidades", "disciplinarios"]) {
    const f = FUENTES.find((x) => x.clave === clave)!;
    assert.ok(!prohibida.test(f.select), `${clave}: select ${f.select}`);
    assert.ok(!f.columnas.some((c) => prohibida.test(c)), `${clave}: columnas`);
  }
  for (const f of FUENTES) {
    assert.ok(!/diagnostico|cie10|descripcion|resumen_descargos|peaton_/.test([f.select, ...f.columnas].join(",")), f.clave);
  }
});

test("filtro: ignora tildes, compara el número solo si son dígitos y ancla si se pide", () => {
  const f = { columnas: ["nombre", "cedula"], columnasNumero: ["consecutivo"] };
  assert.equal(filtroDePalabra(f, "ana", false), 'nombre.imatch."[aáAÁ][nñNÑ][aáAÁ]",cedula.imatch."[aáAÁ][nñNÑ][aáAÁ]"');
  assert.equal(filtroDePalabra(f, "12", true), 'nombre.imatch."^12$",cedula.imatch."^12$",consecutivo.eq.12');
  assert.ok(!filtroDePalabra(f, "9".repeat(19), false).includes("consecutivo"), "desbordaría un BIGINT");
});

// ── Texto ────────────────────────────────────────────────────────────────────

test("texto: normaliza tildes y mayúsculas", () => {
  assert.equal(normalizar("MUÑOZ Álvarez"), "munoz alvarez");
  assert.equal(patronDe("Muñoz"), "m[uúüUÚÜ][nñNÑ][oóOÓ]z");
});

test("texto: ningún metacarácter sale de palabrasDe", () => {
  const malos = ['a"b', "a,b", "a(b)", "a.b*", "a\\b", "%_%", "a'b;--", "[a]", "a$^|b", "x.imatch.y"];
  for (const m of malos) {
    for (const p of palabrasDe(m)) assert.match(p, /^[\p{L}\p{N}]+$/u, m);
  }
  assert.deepEqual(palabrasDe("ABC-123"), ["abc", "123"]);
});

test("texto: limita palabras y largo, y exige 2 caracteres", () => {
  assert.deepEqual(palabrasDe("a"), []);
  assert.deepEqual(palabrasDe("  "), []);
  assert.deepEqual(palabrasDe("a b"), ["a", "b"]);
  assert.equal(palabrasDe("uno dos tres cuatro cinco seis").length, 4);
  assert.equal(palabrasDe("x".repeat(50))[0].length, 20);
});

test("texto: solo un código corto y solo se ancla", () => {
  assert.equal(debeAnclarse(["12"]), true);
  assert.equal(debeAnclarse(["1234"]), true);
  assert.equal(debeAnclarse(["12345"]), false);
  assert.equal(debeAnclarse(["abc", "123"]), false);
  assert.equal(debeAnclarse(["ana"]), false);
});

test("texto: todas las palabras deben coincidir", () => {
  assert.equal(coincide("caja de devengados", ["caja", "deven"]), true);
  assert.equal(coincide("caja de devengados", ["caja", "flota"]), false);
});
