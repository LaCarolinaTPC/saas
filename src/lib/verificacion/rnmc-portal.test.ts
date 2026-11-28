import { test } from "node:test";
import assert from "node:assert/strict";
import { camposDeDetalle, interpretarDetalleRnmc } from "./rnmc-portal";
import { tieneConducta } from "@/lib/seleccion/antecedentes";

// Como lo muestra el portal al hacer clic en el expediente (estructura del 27-nov-2026; datos ficticios).
const HTML = `<h4>Detalle Comportamiento Contrario a la Convivencia</h4>
<span id="ctl00_ContentPlaceHolder3_txt_expediente" class="Label">11-001-6-2021-000001</span>
<span id="ctl00_ContentPlaceHolder3_txt_art" class="Label">Art. 35 Comportamientos que afectan las relaciones entre las personas y las autoridades</span>
<span id="ctl00_ContentPlaceHolder3_txt_numeral" class="Label">Num. 2 Incumplir, desacatar, desconocer e impedir la funci&#243;n o la orden de polic&#237;a</span>
<span id="ctl00_ContentPlaceHolder3_txt_literal" class="Label">No aplica</span>
<span id="ctl00_ContentPlaceHolder3_txt_localidad" class="Label">L-1 NORTE</span>
<span id="ctl00_ContentPlaceHolder3_txt_relatoHechos" class="Label">el ciudadano no portaba el tapabocas </span>
<span id="ctl00_ContentPlaceHolder3_txt_descargos" class="Label">lo ten&#237;a en el bolsillo </span>
<table class="grid" id="ctl00_ContentPlaceHolder3_gv_medida"><tr><th>Medida</th><th>Atribucion</th><th>Remitido a:</th><th>Direccion:</th><th>Estado</th></tr>
<tr><td class="celdaJust">Multa General Tipo 4</td><td>INSPECTOR DE POLIC&#205;A</td><td>INSPECCION - 1</td><td>CALLE 1</td><td>EN PROCESO</td></tr></table>`;

test("portal RNMC: el detalle del expediente sale de la página", () => {
  const d = interpretarDetalleRnmc(HTML);
  assert.ok(d);
  assert.equal(d.expediente, "11-001-6-2021-000001");
  assert.match(d.numeral ?? "", /función o la orden de policía/);
  assert.equal(d.literal, null); // «No aplica»
  assert.equal(d.relato, "el ciudadano no portaba el tapabocas");
  assert.equal(d.descargos, "lo tenía en el bolsillo");
  assert.deepEqual(d.medidas, [{ medida: "Multa General Tipo 4", atribucion: "INSPECTOR DE POLICÍA", remitido: "INSPECCION - 1", estado: "EN PROCESO" }]);
  const campos = camposDeDetalle(d);
  assert.equal(campos["Medidas Correctivas"], "Multa General Tipo 4 (EN PROCESO)");
  assert.equal(tieneConducta(campos), true);
});

test("portal RNMC: sin el detalle (otra página) no hay lectura", () => {
  assert.equal(interpretarDetalleRnmc("<html><body>Consulta Ciudadano</body></html>"), null);
});

test("la tabla de Croma sola no trae conducta; con el detalle del portal, sí", () => {
  assert.equal(tieneConducta({ Expediente: "1", Formato: "002", Estado: "Abierto" }), false);
  assert.equal(tieneConducta({ Expediente: "1", "Relato Hechos": "riña" }), true);
  assert.equal(tieneConducta({ descripcion: "Multa tipo 2" }), true);
});

// Respuestas del portal por cédula (estructura del 27-nov-2026; datos ficticios).
import { interpretarRespuestaCedula } from "./rnmc-portal";
import { interpretarRnmcCroma } from "./proveedores";
import { hallazgoDe } from "@/lib/seleccion/antecedentes";

