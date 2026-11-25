import { test } from "node:test";
import assert from "node:assert/strict";
import { AJUSTE_DE_REGLA, PALABRAS_RNMC_SUGERIDAS, PALABRAS_SUGERIDAS, REGLAS_POR_DEFECTO, evaluarAntecedentes, reglasDeAjustes, type ReglasAntecedentes } from "./antecedentes";
import { OPCIONES_AJUSTE } from "./ajustes";
import { agruparAjustes } from "./secciones-ajustes";
import { CASOS_PROBADOR, EJEMPLO_BASE, FRASES, OTRAS_FRASES_LIMPIAS, SOLO_EN_ANTECEDENTES, TABLA_ANTECEDENTES, consultaDeEjemplo, probarReglas } from "./secciones-antecedentes";
import type { AjusteSeleccion } from "./ajustes";

const ok = (fuente: string, resultado: unknown) => ({ fuente, estado: "ok", resultado });
const LIMPIAS = [
  ok("policia", { has_records: false, full_name: "ANA MARIA PEREZ GOMEZ" }),
  ok("procuraduria", { found: true, has_records: false, full_name: "ANA MARIA PEREZ GOMEZ" }),
  ok("contraloria", { is_fiscal_responsible: false }),
  ok("rnmc", { found: true, full_name: "ANA MARIA PEREZ GOMEZ", has_pending_measures: false }),
];
const caida = (fuente: string) => ({ fuente, estado: "error", resultado: null, error: "Croma no respondió" });

test("la fuente no responde: espera, pasa solo o revisión manual (25-nov-2026)", () => {
  const sinPolicia = [...LIMPIAS.slice(1), caida("policia")];
  // Sin la regla nueva manda el sí/no de antes: obligatoria = espera.
  assert.equal(evaluarAntecedentes(sinPolicia, { reglas: REGLAS_POR_DEFECTO }).veredicto, "pendiente");
  assert.equal(evaluarAntecedentes(sinPolicia, { reglas: REGLAS_POR_DEFECTO, opcionales: ["policia"] }).veredicto, "limpio");
  // Espera: no avanza.
  assert.equal(evaluarAntecedentes(sinPolicia, { reglas: { ...REGLAS_POR_DEFECTO, policiaSinRespuesta: "espera" } }).veredicto, "pendiente");
  // Pasa solo: sigue sin ella y queda la observación de que falta.
  const pasa = evaluarAntecedentes(sinPolicia, { reglas: { ...REGLAS_POR_DEFECTO, policiaSinRespuesta: "pasa" } });
  assert.equal(pasa.veredicto, "limpio");
  assert.deepEqual(pasa.faltan, ["policia"]);
  // La regla nueva manda sobre el sí/no viejo.
  assert.equal(evaluarAntecedentes(sinPolicia, { reglas: { ...REGLAS_POR_DEFECTO, policiaSinRespuesta: "espera" }, opcionales: ["policia"] }).veredicto, "pendiente");
  // Revisión manual: la consulta falló → va a una persona, con el motivo.
  const rev = evaluarAntecedentes(sinPolicia, { reglas: { ...REGLAS_POR_DEFECTO, policiaSinRespuesta: "revision" } });
  assert.equal(rev.veredicto, "revision");
  assert.match(rev.fuentes.find((f) => f.fuente === "policia")?.motivo ?? "", /no respondió/);
  // …pero mientras no se ha consultado (o sigue en curso) espera: no manda a todo el mundo a revisión antes de tiempo.
  assert.equal(evaluarAntecedentes(LIMPIAS.slice(1), { reglas: { ...REGLAS_POR_DEFECTO, policiaSinRespuesta: "revision" } }).veredicto, "pendiente");
  assert.equal(evaluarAntecedentes([...LIMPIAS.slice(1), { fuente: "policia", estado: "pendiente", resultado: null }], { reglas: { ...REGLAS_POR_DEFECTO, policiaSinRespuesta: "revision" } }).veredicto, "pendiente");
});

