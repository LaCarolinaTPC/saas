// Catálogo semántico: nómina y empleados de MGX (líneas de nómina liquidada,
// períodos, conceptos, catálogos y maestro de empleados). Verificado contra
// supabase/migrations/20261021193546_tablas_espejo_de_mgx.sql,
// supabase/migrations/20261022183940_vistas_de_mgx_para_el_mcp.sql,
// src/lib/mgx/{catalogo,esquema}.ts y docs/mgx-sincronizacion.md. El
// documento de MGX solo dice «nomina: nóminas liquidadas»; los significados
// de códigos y banderas son lo observado en la copia el 2026-10-22 (emp0).

import type { DocColumna, DocRecurso } from "./tipos";
import { ADVERTENCIAS_MGX, COLUMNA_EMPRESA, FILTRO_EMPRESA, ORIGEN_MGX, columnaIde } from "./mgx-comun";

const GRUPOS_PAGO: Record<string, string> = {
  "001": "ADMINISTRACION",
  "002": "CONDUCTORES",
  "003": "OTROS",
  "004": "LIQUIDACION CONDUCTORES",
  "005": "CONDUCTORES REUBICADOS",
  "006": "CONDUCTOR TEMPORAL",
};

const TIPOS_CONCEPTO: Record<string, string> = {
  "1": "Devengado (salario, horas extras, recargos, otros devengados)",
  "2": "Deducción (salud, pensión, préstamos, descuentos); su valor viene NEGATIVO",
  "3": "Separador o título («<<<< DESCUENTOS >>>>», «otros devengados.»)",
  "4": "Provisión o aporte del empleador (cesantías, prima, vacaciones, salud, pensión)",
  "5": "Parafiscal (caja de compensación, SENA, ICBF)",
  "6": "ARL",
};

const SALARIO: DocColumna = {
  descripcion: "Salario básico mensual del empleado registrado en MGX.",
  unidad: "COP por mes",
  sensible: true,
};

const NOMINA_SOLO_LIQUIDADA =
  "Solo trae la nómina quincenal liquidada: comprobantes de tipo '03' (prefijo NM-) y conceptos de tipo 1 (devengados) y 2 (deducciones). NO están las liquidaciones finales de contrato (LQ-), las vacaciones (LV-), las incapacidades y licencias (IC-), ni las provisiones y aportes del empleador (conceptos de tipo 4 a 6): esa información está en MGX pero esta vista, que replica la de MGX, la deja fuera.";

