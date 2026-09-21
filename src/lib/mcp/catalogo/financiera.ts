// Catálogo semántico: Financiera · Gestión de flota (rentabilidad por
// vehículo y propietario). Verificado contra
// supabase/migrations/20260921140156_modulo_financiera_consolidado_mensual_y_cargas.sql,
// supabase/migrations/20260921154738_financiera_identificador_de_la_vista_consolidada_para_la_api_externa.sql,
// src/lib/financiera/{motor,analisis,consulta,archivo-contable}.ts,
// docs/Plan_desarrollo_financiera_GESTIVO.md y docs/financiera-fase-{2,3,4,5}.md.

import type { DocRecurso } from "./tipos";

/**
 * La advertencia que gobierna todo el dominio: seis de los quince rubros de
 * costo del modelo no existen en GEMA y llegan por un archivo que carga
 * contabilidad. Sin ese archivo, cualquier cifra de gasto o utilidad está
 * incompleta y decirla sin la salvedad es dar un dato falso.
 */
const TECHO =
  "Si origen_contable = 'sin_dato' (o cobertura_contable no es 'completo'), faltan los seis rubros que no existen en GEMA: despacho, intereses, otros gastos, repuestos, mano de obra y descuento fondo-conductor. En ese caso gastos_operativos_totales está INCOMPLETO, utilidad_neta y rentabilidad son un TECHO (el valor real es menor o igual) y gastos_por_timbrada es un PISO (el real es mayor o igual). Nunca presente esas cifras como definitivas: diga que falta el archivo contable del período.";

const PONDERADO =
  "Para totales de varios vehículos o meses, sume los importes y divida al final (Σ utilidad / Σ ingresos, Σ gastos / Σ timbradas). Nunca promedie las columnas rentabilidad o gastos_por_timbrada: da un número distinto y equivocado, porque pesa igual a un bus con un mes de operación que a uno con doce.";

const AGRUPAR =
  "Agrupe por codigo_vehiculo, nunca por placa: una placa puede pasar de un bus a otro y partiría la historia del vehículo.";

