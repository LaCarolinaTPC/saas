// Guía de negocio del servidor MCP de Gestivo.
//
// Es lo primero que lee un agente de IA antes de consultar datos: qué es
// Gestivo, cómo se reparte la información en dominios, las reglas que valen
// para todos los recursos y el vocabulario del negocio. Todo lo que dice está
// respaldado por el código, las migraciones o los documentos de `docs/`; lo que
// no se pudo confirmar se omite a propósito. Se envía completa al modelo, así
// que cada frase debe ganarse su lugar.

import type { DominioKey, TerminoGlosario } from "./tipos";

/** Qué es Gestivo, a qué empresa sirve y de dónde vienen los datos. */
export const CONTEXTO_NEGOCIO: string = `Gestivo es la plataforma interna de gestión humana y operativa de La Carolina, empresa de transporte de pasajeros en busetas que aparece en los documentos como «Transportes La Carolina» o «La Carolina De Transporte». Según el código, la operación está en Barranquilla y Soledad. Los vehículos recorren rutas con despachos, cobran pasaje y cuentan pasajeros con una registradora. Pueden ser de la empresa o de propietarios afiliados, y a cada conductor se le liquida la producción del día.

Los datos tienen dos orígenes. GEMA es el sistema de operación y recaudo de la empresa: Gestivo lo lee en solo lectura y cada madrugada copia los maestros (conductores, empleados, vehículos, propietarios) y la operación (cierres diarios, viajes perdidos, viajes recaudados, ingresos a terceros, velocidades y puntos virtuales GPS). Gestivo produce lo demás: incapacidades y ausencias, accidentes, reclutamiento y contratación, entregas de caja de tesorería, mantenimiento, documentos del vehículo, riesgo predictivo y campañas de Meta Ads.`;

/** Descripción de cada dominio: qué preguntas responde y qué recursos lo componen. */
export const DOMINIOS: Record<DominioKey, { titulo: string; descripcion: string }> = {
  rotacion: {
    titulo: "Rotación y rendimiento de conductores",
    descripcion:
      "Quién conduce para la empresa, desde cuándo, si sigue activo, cuánto produce cada día y cuántos viajes pierde y por qué. Recursos: conductores_con_grupo (maestro con grupo de antigüedad), cierres_diarios (producción diaria desde GEMA) y viajes_perdidos (viajes con novedad desde GEMA). En la aplicación también abarca rendimiento del día, mapa de calor y alarmas de registradora, que todavía no se exponen.",
  },
  ausentismo: {
    titulo: "Ausentismo e incapacidades",
    descripcion:
      "Dos cosas distintas que no se deben mezclar. (1) Incapacidades médicas certificadas: días perdidos, diagnóstico, origen común o laboral, EPS o ARL que paga y qué se puede cobrar; recurso ausentismo (la matriz EPS, un certificado por fila) con su catálogo ausentismo_catalogos. (2) Ausencias del día a día de los conductores (permisos, faltas no justificadas, incapacidad, vacaciones, taller): recurso ausentismo_registros (un conductor por día), con su catálogo de tipos ausentismo_conceptos y las citaciones a descargos o terminación en ausentismo_notificaciones.",
  },
  accidentabilidad: {
    titulo: "Accidentabilidad vial",
    descripcion:
      "Accidentes reportados por conductores, su gravedad, responsabilidad, reincidencia, correctivo aplicado y paso por comité. Recursos: accidentes (cabecera del reporte), accidente_evaluaciones (una evaluación por accidente), accidente_eventos (historial de estados) y accidente_vehiculos (vehículos involucrados).",
  },
  reclutamiento: {
    titulo: "Reclutamiento, contratación y personal",
    descripcion:
      "Candidatos, vacantes, avance por etapas, contratación de conductores y maestro de empleados. Recursos: candidates, vacancies, candidate_vacancy, stage_history, procesos_contratacion, employees y documents (solo metadatos de archivos). employees es el personal que no es conductor: los conductores están en conductores_con_grupo.",
  },
  rrhh: {
    titulo: "Recursos humanos: familia e incentivos",
    descripcion:
      "Familiares de los trabajadores e incentivos pagados. Recursos: familia (familiares por cédula del trabajador, parentesco y edad) e incentivos (valor, concepto, mes de entrega y periodo por cédula).",
  },
  tesoreria: {
    titulo: "Tesorería: otros devengados",
    descripcion:
      "Dinero entregado en caja a conductores como «otros devengados»: quién recibió cuánto, en qué fecha y quincena, qué se devolvió y qué ya se trasladó a GEMA. Recurso: devengados_entregas. La caja, el análisis quincenal, la liquidación del conductor, el simulador y la auditoría calculan sobre este recurso y cierres_diarios, pero no se exponen.",
  },
  gema: {
    titulo: "Operación y recaudo sincronizados de GEMA",
    descripcion:
      "Telemetría y recaudo que se copian de GEMA: recorrido GPS y pasajeros por punto virtual, viajes recaudados, liquidación de ingresos a terceros por vehículo y maestro de propietarios. Recursos: puntos_virtuales (muy grande; siempre acota por fecha), viajes_recaudados, ingreso_tercero, propietarios y gema_sync_state (qué tan frescos están los datos sincronizados). Además, la operación tal cual la entrega GEMA, cruzable por id_viaje = viajes_recaudados.numero: historico_despacho (todos los viajes programados, despachados o no, con estado y novedad), timbradas_descontadas (cada descuento de pasajeros con su motivo), tickets_transfer, anotaciones_viajes (novedad anotada a cada viaje) y cumplimientos (planilla de tiempos por punto de control). cierres_diarios y viajes_perdidos también vienen de GEMA, pero están en el dominio rotacion.",
  },
  operativo: {
    titulo: "Operativo: vehículos, documentos y velocidad",
    descripcion:
      "Maestro de vehículos (código interno, placa, ruta, propietario), pasajeros que suben y bajan por lugar y hora, excesos de velocidad, vencimientos de documentos del vehículo (SOAT, tecnomecánica, tarjeta de operación y pólizas) y conductores reportados a RRHH por velocidad. Recursos: vehiculos, pv_deltas (subidas y bajadas ya sumables), velocidades, operativo_vehiculo_documentos con su catálogo operativo_documento_tipos, operativo_velocidad_reportes y operativo_velocidad_parametros.",
  },
  mantenimiento: {
    titulo: "Mantenimiento de la flota",
    descripcion:
      "Daños que reportan los conductores por vehículo y concepto, alertas que se abren cuando un daño se repite y bitácora de graduación de frenos. Recursos: mantenimiento_reportes, mantenimiento_alertas, mantenimiento_frenos y el catálogo mantenimiento_conceptos.",
  },
  riesgo: {
    titulo: "Riesgo predictivo de conductores",
    descripcion:
      "Probabilidad estimada de que un conductor se retire en 60 días o tenga una falta no justificada en 30 días, con sus factores principales, calculada en cada corrida nocturna. Son estimaciones de apoyo, no hechos ni sanciones. Recursos: riesgo_corridas (una ejecución del análisis) y riesgo_conductores (puntajes por conductor en cada corrida; filtre siempre por corrida_id).",
  },
  campanas: {
    titulo: "Campañas de reclutamiento en Meta Ads",
    descripcion:
      "Campañas de Meta Ads y su gasto diario, que alimentan el tablero de reclutamiento. Recursos: meta_campaigns y meta_spend_daily.",
  },
  organizacion: {
    titulo: "Estructura organizacional",
    descripcion:
      "Departamentos a los que pertenecen los empleados. Recurso: departments; los departamentos nuevos de GEMA se crean solos al sincronizar empleados.",
  },
};