export const RECURSOS_MGX_NOMINA: DocRecurso[] = [
  // ── mgx_v_no_nomina ──────────────────────────────────────────────────────
  {
    nombre: "mgx_v_no_nomina",
    dominio: "mgx",
    titulo: "Nómina quincenal liquidada en MGX (por empleado y concepto)",
    resumen:
      "Cada concepto liquidado a cada empleado en cada nómina quincenal de MGX: devengados en positivo y deducciones en negativo, con período, grupo de pago, cargo y departamento.",
    granularidad:
      "Una fila = un concepto (devengado o deducción) liquidado a un empleado en un comprobante de nómina quincenal. Un empleado tiene muchas filas por quincena.",
    descripcion:
      "Es la vista «nomina» del documento de MGX (nóminas liquidadas) recreada sobre la copia, a la que Gestivo anexó año y período contable, llave del documento, tipo de concepto, cargo y departamento reales y el ide. Cada quincena hay un comprobante por grupo de pago (administrativa, conductores, reubicados).",
    origen: ORIGEN_MGX,
    identificador: "ide",
    columnaFecha: "fecha",
    volumen:
      "Unas 870.000 filas en emp0 desde 2006; un comprobante por grupo de pago cada quincena (unas seis por mes).",
    filasAproximadas: 870_000,
    columnasPorDefecto: [
      "fecha",
      "num_doc",
      "nom_per",
      "cod_epl",
      "nom_epl",
      "cod_con",
      "nom_con",
      "tip_con",
      "cantbasepor",
      "valor",
      "nom_gpa",
      "nom_cargo",
      "ide",
    ],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      num_doc: { descripcion: "Número del comprobante de nómina (prefijo NM-). Un comprobante = una quincena de un grupo de pago." },
      fecha: {
        descripcion: "Fecha del comprobante de nómina; en la quincenal es el último día de la quincena (15 o fin de mes).",
        formato: "date, hora de Colombia",
      },
      cod_epl: {
        descripcion: "Cédula del empleado (es su código en MGX), solo dígitos.",
        relacion: "mgx_v_rh_empleados.codigo",
      },
      nom_epl: { descripcion: "Nombre completo del empleado según el maestro de MGX." },
      sueldo: { ...SALARIO, advertencia: "Es el salario actual del maestro, no el que tenía en esa quincena." },
      cod_con: { descripcion: "Código del concepto de nómina.", relacion: "mgx_v_no_conceptos.codigo" },
      nom_con: { descripcion: "Nombre del concepto (p. ej. «Salud 4%», «Horas extras diurnas (f)», «Otros devengados N»)." },
      cantbasepor: {
        descripcion:
          "Cantidad, base o porcentaje del concepto, según el concepto: horas en las horas extras y recargos, la base en pesos en salud y pensión, días en los conceptos por días.",
        advertencia: "Mezcla unidades distintas: no la sume entre conceptos.",
      },
      valor: {
        descripcion: "Valor liquidado del concepto. Positivo en los devengados y negativo en las deducciones.",
        unidad: "COP",
        advertencia:
          "La suma de valor de un empleado en un comprobante es su neto de la quincena (devengado menos deducciones). Para «total devengado» sume solo tip_con = 1; para «total deducido», tip_con = 2 y cambie el signo.",
      },
      cod_per: { descripcion: "Código del período de nómina.", relacion: "mgx_v_no_periodos.codigo" },
      nom_per: { descripcion: "Nombre del período («NOMINA PRIMERA QUINCENA DE OCTUBRE 2026 CONDUCTORES»)." },
      est_per: {
        descripcion: "Estado del período (ver mgx_v_no_periodos.est_per).",
        valores: { "2": "Reciente (desde 2025-03-30)", "3": "Antiguo, cerrado (hasta 2025-03-15)", "4": "Residual" },
      },
      feciniper: { descripcion: "Primer día del período.", formato: "date" },
      fecfinper: { descripcion: "Último día del período.", formato: "date" },
      cod_gpa: { descripcion: "Grupo de pago del período.", valores: GRUPOS_PAGO },
      nom_gpa: { descripcion: "Nombre del grupo de pago." },
      cod_epr: { descripcion: "Empresa de nómina del empleado; en emp0 solo existe '001'." },
      nom_epr: { descripcion: "Nombre de la empresa de nómina (en emp0, METROPOLITANA DE TRANSPORTES LA CAROLINA S.A.S)." },
      nit: { descripcion: "NIT de la empresa de nómina (en emp0, 800129395)." },
      horas: { descripcion: "Horas del concepto; casi siempre 0 (las horas suelen venir en cantbasepor).", unidad: "horas" },
      nom_car: {
        descripcion: "Nombre del DEPARTAMENTO del empleado, aunque la columna se llame «car».",
        advertencia: "Así viene en la vista de MGX. Para el cargo use nom_cargo; para el departamento, nom_dpt (mismo valor).",
      },
      observa: { descripcion: "Observación de la liquidación del empleado en ese comprobante, si la hay." },
      nom_est: { descripcion: "Nombre del estado del empleado en la liquidación; NULL en emp0, donde el maestro de estados está vacío." },
      est_emp: { descripcion: "Estado del empleado guardado en la línea de nómina (ver mgx_v_rh_empleados.est_emp)." },
      ano_doc: { descripcion: "Año contable del comprobante.", formato: "AAAA" },
      per_doc: { descripcion: "Período contable (mes) del comprobante.", formato: "'01' a '12'" },
      llave_doc: { descripcion: "Llave del comprobante: año|período|tipo|número.", formato: "ano_doc|per_doc|tip_doc|num_doc" },
      tip_con: { descripcion: "Tipo del concepto: aquí solo 1 o 2.", valores: { "1": TIPOS_CONCEPTO["1"], "2": TIPOS_CONCEPTO["2"] } },
      cod_car: { descripcion: "Código del cargo actual del empleado." },
      nom_cargo: {
        descripcion: "Nombre del cargo actual del empleado (p. ej. CONDUCTOR, SECRETARIA).",
        advertencia: "Es el cargo de hoy en el maestro, no necesariamente el que tenía en esa quincena.",
      },
      cod_dpt: { descripcion: "Código del departamento actual del empleado." },
      nom_dpt: { descripcion: "Nombre del departamento actual del empleado (DEPTO. OPERATIVO, DEPTO. DE MANTENIMIENTO…)." },
      ide: columnaIde("no.cuerpo"),
    },
    relaciones: [
      {
        recurso: "mgx_v_rh_empleados",
        mediante: "empresa + cod_epl = codigo",
        descripcion: "Ficha del empleado en MGX: ingreso, retiro, estado y entidades de seguridad social.",
      },
      {
        recurso: "conductores_con_grupo",
        mediante: "cod_epl = cedula",
        descripcion: "Ficha del conductor en Gestivo.",
      },
      { recurso: "mgx_v_no_periodos", mediante: "empresa + cod_per = codigo", descripcion: "Fechas del período y de pago." },
      { recurso: "mgx_v_no_conceptos", mediante: "empresa + cod_con = codigo", descripcion: "Tipo y cuenta contable del concepto." },
    ],
    advertencias: [
      NOMINA_SOLO_LIQUIDADA,
      "La vista cruza con INNER JOIN el empleado, su departamento, su empresa de nómina, el concepto y el período: si en MGX falta alguno de esos maestros, la línea no aparece.",
      "Cargo, departamento, nombre y sueldo son los ACTUALES del maestro de empleados, no los de la fecha de la nómina.",
      "Contiene lo que se paga a cada persona: responda con totales por grupo, mes o concepto, y dé cifras individuales solo si el usuario pregunta por esa persona.",
      ...ADVERTENCIAS_MGX,
    ],
    noConfundirCon: [
      {
        recurso: "cierres_diarios",
        diferencia:
          "Allí está la producción diaria del conductor según GEMA. Aquí, lo que la nómina de MGX le liquidó por quincena; el producido entra a la nómina por otros comprobantes que esta vista no trae.",
      },
      {
        recurso: "devengados_entregas",
        diferencia:
          "Allí están las entregas de «otros devengados» en caja de Tesorería. Aquí, los conceptos de nómina de MGX, entre ellos «Otros devengados N»; no son el mismo registro.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuánto costó la nómina de conductores en septiembre de 2026?",
        como: "agregar_datos con fecha entre '2026-09-01' y '2026-09-30', cod_gpa = '002' y tip_con = 1; sum valor. Aclare que es devengado de la nómina quincenal, sin aportes ni provisiones del empleador.",
      },
      {
        pregunta: "¿Cuál fue el neto pagado a un conductor en la última quincena?",
        como: "consultar_datos con cod_epl = su cédula y la fecha de la quincena; sume valor (las deducciones ya vienen negativas).",
      },
      {
        pregunta: "¿Qué conceptos pesan más en la nómina?",
        como: "agregar_datos con rango de fecha, agrupar_por nom_con y tip_con, sum valor, orden metrica_desc.",
      },
    ],
  },

  // ── mgx_v_no_periodos ────────────────────────────────────────────────────
  {
    nombre: "mgx_v_no_periodos",
    dominio: "mgx",
    titulo: "Períodos de nómina de MGX",
    resumen: "Cada período de nómina de MGX: quincena, grupo de pago, fechas de inicio, fin y pago, y su estado.",
    granularidad: "Una fila = un período de nómina de un grupo de pago (una quincena de administrativos, otra de conductores…).",
    descripcion:
      "Vista de Gestivo sobre el maestro de períodos de nómina de MGX, con el nombre del grupo de pago. En 2026 hay un período por quincena para cada grupo: administrativa (001), conductores (002) y reubicados (005).",
    origen: ORIGEN_MGX,
    identificador: "ide",
    columnaFecha: "fec_fin",
    volumen: "Unos 1.000 períodos en emp0 desde 2007; seis nuevos por mes.",
    columnasPorDefecto: ["codigo", "nombre", "fec_ini", "fec_fin", "fec_pag", "est_per", "cod_gpa", "nom_gpa", "subper", "ide"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      codigo: { descripcion: "Código del período ('01043'), consecutivo.", relacion: "mgx_v_no_nomina.cod_per" },
      nombre: { descripcion: "Nombre del período («NOMINA PRIMERA QUINCENA DE OCTUBRE 2026 CONDUCTORES»)." },
      fec_ini: { descripcion: "Primer día del período.", formato: "date" },
      fec_fin: { descripcion: "Último día del período.", formato: "date" },
      fec_pag: { descripcion: "Fecha de pago del período.", formato: "date" },
      est_per: {
        descripcion: "Estado del período. Valores observados; MGX no los documenta.",
        valores: {
          "2": "Períodos recientes (todos desde 2025-03-30, incluido el actual)",
          "3": "Períodos antiguos (hasta 2025-03-15), presumiblemente cerrados",
          "4": "Ocho casos residuales",
        },
        advertencia: "No use est_per para saber si una quincena ya se pagó: compárela con fec_pag y con la existencia de líneas en mgx_v_no_nomina.",
      },
      liquida: { descripcion: "Bandera de MGX (0, 1 o 2) sin significado documentado; casi todos los períodos tienen 2." },
      prima: { descripcion: "Bandera de MGX (0 o 1) sin significado documentado; vale 1 en períodos antiguos." },
      subper: {
        descripcion: "Quincena dentro del mes, según lo observado.",
        valores: { "1": "Primera quincena", "2": "Segunda quincena" },
      },
      cod_gpa: { descripcion: "Grupo de pago del período.", valores: GRUPOS_PAGO },
      nom_gpa: { descripcion: "Nombre del grupo de pago." },
      cod_tno: { descripcion: "Código de tipo de nómina de MGX ('01' en los períodos recientes); MGX no entrega su maestro." },
      cod_epr: { descripcion: "Empresa de nómina del período; vacío en los recientes." },
      fhe: {
        descripcion: "Momento de la última edición del período en MGX.",
        formato: "timestamp sin zona, hora de Colombia",
      },
      ide: columnaIde("no.pri_per"),
    },
    advertencias: ADVERTENCIAS_MGX,
  },

  // ── mgx_v_no_conceptos ───────────────────────────────────────────────────
  {
    nombre: "mgx_v_no_conceptos",
    dominio: "mgx",
    titulo: "Conceptos de nómina de MGX",
    resumen: "El catálogo de conceptos de nómina (devengados, deducciones, provisiones, aportes) con su tipo y cuenta contable.",
    granularidad: "Una fila = un concepto de nómina de una empresa.",
    descripcion:
      "Vista de Gestivo sobre el maestro de conceptos de nómina de MGX. El tipo dice si el concepto suma, resta o es un aporte del empleador; la cuenta contable dice dónde se contabiliza.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    volumen: "Unos 240 conceptos en emp0, la mitad inactivos.",
    columnasPorDefecto: ["codigo", "nombre", "tipo", "clasec", "activo", "cta_con", "ide"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      codigo: { descripcion: "Código del concepto ('003' salario básico, '501' salud…).", relacion: "mgx_v_no_nomina.cod_con" },
      nombre: { descripcion: "Nombre del concepto." },
      tipo: { descripcion: "Tipo de concepto, según lo observado.", valores: TIPOS_CONCEPTO },
      clasec: {
        descripcion: "Clase del concepto en MGX, según lo observado; MGX no la documenta.",
        valores: {
          "1": "La mayoría (195)",
          "2": "Conceptos por días (vacaciones en días, días no trabajados, extralegales)",
          "3": "Ajustes y retroactivos (ajuste de auxilio, retroactivo, mayor valor pagado)",
        },
      },
      activo: { descripcion: "1 si el concepto está activo en MGX.", valores: { "0": "Inactivo", "1": "Activo" } },
      cta_con: {
        descripcion: "Cuenta contable donde se registra el concepto; vacía en muchos.",
        relacion: "mgx_v_co_pri_cta.codigo",
      },
      nit_ben: { descripcion: "NIT del beneficiario del concepto (por ejemplo, de un descuento a favor de un tercero); casi siempre vacío." },
      fhe: { descripcion: "Momento de la última edición en MGX.", formato: "timestamp sin zona, hora de Colombia" },
      ide: columnaIde("no.pri_con"),
    },
    advertencias: ADVERTENCIAS_MGX,
  },

  // ── mgx_v_no_catalogos ───────────────────────────────────────────────────
  {
    nombre: "mgx_v_no_catalogos",
    dominio: "mgx",
    titulo: "Catálogos de nómina de MGX (cargos, departamentos, grupos de pago, centros de trabajo)",
    resumen:
      "Los maestros chicos de nómina en una sola tabla: cargos, departamentos, grupos de pago, centros de trabajo de la ARL, empresas de nómina y estados de empleado.",
    granularidad: "Una fila = un valor de un catálogo de una empresa; la columna catalogo dice de cuál.",
    descripcion:
      "Vista de Gestivo que une seis maestros de MGX para traducir los códigos de mgx_v_rh_empleados y mgx_v_no_nomina. Filtre siempre por catalogo.",
    origen: ORIGEN_MGX,
    identificador: "id",
    volumen: "Unos 300 valores en emp0.",
    columnasPorDefecto: ["catalogo", "codigo", "nombre", "activo", "riesgo_arl", "id"],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      catalogo: {
        descripcion: "De qué maestro viene la fila.",
        valores: {
          cargo: "Cargos (pri_car): CONDUCTOR, SECRETARIA, GERENTE…",
          departamento: "Departamentos (pri_dpt): DEPTO. OPERATIVO, DEPTO. DE MANTENIMIENTO…",
          grupo_pago: "Grupos de pago (pri_gpa): ADMINISTRACION, CONDUCTORES…",
          centro_trabajo: "Centros de trabajo para la ARL (pri_ctr), con su tarifa de riesgo",
          empresa_nomina: "Empresa de nómina (pri_epr); en emp0 solo una",
          estado_empleado: "Estados de empleado (pri_est); vacío en emp0",
        },
      },
      codigo: { descripcion: "Código dentro del catálogo; solo es único junto con empresa y catalogo." },
      nombre: {
        descripcion: "Nombre del valor.",
        advertencia: "Varios centros de trabajo antiguos dicen «** no utlizar **» en el nombre.",
      },
      activo: {
        descripcion: "Si el valor está activo; NULL en los catálogos que MGX no marca (departamentos, grupos de pago, estados).",
      },
      riesgo_arl: {
        descripcion:
          "Solo en centro_trabajo: tarifa de cotización a la ARL en porcentaje. Los valores observados (0,522, 4,35 y 6,96) son las tarifas de las clases de riesgo I, IV y V.",
        unidad: "%",
      },
      id: { descripcion: "Identificador compuesto empresa|catalogo|ide, porque el ide de MGX se repite entre catálogos." },
    },
    advertencias: ADVERTENCIAS_MGX,
  },

  // ── mgx_v_rh_empleados ───────────────────────────────────────────────────
  {
    nombre: "mgx_v_rh_empleados",
    dominio: "mgx",
    titulo: "Maestro de empleados de MGX (conductores y administrativos)",
    resumen:
      "La ficha de cada persona que ha tenido contrato en MGX: cédula, nombre, ingreso, retiro, estado, cargo, departamento, grupo de pago y entidades de seguridad social.",
    granularidad: "Una fila = una persona (cédula) en una empresa de MGX, activa o retirada.",
    descripcion:
      "Vista de Gestivo sobre el maestro de empleados de MGX (rh.pri_epl, 163 columnas), con las columnas útiles y los nombres de cargo, departamento, grupo de pago y centro de trabajo. Gestivo calcula activo porque MGX marca «sin retiro» con una fecha de retiro futura. En emp0 hay 3.272 fichas y 222 activas; 182 de las activas están en el maestro de conductores de Gestivo.",
    origen: ORIGEN_MGX,
    identificador: "ide",
    columnaFecha: "fec_ing",
    volumen: "Unas 3.300 fichas en emp0, desde 2006.",
    columnasPorDefecto: [
      "codigo",
      "nomcom",
      "est_emp",
      "activo",
      "fec_ing",
      "fec_ret",
      "nom_car",
      "nom_dpt",
      "cod_gpa",
      "nom_gpa",
      "tip_sal",
      "contrato",
      "ide",
    ],
    filtroPorDefecto: FILTRO_EMPRESA,
    columnas: {
      empresa: COLUMNA_EMPRESA,
      codigo: {
        descripcion: "Cédula del empleado (es su código en MGX), solo dígitos.",
        relacion: "conductores_con_grupo.cedula",
      },
      tip_ide: {
        descripcion: "Tipo de documento.",
        valores: { CC: "Cédula de ciudadanía", CE: "Cédula de extranjería", TI: "Tarjeta de identidad" },
        advertencia: "Vacío en 38 fichas.",
      },
      nomcom: { descripcion: "Nombre completo (apellidos y nombres)." },
      nombres: { descripcion: "Primer nombre." },
      nombres2: { descripcion: "Segundo nombre." },
      apellidos: { descripcion: "Primer apellido." },
      apellidos2: { descripcion: "Segundo apellido." },
      sexo: {
        descripcion:
          "Sexo según MGX: 1 en 3.116 fichas, 2 en 139 y 0 en 17. MGX no documenta qué valor es cuál; no lo traduzca sin confirmarlo.",
        valores: ["0", "1", "2"],
      },
      fec_nac: { descripcion: "Fecha de nacimiento.", formato: "date", sensible: true },
      fec_ing: { descripcion: "Fecha de ingreso del contrato vigente o del último contrato.", formato: "date" },
      fec_ret: {
        descripcion: "Fecha de retiro.",
        formato: "date",
        advertencia:
          "MGX pone una fecha FUTURA (2045, 2048, 2060…) a quienes siguen vinculados. Una fecha de retiro no prueba que la persona se fue: use activo. En fichas antiguas puede ser anterior a fec_ing.",
      },
      fec_rein: {
        descripcion: "Fecha de reingreso según MGX; en los ingresos recientes es igual a fec_ing.",
        formato: "date",
      },
      est_emp: {
        descripcion: "Estado del empleado en MGX. Valores observados en emp0; MGX no los documenta.",
        valores: {
          "0": "Ficha sin vinculación (50; sin fecha de ingreso ni sueldo)",
          "1": "Vinculado (230)",
          "2": "Retirado (2.695)",
          "3": "Retirado antiguo (292, ingresos hasta 2012)",
          "4": "Residual (4)",
          "5": "Residual (1)",
        },
      },
      activo: {
        descripcion:
          "Calculado por Gestivo: true si est_emp = 1 y la fecha de retiro es nula o posterior a hoy. Es la forma de contar la plantilla actual en MGX.",
        valores: { true: "Vinculado hoy", false: "No vinculado" },
      },
      cod_car: { descripcion: "Código del cargo ('032' es CONDUCTOR)." },
      nom_car: { descripcion: "Nombre del cargo." },
      cod_dpt: { descripcion: "Código del departamento." },
      nom_dpt: { descripcion: "Nombre del departamento." },
      cod_gpa: { descripcion: "Grupo de pago.", valores: GRUPOS_PAGO, advertencia: "Vacío en 73 fichas." },
      nom_gpa: { descripcion: "Nombre del grupo de pago." },
      cod_ctr: { descripcion: "Centro de trabajo para la ARL (ver mgx_v_no_catalogos, catalogo = centro_trabajo)." },
      nom_ctr: { descripcion: "Nombre del centro de trabajo." },
      cod_cos: { descripcion: "Centro de costo contable del empleado; vacío en casi todas las fichas." },
      cod_epr: { descripcion: "Empresa de nómina; en emp0, '001'." },
      cod_tco: { descripcion: "Código de MGX ('02' en el 94 % de las fichas) sin maestro copiado ni significado documentado." },
      contrato: {
        descripcion: "Bandera de contrato de MGX: 0 en 3.047 fichas, 1 en 224 (incluye los ingresos recientes) y 2 en una. MGX no la documenta.",
        valores: ["0", "1", "2"],
      },
      tip_sal: {
        descripcion: "Tipo de salario de MGX: 2 en 2.019 fichas (los conductores recientes), 1 en 1.088 y 0 en 165. MGX no lo documenta.",
        valores: ["0", "1", "2"],
      },
      sueldo: SALARIO,
      aux_tra: { descripcion: "Bandera o valor de auxilio de transporte en MGX; sin significado documentado.", sensible: true },
      cod_sal: { descripcion: "Código de la EPS en MGX. MGX no entrega el maestro de entidades.", sensible: true },
      cod_pen: { descripcion: "Código del fondo de pensiones en MGX; sin maestro copiado.", sensible: true },
      cod_arp: { descripcion: "Código de la ARL en MGX; sin maestro copiado." },
      cod_caj: { descripcion: "Código de la caja de compensación en MGX; sin maestro copiado." },
      cod_fon: { descripcion: "Código del fondo de cesantías en MGX; sin maestro copiado.", sensible: true },
      relevo: {
        descripcion: "Bandera de relevo de MGX. Vale 0 en todas las fichas de emp0: no sirve para distinguir relevos.",
        advertencia: "Para saber si un conductor es relevo use conductores_con_grupo.tipo_conductor.",
      },
      produccion: { descripcion: "Bandera de MGX (0, 1 o 3); 3 en 29 fichas. Sin significado documentado." },
      cod_ciu: { descripcion: "Código de ciudad de MGX; sin maestro copiado." },
      direccion: { descripcion: "Dirección de residencia.", sensible: true },
      telefonos: { descripcion: "Teléfonos.", sensible: true },
      tel_movil: { descripcion: "Teléfono móvil.", sensible: true },
      correo: { descripcion: "Correo electrónico.", sensible: true },
      fhc: { descripcion: "Momento de creación de la ficha en MGX; NULL en casi todas.", formato: "timestamp sin zona" },
      ide: columnaIde("rh.pri_epl"),
    },
    relaciones: [
      {
        recurso: "conductores_con_grupo",
        mediante: "codigo = cedula",
        descripcion: "Ficha del conductor en Gestivo (desde GEMA): código de conductor, tipo y grupo de antigüedad.",
      },
      { recurso: "mgx_v_no_nomina", mediante: "empresa + codigo = cod_epl", descripcion: "Lo liquidado en cada quincena." },
      { recurso: "mgx_v_co_pri_ter", mediante: "empresa + codigo = nit", descripcion: "El empleado como tercero contable." },
    ],
    advertencias: [
      "Para contar la plantilla vigente en MGX filtre activo = true. No use est_emp solo (incluye vinculados con fecha de retiro pasada) ni fec_ret solo (los vinculados tienen fecha futura).",
      "MGX y GEMA no tienen por qué coincidir: de 222 activos en MGX, 182 están en conductores_con_grupo (los demás son administrativos u otro personal) y de 171 conductores ACTIVO en Gestivo, 167 están en MGX. Si compara plantillas, diga de qué sistema sale cada cifra.",
      "Contiene datos personales y salario: úselos solo si la pregunta los necesita.",
      ...ADVERTENCIAS_MGX,
    ],
    noConfundirCon: [
      {
        recurso: "conductores_con_grupo",
        diferencia:
          "Es el maestro de conductores de GEMA que usa Gestivo para la operación. Este es el de nómina de MGX: incluye administrativos y fichas desde 2006, y su estado sale de la nómina.",
      },
      {
        recurso: "employees",
        diferencia: "Es el personal administrativo registrado en Gestivo. Este es el maestro de MGX, con conductores y administrativos.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántas personas tiene vinculadas La Carolina en nómina, por grupo de pago?",
        como: "agregar_datos con activo = true, agrupar_por nom_gpa, count.",
      },
      {
        pregunta: "¿Cuándo ingresó y se retiró un conductor según la nómina?",
        como: "consultar_datos con codigo = su cédula; lea fec_ing, fec_ret y activo (recuerde que una fec_ret futura significa vinculado).",
      },
    ],
  },
];
