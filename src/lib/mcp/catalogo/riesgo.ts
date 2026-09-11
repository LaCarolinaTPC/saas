// Catálogo semántico: riesgo predictivo de conductores (retiro en 60 días y
// falta no justificada en 30 días). Verificado contra
// supabase/migrations/20260910155217_modulo_de_riesgo_predictivo_de_conductores.sql,
// src/lib/riesgo/{corrida,datos,modelo,panel,persistir,variables,fechas}.ts,
// src/app/api/cron/riesgo-conductores/route.ts, src/app/(dashboard)/riesgo/*,
// vercel.json y docs/analisis-riesgo-conductores.md.

import type { DocRecurso } from "./tipos";

const TONO =
  "Son estimaciones estadísticas de apoyo para priorizar conversaciones de RRHH, no hechos ni decisiones: nunca presente un puntaje o un nivel como algo que el conductor hizo o hará, ni como causa o sustento de una sanción, un despido o una medida disciplinaria.";

const VIGENTE =
  "Para el riesgo vigente: (1) en riesgo_corridas, estado = 'ok', ordenar por ejecutada_at descendente, limit 1 (es la regla de la pantalla); tome su id y su corte. (2) En riesgo_conductores, corrida_id = ese id. Nunca elija la corrida por `corte`: puede haber varias del mismo corte (cron y recálculo a mano, incluso con segundos de diferencia) y la válida es la de ejecutada_at más reciente.";