/** Reglas que aplican a todos los datos. Frases cortas e imperativas. */
export const REGLAS_GENERALES: string[] = [
  "Identifica a las personas por cédula: es texto de solo dígitos sin ceros a la izquierda. No la conviertas a número y crúzala con igualdad exacta, aunque la columna se llame cedula, cedula_conductor, conductor_cedula, cedula_empleado o document_number.",
  "No confundas la cédula con el código de conductor (conductores_con_grupo.codigo, cierres_diarios.cod_conductor), que es otro texto sin ceros a la izquierda. cierres_diarios se cruza por código; ausentismo, viajes_perdidos, incentivos y devengados_entregas, por cédula.",
  "No confundas el código de vehículo (número interno: codigo_vehiculo, vehiculo) con la placa. Cada dato está en su propia columna.",
  "Para preguntas sobre la plantilla actual, filtra conductores_con_grupo por estado = 'ACTIVO'. En análisis históricos (producción, ausencias, accidentes, pagos) conserva a los RETIRADOS, porque su historia sigue contando. Que un conductor no tenga producción reciente no prueba que se haya retirado: GEMA reporta con atraso.",
  "Trata las columnas de tipo fecha sin hora (fecha, fecha_inicio, fecha_viaje, fecha_ingreso) como días de calendario de Colombia y compáralas como texto AAAA-MM-DD.",
  "Los timestamptz que genera Gestivo (created_at, updated_at, evaluado_at, etc.) están en UTC. Resta 5 horas (America/Bogota, UTC−5, sin horario de verano) antes de hablar de horas o de agrupar por día.",
  "Los timestamptz copiados de GEMA (puntos_virtuales.fecha_hora, viajes_recaudados.fecha_recaudo) ya traen la hora local aunque figuren como UTC. No les restes 5 horas; las columnas fecha y hora de esos recursos también están en hora local.",
  "Los importes están en pesos colombianos (COP). No los conviertas ni supongas otra moneda.",
  "GEMA se sincroniza una vez al día, a las 3:00 a. m. hora de Colombia (08:00 UTC). No hay datos del día en curso. En cada corrida se vuelven a copiar los últimos 45 días, así que las cifras recientes pueden cambiar. El histórico empieza el 2026-01-01, y puntos_virtuales avanza por días y puede ir más atrasado.",
  "Acota siempre por fecha los recursos grandes, sobre todo puntos_virtuales (unas 90.000 filas por día), y usa agregados en lugar de descargar filas.",
  "Filtra los estados con el literal exacto de cada recurso, porque cambian las mayúsculas: ACTIVO/RETIRADO en conductores_con_grupo; activo/retirado/permiso en employees; activa/devuelta/reverso en devengados_entregas. Si dudas del valor, consulta primero los valores distintos.",
  "Excluye de los totales los registros anulados, eliminados o revertidos (eliminado_at o anulada_en con valor; estado devuelta o reverso), salvo que la pregunta sea precisamente sobre ellos.",
  "Diagnóstico, CIE-10, incapacidades, tipo de sangre y datos de salud son sensibles; teléfonos, correos, direcciones, familiares y edades son datos personales. Úsalos solo si la pregunta lo exige, prefiere cifras agregadas y no repitas listados nominales completos.",
  "Si el dato no está en los recursos expuestos, dilo. No lo deduzcas de otro módulo ni inventes columnas o valores.",
];