test("el nombre que devuelve la fuente no es el del aspirante", () => {
  const otro = [ok("policia", { has_records: false, full_name: "CARLOS ALBERTO RUIZ DIAZ" }), ...LIMPIAS.slice(1)];
  const nombre = "Ana María Pérez Gómez";
  // Sin la regla (o en «pasa») no se compara: como hasta hoy.
  assert.equal(evaluarAntecedentes(otro, { reglas: REGLAS_POR_DEFECTO, nombre }).veredicto, "limpio");
  assert.equal(evaluarAntecedentes(otro, { reglas: { ...REGLAS_POR_DEFECTO, nombreNoCoincide: "pasa" }, nombre }).veredicto, "limpio");
  // En «revisión»: aunque salió limpia, una persona confirma que es él.
  const rev = evaluarAntecedentes(otro, { reglas: { ...REGLAS_POR_DEFECTO, nombreNoCoincide: "revision" }, nombre });
  assert.equal(rev.veredicto, "revision");
  assert.equal(rev.resultado, "limpio");
  assert.match(rev.fuentes[0].motivo ?? "", /CARLOS ALBERTO RUIZ DIAZ/);
  // Mismo nombre con tildes y en otro orden: coincide.
  assert.equal(evaluarAntecedentes(LIMPIAS, { reglas: { ...REGLAS_POR_DEFECTO, nombreNoCoincide: "revision" }, nombre: "PÉREZ GÓMEZ ANA" }).veredicto, "limpio");
  // Sin nombre en el proceso o sin nombre en la fuente: no hay con qué comparar.
  assert.equal(evaluarAntecedentes(otro, { reglas: { ...REGLAS_POR_DEFECTO, nombreNoCoincide: "revision" } }).veredicto, "limpio");
  // Un hallazgo que se toleraría, con otro nombre, va a revisión.
  const rnmc = [...LIMPIAS.slice(0, 3), ok("rnmc", { found: true, full_name: "CARLOS RUIZ", has_pending_measures: true, pending_measures: [{ medida: "x" }] })];
  assert.equal(evaluarAntecedentes(rnmc, { reglas: REGLAS_POR_DEFECTO, nombre }).veredicto, "tolerable");
  assert.equal(evaluarAntecedentes(rnmc, { reglas: { ...REGLAS_POR_DEFECTO, nombreNoCoincide: "revision" }, nombre }).veredicto, "revision");
});

test("reglasDeAjustes: los ajustes nuevos solo cuentan si existen", () => {
  const sin = reglasDeAjustes([{ clave: "ant_policia_accion", valor: "tolera" }]);
  assert.equal(sin.policiaSinRespuesta, undefined);
  assert.equal(sin.nombreNoCoincide, undefined);
  const con = reglasDeAjustes([
    { clave: "ant_rnmc_sin_respuesta", valor: "pasa" },
    { clave: "ant_policia_sin_respuesta", valor: "revision" },
    { clave: "ant_contraloria_sin_respuesta", valor: "cualquier cosa" },
    { clave: "ant_nombre_no_coincide", valor: "revision" },
  ]);
  assert.equal(con.rnmcSinRespuesta, "pasa");
  assert.equal(con.policiaSinRespuesta, "revision");
  assert.equal(con.contraloriaSinRespuesta, undefined);
  assert.equal(con.nombreNoCoincide, "revision");
});

test("tabla de la pestaña: cada caso es un ajuste con sus opciones, y no se repite en Tiempos y reglas", () => {
  const claves = TABLA_ANTECEDENTES.flatMap((f) => f.casos.map((c) => c.clave)).filter((c): c is string => !!c);
  assert.equal(new Set(claves).size, claves.length);
  // Todas las reglas de antecedentes.ts están en la tabla.
  for (const clave of Object.values(AJUSTE_DE_REGLA)) assert.ok(claves.includes(clave), clave);
  // Los selectores nuevos tienen sus opciones.
  for (const clave of ["ant_policia_sin_respuesta", "ant_rnmc_sin_respuesta", "ant_nombre_no_coincide", "ant_simit_accion", "ant_licencia_accion"]) assert.ok(OPCIONES_AJUSTE[clave], clave);
  assert.deepEqual(Object.keys(OPCIONES_AJUSTE.ant_simit_accion), ["descarta", "revision"]);
  // Un caso sin ajuste dice qué pasa siempre.
  for (const f of TABLA_ANTECEDENTES) for (const c of f.casos) assert.ok(c.clave || c.fijo, `${f.id}: ${c.etiqueta}`);
  // En Tiempos y reglas no salen (ni en «Otros ajustes»).
  const ajuste = (clave: string): AjusteSeleccion => ({ clave, grupo: "regla", nombre: clave, orden: 1, valor: "x", valor_sugerido: "x", unidad: "opcion", origen: null, entrega: 4, actualizado_por: null, updated_at: "" });
  const secciones = agruparAjustes([...SOLO_EN_ANTECEDENTES, "simit_tope"].map(ajuste));
  const mostradas = secciones.flatMap((s) => s.filas.map((x) => x.ajuste.clave));
  assert.deepEqual(mostradas, ["simit_tope"]);
});

