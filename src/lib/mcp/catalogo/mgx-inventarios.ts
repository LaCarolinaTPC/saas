// Catálogo semántico: inventarios / almacén de MGX (movimientos, referencias,
// bodegas y unidades). Solo La Carolina (emp0) tiene este módulo. Verificado
// contra supabase/migrations/20261021193546_tablas_espejo_de_mgx.sql,
// supabase/migrations/20261022183940_vistas_de_mgx_para_el_mcp.sql y
// src/lib/mgx/esquema.ts. El documento de MGX nombra «vcatalogo» (catálogo del
// maestro de referencias), «vistabodegas», «vistaunidades», «cabeza» y
// «cuerpo»; el significado de columnas e importes es lo observado en la copia
// el 2026-10-22.

import type { DocRecurso } from "./tipos";
import { ADVERTENCIAS_MGX, COLUMNA_EMPRESA, FILTRO_EMPRESA, ORIGEN_MGX, columnaIde } from "./mgx-comun";

/** Tipos de documento de inventario más usados, con su nombre en MGX (pri_mov). */
const TIPOS_DOC_INVENTARIO: Record<string, string> = {
  "02": "ENTRADAS DE ALMACEN COMPRAS (prefijo EA-)",
  "03": "ORDENES DE COMPRA",
  "11": "SALIDAS POR CONSUMO (prefijo SC-), el tipo más frecuente",
  "34": "REQUISICIONES",
  "300": "DOCUMENTO SOPORTE OT",
  "310": "DOCUMENTO SOPORTE",
  "340": "ORDENES DE TALLER M. CORRECTIVO (prefijo OTD-), sin valores",
  "341": "SALIDAS X CONSUMOS OT (prefijo SCOT-): repuestos sacados para una orden de taller",
  "342": "ORDENES DE TALLER M. PREVENTIVO, sin valores",
  "343": "ORDENES DE TALLER VEH EXTERNOS, sin valores",
  "344": "CONTROL MANO DE OBRA",
  "345": "ENTRADAS DE ALMACEN TALLER",
  "346": "ENTRADAS DE MANO DE OBRA",
  "960": "Eventos (ApplicationResponse): eventos de factura electrónica, sin cantidades ni valores",
};