export const RECURSOS_RIESGO: DocRecurso[] = [
  // ── riesgo_corridas ──────────────────────────────────────────────────────
  {
    nombre: "riesgo_corridas",
    dominio: "riesgo",
    titulo: "Corridas del análisis de riesgo de conductores",
    resumen:
      "Una ejecución del análisis predictivo por corte: estado, calidad de los dos modelos, pesos, tasas observadas por tramo y conteos de las fuentes.",
    granularidad:
      "Una fila = una ejecución del análisis. Un mismo corte puede tener varias filas (cron y recálculos a mano); las fallidas también quedan.",
    descripcion:
      "Cada corrida lee el maestro de conductores depurado, ausentismo_registros, ausentismo (incapacidades), viajes_perdidos y cierres_diarios; arma un panel conductor × mes, entrena dos regresiones logísticas y puntúa a los conductores del corte, cuyos resultados están en riesgo_conductores. Aquí quedan las métricas y agregados para mostrar; no hay puntajes individuales. Se conservan todas las corridas para volver a un corte y medir después si el modelo acertó.",
    origen:
      "Cron diario /api/cron/riesgo-conductores (vercel.json: 0 9 * * *, 04:00 hora de Colombia, una hora después de la sincronización de GEMA) con origen 'cron', y botón «Recalcular» del módulo /riesgo con origen 'manual'. Nunca sobrescribe: cada invocación inserta una fila nueva.",
    identificador: "id",
    columnaFecha: "corte",
    volumen: "Alrededor de una fila por día, más los recálculos a mano y las corridas fallidas.",
    columnasPorDefecto: [
      "id",
      "corte",
      "ejecutada_at",
      "origen",
      "estado",
      "conductores_puntuados",
      "observaciones",
      "error",
    ],
    filtroPorDefecto: {
      columna: "estado",
      operador: "eq",
      valor: "ok",
      motivo:
        "Las corridas en 'error' no tienen cifras ni conductores y confunden la búsqueda de la última corrida válida. Desactívelo solo para auditar fallos o saber si la corrida de hoy falló (en ese caso lo vigente es un corte anterior).",
    },
    columnas: {
      id: {
        descripcion: "UUID de la corrida. Es lo que enlaza con sus puntajes.",
        relacion: "riesgo_conductores.corrida_id",
      },
      corte: {
        descripcion:
          "Fecha a la que se puntúa. Las variables miran hacia atrás en ventanas [corte − n días, corte), sin incluir el propio día del corte; los horizontes de predicción cuentan desde el corte.",
        formato: "date, día calendario en hora de Colombia (America/Bogota)",
        advertencia:
          "No es única. En el cron es el día de Colombia en que se ejecuta; si alguien invoca el cron con ?corte=AAAA-MM-DD, la fila queda con origen 'cron' y un corte pasado, calculado con el maestro de hoy.",
      },
      ejecutada_at: {
        descripcion: "Momento en que se insertó la corrida. Es la columna que decide cuál es la última.",
        formato: "timestamptz UTC; restar 5 horas para hora de Colombia",
      },
      ejecutada_por_email: {
        descripcion: "Correo de quien pulsó «Recalcular». Nulo en las corridas del cron.",
        sensible: true,
      },
      origen: {
        descripcion: "Cómo se lanzó la corrida.",
        valores: {
          cron: "Automática diaria (o invocación directa de la ruta del cron)",
          manual: "Botón «Recalcular» del módulo, por un usuario con permiso de edición",
        },
      },
      estado: {
        descripcion: "Resultado de la corrida.",
        valores: {
          ok: "Terminó y guardó métricas y puntajes",
          error: "Falló; solo trae corte, origen, fecha y el mensaje en `error`",
        },
        advertencia:
          "La fila se inserta en 'ok' antes de insertar los puntajes (lotes de 200). Durante esos segundos, o si la inserción falla y la corrida se borra, la última 'ok' puede tener menos filas en riesgo_conductores que conductores_puntuados.",
      },
      error: {
        descripcion:
          "Mensaje del fallo, recortado a 2.000 caracteres. Nulo en las 'ok'. Un caso típico: «Las fuentes cambiaron mientras se leían», cuando la sincronización de GEMA estaba reescribiendo viajes perdidos o cierres.",
      },
      observaciones: {
        descripcion:
          "Filas conductor-mes del panel, incluidas las que aún no tienen resultado observable. No es el tamaño de entrenamiento (ver modelos.*.n y nTest).",
        unidad: "conductor-mes",
      },
      conductores_puntuados: {
        descripcion:
          "Conductores puntuados en el corte: en plantilla, con código de conductor, fuera del comodín y activos en el maestro o con algún cierre en los últimos 30 días. Debe coincidir con las filas de riesgo_conductores de la corrida.",
        unidad: "conductores",
      },
      cortes: {
        descripcion:
          "Meses del panel como arreglo de fechas 'AAAA-MM-01', del más viejo al más reciente: el día 1 del mes del corte y los 6 anteriores (7 por defecto).",
      },
      modelos: {
        descripcion:
          "Objeto { retiro, novedad }, cada uno con: auc, base (tasa observada en el conjunto de prueba, 0-1), n (filas de entrenamiento), nTest, positivos, precisionTop10, liftTop10, capturaTop20 (proporciones 0-1 salvo el lift, en veces), mesesTest ('AAAA-MM'[], los dos meses evaluables más recientes) y coeficientes [{ key, etiqueta, peso }] ordenados por |peso|. `{}` en las corridas fallidas.",
        advertencia:
          "Las métricas y los pesos son del modelo de validación temporal (entrena sin los dos meses de prueba). Los puntajes de riesgo_conductores salen de otro modelo entrenado con todos los meses evaluables, cuyos pesos no se guardan: comparten `base`, pero no los coeficientes exactos. El peso es estandarizado: positivo suma riesgo, negativo lo resta.",
      },
      descriptivos: {
        descripcion:
          "Tasas observadas sin modelo: arreglo de 9 tablas [{ titulo, datos: [{ etiqueta, n, tasa }] }], con n en conductor-mes y tasa 0-1 (por ejemplo, retiro en 60 días según antigüedad).",
      },
      retiros_mes: {
        descripcion:
          "Arreglo [{ mes 'AAAA-MM', plantilla, retiros, tasa }] con los retiros ocurridos en los 30 días desde el día 1 de cada mes del panel, solo en los meses ya observados completos. tasa = retiros / plantilla (0-1).",
      },
      conteos: {
        descripcion:
          "Filas leídas y depuradas: conductores (maestro ya depurado), comodinesOmitidos, sinOperacionOmitidas, duplicadasPorCodigo, registros (ausentismo_registros), viajesPerdidos y cierres (desde 2025-10-01), incapacidades (ausentismo no eliminado) y cierres_sin_cedula. Mezcla claves camelCase y una snake_case.",
        advertencia:
          "Las corridas guardadas antes de la depuración del maestro (2026-09-10) no traen comodinesOmitidos, sinOperacionOmitidas ni duplicadasPorCodigo, y sus puntajes pueden incluir el comodín.",
      },
      duracion_ms: { descripcion: "Duración del cálculo, sin contar el guardado.", unidad: "ms" },
      created_at: {
        descripcion: "Momento de inserción. En la práctica igual a ejecutada_at; use ejecutada_at.",
        formato: "timestamptz UTC",
      },
    },
    relaciones: [
      {
        recurso: "riesgo_conductores",
        mediante: "id = corrida_id",
        descripcion: "Puntaje por conductor de esta corrida.",
      },
    ],
    advertencias: [
      TONO,
      VIGENTE,
      "Antes de dar el riesgo como actual, compare corte con la fecha de hoy en Colombia: si la corrida de hoy falló o no ha corrido, lo vigente es de un corte anterior y hay que decirlo.",
      "Validez: el histórico es corto (panel de 7 meses, 2 de prueba) y el modelo se reentrena en cada corrida, así que métricas y pesos cambian de un día a otro. Primera corrida depurada (corte 2026-09-09): AUC 0,804 en retiro y 0,729 en falta no justificada. Cite siempre el AUC y los meses de prueba de la corrida que use.",
      "Contiene métricas y agregados, no datos individuales; los datos personales están en riesgo_conductores.",
    ],
    noConfundirCon: [
      {
        recurso: "accidente_evaluaciones",
        diferencia:
          "Allí «riesgo» es la evaluación de un accidente ya ocurrido (gravedad, responsabilidad). Aquí es una probabilidad estimada de retiro o de falta futura.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Corrió hoy el análisis de riesgo y con qué calidad?",
        como: "Desactive el filtro por defecto, ordene por ejecutada_at descendente con limit 3 y lea estado, corte y error. En la última 'ok', lea modelos.retiro.auc, modelos.novedad.auc y sus mesesTest.",
      },
      {
        pregunta: "¿Qué variables pesan más en el riesgo de retiro?",
        como: "En la última corrida 'ok', lea modelos.retiro.coeficientes (ya ordenados por |peso|). Aclare que son pesos del modelo de validación y que 'vehículo en taller' y 'sin cierre en 30 días' salen protectores por sesgo de exposición, no por protección real.",
      },
    ],
  },

  // ── riesgo_conductores ───────────────────────────────────────────────────
  {
    nombre: "riesgo_conductores",
    dominio: "riesgo",
    titulo: "Puntaje de riesgo por conductor y corrida",
    resumen:
      "Probabilidad estimada de retiro en 60 días y de falta no justificada en 30 días de cada conductor, con su nivel, factores y variables, en cada corrida.",
    granularidad:
      "Una fila = un conductor (cédula) en una corrida. Llave primaria (corrida_id, cedula): el mismo conductor se repite en cada corrida.",
    descripcion:
      "Salida de una regresión logística con regularización L2 sobre 24 variables estandarizadas de perfil, ausentismo, salud, viajes perdidos y producción. Solo puntúa a conductores en plantilla al corte, con código de conductor, activos en el maestro o con cierres en los últimos 30 días. El maestro se depura antes de entrenar y puntuar: se excluyen el comodín (cédula 99999999, «NO DEFINIDO…», o cualquier cédula vacía, fuera de 6-10 dígitos o de un solo dígito repetido), las fichas sin código y las duplicadas por código. No contiene hechos: ni retiros ni faltas ocurridas.",
    origen:
      "Lo inserta cada corrida exitosa de riesgo_corridas (cron diario a las 09:00 UTC, 04:00 en Colombia, o recálculo a mano). Nombre, código y tipo son copia del maestro en el momento de la corrida.",
    identificador: "cedula",
    volumen: "Del orden de 170-190 filas por corrida (172 en el corte 2026-09-09 depurado); crece con cada corrida.",
    columnasPorDefecto: ["corrida_id", "cedula", "codigo", "nombre", "tipo_conductor"],
    columnas: {
      corrida_id: {
        descripcion:
          "Corrida a la que pertenece el puntaje. El corte y la calidad del modelo están en esa corrida. Filtre siempre por esta columna.",
        relacion: "riesgo_corridas.id",
      },
      cedula: {
        descripcion: "Cédula del conductor, solo dígitos. Con corrida_id forma la llave.",
        formato: "Solo dígitos",
        relacion: "conductores_con_grupo.cedula",
        advertencia:
          "No es única en la tabla: /riesgo_conductores/<cedula> choca con varias corridas. Use el listado con corrida_id = … y cedula = ….",
      },
      codigo: {
        descripcion: "Código del conductor en GEMA, copiado del maestro al correr.",
        relacion: "cierres_diarios.cod_conductor",
      },
      nombre: { descripcion: "Nombre del conductor según el maestro al momento de la corrida." },
      tipo_conductor: {
        descripcion:
          "Tipo de conductor del maestro. El modelo solo mira si contiene «RELEVO» o «AFILIADO».",
      },
      prob_retiro: {
        descripcion:
          "Probabilidad estimada de que el conductor se retire (fecha_retiro del maestro) dentro de los 60 días siguientes al corte. Es una estimación, no un hecho.",
        unidad: "proporción 0-1 (5 decimales)",
        sensible: true,
        advertencia:
          "Puede llegar como texto (numeric). Compárela con modelos.retiro.base de su corrida, no con umbrales fijos. No distingue renuncia, despido ni fin de contrato.",
      },
      nivel_retiro: {
        descripcion:
          "Banda relativa de prob_retiro frente a la tasa base de su corrida (modelos.retiro.base).",
        valores: {
          Alto: "prob_retiro ≥ 3 × tasa base",
          Medio: "1,5 × tasa base ≤ prob_retiro < 3 × tasa base",
          Bajo: "prob_retiro < 1,5 × tasa base",
        },
        sensible: true,
        advertencia:
          "La tasa base cambia en cada corrida: un mismo Alto no significa la misma probabilidad en dos cortes.",
      },
      factores_retiro: {
        descripcion:
          "Hasta 3 variables que más suben el puntaje de retiro de este conductor: arreglo [{ key, etiqueta, z }], z = contribución estandarizada al log-odds, solo si z > 0,15, de mayor a menor. Arreglo vacío = ninguna por encima del promedio.",
        sensible: true,
        advertencia: "Son asociaciones del modelo, no causas. No muestran los factores que bajan el riesgo.",
      },
      prob_novedad: {
        descripcion:
          "Probabilidad estimada de que el conductor tenga al menos una falta no justificada (ausentismo_registros.tipo = 'no_justificada', incluye «sin contacto») en los 30 días siguientes al corte.",
        unidad: "proporción 0-1 (5 decimales)",
        sensible: true,
        advertencia:
          "«novedad» aquí significa solo falta no justificada, no las novedades de viajes_perdidos. Puede llegar como texto.",
      },
      nivel_novedad: {
        descripcion:
          "Banda relativa de prob_novedad frente a la tasa base de su corrida (modelos.novedad.base).",
        valores: {
          Alto: "prob_novedad ≥ 3 × tasa base",
          Medio: "1,5 × tasa base ≤ prob_novedad < 3 × tasa base",
          Bajo: "prob_novedad < 1,5 × tasa base",
        },
        sensible: true,
      },
      factores_novedad: {
        descripcion: "Igual que factores_retiro, para el modelo de falta no justificada.",
        sensible: true,
      },
      variables: {
        descripcion:
          "Las 24 variables crudas al corte (números sin redondear; banderas 0/1). Ventanas [corte − n, corte). Perfil: antig_meses (días/30,44, tope 240), antig_menor_6m, edad (años), es_relevo, es_afiliado, hijos. Ausentismo (conteo de filas de ausentismo_registros): aus30, aus90, nj30, nj90 (tipo no_justificada), inc90, perm90, eps90, taller90, sop_pend90 (soporte pendiente), reincidente30 (3+ ausencias en 30 días). Salud: dias_inc_eps90 (días de incapacidad de la tabla ausentismo dentro de 90 días). Operación: vp_cond30, vp_cond90 (viajes perdidos imputables al conductor). Producción (cierres_diarios): dias_trab30 (días distintos con cierre), sin_cierre30, viajes_prom30, caida_viajes (0-1 frente a los 60 días previos), bruto_prom30 (miles de COP).",
        sensible: true,
        advertencia:
          "Edad, hijos y antigüedad valen 0 cuando falta el dato o es imposible, no nulo. viajes_prom30 y bruto_prom30 promedian por fila de cierre, aunque su etiqueta diga «por día». dias_inc_eps90 no filtra por origen de la incapacidad. Viajes perdidos y cierres solo se leen desde 2025-10-01.",
      },
    },
    relaciones: [
      {
        recurso: "riesgo_corridas",
        mediante: "corrida_id = id",
        descripcion: "Corte, estado, tasa base y calidad del modelo que produjo el puntaje.",
      },
      {
        recurso: "conductores_con_grupo",
        mediante: "cedula = cedula",
        descripcion:
          "Ficha actual del conductor. Su fecha_retiro permite verificar después si un retiro previsto ocurrió en [corte, corte + 60 días).",
      },
      {
        recurso: "ausentismo_registros",
        mediante: "cedula = cedula",
        descripcion:
          "Registro diario de ausencias: fuente de las variables de ausentismo y del resultado de falta no justificada (tipo = 'no_justificada').",
      },
      {
        recurso: "ausentismo",
        mediante: "cedula = cedula",
        descripcion: "Incapacidades de la matriz EPS no eliminadas: fuente de dias_inc_eps90.",
      },
      {
        recurso: "cierres_diarios",
        mediante: "cedula = cedula_conductor, o codigo = cod_conductor cuando el cierre no trae cédula",
        descripcion: "Producción diaria: fuente de las variables de días con cierre, viajes y bruto.",
      },
      {
        recurso: "viajes_perdidos",
        mediante: "cedula = cedula_conductor",
        descripcion:
          "Solo cuentan los imputables al conductor: tipologia = CONDUCTOR o novedad con «AUSENCIA CONDUCTOR» o «PERDIDA TURNO».",
      },
    ],
    advertencias: [
      TONO,
      VIGENTE,
      "No hay filtro por defecto porque la corrida vigente cambia cada día: sin filtrar por corrida_id se mezclan todas las corridas y el mismo conductor aparece muchas veces.",
      "Verifique que el número de filas con ese corrida_id coincide con riesgo_corridas.conductores_puntuados; si hay menos, la corrida se está guardando o falló al guardar: use la anterior 'ok'.",
      "Horizontes: retiro en 60 días y falta no justificada en 30 días, ambos contados desde el corte de la corrida, no desde hoy.",
      "El puntaje de un conductor puede moverse entre corridas seguidas sin que cambie nada de él, porque el modelo se reentrena cada vez. No lea esos cambios como tendencia sin revisar la calidad de ambas corridas.",
      "Un conductor que no aparece no tiene «riesgo cero»: puede estar fuera de la población puntuada (sin código, comodín, duplicado, retirado o sin actividad).",
      "Datos personales de toda la plantilla: la tabla solo es accesible con service_role y en la aplicación cada consulta queda auditada. No reenvíe listados nominales.",
    ],
    noConfundirCon: [
      {
        recurso: "conductores_con_grupo",
        diferencia:
          "Es el maestro actual. Aquí nombre, código y tipo son copia del día de la corrida, y solo están los conductores puntuados, sin el comodín ni las fichas depuradas.",
      },
      {
        recurso: "ausentismo_registros",
        diferencia:
          "Allí están las faltas que ocurrieron (hechos). Aquí, la probabilidad estimada de que ocurran.",
      },
      {
        recurso: "accidente_evaluaciones",
        diferencia:
          "Allí «puntaje» y «nivel» evalúan un accidente ocurrido. Aquí son probabilidades de retiro o falta futura.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuál es el riesgo vigente de retiro de cada conductor?",
        como: "Paso 1: riesgo_corridas con estado = 'ok', order ejecutada_at desc, limit 1 → id, corte, modelos.retiro.base y auc. Paso 2: riesgo_conductores con corrida_id = ese id, pidiendo prob_retiro y nivel_retiro, order prob_retiro desc. Informe el corte y el AUC junto al listado.",
      },
      {
        pregunta: "¿Cuántos conductores están en riesgo alto de falta no justificada hoy?",
        como: "Obtenga el id de la corrida vigente (paso 1) y cuente riesgo_conductores con corrida_id = id y nivel_novedad = 'Alto'. Dígalo como estimación del corte, no como faltas previstas con certeza.",
      },
      {
        pregunta: "¿Cómo evolucionó el riesgo de un conductor?",
        como: "Liste riesgo_corridas 'ok' (id, corte, ejecutada_at), luego riesgo_conductores con cedula = … y corrida_id in (esos id). Si hay varias corridas del mismo corte, quédese con la de ejecutada_at más reciente.",
      },
      {
        pregunta: "¿Acertó el modelo en un corte pasado?",
        como: "Tome una corrida con corte de hace más de 60 días, sus conductores con nivel_retiro = 'Alto' y compare con conductores_con_grupo.fecha_retiro dentro de [corte, corte + 60 días). Para faltas, busque ausentismo_registros tipo = 'no_justificada' en [corte, corte + 30 días).",
      },
    ],
  },
];
