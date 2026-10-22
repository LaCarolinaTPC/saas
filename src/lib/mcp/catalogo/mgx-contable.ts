// Catálogo semántico: módulo contable de MGX (comprobantes, plan de cuentas,
// centros de costo y terceros). Verificado contra
// supabase/migrations/20261021193546_tablas_espejo_de_mgx.sql,
// supabase/migrations/20261022183940_vistas_de_mgx_para_el_mcp.sql,
// src/lib/mgx/{catalogo,esquema,limpieza}.ts y docs/mgx-sincronizacion.md.
// El documento de MGX («etl00027v2») solo nombra las vistas: «movimientos del
// sistema contable», «encabezados», «maestro de centros de costos», «maestro
// de cuentas contables» y «maestro de terceros». El resto sale de inspeccionar
// la copia el 2026-10-22 (emp0 salvo que se diga otra cosa).

import type { DocRecurso } from "./tipos";
import { ADVERTENCIAS_MGX, COLUMNA_EMPRESA, FILTRO_EMPRESA, ORIGEN_MGX, columnaIde } from "./mgx-comun";

/** Lo observado de los tipos de comprobante: MGX no copia su maestro. */
const TIPOS_COMPROBANTE: Record<string, string> = {
  "01": "Prefijo RC: recibos de caja (p. ej. «IMPORTACION CARGOS FIJOS»)",
  "02": "Prefijo EG: egresos",
  "04": "Prefijo CB: ingresos de caja (billete, moneda, abonos)",
  "05": "Prefijo NO: notas (descuentos, pagos, ajustes de gasto)",
  "06": "Prefijo ND: pagos varios (anticipos, liquidaciones de contrato)",
  "08": "Prefijo REC: reembolsos de caja menor",
  "10": "Prefijo DP: depreciación",
  "11": "Prefijo CXC: cuentas por cobrar",
  "14": "Prefijo CXP: cuentas por pagar (combustible, servicios, préstamos)",
  "16": "Prefijo NCP: devoluciones en compras y notas de ajuste",
  "17": "Prefijo OL: causación mensual de nómina, seguridad social y provisiones",
  "18": "Prefijo CR: cruces y pagos semanales (el tipo más frecuente)",
  "21": "Prefijo CM: consumos de almacén por vehículo («Consumo Vehiculo 539»)",
  "26": "Prefijo CEJ: cierre de ejercicio anual (per_doc = '13')",
  "30": "Prefijo CIM: cierres mensuales de retención e ICA",
  "31": "Prefijo TR: abonos y traslados",
  "76": "Prefijo CMPC: consumos de vehículo de otro origen",
  "77": "Prefijo CXPT: cuentas por pagar de taller",
};