test("probador: arma la respuesta de Croma de cada caso y dice qué harían las reglas", () => {
  const reglas: ReglasAntecedentes = { ...REGLAS_POR_DEFECTO, policiaSinRespuesta: "revision", contraloriaSinRespuesta: "pasa", nombreNoCoincide: "revision", rnmcPalabras: ["riña"] };
  const hoy = new Date("2026-11-25T12:00:00Z");
  assert.equal(probarReglas(reglas, EJEMPLO_BASE, hoy).veredicto, "limpio");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, policia: "hallazgo" }, hoy).veredicto, "revision");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, policia: "no_responde" }, hoy).veredicto, "revision");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, procuraduria: "no_responde" }, hoy).veredicto, "pendiente");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, contraloria: "no_responde" }, hoy).veredicto, "limpio");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, contraloria: "hallazgo" }, hoy).veredicto, "descarta");
  assert.equal(probarReglas({ ...reglas, contraloriaValorTolerado: 6_000_000 }, { ...EJEMPLO_BASE, contraloria: "hallazgo" }, hoy).veredicto, "tolerable");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, rnmc: "hallazgo", rnmcMedidas: 2 }, hoy).veredicto, "tolerable");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, rnmc: "hallazgo", rnmcMedidas: 3 }, hoy).veredicto, "revision");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, rnmc: "hallazgo", rnmcTexto: "Riña en vía pública" }, hoy).veredicto, "revision");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, rnmc: "otro_nombre" }, hoy).veredicto, "revision");
  assert.equal(probarReglas(reglas, { ...EJEMPLO_BASE, rnmc: "sin_consultar" }, hoy).veredicto, "pendiente");
  // Cada caso del probador produce una consulta con la forma de la fuente (o ninguna).
  for (const c of CASOS_PROBADOR) {
    const consulta = consultaDeEjemplo("rnmc", { ...EJEMPLO_BASE, rnmc: c.id });
    assert.equal(consulta == null, c.id === "sin_consultar", c.id);
  }
});

test("RNMC: las palabras sugeridas mandan a revisión aunque sea una sola medida (25-nov-2026)", () => {
  const reglas: ReglasAntecedentes = { ...REGLAS_POR_DEFECTO, rnmcPalabras: [...PALABRAS_RNMC_SUGERIDAS] };
  const con = (rnmcTexto: string) => probarReglas(reglas, { ...EJEMPLO_BASE, rnmc: "hallazgo", rnmcMedidas: 1, rnmcTexto }).veredicto;
  // Lo que conviene que una persona mire en un conductor.
  for (const texto of [
    "Reñir, incitar o incurrir en confrontaciones violentas (RIÑAS)",
    "Portar armas, elementos cortantes o punzantes en espacio público",
    "Agredir físicamente a personas por cualquier medio",
    "Consumir bebidas alcohólicas o sustancias psicoactivas en espacio público",
    "Irrespetar a las autoridades de policía",
    "Evadir el pago de la tarifa en el sistema de transporte público",
  ]) assert.equal(con(texto), "revision", texto);
  // Una medida de otro tipo, dentro del máximo, sigue pasando sola.
  assert.equal(con("Arrojar basura o escombros en el espacio público"), "tolerable");
  assert.equal(con("No recoger los excrementos de la mascota"), "tolerable");
  // Sin repetidas ni vacías.
  assert.equal(new Set(PALABRAS_RNMC_SUGERIDAS).size, PALABRAS_RNMC_SUGERIDAS.length);
  assert.ok(PALABRAS_RNMC_SUGERIDAS.every((p) => p.trim().length >= 4));
});

