import { test } from "node:test";
import assert from "node:assert/strict";
import { detalleParaReglas } from "./revision-manual";
import { evaluarAntecedentes, REGLAS_POR_DEFECTO, PALABRAS_SUGERIDAS } from "@/lib/seleccion/antecedentes";

const limpias = ["policia", "procuraduria", "contraloria"].map((fuente) => ({
  fuente,
  estado: "ok",
  resultado: fuente === "policia" ? { has_records: false } : fuente === "procuraduria" ? { found: true, has_records: false } : { is_fiscal_responsible: false },
}));
const reglas = { ...REGLAS_POR_DEFECTO, rnmcPalabras: [...PALABRAS_SUGERIDAS.rnmc] };
const rnmcManual = (extra: Record<string, unknown>) => ({ fuente: "rnmc", estado: "ok", resultado: { manual: true, found: true, full_name: "PEDRO", has_pending_measures: true, ...extra } });

test("RNMC leído por la IA (caso Pedro): una medida por tapabocas se tolera (hasta 2)", () => {
  const extra = detalleParaReglas("rnmc", true, {
    veredicto: "TIENE MEDIDAS CORRECTIVAS PENDIENTES",
    registros: [{ expediente: "08-001-6-2020-124967", fecha: "2020-07-15", comportamiento: "No portar el tapabocas en espacio público", medida: "Multa general tipo 4", estado: "Pendiente" }],
  });
  assert.equal((extra.pending_measures as unknown[]).length, 1);
  const ev = evaluarAntecedentes([...limpias, rnmcManual(extra)], { reglas });
  const rnmc = ev.fuentes.find((f) => f.fuente === "rnmc");
  assert.equal(rnmc?.accion, "tolera");
  assert.equal(ev.veredicto, "tolerable");
});

test("RNMC con una riña: va a revisión por la palabra", () => {
  const extra = detalleParaReglas("rnmc", true, { registros: [{ comportamiento: "Reñir o incitar a una riña", estado: "pendiente" }] });
  const ev = evaluarAntecedentes([...limpias, rnmcManual(extra)], { reglas });
  assert.equal(ev.fuentes.find((f) => f.fuente === "rnmc")?.accion, "revision");
});

test("RNMC: las medidas cumplidas no cuentan; sin detalle sigue yendo a revisión", () => {
  const extra = detalleParaReglas("rnmc", true, {
    registros: [
      { comportamiento: "Tapabocas", estado: "Pendiente" },
      { comportamiento: "Ruido", estado: "Cumplida" },
      { comportamiento: "Basuras", estado: "Pagada" },
    ],
  });
  assert.equal((extra.pending_measures as unknown[]).length, 1);
  const sin = evaluarAntecedentes([...limpias, rnmcManual(detalleParaReglas("rnmc", true, { registros: [] }))], { reglas });
  assert.equal(sin.fuentes.find((f) => f.fuente === "rnmc")?.accion, "revision");
});

test("Contraloría leída: valor y fecha del fallo para las tolerancias", () => {
  const extra = detalleParaReglas("contraloria", true, { registros: [{ descripcion: "Fallo", valor: "1.500.000", fecha: "2010-03-01" }] });
  const fallo = (extra.records as Record<string, unknown>[])[0];
  assert.equal(fallo.amount, 1_500_000);
  assert.equal(fallo.ruling_date, "2010-03-01");
});

test("Policía leída: el detalle de los registros entra en las palabras de la fuente", () => {
  const extra = detalleParaReglas("policia", true, { veredicto: "TIENE ASUNTOS PENDIENTES", registros: [{ descripcion: "Orden de captura vigente por hurto" }] });
  const ev = evaluarAntecedentes(
    [{ fuente: "policia", estado: "ok", resultado: { manual: true, has_records: true, ...extra } }, ...limpias.slice(1), rnmcManual({ has_pending_measures: false, pending_measures: [] })],
    { reglas: { ...reglas, policia: "tolera", policiaPalabras: ["orden de captura"] } }
  );
  assert.equal(ev.fuentes.find((f) => f.fuente === "policia")?.accion, "revision");
});