export const RECURSOS_MGX_CONTABLE: DocRecurso[] = [
  // ── mgx_v_co_movimientos ─────────────────────────────────────────────────
  {
    nombre: "mgx_v_co_movimientos",
    dominio: "mgx",
    titulo: "Movimientos contables de MGX (asientos)",
    resumen:
      "Cada línea de débito o crédito de los comprobantes contables de MGX, con su fecha, cuenta, tercero y centro de costo: la base para gastos, ingresos y saldos por cuenta.",
    granularidad:
      "Una fila = una línea (ítem) de un comprobante contable: una cuenta con su débito o su crédito. Un comprobante tiene varias líneas y sus débitos suman lo mismo que sus créditos.",
    descripcion:
      "Es la vista «vemp0comovimientos» del documento de MGX recreada sobre la copia: cruza cada línea (cuerpo) con su encabezado (cabeza) para traer la fecha, y con el plan de cuentas para traer el nombre y la naturaleza de la cuenta. Gestivo le anexó el ítem, el nombre del tercero, el nombre del centro de costo, la descripción del comprobante, la llave del documento y el ide. No contiene las líneas cuya cuenta no existe en el plan de cuentas ni las 1.149 líneas sin encabezado. No trae nombre del tipo de comprobante: MGX no entrega ese maestro.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    columnaFecha: "fecha",
    volumen:
      "Unos 16,2 millones de líneas en emp0 desde 2002 (~86.000 por mes en 2026). Siempre filtre por fecha: es obligatorio en esta vista y con él una agregación de varios meses tarda alrededor de un segundo.",
    filasAproximadas: 16_200_000,
    filtroObligatorio: {
      columna: "fecha",
      motivo:
        "Son 16 millones de líneas: sin rango de fecha la consulta recorre la tabla entera y no termina a tiempo.",
    },
    columnasPorDefecto: [
      "fecha",
      "tip_doc",
      "num_doc",
      "cod_cta",
      "nom_cta",
      "nat_cue",
      "debito",
      "credito",
      "nit_ter",
      "nom_ter",
      "cod_cos",
      "nom_cos",
      "concepto",
      "ide",
    ],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      ano_doc: { descripcion: "Año contable del comprobante, como texto de cuatro dígitos.", formato: "AAAA" },
      per_doc: {
        descripcion:
          "Período contable (mes) del comprobante, como texto de dos dígitos. El período '13' es el de cierre de ejercicio.",
        formato: "'01' a '12', y '13' para el cierre anual",
      },
      tip_doc: {
        descripcion:
          "Tipo de comprobante. MGX no entrega el maestro con su nombre; lo que se sabe sale del prefijo de num_doc y de las descripciones observadas.",
        valores: TIPOS_COMPROBANTE,
        advertencia:
          "Hay 41 tipos en emp0; los no listados son poco frecuentes y su significado no se pudo observar. Los nombres de esta lista son observados, no oficiales de MGX.",
      },
      num_doc: {
        descripcion: "Número del comprobante, con un prefijo por tipo (CR-, CM-, CXP…).",
        advertencia: "Solo es único junto con ano_doc, per_doc y tip_doc (ver llave_doc).",
      },
      fecha: {
        descripcion: "Fecha del comprobante (del encabezado).",
        formato: "date, día calendario en hora de Colombia",
        advertencia:
          "Puede ser posterior a hoy (comprobantes fechados a futuro) y es NULL en 25 comprobantes antiguos con fecha centinela. Para cifras de un mes use la fecha, no ano_doc/per_doc: casi siempre coinciden, pero el cierre usa el período 13.",
      },
      cod_cta: {
        descripcion:
          "Código de la cuenta contable (PUC colombiano). Las cuentas de movimiento tienen 9 dígitos y empiezan por la clase: 1 activo, 2 pasivo, 3 patrimonio, 4 ingresos, 5 gastos, 6 y 7 costos.",
        relacion: "mgx_v_co_pri_cta.codigo",
        advertencia:
          "Para agrupar por cuenta mayor filtre con like (p. ej. '5105%' gastos de personal); no existe columna de nivel.",
      },
      nom_cta: { descripcion: "Nombre de la cuenta según el plan de cuentas de la misma empresa." },
      nat_cue: {
        descripcion: "Naturaleza de la cuenta: indica qué lado aumenta su saldo.",
        valores: {
          "1": "Débito: activos, gastos y costos (el saldo es débito − crédito)",
          "2": "Crédito: pasivos, patrimonio e ingresos (el saldo es crédito − débito)",
        },
      },
      concepto: {
        descripcion: "Detalle de la línea, en mayúsculas (la vista de MGX lo pasa a mayúsculas).",
        advertencia: "Texto libre; a veces vacío. No sirve para agrupar con confianza.",
      },
      cod_cos: {
        descripcion:
          "Centro de costo de la línea. En La Carolina, para los buses es el número interno del vehículo (p. ej. '539'), el mismo de vehiculos.codigo. Vacío cuando la línea no tiene centro de costo.",
        relacion: "mgx_v_co_pri_cos.codigo",
        advertencia:
          "Que una línea no tenga centro de costo no significa que el gasto no sea de un bus: muchas contrapartidas (inventario, bancos) van sin él.",
      },
      nit_ter: {
        descripcion:
          "Documento del tercero de la línea (NIT de una empresa o cédula de una persona), solo dígitos.",
        relacion: "mgx_v_co_pri_ter.nit",
      },
      doc_rel: {
        descripcion:
          "Documento relacionado, como texto libre: por ejemplo la orden de taller o la factura que originó la línea ('OTD-2026100129').",
      },
      base: {
        descripcion: "Base gravable sobre la que se calculó una retención o un impuesto; 0 en las demás líneas.",
        unidad: "COP",
      },
      porcen: {
        descripcion: "Porcentaje de la retención o del impuesto aplicado sobre base (p. ej. 4, 19, 0,7); 0 en las demás líneas.",
        unidad: "%",
      },
      debito: { descripcion: "Valor débito de la línea; 0 si la línea es crédito.", unidad: "COP" },
      credito: { descripcion: "Valor crédito de la línea; 0 si la línea es débito.", unidad: "COP" },
      norma: {
        descripcion: "Norma contable de la línea. MGX no la documenta.",
        valores: { "1": "Observada en documentos antiguos", "2": "La única observada en 2026", "3": "Muy poco frecuente" },
        advertencia:
          "No se observó un comprobante con líneas en dos normas, pero MGX no lo garantiza. Si suma años con normas distintas, dígalo.",
      },
      item: { descripcion: "Número de la línea dentro del comprobante. Puede ser 0 y repetirse." },
      nom_ter: {
        descripcion: "Nombre del tercero tal como quedó escrito en la línea al contabilizar.",
        advertencia: "Puede diferir del nombre actual en mgx_v_co_pri_ter.",
      },
      nom_cos: {
        descripcion: "Nombre del centro de costo. Para los buses es la placa con guion ('UYN-203').",
      },
      descrip: { descripcion: "Descripción del comprobante completo (del encabezado)." },
      llave_doc: {
        descripcion: "Llave del comprobante: año|período|tipo|número. Une las líneas con su encabezado.",
        formato: "ano_doc|per_doc|tip_doc|num_doc",
        relacion: "mgx_v_co_cabeza.llave_doc",
      },
      ide: columnaIde("co.cuerpo"),
    },
    relaciones: [
      {
        recurso: "mgx_v_co_cabeza",
        mediante: "empresa + llave_doc",
        descripcion: "Encabezado del comprobante: totales, quién lo creó y cuándo se editó.",
      },
      {
        recurso: "mgx_v_co_pri_cta",
        mediante: "empresa + cod_cta = codigo",
        descripcion: "Plan de cuentas: tipo de cuenta y cuentas mayores.",
      },
      {
        recurso: "mgx_v_co_pri_cos",
        mediante: "empresa + cod_cos = codigo",
        descripcion: "Centro de costo; en los buses trae la placa y el propietario.",
      },
      {
        recurso: "vehiculos",
        mediante: "cod_cos = codigo (solo centros de costo de buses)",
        descripcion: "Maestro de buses de Gestivo, desde GEMA.",
      },
      {
        recurso: "mgx_v_co_pri_ter",
        mediante: "empresa + nit_ter = nit",
        descripcion: "Datos del tercero: tipo de documento y si es proveedor, cliente o empleado.",
      },
    ],
    advertencias: [
      "Para el gasto o el ingreso de un período sume débitos y créditos de las cuentas de resultado (clases 4, 5 y 6) con agregar_datos, filtrando fecha con gte y lte. El valor neto de una cuenta es Σdébito − Σcrédito si nat_cue = 1 y Σcrédito − Σdébito si nat_cue = 2.",
      "Excluya el cierre de ejercicio (tip_doc = '26', per_doc = '13') cuando calcule resultados de un año: ese comprobante cancela las cuentas de resultado y deja el año en cero.",
      "Un saldo de balance (clases 1 a 3) es acumulado desde el inicio: hay que sumar todo el histórico hasta la fecha, no solo el período.",
      "Los anulados no se marcan aparte: en emp0 se observa «ANULADO» en la descripción de algunos comprobantes. Si la cifra importa, revíselo.",
      ...ADVERTENCIAS_MGX,
    ],
    noConfundirCon: [
      {
        recurso: "vw_financiera_consolidado",
        diferencia:
          "Es la rentabilidad por bus y mes calculada en Gestivo con GEMA más un archivo contable. Aquí está la contabilidad completa de MGX, línea por línea; las cifras no tienen por qué coincidir.",
      },
      {
        recurso: "mgx_v_in_movimientos",
        diferencia:
          "Allí están los documentos de inventario (salidas, entradas, órdenes de taller) con cantidades y referencias. Aquí, su efecto en pesos en la contabilidad (por ejemplo el tipo 21, consumos por vehículo).",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuánto se gastó en sueldos por mes en 2026?",
        como: "agregar_datos con filtros fecha gte '2026-01-01', fecha lte '2026-12-31' y cod_cta like '5105%'; agrupar_por fecha truncada a mes; métricas sum debito y sum credito. Neto = débito − crédito.",
      },
      {
        pregunta: "¿Cuánto se le cargó a un bus en el mes?",
        como: "agregar_datos con cod_cos = número interno del bus, rango de fecha, agrupar_por cod_cta y nom_cta, sum debito y sum credito. Diga que es lo contabilizado con ese centro de costo en MGX.",
      },
      {
        pregunta: "¿Qué se le pagó a un proveedor?",
        como: "Resuelva el NIT en mgx_v_co_pri_ter (nombre con ilike) y luego consulte esta vista con nit_ter = ese NIT y rango de fecha.",
      },
    ],
  },

  // ── mgx_v_co_cabeza ──────────────────────────────────────────────────────
  {
    nombre: "mgx_v_co_cabeza",
    dominio: "mgx",
    titulo: "Encabezados de comprobantes contables de MGX",
    resumen:
      "Un comprobante contable de MGX por fila: tipo, número, fecha, descripción, totales y quién lo creó o editó.",
    granularidad: "Una fila = un comprobante contable (encabezado). Sus líneas están en mgx_v_co_movimientos.",
    descripcion:
      "Es la vista «vemp0cocabeza» del documento de MGX, con los totales de débito y crédito, la llave del documento y el ide anexados por Gestivo. Sirve para contar comprobantes, ver quién los creó y cuándo se editaron, y obtener su llave sin recorrer las líneas.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    columnaFecha: "fecha",
    volumen: "Unos 426.000 comprobantes en emp0 desde 2002; ~1.800 por mes en 2026.",
    columnasPorDefecto: [
      "ano_doc",
      "per_doc",
      "tip_doc",
      "num_doc",
      "fecha",
      "descrip",
      "tot_deb",
      "tot_cre",
      "usercreo",
      "fhedicion",
      "ide",
    ],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      ano_doc: { descripcion: "Año contable, texto de cuatro dígitos.", formato: "AAAA" },
      per_doc: { descripcion: "Período contable (mes); '13' es el cierre anual.", formato: "'01' a '13'" },
      tip_doc: {
        descripcion: "Tipo de comprobante (ver mgx_v_co_movimientos.tip_doc para lo observado de cada código).",
        valores: TIPOS_COMPROBANTE,
      },
      num_doc: { descripcion: "Número del comprobante, con prefijo por tipo." },
      fecha: {
        descripcion: "Fecha del comprobante.",
        formato: "date, hora de Colombia",
        advertencia: "NULL en 25 comprobantes antiguos y posterior a hoy en algunos fechados a futuro.",
      },
      descrip: { descripcion: "Descripción del comprobante escrita en MGX." },
      usercreo: { descripcion: "Usuario de MGX que creó el comprobante (nombre de usuario, no persona verificada)." },
      fhedicion: {
        descripcion: "Momento de la última edición en MGX; NULL si nunca se editó.",
        formato: "timestamp sin zona, hora de Colombia",
        advertencia: "En unos 200.000 comprobantes antiguos MGX tenía una fecha centinela, que aquí es NULL.",
      },
      fhcreacion: { descripcion: "Momento en que se creó el comprobante en MGX.", formato: "timestamp sin zona, hora de Colombia" },
      tot_deb: { descripcion: "Suma de los débitos del comprobante.", unidad: "COP" },
      tot_cre: { descripcion: "Suma de los créditos del comprobante; en un comprobante cuadrado es igual a tot_deb.", unidad: "COP" },
      llave_doc: {
        descripcion: "Llave del comprobante: año|período|tipo|número.",
        formato: "ano_doc|per_doc|tip_doc|num_doc",
        relacion: "mgx_v_co_movimientos.llave_doc",
      },
      ide: columnaIde("co.cabeza"),
    },
    relaciones: [
      {
        recurso: "mgx_v_co_movimientos",
        mediante: "empresa + llave_doc",
        descripcion: "Líneas del comprobante, con cuenta, tercero y centro de costo.",
      },
    ],
    advertencias: [
      "Para totales en pesos use las líneas (mgx_v_co_movimientos): tot_deb y tot_cre son del comprobante entero y no dicen a qué cuentas fue el dinero.",
      ...ADVERTENCIAS_MGX,
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos comprobantes de cada tipo se hicieron en septiembre?",
        como: "agregar_datos con fecha entre '2026-09-01' y '2026-09-30', agrupar_por tip_doc, count.",
      },
    ],
  },

  // ── mgx_v_co_pri_cta ─────────────────────────────────────────────────────
  {
    nombre: "mgx_v_co_pri_cta",
    dominio: "mgx",
    titulo: "Plan de cuentas de MGX",
    resumen: "Las cuentas contables de cada empresa (PUC), con su nombre, si son de movimiento o título y su naturaleza.",
    granularidad: "Una fila = una cuenta contable de una empresa (desde la clase de un dígito hasta la subcuenta de nueve).",
    descripcion:
      "Es la vista «vemp0copri_cta» del documento de MGX, con el estado, la norma y el ide anexados. La jerarquía está en el propio código: '5' gastos, '51' operacionales de administración, '5105' gastos de personal, '510506' sueldos, '510506001' sueldos (cuenta de movimiento).",
    origen: ORIGEN_MGX,
    identificador: "ide",
    volumen: "Unas 1.500 cuentas en emp0.",
    columnasPorDefecto: ["codigo", "nombre", "tipo", "nat_cue", "estado", "ide"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      codigo: {
        descripcion: "Código de la cuenta. Su longitud da el nivel: 1 clase, 2 grupo, 4 cuenta, 6 subcuenta, 9 auxiliar.",
        relacion: "mgx_v_co_movimientos.cod_cta",
      },
      nombre: { descripcion: "Nombre de la cuenta. Las de título vienen en mayúsculas y las de movimiento a menudo en minúsculas." },
      tipo: {
        descripcion: "Si la cuenta recibe movimientos o solo agrupa a otras.",
        valores: {
          "1": "De movimiento (auxiliar de 9 dígitos): las líneas contables usan estas",
          "2": "De título o mayor (1 a 6 dígitos): solo agrupa",
        },
      },
      nat_cue: {
        descripcion: "Naturaleza de la cuenta.",
        valores: { "1": "Débito (activos, gastos, costos)", "2": "Crédito (pasivos, patrimonio, ingresos)" },
      },
      estado: {
        descripcion: "Bandera de MGX. Observado: casi siempre 1 en las cuentas de movimiento y 0 en las de título (757 y 770 en emp0). MGX no la documenta.",
        valores: ["0", "1"],
        advertencia: "No la lea como «cuenta activa o inactiva» sin confirmarlo.",
      },
      norma: {
        descripcion: "Norma contable de la cuenta (ver mgx_v_co_movimientos.norma). Casi todas están en 2.",
        valores: ["1", "2", "3"],
      },
      ide: columnaIde("co.pri_cta"),
    },
    advertencias: [
      "El nivel en MGX (columna nivel de la tabla original) vale 0 en todas las cuentas y no se expone: use la longitud del código.",
      ...ADVERTENCIAS_MGX,
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué cuentas hay de gastos de personal?",
        como: "consultar_datos con filtro codigo like '5105%' y tipo = 1.",
      },
    ],
  },

  // ── mgx_v_co_pri_cos ─────────────────────────────────────────────────────
  {
    nombre: "mgx_v_co_pri_cos",
    dominio: "mgx",
    titulo: "Centros de costo de MGX (incluye un centro por bus)",
    resumen:
      "Los centros de costo contables de cada empresa. En La Carolina cada bus es un centro de costo cuyo código es su número interno y cuyo nombre es su placa.",
    granularidad: "Una fila = un centro de costo de una empresa.",
    descripcion:
      "Es la vista «vemp0copri_cos» del documento de MGX, a la que Gestivo anexó tipo, ruta, interno, propietario, activo, la placa sin guion y el ide. En emp0 los de tipo 2 son los buses (541): todos los 203 buses del maestro de vehículos de Gestivo están aquí con el mismo código. Los de tipo 1 son áreas de la empresa (jurídica, casino…).",
    origen: ORIGEN_MGX,
    identificador: "ide",
    volumen: "Unos 670 centros en emp0.",
    columnasPorDefecto: ["codigo", "nombre", "placa", "tipo", "ruta", "nit_pre", "activo", "ide"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      codigo: {
        descripcion: "Código del centro de costo. Para los buses es el número interno del vehículo.",
        relacion: "vehiculos.codigo",
      },
      nombre: { descripcion: "Nombre del centro. Para los buses, la placa con guion ('UYN-203')." },
      tipo: {
        descripcion: "Clase de centro de costo. Valores observados en emp0; MGX no los documenta.",
        valores: {
          "0": "Otros (6 casos: socios, buses externos)",
          "1": "Áreas y unidades de la empresa",
          "2": "Vehículos (buses)",
        },
      },
      ruta: {
        descripcion: "Código de ruta asignado al centro en MGX; vacío en la mayoría.",
        valores: ["01", "02", "03"],
        advertencia: "No está confirmado que coincida con las rutas de GEMA; para la ruta de un bus use vehiculos.",
      },
      interno: { descripcion: "Bandera numérica de MGX sin significado documentado (0, 1 o 2)." },
      nit_pre: {
        descripcion:
          "Documento del responsable del centro. En los buses es la cédula o NIT del propietario (442 de 539 coinciden con el maestro de propietarios de Gestivo).",
        relacion: "propietarios.cedula",
      },
      activo: { descripcion: "Bandera de MGX: 1 activo, 0 inactivo.", valores: { "0": "Inactivo", "1": "Activo" } },
      placa: {
        descripcion:
          "Placa sin guion, derivada por Gestivo del nombre cuando tiene forma de placa (tres letras y tres números). NULL en los demás centros.",
        relacion: "vehiculos.placa",
        advertencia:
          "En 7 buses la placa de MGX no coincide con la del maestro de vehículos (cambio de placa): para cruzar use codigo, no placa.",
      },
      ide: columnaIde("co.pri_cos"),
    },
    relaciones: [
      { recurso: "vehiculos", mediante: "codigo = codigo", descripcion: "Maestro de buses de Gestivo." },
      { recurso: "propietarios", mediante: "nit_pre = cedula", descripcion: "Propietario del bus en GEMA." },
      {
        recurso: "mgx_v_co_movimientos",
        mediante: "empresa + codigo = cod_cos",
        descripcion: "Asientos contables cargados al centro de costo.",
      },
    ],
    advertencias: ADVERTENCIAS_MGX,
  },

  // ── mgx_v_co_pri_ter ─────────────────────────────────────────────────────
  {
    nombre: "mgx_v_co_pri_ter",
    dominio: "mgx",
    titulo: "Terceros de MGX (proveedores, clientes y empleados)",
    resumen:
      "Las personas y empresas con las que cada empresa tiene movimientos contables: NIT o cédula, nombre, tipo de documento y si son proveedor, cliente o empleado.",
    granularidad: "Una fila = un tercero de una empresa, identificado por nit.",
    descripcion:
      "Es la vista «vemp0pri_ter» del documento de MGX, con el tipo de documento, las banderas de rol, la fecha de ingreso, el móvil y el ide anexados por Gestivo. Un empleado o conductor aparece como tercero con su cédula en nit.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    volumen: "Unos 6.700 terceros en emp0, la mitad empleados.",
    columnasPorDefecto: ["nit", "nombre", "cod_tid", "tip_per", "prove", "cliente", "empleado", "cod_ciu", "estado", "ide"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      nit: {
        descripcion: "NIT de la empresa o cédula de la persona, solo dígitos y sin dígito de verificación.",
        relacion: "conductores_con_grupo.cedula",
        advertencia: "Solo es la cédula de un conductor cuando empleado = 1; un proveedor tiene su NIT.",
      },
      nombre: { descripcion: "Nombre o razón social del tercero." },
      direccion: { descripcion: "Dirección del tercero.", sensible: true },
      telefonos: { descripcion: "Teléfonos del tercero.", sensible: true },
      correo: { descripcion: "Correo electrónico del tercero.", sensible: true },
      fax: { descripcion: "Fax del tercero; casi siempre vacío.", sensible: true },
      cod_ciu: {
        descripcion: "Código de ciudad de MGX ('0125' es el más frecuente). MGX no entrega el maestro de ciudades.",
      },
      apa_aer: { descripcion: "Apartado aéreo; casi siempre vacío." },
      representante: { descripcion: "Representante legal escrito en MGX; casi siempre vacío." },
      estado: {
        descripcion: "Bandera de MGX sin significado documentado: 0 en unos 5.400 terceros y 1 en unos 1.300.",
        valores: ["0", "1"],
        advertencia: "NO indica si el tercero está vigente: hay empleados activos con estado 0.",
      },
      prod_ser: { descripcion: "Producto o servicio que ofrece el proveedor, texto libre; casi siempre vacío." },
      cod_tid: {
        descripcion: "Tipo de documento según los códigos de la DIAN.",
        valores: {
          "13": "Cédula de ciudadanía",
          "31": "NIT",
          "22": "Cédula de extranjería",
          "41": "Pasaporte",
          "11": "Registro civil",
          "12": "Tarjeta de identidad",
          "21": "Tarjeta de extranjería",
          "43": "Sin identificación del exterior",
        },
        advertencia: "También aparecen '01' y '02' (37 casos), que no son códigos DIAN.",
      },
      tip_per: {
        descripcion: "Tipo de persona en MGX: 0, 1 o 2. MGX no lo documenta y no coincide del todo con cod_tid.",
        valores: ["0", "1", "2"],
      },
      prove: { descripcion: "1 si el tercero es proveedor.", valores: { "0": "No", "1": "Sí" } },
      cliente: { descripcion: "1 si el tercero es cliente.", valores: { "0": "No", "1": "Sí" } },
      empleado: { descripcion: "1 si el tercero es empleado (en emp0, unos 3.300).", valores: { "0": "No", "1": "Sí" } },
      afiliado: {
        descripcion: "Bandera de afiliado de MGX; solo un tercero la tiene en emp0.",
        advertencia: "No sirve para saber quién es propietario afiliado: use propietarios.",
      },
      fec_ing: { descripcion: "Fecha en que se registró el tercero; NULL en muchos.", formato: "date" },
      tel_movil: { descripcion: "Teléfono móvil del tercero.", sensible: true },
      ide: columnaIde("co.pri_ter"),
    },
    relaciones: [
      {
        recurso: "mgx_v_co_movimientos",
        mediante: "empresa + nit = nit_ter",
        descripcion: "Movimientos contables del tercero.",
      },
      {
        recurso: "conductores_con_grupo",
        mediante: "nit = cedula (cuando empleado = 1)",
        descripcion: "Ficha del conductor en Gestivo.",
      },
    ],
    advertencias: ADVERTENCIAS_MGX,
  },
];