export const RECURSOS_MGX_INVENTARIOS: DocRecurso[] = [
  // ── mgx_v_in_movimientos ─────────────────────────────────────────────────
  {
    nombre: "mgx_v_in_movimientos",
    dominio: "mgx",
    titulo: "Movimientos de inventario y taller de MGX (por ítem)",
    resumen:
      "Cada ítem de los documentos del almacén de La Carolina en MGX: compras, salidas por consumo, salidas para órdenes de taller, órdenes de taller y traslados, con referencia, bodega, cantidad, costo y el bus al que se cargó.",
    granularidad:
      "Una fila = un ítem (referencia) de un documento de inventario. El encabezado del documento se repite en cada ítem.",
    descripcion:
      "Vista de Gestivo que cruza el encabezado y el cuerpo de los documentos de inventario de MGX con el nombre del tipo de documento (pri_mov), la referencia (por ref_cod) y la bodega. Solo existe para emp0. Es la fuente para saber qué repuestos se consumieron por bus, qué se compró a cada proveedor y qué trabajos registra cada orden de taller.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    columnaFecha: "fecha",
    volumen: "Unos 380.000 ítems de unos 197.000 documentos desde 2014; unos 2.500 a 3.000 documentos por mes en 2026. Filtre por fecha.",
    filasAproximadas: 380_000,
    columnasPorDefecto: [
      "fecha",
      "tip_doc",
      "nom_tip_doc",
      "num_doc",
      "cod_cco_doc",
      "cod_ref",
      "nom_ref",
      "cod_bod",
      "cantidad",
      "pre_cos",
      "subtotal",
      "nit_ter",
      "detalle",
      "ide",
    ],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      ano_doc: { descripcion: "Año del documento.", formato: "AAAA" },
      per_doc: { descripcion: "Mes del documento.", formato: "'01' a '12'" },
      tip_doc: {
        descripcion: "Tipo de documento de inventario. Su nombre oficial de MGX está en nom_tip_doc.",
        valores: TIPOS_DOC_INVENTARIO,
        advertencia: "Hay 38 tipos en uso; los no listados son poco frecuentes. Para agrupar por clase de movimiento use nom_tip_doc.",
      },
      nom_tip_doc: { descripcion: "Nombre del tipo de documento según el maestro de MGX (pri_mov)." },
      num_doc: { descripcion: "Número del documento, con prefijo por tipo (EA-, SC-, SCOT-, OTD-…)." },
      fecha: {
        descripcion: "Fecha y hora del documento.",
        formato: "timestamp sin zona, hora de Colombia (a diferencia de la contabilidad, aquí trae hora)",
        advertencia: "Para un día completo filtre gte 'AAAA-MM-DD' y lt el día siguiente.",
      },
      descrip: {
        descripcion: "Descripción del documento: en las órdenes de taller, el trabajo («RETROVISOR DERECHO»); en las salidas por OT, «Consumo Vehiculo 539».",
      },
      nit_ter: { descripcion: "NIT del tercero del documento (proveedor en las compras).", relacion: "mgx_v_co_pri_ter.nit" },
      cod_epl: {
        descripcion: "Cédula de la persona de MGX asociada al documento (quien lo registra o solicita; en las órdenes de taller se observa casi siempre la misma persona).",
        relacion: "mgx_v_rh_empleados.codigo",
        advertencia: "No es el conductor del bus.",
      },
      cod_cco_doc: {
        descripcion:
          "Centro de costo del ENCABEZADO. En las órdenes de taller y en las salidas para OT es el número interno del bus ('539'); en compras y consumos generales suele ser un área.",
        relacion: "mgx_v_co_pri_cos.codigo",
        advertencia: "Para costos por bus use esta columna, no cod_cco (la del ítem casi siempre está vacía).",
      },
      estado: {
        descripcion: "Bandera del encabezado: 2 solo en los eventos electrónicos (tipo 960), 0 en el resto.",
        valores: ["0", "2"],
      },
      est_mov: { descripcion: "Bandera de MGX (0, 1, 2, 3 o 5) sin significado documentado; 0 en el 90 %." },
      cerrada: {
        descripcion: "Bandera de MGX (0, 1, 2 o 5) sin significado documentado; las órdenes de taller recientes tienen 1.",
        advertencia: "No la interprete como «orden cerrada» sin confirmarlo.",
      },
      total_doc: {
        descripcion: "Total del documento entero (con IVA en las compras). Se repite en cada ítem.",
        unidad: "COP",
        advertencia: "No lo sume sobre ítems: se multiplicaría. Sume subtotal.",
      },
      item: { descripcion: "Número del ítem dentro del documento." },
      cod_ref: {
        descripcion: "Código de la referencia (repuesto, servicio). Vacío en algunos ítems de encabezado o de eventos.",
        relacion: "mgx_v_in_catalogo.ref_cod",
      },
      nom_ref: { descripcion: "Nombre de la referencia: el del ítem o, si viene vacío, el del catálogo." },
      cod_gru: { descripcion: "Grupo de la referencia (FRENOS, MOTOR, LLANTAS…); ver mgx_v_in_catalogo." },
      cod_bod: { descripcion: "Bodega del ítem.", relacion: "mgx_v_in_bodegas.codigo" },
      nom_bod: { descripcion: "Nombre de la bodega." },
      cod_cco: { descripcion: "Centro de costo del ítem; casi siempre vacío (ver cod_cco_doc)." },
      cantidad: { descripcion: "Cantidad del ítem, en la unidad de la referencia.", unidad: "unidades de la referencia" },
      cod_und: { descripcion: "Unidad del ítem; casi siempre vacía (la unidad está en el catálogo)." },
      pre_cos: {
        descripcion: "Precio unitario: en las salidas es el costo unitario; en las compras se observa el precio con IVA.",
        unidad: "COP por unidad",
      },
      valor: {
        descripcion: "Valor del ítem según MGX.",
        unidad: "COP",
        advertencia: "Inconsistente entre tipos (0 en las salidas para OT, valor antes de IVA en las compras). Use subtotal.",
      },
      subtotal: {
        descripcion:
          "Importe del ítem: cantidad × costo en las salidas; valor antes de IVA en las compras. Es la columna para sumar costos.",
        unidad: "COP",
      },
      tot_iva: { descripcion: "IVA del ítem (en las compras).", unidad: "COP" },
      detalle: { descripcion: "Detalle libre del ítem." },
      doc_rel: { descripcion: "Documento relacionado (requisición RQ-, factura del proveedor…)." },
      cod_cta: { descripcion: "Cuenta contable del ítem; casi siempre vacía." },
      llave_doc: { descripcion: "Llave del documento: año|mes|tipo|número.", formato: "ano_doc|per_doc|tip_doc|num_doc" },
      ide: columnaIde("in.cuerpo"),
    },
    relaciones: [
      { recurso: "mgx_v_in_catalogo", mediante: "empresa + cod_ref = ref_cod", descripcion: "Ficha de la referencia." },
      { recurso: "vehiculos", mediante: "cod_cco_doc = codigo", descripcion: "El bus al que se cargó la salida o la orden de taller." },
      {
        recurso: "mgx_v_co_movimientos",
        mediante: "la salida SCOT-… aparece en la descripción del comprobante contable tipo 21",
        descripcion: "Contabilización en pesos del consumo.",
      },
      {
        recurso: "mantenimiento_reportes",
        mediante: "cod_cco_doc = codigo_vehiculo y fechas cercanas (no hay llave común)",
        descripcion: "Daños reportados por los conductores en Gestivo.",
      },
    ],
    advertencias: [
      "Las órdenes de taller (tipos 340, 342 y 343) traen los trabajos con cantidad y valor 0: el costo de los repuestos está en las salidas para OT (tipo 341) y en las salidas por consumo (tipo 11).",
      "Para costo de repuestos por bus: agregar_datos con tip_doc in ('11','341'), rango de fecha, agrupar_por cod_cco_doc y sum subtotal.",
      "No mezcle entradas (compras) con salidas en un mismo total: unas suben el inventario y otras lo bajan.",
      ...ADVERTENCIAS_MGX,
    ],
    noConfundirCon: [
      {
        recurso: "mantenimiento_alertas",
        diferencia: "Son alertas de daños repetidos en Gestivo. Aquí está lo que el almacén y el taller registraron en MGX.",
      },
      {
        recurso: "combustible_tanqueos",
        diferencia: "El combustible llega por el archivo del proveedor; no está en el inventario de MGX.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué buses consumieron más repuestos en septiembre?",
        como: "agregar_datos con fecha gte '2026-09-01' y lt '2026-10-01', tip_doc in ('11','341'), agrupar_por cod_cco_doc, sum subtotal, orden metrica_desc.",
      },
      {
        pregunta: "¿Qué trabajos de taller se le hicieron a un bus?",
        como: "consultar_datos con cod_cco_doc = número interno, tip_doc in ('340','342'), rango de fecha; columnas fecha, num_doc, descrip, nom_ref.",
      },
      {
        pregunta: "¿Cuánto se compró a un proveedor?",
        como: "agregar_datos con tip_doc = '02', nit_ter = NIT y rango de fecha; sum subtotal y sum tot_iva.",
      },
    ],
  },

  // ── mgx_v_in_catalogo ────────────────────────────────────────────────────
  {
    nombre: "mgx_v_in_catalogo",
    dominio: "mgx",
    titulo: "Catálogo de referencias de inventario de MGX",
    resumen: "Las referencias del almacén (repuestos, insumos, servicios) con su grupo, subgrupo, unidad y si están activas.",
    granularidad: "Una fila = una referencia de inventario.",
    descripcion:
      "Es la vista «vcatalogo» del documento de MGX. En MGX sale vacía porque usa INNER JOIN con líneas y La Carolina no tiene ninguna; aquí cruza con LEFT JOIN. Gestivo anexó el código interno, stock mínimo y máximo, marca, fecha de ingreso e ide.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    volumen: "Unas 3.400 referencias en emp0.",
    columnasPorDefecto: ["ref_cod", "nombre", "cod_gru", "nom_gru", "cod_sgr", "nom_sgr", "nom_und", "activa", "sto_min", "sto_max", "ide"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      ref_cod: {
        descripcion: "Código de la referencia, el que usan los movimientos ('FRE-991', '05MOT03380').",
        relacion: "mgx_v_in_movimientos.cod_ref",
      },
      nombre: { descripcion: "Nombre de la referencia." },
      cod_gru: { descripcion: "Grupo (FRENOS, MOTOR, LLANTAS, CARROCERIA, SENSOR…)." },
      cod_und: { descripcion: "Unidad de medida." },
      nom_und: { descripcion: "Nombre de la unidad (UNIDAD, GAL, MTS…)." },
      nom_gru: { descripcion: "Nombre del grupo." },
      cta_inv: { descripcion: "Cuenta contable de inventario del grupo." },
      cod_sgr: { descripcion: "Subgrupo ('000' = NINGUNA)." },
      nom_sgr: { descripcion: "Nombre del subgrupo." },
      cod_lin: { descripcion: "Línea; vacía en emp0." },
      nom_lin: { descripcion: "Nombre de la línea; NULL en emp0." },
      activa: { descripcion: "1 si la referencia está activa.", valores: { "0": "Inactiva", "1": "Activa" } },
      cod_interno: { descripcion: "Código interno consecutivo de MGX ('03386'). No es el que usan los movimientos." },
      sto_min: { descripcion: "Stock mínimo configurado; casi siempre 0." },
      sto_max: { descripcion: "Stock máximo configurado; casi siempre 0." },
      cod_mar: { descripcion: "Marca ('000' = sin marca)." },
      fec_ing: { descripcion: "Fecha de creación de la referencia; NULL en muchas.", formato: "date" },
      ide: columnaIde("in.pri_ref"),
    },
    advertencias: [
      "Esta vista no trae existencias ni costo promedio: el saldo de inventario no se copia de MGX.",
      ...ADVERTENCIAS_MGX,
    ],
  },

  // ── mgx_v_in_bodegas ─────────────────────────────────────────────────────
  {
    nombre: "mgx_v_in_bodegas",
    dominio: "mgx",
    titulo: "Bodegas de inventario de MGX",
    resumen: "Las bodegas del almacén de La Carolina en MGX.",
    granularidad: "Una fila = una bodega.",
    descripcion:
      "Es la vista «vistabodegas» del documento de MGX, con el ide anexado. En emp0 son seis: 00 SERVICIOS, 01 PRINCIPAL, 02 BODEGA LLANTAS, 03 BODEGA APROVECHAMIENTOS, 04 BODEGA DE REPUESTOS EN CONSIGNACIÓN y 05 BODEGA CONSUMO DIRECTO.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    columnasPorDefecto: ["codigo", "nombre", "ide"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      codigo: { descripcion: "Código de la bodega.", relacion: "mgx_v_in_movimientos.cod_bod" },
      nombre: { descripcion: "Nombre de la bodega. '00' SERVICIOS es la de los trabajos de taller, que no son existencias." },
      direccion: { descripcion: "Dirección de la bodega." },
      telefonos: { descripcion: "Teléfonos de la bodega." },
      ide: columnaIde("in.pri_bod"),
    },
    advertencias: ADVERTENCIAS_MGX,
  },

  // ── mgx_v_in_unidades ────────────────────────────────────────────────────
  {
    nombre: "mgx_v_in_unidades",
    dominio: "mgx",
    titulo: "Unidades de medida de inventario de MGX",
    resumen: "Las unidades de medida de las referencias (UNIDAD, GAL, MTS…).",
    granularidad: "Una fila = una unidad de medida.",
    descripcion: "Es la vista «vistaunidades» del documento de MGX, con el ide anexado. Ocho unidades en emp0; una tiene nombre vacío y otra '0.25'.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    columnasPorDefecto: ["codigo", "nombre", "ide"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      codigo: { descripcion: "Código de la unidad ('01' UNIDAD).", relacion: "mgx_v_in_catalogo.cod_und" },
      nombre: { descripcion: "Nombre de la unidad." },
      ide: columnaIde("in.pri_und"),
    },
    advertencias: ADVERTENCIAS_MGX,
  },
];