/** Vocabulario del negocio. */
export const GLOSARIO: TerminoGlosario[] = [
  // ── Identificación ──────────────────────────────────────────────────────────
  {
    termino: "Cédula",
    definicion:
      "Documento de identidad colombiano; es la llave que une a una persona entre recursos. Se guarda como texto de solo dígitos, sin ceros a la izquierda.",
    dondeAparece: [
      "conductores_con_grupo.cedula",
      "ausentismo.cedula",
      "viajes_perdidos.cedula_conductor",
      "cierres_diarios.cedula_conductor",
      "devengados_entregas.cedula_conductor",
      "accidentes.conductor_cedula",
      "familia.cedula_empleado",
      "employees.document_number",
      "propietarios.cedula",
    ],
    sinonimos: ["identificación", "documento"],
  },
  {
    termino: "Código de conductor",
    definicion:
      "Código de personal que GEMA asigna al conductor, distinto de la cédula; es la llave de los cierres y de la liquidación. Es texto sin ceros a la izquierda.",
    dondeAparece: [
      "conductores_con_grupo.codigo",
      "cierres_diarios.cod_conductor",
      "viajes_recaudados.codigo_conductor",
      "ingreso_tercero.codigo_conductor",
      "devengados_entregas.codigo_conductor",
    ],
    sinonimos: ["código de personal", "cód."],
  },
  {
    termino: "Código de vehículo",
    definicion:
      "Número interno con el que la empresa identifica cada buseta; es la llave del maestro de vehículos y no es la placa. En cierres_diarios.vehiculo puede traer varios códigos separados por comas cuando el conductor usó más de un vehículo en el día.",
    dondeAparece: [
      "cierres_diarios.vehiculo",
      "viajes_perdidos.vehiculo",
      "viajes_recaudados.codigo_vehiculo",
      "ingreso_tercero.codigo_vehiculo",
      "puntos_virtuales.codigo_vehiculo",
    ],
    sinonimos: ["número interno", "número de la buseta"],
  },
  {
    termino: "Placa",
    definicion: "Matrícula del vehículo. Es un dato distinto del código de vehículo.",
    dondeAparece: [
      "puntos_virtuales.placa",
      "viajes_recaudados.placa",
      "ingreso_tercero.placa",
      "viajes_perdidos.placa",
      "accidente_vehiculos.placa",
    ],
  },
  {
    termino: "Buseta",
    definicion: "Vehículo de pasajeros de la flota; en la interfaz y en los documentos se usa como sinónimo de vehículo.",
    sinonimos: ["vehículo", "bus"],
  },

  // ── Operación y producción ──────────────────────────────────────────────────
  {
    termino: "GEMA",
    definicion:
      "Sistema externo de operación y recaudo de la empresa, del que Gestivo copia maestros y operación todos los días en solo lectura. Si un recurso tiene source_file = 'GEMA' u origen = 'gema', el dato vino de allí.",
    dondeAparece: ["cierres_diarios.origen", "viajes_perdidos.origen", "puntos_virtuales.source_file"],
  },
  {
    termino: "Ruta",
    definicion:
      "Recorrido que opera el vehículo. Los viajes recaudados distinguen la ruta programada de la reprogramada.",
    dondeAparece: [
      "cierres_diarios.ruta",
      "viajes_perdidos.ruta",
      "ingreso_tercero.ruta",
      "viajes_recaudados.ruta_programada",
      "viajes_recaudados.ruta_reprogramada",
    ],
  },
  {
    termino: "Despacho",
    definicion:
      "Salida de un vehículo a hacer un viaje, con número y hora de despacho. En viajes_perdidos.despacho, en cambio, se guarda el nombre del despachador.",
    dondeAparece: [
      "puntos_virtuales.numero_despacho",
      "puntos_virtuales.hora_despacho",
      "viajes_recaudados.hora_despacho",
      "viajes_perdidos.despacho",
    ],
  },
  {
    termino: "Timbrada",
    definicion:
      "Conteo de pasajeros de la registradora del vehículo en un viaje (lectura final menos inicial). En viajes_recaudados, timbradas es la cifra neta (timbradas_real menos descuento), así que no hay que volver a restarle el descuento.",
    dondeAparece: [
      "viajes_recaudados.timbradas",
      "viajes_recaudados.timbradas_real",
      "viajes_recaudados.descuento",
      "cierres_diarios.timbradas",
      "ingreso_tercero.timbradas",
    ],
    sinonimos: ["timbradas", "timb."],
  },
  {
    termino: "Viaje",
    definicion:
      "Recorrido completo de un despacho. En cierres_diarios.viajes admite medios viajes (.5) del conductor, y es la cifra que se usa para liquidar.",
    dondeAparece: ["cierres_diarios.viajes", "ingreso_tercero.viajes", "viajes_recaudados.viaje"],
  },
  {
    termino: "Cierre diario",
    definicion:
      "Liquidación de la producción de un conductor en un día y una ruta, ya sumados los vehículos y turnos. Sale del procedimiento de ingreso del conductor en GEMA. Una fila = código de conductor + fecha + ruta.",
    dondeAparece: ["cierres_diarios"],
    sinonimos: ["cierre", "ingreso del conductor"],
  },
  {
    termino: "Tipo de cierre",
    definicion:
      "Modalidad con la que GEMA liquida el cierre. Tesorería los agrupa así: «CU (RUTAS,GRUPOS)» es CU Rutas, «CU (…,PROM)» es CU promedios, «SEGURRUTAS…» es Caja Única e «INDIVIDUAL» es Individual.",
    dondeAparece: ["cierres_diarios.tipo_cierre", "ingreso_tercero.tipo_cierre"],
  },
  {
    termino: "Timbradas CU",
    definicion:
      "En los cierres de tipo CU, timbradas que le corresponden al conductor. Gestivo las deriva así: salario bruto del día ÷ porcentaje de pago ÷ tarifa.",
    dondeAparece: ["cierres_diarios.salario_bruto_dia", "cierres_diarios.pct_total"],
    sinonimos: ["timb. CU"],
  },
  {
    termino: "Porcentaje de pago",
    definicion:
      "Porcentaje del cierre que Gestivo toma como la parte del bruto que se paga al conductor. GEMA entrega además un porcentaje individual y otro de grupo.",
    dondeAparece: ["cierres_diarios.pct_total", "cierres_diarios.pct_indiv", "cierres_diarios.pct_grupo"],
    sinonimos: ["%pago", "porcentaje de cumplimiento"],
  },
  {
    termino: "Producción del conductor",
    definicion:
      "Lo que el conductor genera en el día. Tesorería usa como producción neta el salario neto del día del cierre, y sobre esa cifra calcula devengados y liquidación.",
    dondeAparece: ["cierres_diarios.salario_neto_dia", "cierres_diarios.salario_bruto_dia"],
    sinonimos: ["producido", "producción neta"],
  },
  {
    termino: "Bruto",
    definicion:
      "Valor antes de descuentos. Cuidado: cierres_diarios.bruto es un valor de grupo que comparten muchos conductores, no el bruto individual. En los indicadores de timbradas, «bruto» son las timbradas reales, no dinero.",
    dondeAparece: ["cierres_diarios.bruto", "viajes_recaudados.bruto", "ingreso_tercero.bruto"],
  },
  {
    termino: "Neto",
    definicion: "Valor del viaje recaudado después de descuentos, en COP.",
    dondeAparece: ["viajes_recaudados.neto"],
  },
  {
    termino: "Anticipo",
    definicion:
      "Valor en COP que GEMA registra como anticipo en el cierre, el viaje recaudado o la liquidación a terceros. El código no documenta cómo se calcula.",
    dondeAparece: ["cierres_diarios.anticipo", "viajes_recaudados.anticipo", "ingreso_tercero.anticipo"],
  },
  {
    termino: "Ahorro",
    definicion:
      "Valores de ahorro que GEMA descuenta en el cierre del conductor. El ahorro obligatorio va en una columna aparte.",
    dondeAparece: ["cierres_diarios.ahorro", "cierres_diarios.ahorro_obli", "viajes_recaudados.ahorro"],
  },
  {
    termino: "Recaudo",
    definicion:
      "Cobro en caja del dinero de un viaje. viajes_recaudados guarda un viaje con su recaudo, cajero y fecha de recaudo; is_extemporaneo marca los recaudos hechos fuera de término.",
    dondeAparece: ["viajes_recaudados.fecha_recaudo", "viajes_recaudados.cajero", "viajes_recaudados.is_extemporaneo"],
    sinonimos: ["viaje recaudado"],
  },
  {
    termino: "Pasaje",
    definicion:
      "Tarifa por pasajero. En 2026 Gestivo replica la de GEMA: $3.400 el domingo y $3.300 el resto de días.",
    dondeAparece: ["viajes_recaudados.pasaje", "ingreso_tercero.pasaje"],
    sinonimos: ["tarifa"],
  },
  {
    termino: "Ingreso a terceros",
    definicion:
      "Liquidación diaria que GEMA hace por vehículo, conductor y propietario, con viajes, timbradas, descuentos, FET, bruto y los rubros de cartulina.",
    dondeAparece: ["ingreso_tercero"],
  },
  {
    termino: "FET",
    definicion:
      "Rubro monetario de la liquidación a terceros que viene de GEMA. Ni el código ni los documentos explican la sigla: no la interpretes.",
    dondeAparece: ["ingreso_tercero.fet"],
  },
  {
    termino: "Cartulina",
    definicion:
      "Rubros que GEMA liquida por vehículo: total y desglose en administración, estudio, fondo, póliza y «presta». En Tesorería, «Revisión cartulina» es la verificación de timbradas con el mapa de calor.",
    dondeAparece: [
      "ingreso_tercero.total_cartulina",
      "ingreso_tercero.cartu_admon",
      "ingreso_tercero.cartu_estudio",
      "ingreso_tercero.cartu_fondo",
      "ingreso_tercero.cartu_poliza",
      "ingreso_tercero.cartu_presta",
    ],
  },
  {
    termino: "Propietario",
    definicion:
      "Dueño de un vehículo, con su maestro en GEMA. tipo_propietario lo clasifica; los vehículos son de la empresa o de propietarios afiliados.",
    dondeAparece: [
      "propietarios.cedula",
      "propietarios.tipo_propietario",
      "ingreso_tercero.cedula_propietario",
      "viajes_recaudados.cedula_propietario",
      "viajes_perdidos.tipo_propietario",
    ],
  },
  {
    termino: "Tipo de conductor",
    definicion:
      "Vinculación del conductor según el maestro. Los valores usados en ausentismo son EMPRESA, AFILIADO (conduce un vehículo afiliado) y REUBICADO, y ADMINISTRATIVO para el resto del personal. El análisis de riesgo distingue además relevo o fijo.",
    dondeAparece: ["conductores_con_grupo.tipo_conductor", "ausentismo.tipo_conductor"],
  },
  {
    termino: "Viaje perdido",
    definicion:
      "Viaje programado que no se hizo como estaba previsto: en GEMA, un viaje cuya novedad es distinta de NORMAL. Una fila = un viaje perdido de un conductor en una fecha.",
    dondeAparece: ["viajes_perdidos"],
  },
  {
    termino: "Tipología",
    definicion:
      "Causa a la que se atribuye un viaje perdido. La tipología CONDUCTOR es la que se cuenta como falla del conductor en rendimiento y riesgo.",
    dondeAparece: ["viajes_perdidos.tipologia"],
  },
  {
    termino: "Novedad",
    definicion:
      "En viajes, estado del viaje en GEMA (NORMAL o el motivo de la pérdida), con su detalle. En ausentismo y riesgo se llama «novedad» a una falta no justificada: no son lo mismo.",
    dondeAparece: ["viajes_perdidos.novedad", "viajes_perdidos.detalle_novedad", "viajes_recaudados.novedad"],
  },
  {
    termino: "Punto virtual",
    definicion:
      "Punto geográfico de control por el que pasa el vehículo. Cada fila de puntos_virtuales es un evento GPS con hora, velocidad, coordenadas y pasajeros que suben y bajan.",
    dondeAparece: ["puntos_virtuales.punto_virtual", "puntos_virtuales.cod_pv", "puntos_virtuales.is_base"],
    sinonimos: ["PV"],
  },
  {
    termino: "Subidas, bajadas y a bordo",
    definicion:
      "Pasajeros que suben, bajan y van en el vehículo en un evento de punto virtual. Las columnas _p1, _p2 y _p3 separan por puerta.",
    dondeAparece: [
      "puntos_virtuales.subidas",
      "puntos_virtuales.bajadas",
      "puntos_virtuales.abordo",
      "puntos_virtuales.subidas_p1",
      "puntos_virtuales.bajadas_p1",
    ],
  },
  {
    termino: "Alarmas de registradora",
    definicion:
      "Eventos de la registradora en puntos_virtuales.descripcion: BLOQUEO P1/P2/P3, PUERTA ABIERTA, PUERTA CERRADA y FALLA DE COMUNICACION, agrupados como BLOQUEO, PUERTA y FALLA.",
    dondeAparece: ["puntos_virtuales.descripcion", "puntos_virtuales.registradora"],
  },
  {
    termino: "Reinicio de registradora",
    definicion:
      "El contador de la registradora retrocede a mitad del viaje. Como GEMA liquida final menos inicial, la timbrada neta queda corta y hay que verificarla a mano.",
    dondeAparece: ["viajes_recaudados.inicial", "viajes_recaudados.final", "puntos_virtuales.registradora"],
  },
  {
    termino: "Exceso de velocidad",
    definicion:
      "GEMA entrega eventos GPS de 50 km/h o más. Gestivo agrupa en una incidencia los que superan el umbral (60 km/h por defecto) en el mismo vehículo con menos de 5 minutos entre sí, y reporta a RR. HH. al conductor con 4 o más incidencias en la semana.",
  },

  // ── Personas, rotación y RR. HH. ────────────────────────────────────────────
  {
    termino: "Rotación",
    definicion:
      "Salida de conductores de la empresa y su análisis. El módulo reúne por conductor el maestro, producción, viajes perdidos, ausentismo, accidentes, familia e incentivos.",
  },
  {
    termino: "Retirado",
    definicion:
      "Conductor que ya no está vinculado: estado = 'RETIRADO' y, normalmente, fecha_retiro. Sus registros históricos y los pagos que recibió siguen en los demás recursos. Ojo: en Tesorería, «retiro» también es un pago de caja.",
    dondeAparece: ["conductores_con_grupo.estado", "conductores_con_grupo.fecha_retiro", "employees.status"],
    sinonimos: ["inactivo"],
  },
  {
    termino: "Grupo de antigüedad",
    definicion:
      "Tramo de antigüedad desde fecha_ingreso hasta hoy: 0-3m, 3-6m, 6-12m o 1+a. Se recalcula con la fecha actual, así que no refleja la antigüedad que la persona tenía en una fecha pasada.",
    dondeAparece: ["conductores_con_grupo.grupo_antiguedad", "conductores_con_grupo.meses_antiguedad"],
  },
  {
    termino: "Empleado",
    definicion:
      "Persona del personal que no es conductor. Los registros de GEMA con cargo conductor no se copian a employees.",
    dondeAparece: ["employees"],
  },
  {
    termino: "Incentivo",
    definicion:
      "Pago adicional reconocido a un trabajador, con valor, concepto, mes de entrega y periodo. Perderlo es una de las medidas del correctivo de accidentes nivel III.",
    dondeAparece: ["incentivos.valor", "incentivos.concepto", "incentivos.mes_entrega", "incentivos.periodo"],
  },
  {
    termino: "Proceso de contratación",
    definicion:
      "Proceso de un aspirante a conductor, desde pendiente hasta contratado o cierre, con validación en SIMIT, antecedentes y categoría de licencia.",
    dondeAparece: ["procesos_contratacion"],
  },

  // ── Ausentismo ──────────────────────────────────────────────────────────────
  {
    termino: "Ausentismo",
    definicion:
      "En el recurso ausentismo, la matriz de incapacidades médicas. En la aplicación también incluye las ausencias del día a día (permiso, vacaciones, descanso, suspensión, calamidad, licencia, cita EPS, taller, no justificada, renuncia), que están en otra tabla todavía no expuesta.",
    dondeAparece: ["ausentismo"],
  },
  {
    termino: "Incapacidad",
    definicion:
      "Periodo en que un médico certifica que el trabajador no puede laborar. Tiene consecutivo, fechas de inicio y fin, diagnóstico CIE-10, origen y pagador (EPS o ARL).",
    dondeAparece: [
      "ausentismo.consecutivo_incapacidad",
      "ausentismo.fecha_inicio",
      "ausentismo.fecha_fin",
      "ausentismo.cie10",
      "ausentismo.diagnostico",
    ],
  },
  {
    termino: "Días perdidos",
    definicion:
      "Días calendario de una incapacidad, contando el de inicio y el de fin. Pese a su nombre, la columna dias_it_pagados guarda este cálculo, que la base impone por trigger: no son días efectivamente pagados.",
    dondeAparece: ["ausentismo.dias_it_pagados"],
    sinonimos: ["días IT", "días de incapacidad"],
  },
  {
    termino: "Origen",
    definicion:
      "En ausentismo, causa de la incapacidad: EG (enfermedad general, es decir, origen común), EL (enfermedad laboral), AT (accidente de trabajo), LM (licencia de maternidad) y LP (licencia de paternidad). En cierres_diarios y viajes_perdidos, origen es en cambio el sistema del que vino la fila (gema o excel).",
    dondeAparece: ["ausentismo.origen"],
    sinonimos: ["origen común", "origen laboral"],
  },
  {
    termino: "EPS",
    definicion:
      "Entidad de salud del trabajador, que paga las incapacidades de origen común. En una incapacidad inicial, el empleador asume los dos primeros días y la EPS paga desde el tercero; la prórroga la paga completa. RR. HH. cobra a la EPS las de más de 3 días.",
    dondeAparece: ["ausentismo.eps", "conductores_con_grupo.eps", "employees.eps"],
  },
  {
    termino: "ARL",
    definicion:
      "Aseguradora de riesgos laborales, que paga desde el primer día las incapacidades de origen AT o EL.",
    dondeAparece: ["ausentismo.arl", "conductores_con_grupo.arl", "employees.arl"],
  },
  {
    termino: "IPS",
    definicion: "Institución prestadora de salud que atendió al trabajador y expidió la incapacidad.",
    dondeAparece: ["ausentismo.ips"],
  },
  {
    termino: "Prórroga",
    definicion: "Incapacidad que continúa otra anterior, frente a la INICIAL.",
    dondeAparece: ["ausentismo.indicador_prorroga"],
  },
  {
    termino: "Falta no justificada",
    definicion:
      "Ausencia sin soporte válido. Con 4 días seguidos se cita a descargos y con 5 se notifica la terminación del contrato. Aparte, es reincidente quien acumula 3 o más ausencias de cualquier concepto (salvo vacaciones y descansos) en 30 días.",
    sinonimos: ["no justificada", "novedad"],
  },

  // ── Accidentabilidad ────────────────────────────────────────────────────────
  {
    termino: "Accidentabilidad",
    definicion:
      "Seguimiento de los accidentes viales de los conductores según la «Política de Correctivos por Accidentalidad Vial»: reporte, evaluación, correctivo y comité.",
    dondeAparece: ["accidentes", "accidente_evaluaciones"],
    sinonimos: ["accidentalidad"],
  },
  {
    termino: "Gravedad",
    definicion:
      "Clasificación del accidente: leve, moderado, grave o fatal. Se toma la peor entre los lesionados (ninguno, leves, incapacitantes, fatal) y los daños (menores, significativos, altos, pérdida total).",
    dondeAparece: ["accidente_evaluaciones.gravedad", "accidentes.lesionados", "accidentes.danos_materiales"],
  },
  {
    termino: "Responsabilidad",
    definicion:
      "A quién se atribuye el accidente: directo (el conductor), compartido, tercero o en_estudio. La que se declara al reportar se guarda aparte de la que fija la evaluación.",
    dondeAparece: ["accidente_evaluaciones.responsabilidad", "accidentes.responsabilidad_reportada"],
  },
  {
    termino: "Nivel de correctivo",
    definicion:
      "Escala de la política: ninguno; I preventivo; II correctivo moderado; III correctivo grave (incluye pérdida de incentivos y comité disciplinario); IV sanción crítica (puede terminar el contrato). El sistema sugiere un nivel y el evaluador fija el final.",
    dondeAparece: ["accidente_evaluaciones.nivel_sugerido", "accidente_evaluaciones.nivel_final"],
    sinonimos: ["nivel", "correctivo"],
  },
  {
    termino: "Comité de accidentalidad",
    definicion: "Instancia que evalúa todo accidente moderado, grave o fatal.",
    dondeAparece: ["accidente_evaluaciones.requiere_comite"],
    sinonimos: ["comité"],
  },
  {
    termino: "Reincidencia en accidentes",
    definicion: "Accidentes previos del mismo conductor en los últimos 3, 6 y 12 meses, que suben el puntaje y el nivel.",
    dondeAparece: [
      "accidente_evaluaciones.reincidente",
      "accidente_evaluaciones.reincidencia_3m",
      "accidente_evaluaciones.reincidencia_12m",
    ],
  },

  // ── Tesorería ───────────────────────────────────────────────────────────────
  {
    termino: "Otros devengados",
    definicion:
      "Excedente de producción que la caja entrega al conductor cuando su producción neta acumulada supera la base exigida. Se contabiliza en la cuenta 281505010.",
    dondeAparece: ["devengados_entregas.valor_entregado", "devengados_entregas.cuenta_contable"],
    sinonimos: ["devengados", "excedente"],
  },
  {
    termino: "Base diaria",
    definicion:
      "Producción neta mínima que la empresa exige por cada día con producción antes de liberar excedente; un día sin viajes no suma base. Es un parámetro editable: en julio de 2026 era $85.000.",
  },
  {
    termino: "Regla de oro",
    definicion:
      "El excedente de un día primero cubre el déficit acumulado de días anteriores de la misma quincena, y solo se libera lo que sobra.",
  },
  {
    termino: "Quincena",
    definicion: "Mitad del mes: 1 va del día 1 al 15 y 2 del 16 al último día.",
    dondeAparece: ["devengados_entregas.quincena", "viajes_perdidos.quincena"],
  },
  {
    termino: "Periodo",
    definicion:
      "Mes al que pertenece un registro, pero cambia de formato: texto AAAA-MM en viajes_perdidos, fecha en incentivos y texto en devengados_entregas. Revisa los valores antes de filtrar.",
    dondeAparece: ["viajes_perdidos.periodo", "incentivos.periodo", "devengados_entregas.periodo"],
  },
  {
    termino: "Entrega",
    definicion:
      "Pago de otros devengados en caja a un conductor: movimiento DEBITO en estado activa, con fecha contable y cajero. La liquidación del conductor lo muestra como «Retiro».",
    dondeAparece: ["devengados_entregas.movimiento", "devengados_entregas.estado", "devengados_entregas.aprobada_por"],
    sinonimos: ["pago", "retiro"],
  },
  {
    termino: "Entrega extemporánea",
    definicion:
      "Entrega que se registra para un día de caja que ya estaba cerrado (extemporanea = true). Si registrada_por y aprobada_por no coinciden, quien la digitó no es el cajero al que se le acredita.",
    dondeAparece: ["devengados_entregas.extemporanea"],
  },
  {
    termino: "Devolución y reverso",
    definicion:
      "Una devolución anula una entrega: la original pasa a devuelta y se crea un reverso contable (crédito) con la fecha de la entrega original. Ninguna de las dos cuenta como efectivo salido.",
    dondeAparece: ["devengados_entregas.estado", "devengados_entregas.devolucion_de"],
  },
  {
    termino: "Traslado a GEMA",
    definicion: "Marca de que la entrega ya se registró a mano en GEMA.",
    dondeAparece: ["devengados_entregas.trasladada_gema", "devengados_entregas.trasladada_at"],
  },
  {
    termino: "Liquidación del conductor",
    definicion:
      "Vista día a día que resta a la producción neta la base y los retiros, y deja un saldo con signo (positivo, disponible; negativo, deuda). Es explicativa: el disponible real de caja se calcula con la regla de oro.",
    sinonimos: ["estado de cuenta"],
  },

  // ── Mantenimiento, operativo y riesgo ───────────────────────────────────────
  {
    termino: "Reporte de daño",
    definicion:
      "Daño que un conductor reporta para un vehículo y un concepto (motor, frenos, luces…). Si hay dos o más reportes del mismo vehículo y concepto en 30 días, se abre una alerta de mantenimiento que se cierra con orden de taller.",
  },
  {
    termino: "Graduación de frenos",
    definicion: "Registro en la bitácora de mantenimiento de si se graduaron los frenos de un vehículo en una fecha.",
  },
  {
    termino: "Documentos del vehículo",
    definicion:
      "Documentos con vencimiento por vehículo: SOAT, tecnomecánica, tarjeta de operación, SRCC, SRCE, full amparo y contrato. Se alertan como próximos a 30 días y críticos a 15.",
  },
  {
    termino: "Riesgo predictivo",
    definicion:
      "Probabilidad estimada por un modelo de que el conductor se retire en 60 días o tenga una falta no justificada en 30. Es Alto si llega al triple de la tasa base y Medio si está entre 1,5 y 3 veces: es una estimación, no un hecho.",
  },
  {
    termino: "Corte y corrida",
    definicion:
      "En riesgo, el corte es la fecha a la que se puntúa y la corrida es cada ejecución del cálculo; puede haber varias por corte y se usa la última correcta. El cálculo automático corre a las 4:00 a. m. hora de Colombia. En Tesorería, «corte a corte» significa día a día dentro de la quincena.",
    sinonimos: ["corte", "corrida"],
  },
  {
    termino: "Timbrada descontada",
    definicion:
      "Pasajeros que GEMA resta del conteo de la registradora de un viaje, con un motivo (POR VENTA, SENSOR, POR ABORTADOS…). La suma por viaje es viajes_recaudados.descuento, y viajes_recaudados.timbradas ya viene con el descuento restado.",
    dondeAparece: ["timbradas_descontadas.tim_descuento", "timbradas_descontadas.motivo_descuento", "viajes_recaudados.descuento"],
    sinonimos: ["descuento de timbradas", "descuento de registradora"],
  },
  {
    termino: "Ticket transfer",
    definicion:
      "Registro de GEMA por viaje con tickets numerados; cada ticket cuenta como descuento (tipo 0) o como incentivo (tipo 1). GEMA no documenta su uso operativo.",
    dondeAparece: ["tickets_transfer.cantidad_descuento", "tickets_transfer.cantidad_incentivo", "tickets_transfer.tickets_detalles"],
    sinonimos: ["transfer", "tickets de transfer"],
  },
  {
    termino: "Anotación de viaje",
    definicion:
      "Novedad que el despacho anota a cada viaje en GEMA, como '(02) TROCHA', '(04) VIAJE INCOMPLETO' o '(13) SIN NOVEDAD' (la gran mayoría). No es lo mismo que un viaje perdido.",
    dondeAparece: ["anotaciones_viajes.novedad", "anotaciones_viajes.cod_novedad"],
    sinonimos: ["anotaciones", "novedad del viaje"],
  },
  {
    termino: "Planilla de cumplimientos",
    definicion:
      "Planilla de tiempos de GEMA: para cada viaje, la hora programada y la hora real de paso por cada punto de control de la ruta. min_diferencia positivo significa que pasó tarde.",
    dondeAparece: ["cumplimientos.punto_control", "cumplimientos.hora_cumplimiento", "cumplimientos.hora_llegada", "cumplimientos.min_diferencia"],
    sinonimos: ["planilla de tiempos", "cumplimiento de horario", "punto de control", "puntualidad"],
  },
  {
    termino: "Histórico de despacho",
    definicion:
      "Registro de GEMA de todos los viajes programados por día, se hayan despachado o no, con su estado (DESPACHADO, NO_DESPACHADO…), novedad y tipología. Un viaje perdido es un viaje de este histórico con novedad distinta de NORMAL.",
    dondeAparece: ["historico_despacho.estado", "historico_despacho.novedad", "historico_despacho.tipologia_novedad"],
    sinonimos: ["despacho", "viajes programados", "planilla de despacho"],
  },
];