const LIMPIO = `<h2>La Policía Nacional de Colombia informa:</h2><p>Que a la fecha, 27/11/2026 06:18:10 p. m. &nbsp;el ciudadano con Cédula de Ciudadanía Nº.
<span id="ctl00_ContentPlaceHolder3_txtIdentificacionUser" style="font-weight:bold;">1000000001</span> <span id="ctl00_ContentPlaceHolder3_txtNameUser" style="font-weight:bold;"> .</span></p>
<h3>NO TIENE MEDIDAS CORRECTIVAS PENDIENTES POR CUMPLIR. </h3><p>Registro interno de validación No. <span id="ctl00_ContentPlaceHolder3_txtCodigoVerifi" style="font-weight:bold;">152887612</span> .</p>`;
const CON_REGISTROS = `<h2>La Policía Nacional de Colombia informa: </h2><p>Que a la fecha <label> de Nombre:</label> <span id="ctl00_ContentPlaceHolder3_txtNameUser2" style="font-weight:bold;">PEREZ GOMEZ ANA MARIA</span></p>
<h3>PRESENTA LOS SIGUIENTES REGISTROS:</h3><table class="grid" id="gv_expedientes"><tr><th>Expediente</th><th>Formato</th><th>Infractor</th><th>Fecha</th><th>Municipio</th><th>Apelaci&#243;n</th><th>Estado</th></tr>
<tr><td><a href="javascript:__doPostBack('ctl00$ContentPlaceHolder3$gv_expedientes','ver$0')">11-001-6-2021-000001</a></td><td>002</td><td>PEREZ GOMEZ ANA MARIA</td><td>2021-03-01 10:00:00</td><td>BOGOTA</td><td>NO</td><td>Abierto</td></tr></table>`;
const FECHA_MALA = `<span id="ctl00_ContentPlaceHolder3_PopMsg_lblMsg">La fecha de expedición de la Cedula de Ciudadania no es correcta, por favor verifique.</span>`;

test("portal por cédula: limpio, sin nombre, con número de validación (como Croma)", () => {
  const d = interpretarRespuestaCedula(LIMPIO);
  assert.ok(d);
  assert.equal(d.has_pending_measures, false);
  assert.equal(d.full_name, null);
  assert.equal(d.validation_number, "152887612");
  // Sin nombre, solo vale si el RUNT ya confirmó a la persona (igual que con Croma).
  assert.equal(hallazgoDe("rnmc", d), null);
  assert.equal(hallazgoDe("rnmc", d, { identidadConfirmada: true }), false);
});

test("portal por cédula: con registros, el nombre y la tabla con sus encabezados", () => {
  const d = interpretarRespuestaCedula(CON_REGISTROS);
  assert.ok(d);
  assert.equal(d.full_name, "PEREZ GOMEZ ANA MARIA");
  assert.equal(d.pending_measures.length, 1);
  assert.equal(d.pending_measures[0].Expediente, "11-001-6-2021-000001");
  assert.equal(d.pending_measures[0]["Apelación"], "NO");
  assert.equal(d.pending_measures[0].Estado, "Abierto");
  const r = interpretarRnmcCroma(d);
  assert.equal(r.resumen?.cantidad, 1);
  assert.equal(r.resumen?.medidasPendientes, true);
});

test("portal por cédula: la fecha rechazada es found=false (el asistente la vuelve a pedir)", () => {
  const d = interpretarRespuestaCedula(FECHA_MALA);
  assert.equal(d?.found, false);
  assert.equal(interpretarRnmcCroma(d).resumen?.fechaCoincide, false);
  assert.equal(interpretarRespuestaCedula("<html>Portal de Servicios al Ciudadano</html>"), null);
});

import { interpretarExpedienteCroma } from "./proveedores";

test("Croma /case/v1 (27-nov-2026): el expediente con la forma del portal; found=false no hay detalle", () => {
  const d = interpretarExpedienteCroma({
    found: true,
    case_number: "11-001-6-2021-000001",
    article: "Art. 35 Comportamientos que afectan las relaciones entre las personas y las autoridades",
    numeral: "Num. 2 Incumplir, desacatar, desconocer e impedir la función o la orden de policía",
    literal: "No aplica",
    facts: "no portaba el tapabocas",
    defense: "lo tenía en el bolsillo",
    measures: [{ measure: "Multa General Tipo 4", authority: "INSPECTOR DE POLICÍA", referred_to: "INSPECCION - 1", status: "EN PROCESO" }],
  });
  assert.ok(d);
  assert.equal(d.literal, null);
  assert.equal(d.relato, "no portaba el tapabocas");
  const campos = camposDeDetalle(d, "croma");
  assert.equal(campos["Medidas Correctivas"], "Multa General Tipo 4 (EN PROCESO)");
  assert.equal(campos.Detalle, "Croma (consulta del expediente)");
  assert.equal(interpretarExpedienteCroma({ found: false, case_number: null }), null);
});