test("palabras por fuente: Policía, Procuraduría y Contraloría (25-nov-2026)", () => {
  const reglas: ReglasAntecedentes = {
    ...REGLAS_POR_DEFECTO,
    // Para ver el efecto de las palabras: los hallazgos pasarían solos.
    policia: "tolera", procuraduria: "tolera", contraloria: "tolera",
    policiaPalabras: [...PALABRAS_SUGERIDAS.policia], procuraduriaPalabras: [...PALABRAS_SUGERIDAS.procuraduria], contraloriaPalabras: [...PALABRAS_SUGERIDAS.contraloria],
  };
  const hoy = new Date("2026-11-25T12:00:00Z");
  const v = (e: Partial<typeof EJEMPLO_BASE>) => probarReglas(reglas, { ...EJEMPLO_BASE, ...e }, hoy);
  // Las frases habituales de «sin antecedentes» no disparan ninguna palabra…
  assert.equal(v({}).veredicto, "limpio");
  // …ni las otras formas que se han visto, en ninguna fuente.
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const limpias = [FRASES.policia.limpio, FRASES.procuraduria.limpio, FRASES.contraloria.limpio, ...OTRAS_FRASES_LIMPIAS].map(norm);
  for (const f of ["policia", "procuraduria", "contraloria"] as const) {
    for (const p of PALABRAS_SUGERIDAS[f]) assert.ok(!limpias.some((l) => l.includes(norm(p))), `«${p}» (${f}) aparece en una frase de sin antecedentes`);
  }
  // Un hallazgo sin palabras de la lista pasa solo (la regla dice «tolera»)…
  assert.equal(v({ policia: "hallazgo" }).veredicto, "tolerable");
  // …y con una palabra de la lista va a revisión, con la palabra en el motivo.
  const captura = v({ policia: "hallazgo", policiaTexto: "REGISTRA ORDEN DE CAPTURA VIGENTE" });
  assert.equal(captura.veredicto, "revision");
  assert.match(captura.fuentes.find((f) => f.fuente === "policia")?.motivo ?? "", /orden de captura/);
  // Aunque la fuente no lo marque como hallazgo: el certificado de quien ya cumplió.
  const cumplio = v({ policia: "limpio", policiaTexto: "ACTUALMENTE NO ES REQUERIDO POR AUTORIDAD JUDICIAL ALGUNA" });
  assert.equal(cumplio.veredicto, "revision");
  assert.equal(cumplio.resultado, "limpio");
  assert.equal(v({ procuraduria: "hallazgo", procuraduriaTexto: "Registra sanción: DESTITUCIÓN e inhabilidad general por 10 años" }).veredicto, "revision");
  // Contraloría: la palabra en la entidad afectada del fallo.
  assert.equal(v({ contraloria: "hallazgo", contraloriaEntidad: "Hospital de ejemplo" }).veredicto, "tolerable");
  assert.equal(v({ contraloria: "hallazgo", contraloriaEntidad: "Empresa de Transporte Masivo" }).veredicto, "revision");
  // Si la regla ya propone el cierre, la palabra no lo rebaja a revisión.
  assert.equal(probarReglas({ ...reglas, contraloria: "descarta" }, { ...EJEMPLO_BASE, contraloria: "hallazgo", contraloriaEntidad: "Empresa de Transporte" }, hoy).veredicto, "descarta");
  // Sin listas (antes de la migración) nada cambia.
  assert.equal(probarReglas({ ...REGLAS_POR_DEFECTO, policia: "tolera" }, { ...EJEMPLO_BASE, policia: "hallazgo", policiaTexto: "ORDEN DE CAPTURA" }, hoy).veredicto, "tolerable");
  // Lee las listas de los ajustes.
  assert.deepEqual(reglasDeAjustes([{ clave: "ant_policia_palabras_revision", valor: [" captura ", ""] }]).policiaPalabras, ["captura"]);
  // Sin repetidas en ninguna lista.
  for (const f of Object.keys(PALABRAS_SUGERIDAS) as (keyof typeof PALABRAS_SUGERIDAS)[]) assert.equal(new Set(PALABRAS_SUGERIDAS[f]).size, PALABRAS_SUGERIDAS[f].length, f);
});