export const RECURSOS_FINANCIERA: DocRecurso[] = [
  // ── vw_financiera_consolidado ──────────────────────────────────────────────
  {
    nombre: "vw_financiera_consolidado",
    dominio: "financiera",
    titulo: "Rentabilidad por vehículo y mes",
    resumen:
      "Producción, costos e indicadores de rentabilidad de cada bus en cada mes: ingresos, los nueve rubros de costo que vienen de GEMA, los seis que llegan por archivo contable, la utilidad, la rentabilidad y el gasto por timbrada.",
    granularidad:
      "Una fila = un período (mes) + un vehículo. Si el bus tuvo dos propietarios en el mes, la fila los suma y propietario_nombre dice 'VARIOS' (la apertura por dueño está en financiera_operativo_mes, que no se expone).",
    descripcion:
      "Es la vista con la que trabaja el módulo Financiera · Gestión de flota, que reemplaza a un aplicativo aparte donde la rentabilidad de la flota se calculaba cargando un Excel de 26 columnas. La producción y nueve rubros de costo se consolidan mes a mes desde ingreso_tercero (el cierre diario de GEMA); los otros seis rubros no existen en GEMA por ninguna vía y los carga contabilidad por archivo. Los indicadores NO están guardados: la vista los calcula con las mismas fórmulas del aplicativo original. No contiene el detalle diario (eso es ingreso_tercero) ni la apertura por propietario.",
    origen:
      "Consolidación diaria desde ingreso_tercero al terminar el cron /api/cron/sync-gema (03:00 hora de Colombia), más el botón «Consolidar ahora» de la aplicación. Los rubros contables se cargan a mano por CSV o Excel. Un mes se congela solo cuando el marcador del sync de GEMA pasa su último día; desde ahí no cambia salvo que el administrador lo reabra.",
    identificador: "id",
    columnaFecha: "periodo",
    volumen:
      "Del orden de 150 vehículos por mes desde 2025-01 (unas 3.000 filas y creciendo ~150 al mes). Filtre por periodo.",
    columnasPorDefecto: [
      "id",
      "periodo",
      "codigo_vehiculo",
      "placa",
      "propietario_nombre",
      "tipo_propietario",
      "viajes",
      "timbradas",
      "ingresos",
      "gastos_operativos_totales",
      "utilidad_neta",
      "rentabilidad",
      "origen_contable",
    ],
    columnas: {
      id: {
        descripcion:
          "Llave de negocio de la fila, 'AAAA-MM|codigo_vehiculo' (por ejemplo '2026-03|500'). Es lo que pide el endpoint de detalle; se puede construir sin consultar nada.",
      },
      periodo: {
        descripcion: "Mes al que corresponde la fila. Es la columna para acotar por fechas.",
        formato: "AAAA-MM (texto, no fecha). El histórico arranca en 2025-01.",
      },
      codigo_vehiculo: {
        descripcion: "Código interno del bus en GEMA. Es la forma correcta de identificar un vehículo.",
        relacion: "vehiculos.codigo",
      },
      propietarios: {
        descripcion: "Cuántos propietarios distintos tuvo el bus ese mes. Normalmente 1; más de 1 si cambió de dueño dentro del mes.",
        unidad: "propietarios",
      },
      cedula_propietario: {
        descripcion: "Cédula o NIT del dueño del bus ese mes.",
        relacion: "propietarios.cedula",
        advertencia: "NULL cuando el bus tuvo más de un dueño en el mes (propietarios > 1).",
      },
      propietario_nombre: {
        descripcion: "Nombre del dueño del bus ese mes.",
        advertencia: "Vale 'VARIOS' cuando el bus cambió de dueño dentro del mes.",
      },
      tipo_propietario: {
        descripcion: "Si el bus es de un afiliado o de la empresa. Es el campo que el aplicativo original llamaba «flota».",
        valores: { AFILIADO: "De un tercero afiliado a la empresa", EMPRESA: "Propio de La Carolina", MIXTO: "Cambió de tipo dentro del mes" },
      },
      placa: {
        descripcion: "Placa del bus el último día con producción del mes.",
        advertencia: "No agrupe por placa: use codigo_vehiculo. Una placa puede cambiar de bus.",
      },
      placa_cambio: { descripcion: "true si el bus tuvo más de una placa dentro del mes." },
      placa_maestro: { descripcion: "Placa que tiene el bus hoy en el maestro de vehículos, que puede diferir de la del mes." },
      modelo: { descripcion: "Año del modelo del bus.", formato: "AAAA" },
      estado_vehiculo: {
        descripcion: "Estado del bus en el maestro de GEMA, tal cual llega.",
        valores: { "1": "Activo", "0": "No activo (u otro valor no documentado)" },
        advertencia: "Puede ser NULL si el código no está en el maestro. Use vehiculo_activo, que ya lo interpreta.",
      },
      vehiculo_activo: {
        descripcion: "true si el bus sigue activo en el maestro hoy.",
        advertencia:
          "Es el estado de HOY, no el del período. Los retirados SÍ entran en el consolidado a propósito: su historia cuenta para los totales del pasado. No filtre por esta columna salvo que le pidan «solo los activos».",
      },
      estado_periodo: {
        descripcion: "Si el mes todavía se recalcula o ya está congelado.",
        valores: {
          abierto: "GEMA aún no cerró el mes: las cifras pueden moverse en la siguiente corrida",
          cerrado: "El marcador del sync pasó el último día del mes: congelado",
          reabierto: "El administrador lo reabrió con motivo; vuelve a recalcularse",
        },
      },
      cerrado_at: { descripcion: "Cuándo se congeló el período.", formato: "timestamptz UTC" },
      viajes: { descripcion: "Viajes del bus en el mes, sumados del cierre diario de GEMA.", unidad: "viajes" },
      timbradas: {
        descripcion: "Pasajeros timbrados en el mes.",
        unidad: "pasajeros",
        advertencia: "Es `timbradas`, no `timbradas_cu`: son distintas (~6 % de diferencia) y el modelo usa esta.",
      },
      ingresos: {
        descripcion: "Producido bruto del bus en el mes: la suma de `bruto` de ingreso_tercero. Es el «Ingresos» del modelo.",
        unidad: "COP",
      },
      dias_con_produccion: { descripcion: "Días distintos del mes en que el bus produjo.", unidad: "días" },
      fondo: { descripcion: "Fondo de reposición descontado en el mes (cartulina).", unidad: "COP" },
      poliza: { descripcion: "Póliza descontada en el mes (cartulina).", unidad: "COP" },
      prestamo: { descripcion: "Préstamos descontados en el mes (cartulina).", unidad: "COP" },
      estudio: { descripcion: "Fondo de estudio descontado en el mes (cartulina).", unidad: "COP" },
      salario: { descripcion: "Salario del conductor cargado al bus en el mes.", unidad: "COP" },
      combustible: { descripcion: "Combustible cargado al bus en el mes.", unidad: "COP" },
      rtica: { descripcion: "Retención de industria y comercio. Es el 0,7 % del bruto.", unidad: "COP" },
      admon: {
        descripcion: "Administración: el 2,5 % del bruto.",
        unidad: "COP",
        advertencia:
          "Es el `admon` de ingreso_tercero, NO `cartu_admon`, que es otra cosa (un fijo diario por bus) y vale unas siete veces más. Confundirlos hunde la utilidad de toda la flota.",
      },
      sitra: {
        descripcion: "Concepto SITRA.",
        unidad: "COP",
        advertencia: "Vale 0 en todo el histórico: el concepto ya no se cobra. Se conserva por paridad con el modelo original.",
      },
      fet: {
        descripcion: "Fondo de estabilización tarifaria descontado por GEMA.",
        unidad: "COP",
        advertencia: "INFORMATIVO: no entra en gastos_operativos_totales ni en la utilidad. El modelo del aplicativo no lo resta.",
      },
      valor_camb: { descripcion: "Concepto CAMB de GEMA.", unidad: "COP", advertencia: "Informativo: no entra en la utilidad." },
      incentivo_c: { descripcion: "Incentivo al conductor pagado por GEMA.", unidad: "COP", advertencia: "Informativo: no entra en la utilidad." },
      valor_descuentos: { descripcion: "Otros descuentos de GEMA.", unidad: "COP", advertencia: "Informativo: no entra en la utilidad." },
      despacho: {
        descripcion: "Costo de despacho del mes. Viene del archivo contable, no de GEMA.",
        unidad: "COP",
        advertencia: "0 cuando origen_contable = 'sin_dato': ahí significa «no hay dato», no «no gastó».",
      },
      intereses: {
        descripcion: "Intereses del mes. Viene del archivo contable.",
        unidad: "COP",
        advertencia: "Es el único rubro tratado como financiero: las columnas *_operativo lo excluyen.",
      },
      otros_gastos: { descripcion: "Otros gastos del mes. Viene del archivo contable.", unidad: "COP" },
      repuestos: { descripcion: "Repuestos del mes, en bruto. Viene del archivo contable.", unidad: "COP" },
      mano_de_obra: { descripcion: "Mano de obra de mantenimiento del mes. Viene del archivo contable.", unidad: "COP" },
      desc_fondo_conductor: {
        descripcion: "Descuento del fondo del conductor aplicado a los repuestos.",
        unidad: "COP",
        advertencia: "Se RESTA de repuestos; nunca se suma como gasto. Use repuestos_netos, que ya lo hace.",
      },
      repuestos_netos: { descripcion: "repuestos − desc_fondo_conductor. Es lo que entra en el gasto.", unidad: "COP" },
      celdas_vacias: {
        descripcion: "Cuántas de las seis celdas del archivo contable llegaron vacías y se tomaron como 0.",
        advertencia: "Mayor que 0 avisa que parte del costo pudo quedarse sin informar, aunque la fila cuente como cargada.",
      },
      origen_contable: {
        descripcion: "Si el vehículo-mes tiene cargados los seis rubros contables.",
        valores: { archivo: "Cargados: las cifras están completas", sin_dato: "No cargados: utilidad y rentabilidad son un techo" },
        advertencia: TECHO,
      },
      gastos_gema: { descripcion: "Suma de los nueve rubros que vienen de GEMA (fondo, póliza, préstamo, estudio, salario, combustible, rtica, admon, sitra).", unidad: "COP" },
      gastos_contables: { descripcion: "Suma de los rubros del archivo contable, con repuestos ya netos.", unidad: "COP" },
      gastos_operativos_totales: {
        descripcion: "gastos_gema + gastos_contables. Es el gasto del modelo, con los quince sumandos del Excel original.",
        unidad: "COP",
        advertencia: TECHO,
      },
      utilidad_neta: { descripcion: "ingresos − gastos_operativos_totales.", unidad: "COP", advertencia: TECHO },
      rentabilidad: {
        descripcion: "utilidad_neta / ingresos × 100. Vale 0 cuando no hay ingresos, no da error.",
        unidad: "%",
        advertencia: `${PONDERADO} ${TECHO}`,
      },
      gastos_por_timbrada: {
        descripcion: "gastos_operativos_totales / timbradas: cuánto cuesta cada pasajero. Vale 0 si no hubo timbradas.",
        unidad: "COP por pasajero",
        advertencia: `${PONDERADO} Sin archivo contable es un PISO, no un techo.`,
      },
      utilidad_operativa: { descripcion: "Utilidad antes del componente financiero: utilidad_neta + intereses.", unidad: "COP" },
      rentabilidad_operativa: { descripcion: "Rentabilidad excluyendo los intereses del gasto.", unidad: "%", advertencia: PONDERADO },
      gastos_por_timbrada_operativo: { descripcion: "Gasto por timbrada excluyendo los intereses.", unidad: "COP por pasajero" },
      filas_origen: { descripcion: "Cuántas filas diarias de ingreso_tercero se sumaron para armar el vehículo-mes." },
      operativo_updated_at: { descripcion: "Última consolidación de la parte de GEMA.", formato: "timestamptz UTC" },
      contable_updated_at: { descripcion: "Última carga del archivo contable de esa fila.", formato: "timestamptz UTC" },
    },
    relaciones: [
      {
        recurso: "ingreso_tercero",
        mediante: "to_char(ingreso_tercero.fecha,'YYYY-MM') = periodo y ingreso_tercero.codigo_vehiculo = codigo_vehiculo",
        descripcion: "El detalle diario del que sale la parte operativa de esta vista.",
      },
      {
        recurso: "vehiculos",
        mediante: "vw_financiera_consolidado.codigo_vehiculo = vehiculos.codigo",
        descripcion: "Maestro del bus: placa vigente, modelo y estado.",
      },
      {
        recurso: "propietarios",
        mediante: "vw_financiera_consolidado.cedula_propietario = propietarios.cedula",
        descripcion: "Datos del dueño del bus, cuando hubo uno solo en el mes.",
      },
      {
        recurso: "vw_financiera_flota_mes",
        mediante: "mismo `periodo`",
        descripcion: "Los totales de toda la flota de ese mes, ya ponderados.",
      },
    ],
    advertencias: [
      TECHO,
      PONDERADO,
      AGRUPAR,
      "Los períodos 'abierto' todavía se recalculan: si compara una cifra de hoy con una que dio ayer, mire estado_periodo antes de concluir que algo cambió.",
      "Los vehículos retirados entran a propósito. Excluirlos cambia los totales históricos y no es lo que el negocio quiere salvo que lo pidan.",
      "El campo `liquido` de ingreso_tercero NO es la utilidad y no está en esta vista: no es reproducible. La utilidad del negocio es utilidad_neta.",
    ],
    noConfundirCon: [
      {
        recurso: "ingreso_tercero",
        diferencia:
          "ingreso_tercero es el detalle DIARIO de GEMA por vehículo, conductor, ruta y grupo, con todas las deducciones que hace GEMA. Esta vista es el mes ya consolidado con el modelo financiero del negocio: suma solo las quince partidas del modelo, le añade seis rubros que GEMA no tiene y calcula la utilidad. Para «cuánto ganó el bus» use esta vista; para «qué pasó el día X» use ingreso_tercero.",
      },
      {
        recurso: "cierres_diarios",
        diferencia: "cierres_diarios es la liquidación del CONDUCTOR. Esta vista es la rentabilidad del VEHÍCULO para su dueño.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuál fue la rentabilidad de la flota en un mes?",
        como:
          "Use vw_financiera_flota_mes con periodo eq 'AAAA-MM': ya trae la rentabilidad ponderada. Mire cobertura_contable antes de dar la cifra; si no es 'completo', preséntela como un techo.",
      },
      {
        pregunta: "¿Qué buses perdieron plata en el año?",
        como:
          "Filtre periodo gte 'AAAA-01' y lte 'AAAA-12' y origen_contable eq 'archivo'; agrupe por codigo_vehiculo sumando ingresos y gastos_operativos_totales, y quédese con los que tengan Σingresos − Σgastos < 0. Los de origen_contable 'sin_dato' NO se pueden clasificar: menciónelos aparte.",
      },
      {
        pregunta: "¿Cuánto gastó un bus en mantenimiento?",
        como:
          "Sume repuestos_netos + mano_de_obra con codigo_vehiculo eq X en el rango. Si esas columnas están en 0 mire origen_contable: puede ser que no haya dato, no que no haya gastado.",
      },
      {
        pregunta: "¿Cuánto produce un propietario con todos sus buses?",
        como:
          "Filtre cedula_propietario eq X y sume ingresos y utilidad_neta. Ojo con los meses en que el bus cambió de dueño: ahí cedula_propietario es NULL y la fila no entra; verifíquelo con propietarios > 1.",
      },
    ],
  },

  // ── vw_financiera_flota_mes ────────────────────────────────────────────────
  {
    nombre: "vw_financiera_flota_mes",
    dominio: "financiera",
    titulo: "Totales de la flota por mes",
    resumen:
      "Una fila por mes con los totales de toda la flota: vehículos con movimiento, producción, ingresos, gastos, utilidad y los indicadores ya ponderados.",
    granularidad: "Una fila = un mes de toda la flota.",
    descripcion:
      "Agregado de vw_financiera_consolidado. Los indicadores se calculan sobre las sumas, que es como los presenta el negocio, así que aquí no hay que ponderar nada a mano. Sirve para series mensuales y comparaciones entre períodos.",
    origen: "Misma consolidación que vw_financiera_consolidado: se recalcula con ella.",
    identificador: "periodo",
    columnaFecha: "periodo",
    volumen: "Una fila por mes desde 2025-01: unas 21 filas.",
    columnasPorDefecto: [
      "periodo",
      "estado_periodo",
      "vehiculos",
      "viajes",
      "timbradas",
      "ingresos",
      "gastos_operativos_totales",
      "utilidad_neta",
      "rentabilidad",
      "gastos_por_timbrada",
      "productividad",
      "cobertura_contable",
    ],
    columnas: {
      periodo: { descripcion: "Mes. Identificador de la fila y columna para acotar.", formato: "AAAA-MM (texto)" },
      estado_periodo: {
        descripcion: "Si el mes se sigue recalculando o ya está congelado.",
        valores: { abierto: "Puede moverse", cerrado: "Congelado", reabierto: "Reabierto por el administrador" },
      },
      vehiculos: { descripcion: "Buses con movimiento en el mes.", unidad: "vehículos" },
      vehiculos_activos: { descripcion: "De esos, cuántos siguen activos hoy en el maestro.", unidad: "vehículos" },
      vehiculos_con_contable: { descripcion: "Cuántos tienen cargados los seis rubros del archivo contable.", unidad: "vehículos" },
      viajes: { descripcion: "Viajes de toda la flota en el mes.", unidad: "viajes" },
      timbradas: { descripcion: "Pasajeros timbrados de toda la flota en el mes.", unidad: "pasajeros" },
      ingresos: { descripcion: "Producido bruto de toda la flota en el mes.", unidad: "COP" },
      gastos_gema: { descripcion: "Suma de los nueve rubros de costo que vienen de GEMA.", unidad: "COP" },
      gastos_contables: { descripcion: "Suma de los rubros del archivo contable.", unidad: "COP", advertencia: "0 si el mes no tiene archivo cargado." },
      gastos_operativos_totales: { descripcion: "Gasto total del mes.", unidad: "COP", advertencia: TECHO },
      utilidad_neta: { descripcion: "ingresos − gastos_operativos_totales de toda la flota.", unidad: "COP", advertencia: TECHO },
      intereses: { descripcion: "Intereses del mes, el único rubro financiero.", unidad: "COP" },
      fet: { descripcion: "Fondo de estabilización tarifaria del mes.", unidad: "COP", advertencia: "Informativo: no entra en la utilidad." },
      valor_camb: { descripcion: "Concepto CAMB del mes.", unidad: "COP", advertencia: "Informativo: no entra en la utilidad." },
      incentivo_c: { descripcion: "Incentivos al conductor del mes.", unidad: "COP", advertencia: "Informativo: no entra en la utilidad." },
      valor_descuentos: { descripcion: "Otros descuentos de GEMA en el mes.", unidad: "COP", advertencia: "Informativo: no entra en la utilidad." },
      cobertura_contable: {
        descripcion: "Si el mes tiene el archivo contable de todos sus vehículos.",
        valores: {
          completo: "Todos los vehículos del mes tienen los seis rubros",
          parcial: "Solo algunos: los totales están incompletos",
          sin_dato: "Ninguno: solo se conocen los costos de GEMA",
        },
        advertencia: "Mírelo SIEMPRE antes de dar una cifra de gasto, utilidad o rentabilidad de este recurso.",
      },
      rentabilidad: { descripcion: "Utilidad sobre ingresos de toda la flota, ya ponderada.", unidad: "%", advertencia: TECHO },
      gastos_por_timbrada: { descripcion: "Gasto total dividido por las timbradas del mes, ya ponderado.", unidad: "COP por pasajero", advertencia: "Sin archivo contable es un PISO." },
      productividad: {
        descripcion: "Viajes por vehículo-mes: viajes / vehículos con movimiento.",
        unidad: "viajes por vehículo-mes",
        advertencia:
          "Es el único indicador EXACTO aunque falte el archivo contable, porque sale entero de GEMA. El umbral heredado del aplicativo (excelente ≥ 90, aceptable ≥ 80) es inalcanzable para esta flota, que promedia unos 77: no concluya que la flota va mal solo porque no llega a 90.",
      },
      rentabilidad_operativa: { descripcion: "Rentabilidad del mes excluyendo los intereses.", unidad: "%" },
      gastos_por_timbrada_operativo: { descripcion: "Gasto por timbrada del mes excluyendo los intereses.", unidad: "COP por pasajero" },
    },
    relaciones: [
      {
        recurso: "vw_financiera_consolidado",
        mediante: "mismo `periodo`",
        descripcion: "El detalle por vehículo del que sale este total.",
      },
    ],
    advertencias: [
      TECHO,
      "Los indicadores ya vienen ponderados: no los vuelva a promediar entre meses. Para un acumulado de varios meses, sume ingresos, gastos y utilidad y divida al final.",
      "El acumulado que muestra la aplicación va de enero al mes elegido. Si le piden «el acumulado a agosto», sume los períodos AAAA-01 a AAAA-08, no solo agosto.",
    ],
    noConfundirCon: [
      {
        recurso: "vw_financiera_consolidado",
        diferencia: "Aquel está por vehículo y mes; este ya suma toda la flota. Para «qué bus» use el consolidado; para «cómo va la flota» use este.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cómo evolucionó la rentabilidad mes a mes?",
        como:
          "Traiga periodo, rentabilidad, ingresos, utilidad_neta y cobertura_contable ordenados por periodo. Advierta los meses cuya cobertura no sea 'completo': su rentabilidad es un techo y no se compara con la de un mes completo.",
      },
      {
        pregunta: "¿Cuántos viajes por bus hizo la flota este año?",
        como:
          "Sume viajes y divida por la suma de vehículos de los meses del año (o promedie productividad solo si todos los meses pesan igual). Es exacto: no depende del archivo contable.",
      },
    ],
  },
];