test("Registros raros del navegador se descartan", () => {
  const extra = detalleParaReglas("rnmc", true, { registros: [{ comportamiento: { x: 1 } }, "texto", null, { comportamiento: "Tapabocas", otro: "se ignora" }] });
  assert.deepEqual(extra.pending_measures, [{ comportamiento: "Tapabocas" }]);
});

test("RNMC de Croma como lo devolvió para Pedro (27-nov-2026): sin la conducta va a revisión; «Cerrado» no cuenta", () => {
  const medida = (Estado: string, extra: Record<string, string> = {}) => ({ Expediente: "08-001-6-2020-124967", Formato: "002", Fecha: "2020-12-04 20:48:51", Municipio: "BARRANQUILLA", "Apelación": "SI", Estado, ...extra });
  const croma = (medidas: Record<string, unknown>[]) => ({ fuente: "rnmc", estado: "ok", resultado: { found: true, full_name: "PEDRO", has_pending_measures: true, status: "PRESENTA LOS SIGUIENTES REGISTROS", pending_measures: medidas } });
  const rnmc = (medidas: Record<string, unknown>[], r = reglas) => evaluarAntecedentes([...limpias, croma(medidas)], { reglas: r }).fuentes.find((f) => f.fuente === "rnmc");
  // Solo la tabla (el portal no respondió): revisión, con el expediente para buscarlo.
  const sola = rnmc([medida("Abierto")]);
  assert.equal(sola?.accion, "revision");
  assert.match(sola?.motivo ?? "", /sin la conducta \(expediente 08-001-6-2020-124967/);
  // Con el detalle del portal y una lista de palabras sin «autoridad»: se cuenta y se tolera.
  const detalle = { "Artículo": "Art. 35", Numeral: "Num. 2", "Relato Hechos": "no portaba el tapabocas", "Medidas Correctivas": "Multa General Tipo 4 (EN PROCESO)" };
  assert.equal(rnmc([medida("Abierto", detalle)], { ...reglas, rnmcPalabras: ["riña"] })?.accion, "tolera");
  // Como lo trae el portal para Pedro: el título del Art. 35 («…las autoridades») no cuenta; el numeral
  // («impedir… la orden de policía») sí, salvo que la conducta traiga una palabra que se tolera.
  const pedro = {
    "Artículo": "Art. 35 Comportamientos que afectan las relaciones entre las personas y las autoridades",
    Numeral: "Num. 2 Incumplir, desacatar, desconocer e impedir la función o la orden de policía",
    "Relato Hechos": "violando el decreto de la ciudad de Barranquilla por el uso del tapabocas",
    Descargos: "lo tenía en el bolsillo",
    "Medidas Correctivas": "Multa General Tipo 4 (EN PROCESO)",
  };
  const sinExcepcion = rnmc([medida("Abierto", pedro)]);
  assert.equal(sinExcepcion?.accion, "revision");
  assert.match(sinExcepcion?.motivo ?? "", /impedir/);
  const conExcepcion = rnmc([medida("Abierto", pedro)], { ...reglas, rnmcPalabrasToleradas: ["tapabocas"] });
  assert.equal(conExcepcion?.accion, "tolera");
  assert.match(conExcepcion?.motivo ?? "", /tapabocas/);
  // Una riña no se salva por la excepción de otra medida, ni por el nombre del infractor.
  assert.equal(rnmc([medida("Abierto", pedro), medida("Abierto", { ...pedro, "Relato Hechos": "riña en la vía" })], { ...reglas, rnmcPalabras: ["riña"], rnmcPalabrasToleradas: ["tapabocas"] })?.accion, "revision");
  assert.equal(rnmc([medida("Abierto", { ...detalle, Infractor: "ARMANDO PEREZ" })], { ...reglas, rnmcPalabras: ["arma"] })?.accion, "tolera");
  // Las cerradas no cuentan, aunque no traigan conducta.
  const cerradas = rnmc([medida("CERRADO")]);
  assert.equal(cerradas?.accion, "tolera");
  assert.match(cerradas?.motivo ?? "", /cerrada/);
});
