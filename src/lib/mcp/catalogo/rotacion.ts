// Catálogo semántico: conductores, cierres diarios, viajes perdidos, familia,
// incentivos y entregas de devengados. Verificado contra supabase/migrations
// (005, 006, 007, 011, 030, 031, 033-040), src/lib/gema/sync.ts,
// src/lib/rotacion/upload, src/lib/devengados y docs/*.md.

import type { DocRecurso } from "./tipos";

export const RECURSOS_ROTACION: DocRecurso[] = [
  // ── conductores_con_grupo ────────────────────────────────────────────────
  {
    nombre: "conductores_con_grupo",
    dominio: "rotacion",
    titulo: "Maestro de conductores con antigüedad",
    resumen:
      "Ficha de cada conductor (activo o retirado) con su grupo y meses de antigüedad calculados al día de hoy.",
    granularidad:
      "Una fila = un conductor, identificado por cédula única. Incluye activos y retirados; no hay filas por periodo.",
    descripcion:
      "Vista sobre la tabla base `conductores` que agrega `grupo_antiguedad` y `meses_antiguedad`. Los datos de la ficha vienen de GEMA. No trae producción, ausentismo ni personal administrativo.",
    origen:
      "Sincronización diaria con GEMA (vista vst_ext_get_conductores, más el correo tomado de vst_ext_get_personal): cada corrida refresca todo el maestro con upsert por cédula y no borra filas. La dispara el cron /api/cron/sync-gema (vercel.json: 0 8 * * *). Históricamente también se cargaba por Excel (vstConductoresactivos/retirados.xlsx), opción que ya no aparece en pantalla. `fecha_reingreso` se escribe aparte (ver columna).",
    identificador: "cedula",
    columnaFecha: "fecha_ingreso",
    // Sin fecha_reingreso: puede no existir en la vista y rompería el select.
    columnasPorDefecto: [
      "cedula",
      "nombre",
      "codigo",
      "tipo_conductor",
      "estado",
      "fecha_ingreso",
      "fecha_retiro",
      "grupo_antiguedad",
      "meses_antiguedad",
    ],
    columnas: {
      id: { descripcion: "UUID interno de la fila. Para cruzar datos use `cedula` o `codigo`." },
      cedula: {
        descripcion: "Número de identificación del conductor, en texto. Es único en la tabla.",
        formato: "Solo dígitos, sin ceros a la izquierda (así la normaliza el sync de GEMA)",
        advertencia:
          "Las tablas que se cargan por Excel (familia, incentivos) solo quitan puntos, espacios, comas y guiones, y pueden conservar ceros a la izquierda. Compare quitando esos ceros.",
      },
      nombre: { descripcion: "Nombre completo según GEMA. Vale \"SIN NOMBRE\" si GEMA no lo trae." },
      codigo: {
        descripcion:
          "Código de personal del conductor en GEMA, sin ceros a la izquierda. Es la llave para cruzar con los cierres y las entregas de caja.",
        relacion: "cierres_diarios.cod_conductor",
        advertencia:
          "Puede ser nulo: hay fichas sin código, por ejemplo las creadas desde Contratación antes de que existan en GEMA.",
      },
      correo: { descripcion: "Correo personal, tomado de la vista de personal de GEMA.", sensible: true },
      direccion: { descripcion: "Dirección de residencia.", sensible: true },
      celular: { descripcion: "Número de celular.", sensible: true },
      telefono: { descripcion: "Teléfono fijo.", sensible: true },
      tipo_conductor: {
        descripcion:
          "Tipo de conductor según GEMA (campo tipo_coductor de vst_ext_get_conductores). Los de empresa llevan la palabra EMPRESA y los de vehículos afiliados, AFILIADO.",
        valores: {
          "RELEVO TEMPORAL EMPRESA": "Conductor de la empresa (103 de los 104 activos de empresa al 2026-09-11)",
          "FIJO EMPRESA": "Conductor fijo de la empresa (en septiembre de 2026 el único activo es la ficha comodín 999999991)",
          "FIJO AFILIADO": "Conductor fijo de un vehículo afiliado",
          "RELEVO FIJO AFILIADO": "Relevo de un vehículo afiliado",
        },
        advertencia:
          "Nulo en las fichas creadas desde Contratación que aún no están en GEMA (19 activos al 2026-09-11): no las cuente como empresa ni como afiliado. Filtre con ilike '%EMPRESA%' o '%AFILIADO%' en vez de igualdad exacta.",
      },
      licencia: { descripcion: "Número de la licencia de conducción.", sensible: true },
      venc_licencia: { descripcion: "Vencimiento de la licencia de conducción.", formato: "date (día calendario)" },
      venc_contrato: { descripcion: "Vencimiento del contrato laboral.", formato: "date (día calendario)" },
      fecha_ingreso: {
        descripcion: "Fecha de ingreso a la empresa según GEMA. De ella salen la antigüedad y el grupo.",
        formato: "date (día calendario)",
        advertencia:
          "El sync diario la sobrescribe con lo que diga GEMA. No está verificado si, tras un reingreso, GEMA conserva la fecha original o pone la nueva.",
      },
      fecha_retiro: {
        descripcion: "Fecha de retiro. Es nula en los activos.",
        formato: "date (día calendario)",
        advertencia: "El sync descarta fechas con año fuera de 1940-2035 (en GEMA hay retiros con fecha de 2040).",
      },
      fecha_reingreso: {
        descripcion:
          "Fecha del último reingreso de un conductor que había sido retirado. La ficha del conductor la usa como corte para no mezclar el histórico anterior (cierres, viajes perdidos, ausentismo, incentivos). Es nula si nunca reingresó.",
        formato: "date (día calendario)",
        advertencia:
          "La escriben la carga reingresos.csv y el módulo de Contratación; el sync de GEMA no la toca. Muy pocos conductores la tienen (2 al 2026-09-11). Para analizar a un reingresado, filtre sus demás recursos desde esta fecha.",
      },
      experiencia: {
        descripcion:
          "En las fichas sincronizadas es la fecha de inicio de la experiencia como conductor (texto AAAA-MM-DD). En las cargas antiguas por Excel es texto libre.",
      },
      fecha_nacimiento: { descripcion: "Fecha de nacimiento.", formato: "date (día calendario)", sensible: true },
      observacion: {
        descripcion:
          "Observación libre de GEMA. Las fichas creadas desde Contratación dicen \"Creado automáticamente al contratar (módulo Candidatos)\".",
      },
      eps: { descripcion: "EPS (entidad de salud) a la que está afiliado.", sensible: true },
      arl: { descripcion: "ARL (riesgos laborales) a la que está afiliado.", sensible: true },
      pension: { descripcion: "Fondo de pensiones.", sensible: true },
      compensacion: { descripcion: "Caja de compensación familiar.", sensible: true },
      tipo_sangre: { descripcion: "Grupo sanguíneo y RH.", sensible: true },
      nivel_educativo: { descripcion: "Nivel educativo declarado.", sensible: true },
      num_hijos: {
        descripcion: "Número de hijos según GEMA.",
        unidad: "hijos",
        sensible: true,
        advertencia: "Es otra fuente distinta de la tabla `familia` y puede no coincidir con ella.",
      },
      estado_civil: { descripcion: "Estado civil.", sensible: true },
      reubicado: {
        descripcion:
          "Indica si el conductor está reubicado según GEMA. El sync escribe \"SI\" o nulo. Gestivo lo trata como categoría aparte de empresa y afiliado (la matriz de ausentismo lo clasifica como REUBICADO), y RRHH lo excluye al contar conductores operativos.",
        valores: { SI: "Reubicado (14 activos al 2026-09-11: 12 de empresa y 2 afiliados)" },
        advertencia:
          "Para excluir reubicados filtre reubicado is_null (no neq 'SI', que también descarta los nulos). GEMA no documenta a qué labor pasa un reubicado.",
      },
      estado: {
        descripcion: "Situación laboral actual. En el sync, `estado = 1` de GEMA se traduce a ACTIVO.",
        valores: { ACTIVO: "Vinculado actualmente", RETIRADO: "Ya no trabaja en la empresa" },
      },
      created_at: {
        descripcion: "Momento en que la fila entró a Gestivo. No es la fecha de ingreso a la empresa.",
        formato: "timestamptz UTC",
      },
      updated_at: {
        descripcion: "Fecha de actualización, con valor por defecto al insertar.",
        formato: "timestamptz UTC",
        advertencia: "`conductores` no tiene trigger de updated_at y el sync no la envía: no refleja la última modificación.",
      },
      grupo_antiguedad: {
        descripcion: "Tramo de antigüedad calculado desde fecha_ingreso hasta la fecha actual del servidor.",
        valores: {
          "0-3m": "Menos de 3 meses",
          "3-6m": "De 3 a menos de 6 meses",
          "6-12m": "De 6 a menos de 12 meses",
          "1+a": "12 meses o más",
        },
        advertencia: "Es nulo si falta fecha_ingreso. En los retirados sigue contando hasta hoy, no hasta el retiro.",
      },
      meses_antiguedad: {
        descripcion: "Meses completos entre fecha_ingreso y la fecha actual (años × 12 + meses).",
        unidad: "meses",
        advertencia: "En los retirados no es la antigüedad al retirarse: para eso calcule fecha_retiro − fecha_ingreso.",
      },
    },
    relaciones: [
      { recurso: "cierres_diarios", mediante: "codigo = cod_conductor", descripcion: "Producción diaria liquidada por GEMA." },
      { recurso: "viajes_perdidos", mediante: "cedula = cedula_conductor", descripcion: "Novedades de viajes del conductor." },
      { recurso: "devengados_entregas", mediante: "cedula = cedula_conductor", descripcion: "Pagos de caja de Tesorería." },
      { recurso: "familia", mediante: "cedula = cedula_empleado", descripcion: "Hijos y cónyuges registrados." },
      { recurso: "incentivos", mediante: "cedula = cedula", descripcion: "Incentivos entregados." },
      { recurso: "ausentismo", mediante: "cedula = cedula", descripcion: "Incapacidades." },
    ],
    advertencias: [
      "Incluye retirados: para la planta actual filtre estado = ACTIVO.",
      "«Activo» aquí NO es la planta de GEMA. Al 2026-09-11 figuraban 199 activos contra 179 en GEMA: 19 fichas creadas por el módulo de Contratación que todavía no existen en GEMA (sin código ni tipo_conductor y sin ningún cierre) y 2 fichas que ya no existen en GEMA pero siguen en ACTIVO. Para la planta operativa filtre también codigo not_null y diga que las fichas sin código se excluyeron.",
      "GEMA tiene fichas comodín activas que no son personas: cédula 99999999 («NO DEFINIDO…», código 10735, donde caen los turnos sin conductor) y cédula 999999991 («CONDUCTOR SIN .», código 9999). Exclúyalas siempre al contar conductores (filtros cedula neq '99999999' y cedula neq '999999991'). Regla general del módulo de riesgo: cédula con todos los dígitos iguales o fuera de 6-10 dígitos, o nombre con NO DEFINIDO, SIN DEFINIR, POR DEFINIR o NO REGISTRA.",
      "Para «conductores de empresa» agrupe por la palabra EMPRESA en tipo_conductor (RELEVO TEMPORAL EMPRESA y FIJO EMPRESA); para «afiliados», por AFILIADO (FIJO AFILIADO y RELEVO FIJO AFILIADO). Si la pregunta es de disponibilidad, pregunte o declare si excluye reubicados, incapacitados o ausentes del día: cada criterio cambia la cifra.",
      "Cuente con agregar_datos (count o count_distinct de cedula), no trayendo filas con consultar_datos: así la suma de los grupos cuadra con el total.",
      "El sync nunca borra: una ficha que ya no esté en GEMA se queda con su último estado.",
      "Hay cédulas mal digitadas en GEMA (por ejemplo, con un dígito de más) que generan fichas duplicadas de la misma persona (docs/analisis-riesgo-conductores.md).",
      "La antigüedad se calcula al momento de la consulta, así que cambia de un día para otro sin que cambie el dato.",
      "Para estudiar rotación, un reingreso tiene fecha_reingreso y fecha_retiro nula; los retiros previos a ese reingreso no quedan en esta vista.",
    ],
    noConfundirCon: [
      {
        recurso: "employees",
        diferencia:
          "`employees` es el personal administrativo de RRHH: el sync borra de ahí los cargos CONDUCTOR, así que los conductores solo están en esta vista.",
      },
      {
        recurso: "conductores",
        diferencia:
          "`conductores` es la tabla base, sin grupo ni meses de antigüedad y no expuesta en la API; es la única que garantiza tener fecha_reingreso.",
      },
      { recurso: "propietarios", diferencia: "`propietarios` son los dueños de los vehículos, no quienes los conducen." },
      { recurso: "candidates", diferencia: "`candidates` son aspirantes en proceso de selección, todavía no conductores." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos conductores operativos o disponibles hay hoy, sin reubicados ni incapacitados?",
        como:
          "Definición de la empresa (cuadrada con el reporte de GEMA del 2026-09-11): activos − fichas de prueba − reubicados − incapacitados permanentes, entendidos como incapacidad continua de más de 30 días. Paso 1: agregar_datos agrupando por tipo_conductor con count_distinct de cedula y filtros estado eq ACTIVO, codigo not_null, cedula neq '99999999', cedula neq '999999991' y reubicado is_null. Paso 2: en ausentismo, certificados con eliminado_at is_null y fecha_fin gte hoy de esas cédulas; encadene las prórrogas (un certificado que empieza a más tardar el día siguiente al fin del anterior continúa la incapacidad) y descuente a quien lleve más de 30 días seguidos a hoy. Resultado del 2026-09-11: 179 activos − 2 fichas de prueba − 14 reubicados − 1 incapacitado permanente = 162 disponibles, igual al reporte de GEMA. Informe aparte, sin descontarlas salvo que se pida, las incapacidades cortas vigentes hoy (en ausentismo o en ausentismo_registros con tipo eq 'incapacidad'; ese día eran 2, lo que daría 160) y las demás ausencias del día (no justificadas, taller, citas EPS).",
      },
      {
        pregunta: "¿Cuántos conductores activos hay por grupo de antigüedad?",
        como: "Filtrar estado = ACTIVO, agrupar por grupo_antiguedad y contar cédulas.",
      },
      {
        pregunta: "¿Cuántos conductores se retiraron en un mes?",
        como: "Filtrar estado = RETIRADO y fecha_retiro dentro del mes; contar.",
      },
      {
        pregunta: "¿Qué licencias vencen en los próximos 30 días?",
        como: "Filtrar estado = ACTIVO y venc_licencia entre hoy y hoy + 30; ordenar por venc_licencia.",
      },
      {
        pregunta: "¿Cuántos ingresaron o reingresaron en el trimestre?",
        como: "Contar fecha_ingreso dentro del rango y, por aparte, fecha_reingreso dentro del rango.",
      },
    ],
  },

  // ── cierres_diarios ──────────────────────────────────────────────────────
  {
    nombre: "cierres_diarios",
    dominio: "rotacion",
    titulo: "Cierres diarios por conductor",
    resumen:
      "Liquidación diaria de GEMA por conductor y ruta: viajes, timbradas, porcentajes de pago y salario bruto y neto del día.",
    granularidad:
      "Una fila = un conductor (código) en un día de operación y una ruta. Hay llave única (cod_conductor, fecha, ruta): no hay duplicados, pero un conductor que rodó varias rutas tiene varias filas ese día.",
    descripcion:
      "Es el cierre que liquida GEMA; Tesorería toma de aquí la producción neta del día (salario_neto_dia) para liberar pagos. Las filas de GEMA con el mismo conductor, día y ruta (otro vehículo o turno) llegan ya sumadas en una sola. No contiene viajes individuales ni pagos de caja.",
    origen:
      "Sync diario desde GEMA (procedimiento pa_ext_get_IngresoConductorByFecha), con upsert por (cod_conductor, fecha, ruta). Cada corrida vuelve a sincronizar los últimos 45 días, o más atrás si GEMA viene atrasado, porque GEMA ajusta los cierres después. El histórico arranca el 2026-01-01. Las filas con origen = excel vienen de cargas antiguas de \"CIERRE DEFINITIVO CONDUCTOR *.xlsx\".",
    identificador: "id",
    columnaFecha: "fecha",
    columnasPorDefecto: [
      "id",
      "fecha",
      "cod_conductor",
      "cedula_conductor",
      "conductor_nombre",
      "ruta",
      "tipo_cierre",
      "viajes",
      "timbradas",
      "salario_neto_dia",
      "origen",
    ],
    columnas: {
      id: { descripcion: "UUID interno de la fila." },
      cod_conductor: {
        descripcion: "Código de personal del conductor en GEMA, sin ceros a la izquierda.",
        relacion: "conductores_con_grupo.codigo",
      },
      conductor_nombre: { descripcion: "Nombre del conductor tal como aparece en el cierre." },
      fecha: { descripcion: "Día de operación liquidado.", formato: "date, día calendario de Colombia (tal como lo entrega GEMA)" },
      tipo_cierre: {
        descripcion:
          "Modalidad de liquidación que aplicó GEMA. El código reconoce: los que empiezan por \"CU\" (con \"PROM\" = CU promedios; si no, CU rutas, por ejemplo \"CU (RUTAS,GRUPOS)\"), los que contienen \"SEGURRUTA\" (Caja Única) y los que contienen \"INDIVIDUAL\".",
        advertencia: "La lista de literales no es exhaustiva. En los tipos CU la timbrada que se liquida no es la columna `timbradas`.",
      },
      ruta: {
        descripcion: "Ruta del cierre. En GEMA, sin ruta se guarda cadena vacía, porque la ruta forma parte de la llave única.",
      },
      grupo_liquidacion: { descripcion: "Grupo de liquidación de GEMA.", advertencia: "Significado no verificado en el código." },
      vehiculo: {
        descripcion: "Código interno del vehículo. Si GEMA consolidó varias filas, trae varios códigos separados por coma.",
      },
      viajes: {
        descripcion: "Viajes liquidados al conductor (en la liquidación, los \"Viajes C\"). Admite medio viaje (0,5).",
        unidad: "viajes",
      },
      timbradas: {
        descripcion: "Timbradas (pasajeros registrados) individuales del conductor en esa fila.",
        unidad: "timbradas",
        advertencia: "En los cierres tipo CU la timbrada liquidada se deriva: salario_bruto_dia ÷ (pct_total/100) ÷ tarifa ($3.300, o $3.400 los domingos).",
      },
      diff_tim: {
        descripcion: "Diferencia de timbradas del Excel de cierre. La ficha del conductor la resta de `timbradas`.",
        unidad: "timbradas",
        advertencia: "Solo existe en las filas cargadas por Excel; en las de GEMA es nula. Significado exacto no verificado en el código.",
      },
      prom_tim: {
        descripcion: "Promedio de timbradas del cierre (promTimbradas en GEMA).",
        unidad: "timbradas",
        advertencia: "La base del promedio (por viaje, por grupo) no está verificada en el código.",
      },
      pct_indiv: {
        descripcion: "Porcentaje individual de pago del cierre (porcentajeInd en GEMA).",
        unidad: "%",
        advertencia: "Se asume la escala 0-100 de pct_total; no está verificado. Para las filas de Excel tampoco se verificó la escala.",
      },
      pct_grupo: {
        descripcion: "Porcentaje de pago por grupo (porcentajeGrupo en GEMA).",
        unidad: "%",
        advertencia: "Escala y significado exacto no verificados.",
      },
      pct_total: {
        descripcion: "Porcentaje total de pago del cierre, sobre el bruto (totalPorcentaje en GEMA).",
        unidad: "% (escala 0-100; el código lo divide entre 100 y usa 16 si falta)",
      },
      tim_grupo: {
        descripcion: "Timbradas del grupo, según el Excel de cierre.",
        unidad: "timbradas",
        advertencia: "Solo en las filas de Excel; nula en GEMA.",
      },
      viajes_grupo: {
        descripcion: "Viajes del grupo, según el Excel de cierre.",
        unidad: "viajes",
        advertencia: "Solo en las filas de Excel; nula en GEMA.",
      },
      prom_grupo: {
        descripcion: "Promedio del grupo, según el Excel de cierre.",
        advertencia: "Solo en las filas de Excel; nula en GEMA. Significado no verificado.",
      },
      source_file: { descripcion: "Nombre del Excel de origen, o \"GEMA\" si vino del sync." },
      created_at: { descripcion: "Momento de inserción en Gestivo.", formato: "timestamptz UTC" },
      origen: {
        descripcion: "Fuente de la fila.",
        valores: { gema: "Sincronizada desde GEMA", excel: "Cargada por Excel (histórico, antes del sync)" },
      },
      cedula_conductor: {
        descripcion: "Cédula del conductor que envía GEMA: solo dígitos, sin ceros a la izquierda.",
        relacion: "conductores_con_grupo.cedula",
        advertencia: "Es nula en las filas antiguas cargadas por Excel. Para cruzar todo el histórico use cod_conductor.",
      },
      bruto: {
        descripcion: "Bruto que trae la base de GEMA. Es un valor GRUPAL (monto por viaje compartido entre conductores), no el bruto individual.",
        unidad: "COP",
        advertencia: "La app no lo usa porque infla la CU cerca de 10 %. El bruto individual es salario_bruto_dia ÷ (pct_total/100).",
      },
      salario_bruto_dia: { descripcion: "Salario bruto del conductor para esa fila (ruta) del día.", unidad: "COP" },
      salario_neto_dia: {
        descripcion:
          "Producción neta del conductor para esa fila. Sumando las filas del día se obtiene la producción que usa Tesorería. En el caso validado de GEMA, neto = bruto día − ahorro.",
        unidad: "COP",
      },
      ahorro: { descripcion: "Ahorro descontado del salario del día.", unidad: "COP", advertencia: "No está verificado si es voluntario." },
      ahorro_obli: {
        descripcion: "Ahorro obligatorio descontado del salario del día. La app muestra ahorro + ahorro_obli como un solo valor.",
        unidad: "COP",
      },
      anticipo: { descripcion: "Anticipo registrado en el cierre.", unidad: "COP", advertencia: "La app no lo usa; significado no verificado." },
    },
    relaciones: [
      { recurso: "conductores_con_grupo", mediante: "cod_conductor = codigo", descripcion: "Ficha, estado y antigüedad del conductor." },
      { recurso: "devengados_entregas", mediante: "cedula_conductor y fecha dentro de la quincena", descripcion: "Pagos de caja liberados con base en salario_neto_dia." },
      { recurso: "viajes_recaudados", mediante: "cod_conductor = codigo_conductor y fecha = fecha_viaje", descripcion: "Detalle viaje por viaje del mismo día." },
    ],
    advertencias: [
      "El día de un conductor es la SUMA de sus filas (una por ruta): nunca tome una sola fila como su producción del día.",
      "GEMA entrega los cierres con días de atraso y los ajusta después: los últimos días pueden estar incompletos o cambiar.",
      "El sync reescribe a diario la ventana de 45 días (cron 0 8 * * *); una lectura mientras corre puede ver datos a medias.",
      "Las filas por Excel (origen = excel) no tienen cédula ni salarios, y sí tienen diff_tim y las columnas de grupo; las de GEMA son al revés.",
      "Tras un reingreso, la ficha del conductor solo muestra cierres desde fecha_reingreso; esta tabla conserva todo el histórico.",
    ],
    noConfundirCon: [
      {
        recurso: "viajes_recaudados",
        diferencia:
          "`viajes_recaudados` es una fila por viaje recaudado, con bruto y neto por viaje; los cierres son la liquidación consolidada por conductor, día y ruta, y la producción oficial es salario_neto_dia, no la suma de netos de viajes.",
      },
      { recurso: "ingreso_tercero", diferencia: "`ingreso_tercero` liquida al vehículo y a su propietario, no el salario del conductor." },
      { recurso: "devengados_entregas", diferencia: "`devengados_entregas` son los pagos en efectivo de la caja, no la producción." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuánto produjo neto un conductor en la quincena?",
        como: "Filtrar cod_conductor (o cedula_conductor) y fecha entre el 1 y el 15 (o del 16 a fin de mes); sumar salario_neto_dia.",
      },
      {
        pregunta: "¿Cuántos días trabajó cada conductor en el mes?",
        como: "Filtrar fecha dentro del mes, agrupar por cod_conductor y contar fechas distintas.",
      },
      {
        pregunta: "¿Viajes y timbradas por ruta en un día?",
        como: "Filtrar fecha, agrupar por ruta y sumar viajes y timbradas.",
      },
    ],
  },

  // ── viajes_perdidos ──────────────────────────────────────────────────────
  {
    nombre: "viajes_perdidos",
    dominio: "rotacion",
    titulo: "Viajes perdidos y novedades de viaje",
    resumen:
      "Viajes programados que tuvieron una novedad distinta de NORMAL (ausencia, accidente, pérdida de turno…), con su causa y el conductor asignado.",
    granularidad:
      "Una fila = un viaje programado con novedad. No hay llave única, así que pueden existir duplicados (por ejemplo, el mismo viaje cargado por Excel y por GEMA).",
    descripcion:
      "Registra cada viaje con novedad, con su tipología (a quién se imputa) y su detalle. Los indicadores de la app cuentan como viaje perdido del conductor solo los de tipologia = CONDUCTOR. No contiene los viajes normales.",
    origen:
      "Sync diario desde GEMA (procedimiento pa_ext_get_ViajesByFecha, descartando novedad NORMAL): cada corrida borra las filas con origen = gema de la ventana (45 días o más) y las vuelve a insertar. Las filas con origen = excel vienen de cargas mensuales antiguas (Feb_2026.xlsx, Mar_2026.xlsx) que reemplazaban el periodo.",
    identificador: "id",
    columnaFecha: "fecha",
    volumen: "Unas 28.500 filas al 10-sep-2026 (docs/analisis-riesgo-conductores.md).",
    columnasPorDefecto: [
      "id",
      "fecha",
      "cedula_conductor",
      "conductor_nombre",
      "tipologia",
      "novedad",
      "ruta",
      "vehiculo",
      "periodo",
      "quincena",
      "origen",
    ],
    columnas: {
      id: { descripcion: "UUID interno de la fila." },
      cedula_conductor: {
        descripcion: "Cédula del conductor asignado al viaje.",
        relacion: "conductores_con_grupo.cedula",
        formato: "GEMA: solo dígitos, sin ceros a la izquierda. Excel: puede conservar ceros a la izquierda",
      },
      tipologia: {
        descripcion: "A quién se imputa la novedad.",
        valores: { CONDUCTOR: "Imputable al conductor; es lo que cuentan los indicadores de rotación y riesgo" },
        advertencia: "Los demás literales no están verificados en el código. Compare sin distinguir mayúsculas.",
      },
      novedad: {
        descripcion:
          "Tipo de novedad según GEMA. El código busca, por ejemplo, textos que contienen \"ACCIDENTE\", \"AUSENCIA CONDUCTOR\" o \"PERDIDA TURNO\".",
        advertencia: "Nunca vale NORMAL en las filas de GEMA. La lista completa de literales no está verificada.",
      },
      detalle_novedad: { descripcion: "Detalle en texto libre de la novedad." },
      fecha: { descripcion: "Día programado del viaje.", formato: "date, día calendario de Colombia" },
      despacho: {
        descripcion: "En GEMA, el nombre del despachador; en el Excel, la columna \"Despacho\".",
        advertencia: "No está verificado que el Excel tenga el mismo significado.",
      },
      tipo_propietario: { descripcion: "Tipo de propietario del vehículo según GEMA.", advertencia: "Literales no verificados." },
      vehiculo: { descripcion: "Código interno del vehículo." },
      placa: { descripcion: "Placa del vehículo." },
      conductor_nombre: { descripcion: "Nombre del conductor asignado." },
      turno: { descripcion: "Turno del viaje según GEMA.", advertencia: "Literales no verificados." },
      viaje: { descripcion: "Identificador del viaje en la programación de GEMA, en texto.", advertencia: "Formato no verificado." },
      ruta: { descripcion: "Ruta programada o, si falta, la ruta reprogramada." },
      planillero: { descripcion: "Planillero registrado en el viaje.", advertencia: "Significado no verificado en el código." },
      periodo: { descripcion: "Mes del viaje, derivado de fecha.", formato: "texto AAAA-MM" },
      quincena: {
        descripcion: "Quincena del mes, derivada de fecha.",
        valores: { "1": "Días 1 a 15", "2": "Día 16 a fin de mes" },
      },
      source_file: { descripcion: "Nombre del Excel de origen, o \"GEMA\"." },
      created_at: { descripcion: "Momento de inserción; en GEMA cambia cada vez que se reescribe la ventana.", formato: "timestamptz UTC" },
      origen: {
        descripcion: "Fuente de la fila.",
        valores: { gema: "Sincronizada desde GEMA", excel: "Cargada por Excel (histórico)" },
      },
    },
    relaciones: [
      { recurso: "conductores_con_grupo", mediante: "cedula_conductor = cedula", descripcion: "Ficha y estado del conductor." },
      { recurso: "ausentismo", mediante: "cedula_conductor = cedula y fecha dentro de la incapacidad", descripcion: "Una incapacidad puede explicar ausencias." },
    ],
    advertencias: [
      "\"Viajes perdidos del conductor\" = tipologia CONDUCTOR. Sin ese filtro se cuentan también las novedades que no le son imputables.",
      "Posibles duplicados entre filas excel y gema para feb-mar 2026, porque el sync borra solo las suyas (no verificado en los datos).",
      "El sync borra y reinserta la ventana cada día: el 2026-09-10 una lectura concurrente vio 22.802 de 28.549 filas.",
      "Los created_at y los id de las filas de GEMA cambian en cada sync: no los use como referencia estable.",
    ],
    noConfundirCon: [
      { recurso: "viajes_recaudados", diferencia: "`viajes_recaudados` son los viajes realizados y recaudados, con dinero; aquí solo están los que tuvieron novedad." },
      { recurso: "ausentismo", diferencia: "`ausentismo` registra incapacidades con días y diagnóstico; aquí está cada viaje afectado." },
      { recurso: "cierres_diarios", diferencia: "`cierres_diarios` es la producción liquidada; un viaje perdido no aparece como fila de cierre." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos viajes perdidos imputables tuvo cada conductor en la quincena?",
        como: "Filtrar tipologia = CONDUCTOR, periodo y quincena; agrupar por cedula_conductor y contar.",
      },
      {
        pregunta: "¿Cuántas novedades fueron por accidente y cuántas por ausencia?",
        como: "Filtrar tipologia = CONDUCTOR y un rango de fecha; clasificar según si novedad contiene ACCIDENTE.",
      },
      {
        pregunta: "¿Qué rutas pierden más viajes?",
        como: "Filtrar un rango de fecha, agrupar por ruta y contar.",
      },
    ],
  },

  // ── familia ──────────────────────────────────────────────────────────────
  {
    nombre: "familia",
    dominio: "rrhh",
    titulo: "Núcleo familiar registrado",
    resumen: "Hijos y cónyuges de los trabajadores registrados ante la caja de compensación, según el último Excel cargado.",
    granularidad:
      "Una fila = un familiar a cargo de un trabajador. No hay llave única: una persona repetida en el archivo queda repetida.",
    descripcion:
      "Foto del archivo de la caja de compensación (administrativos y conductores). No tiene fecha, historial ni cédula del familiar; la edad no se actualiza.",
    origen:
      "Excel \"Hijos y Conyugues *.xlsx\" (hoja Hijos_Conyugue) cargado a mano en Rotación › Datos. Cada carga borra toda la tabla y la vuelve a llenar. No tiene frecuencia fija.",
    identificador: "id",
    columnasPorDefecto: ["id", "cedula_empleado", "parentesco", "edad", "created_at"],
    columnas: {
      id: { descripcion: "UUID interno; cambia en cada carga." },
      cedula_empleado: {
        descripcion: "Cédula del trabajador del que depende el familiar.",
        relacion: "conductores_con_grupo.cedula",
        formato: "Sin puntos, espacios, comas ni guiones; puede conservar ceros a la izquierda",
        advertencia: "Puede ser un administrativo: si no aparece en conductores_con_grupo, búsquelo en employees.document_number.",
      },
      nombre_familiar: { descripcion: "Nombre del familiar a cargo.", sensible: true },
      parentesco: {
        descripcion: "Parentesco con el trabajador, tal como viene en el Excel (hijos y cónyuges).",
        advertencia: "Literales no verificados en el código; revise los valores distintos antes de filtrar.",
      },
      edad: {
        descripcion: "Edad del familiar cuando se hizo el archivo.",
        unidad: "años",
        advertencia: "No se recalcula: envejece con cada mes que pase sin una carga nueva.",
      },
      created_at: { descripcion: "Momento de la última carga (todas las filas quedan casi con la misma fecha).", formato: "timestamptz UTC" },
    },
    relaciones: [
      { recurso: "conductores_con_grupo", mediante: "cedula_empleado = cedula", descripcion: "Conductor titular." },
      { recurso: "employees", mediante: "cedula_empleado = document_number", descripcion: "Empleado administrativo titular." },
    ],
    advertencias: [
      "Solo incluye lo registrado ante la caja de compensación; un trabajador sin filas no significa que no tenga familia.",
      "Reemplazo total: no hay histórico, solo el contenido del último archivo.",
    ],
    noConfundirCon: [
      { recurso: "conductores_con_grupo", diferencia: "`conductores_con_grupo.num_hijos` es un número declarado en GEMA; aquí están las personas del archivo de la caja, y los dos datos pueden no coincidir." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Qué familiares tiene registrados un trabajador?", como: "Filtrar cedula_empleado; listar nombre_familiar, parentesco y edad." },
      {
        pregunta: "¿Cuántos trabajadores tienen hijos menores de cierta edad?",
        como: "Filtrar edad < N (y parentesco de hijo) y contar cedula_empleado distintas.",
      },
    ],
  },

  // ── incentivos ───────────────────────────────────────────────────────────
  {
    nombre: "incentivos",
    dominio: "rrhh",
    titulo: "Incentivos entregados a conductores",
    resumen: "Incentivos (bonificaciones) entregados a conductores por mes y concepto, según el Excel maestro acumulado.",
    granularidad:
      "Una fila = un incentivo entregado a un conductor en un mes y concepto. No hay llave única: un conductor puede tener varias filas en el mismo mes.",
    descripcion:
      "Listado maestro de incentivos que lleva RRHH por fuera de GEMA. Cada carga trae el histórico completo. No incluye los pagos de caja de devengados ni el salario.",
    origen:
      "Excel \"Incentivos entregados *.xlsx\" cargado a mano en Rotación › Datos. Cada carga borra toda la tabla y reinserta el archivo acumulado. No tiene frecuencia fija.",
    identificador: "id",
    columnaFecha: "periodo",
    columnasPorDefecto: ["id", "cedula", "nombre", "mes_entrega", "periodo", "valor", "concepto"],
    columnas: {
      id: { descripcion: "UUID interno; cambia en cada carga." },
      cedula: {
        descripcion: "Cédula del conductor que recibió el incentivo.",
        relacion: "conductores_con_grupo.cedula",
        formato: "Sin puntos, espacios, comas ni guiones; puede conservar ceros a la izquierda",
      },
      nombre: { descripcion: "Nombre del conductor según el Excel." },
      mes_entrega: {
        descripcion: "Mes de entrega en texto, por ejemplo \"ENERO 2026\". Si el Excel traía una fecha, se convierte a \"MES AAAA\".",
        advertencia: "Al ordenar por esta columna el orden es alfabético, no cronológico. Para rangos y orden use periodo.",
      },
      periodo: {
        descripcion: "Primer día del mes de entrega, derivado de mes_entrega.",
        formato: "date AAAA-MM-01 (día calendario)",
        advertencia: "Es nulo cuando el texto del mes no se pudo interpretar: esas filas se pierden en los filtros por fecha.",
      },
      valor: { descripcion: "Monto del incentivo. Vale 0 si la celda venía vacía.", unidad: "COP" },
      concepto: { descripcion: "Concepto del incentivo en texto libre.", advertencia: "Literales no verificados en el código." },
      source_file: { descripcion: "Nombre del Excel cargado." },
      created_at: { descripcion: "Momento de la última carga; no es la fecha de entrega.", formato: "timestamptz UTC" },
    },
    relaciones: [
      { recurso: "conductores_con_grupo", mediante: "cedula = cedula", descripcion: "Estado y antigüedad del conductor." },
    ],
    advertencias: [
      "Reemplazo total en cada carga: si el último archivo omitió meses, esos meses desaparecen.",
      "Tras un reingreso, la ficha del conductor solo muestra incentivos con periodo desde el mes del reingreso (o periodo nulo).",
      "Cruzar con conductores puede fallar si la cédula del Excel trae ceros a la izquierda.",
    ],
    noConfundirCon: [
      {
        recurso: "devengados_entregas",
        diferencia:
          "`devengados_entregas` son los pagos diarios en efectivo que hace Tesorería con el excedente de producción; los incentivos son bonificaciones mensuales que registra RRHH en Excel.",
      },
      { recurso: "cierres_diarios", diferencia: "`cierres_diarios` trae el salario de producción del día, que no incluye estos incentivos." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuánto se pagó en incentivos por mes?", como: "Agrupar por periodo y sumar valor; revisar aparte las filas con periodo nulo." },
      { pregunta: "¿Qué incentivos recibió un conductor?", como: "Filtrar cedula y ordenar por periodo descendente." },
      { pregunta: "¿Cuál es el total por concepto en el año?", como: "Filtrar periodo dentro del año, agrupar por concepto y sumar valor." },
    ],
  },

  // ── devengados_entregas ──────────────────────────────────────────────────
  {
    nombre: "devengados_entregas",
    dominio: "tesoreria",
    titulo: "Entregas de caja de devengados",
    resumen:
      "Movimientos de la caja de \"otros devengados\": pagos en efectivo a conductores con cargo al excedente de su producción, y reversos de pagos devueltos.",
    granularidad:
      "Una fila = un movimiento de caja: un pago (DEBITO) o el reverso contable (CREDITO) de un pago devuelto. Por conductor y día hay como máximo dos pagos vigentes (el segundo, autorizado).",
    descripcion:
      "El cajero solo puede entregar hasta el excedente liberado de la quincena: la producción neta acumulada (cierres_diarios.salario_neto_dia) menos la base diaria (hoy $85.000 por día con producción, en app_settings). Una devolución marca el pago como devuelta y crea un reverso con el mismo valor.",
    origen:
      "Formulario de caja en Tesorería › Devengados, en tiempo real, mediante funciones transaccionales (registrar_entrega_devengado, registrar_entrega_extemporanea, registrar_devolucion_devengado). No hay sync. Una persona marca a mano trasladada_gema después de digitar el movimiento en GEMA.",
    identificador: "id",
    columnaFecha: "fecha",
    // Sin filtroPorDefecto: los reversos y los pagos devueltos son información válida.
    columnasPorDefecto: [
      "id",
      "fecha",
      "periodo",
      "quincena",
      "cedula_conductor",
      "codigo_conductor",
      "conductor_nombre",
      "valor_entregado",
      "movimiento",
      "estado",
      "devolucion_de",
      "trasladada_gema",
    ],
    columnas: {
      id: { descripcion: "UUID del movimiento." },
      fecha: {
        descripcion:
          "Día contable del movimiento: la fecha operativa del módulo, que es el día real de Bogotá salvo que un administrador la fije en un día cerrado. Un reverso lleva la fecha del pago que anula.",
        formato: "date, día calendario de Colombia",
        advertencia: "Puede diferir del día de created_at (registros extemporáneos, reversos, fecha operativa fijada).",
      },
      periodo: { descripcion: "Mes de la quincena liquidada.", formato: "texto AAAA-MM" },
      quincena: {
        descripcion: "Quincena del periodo.",
        valores: { "1": "Días 1 a 15", "2": "Día 16 a fin de mes" },
      },
      cedula_conductor: { descripcion: "Cédula del conductor que recibe el pago.", relacion: "conductores_con_grupo.cedula" },
      codigo_conductor: { descripcion: "Código de personal del conductor en GEMA.", relacion: "conductores_con_grupo.codigo" },
      conductor_nombre: { descripcion: "Nombre del conductor al momento del pago." },
      viajes: {
        descripcion: "Arreglo JSON con los números de viajes_recaudados.numero del día, que sirven de soporte del pago.",
        relacion: "viajes_recaudados.numero",
        advertencia: "Es un arreglo vacío en los reversos y en los registros hechos por un administrador a nombre de un cajero.",
      },
      valor_entregado: {
        descripcion: "Monto del movimiento, siempre positivo (CHECK > 0), también en los reversos.",
        unidad: "COP",
        advertencia: "El signo lo da `movimiento`: no sume todas las filas.",
      },
      cuenta_contable: { descripcion: "Cuenta contable del movimiento; por defecto 281505010. El reverso copia la del pago original." },
      movimiento: {
        descripcion: "Naturaleza contable del movimiento.",
        valores: { DEBITO: "Pago entregado al conductor", CREDITO: "Reverso automático por la devolución total de un pago" },
      },
      observacion: {
        descripcion: "Nota del cajero. En los reversos: \"Devolución total de la entrega <id>\" y, si aplica, la fecha en que se registró.",
      },
      trasladada_gema: { descripcion: "true si una persona ya digitó el movimiento en GEMA (marca manual)." },
      trasladada_at: { descripcion: "Momento en que se marcó como trasladada.", formato: "timestamptz UTC" },
      trasladada_por: { descripcion: "UUID del usuario (profiles) que marcó el traslado." },
      aprobada_por: {
        descripcion:
          "UUID del usuario (profiles) acreditado con el pago: el cajero que entregó el dinero, aunque lo haya digitado un administrador. En un reverso, quien registró la devolución.",
      },
      created_at: {
        descripcion: "Momento real en que se digitó el registro.",
        formato: "timestamptz UTC (hora de Colombia = UTC − 5)",
        advertencia: "Un 20:11 en la base corresponde a las 3:11 p. m. en Bogotá; no son transacciones fuera de horario.",
      },
      estado: {
        descripcion: "Estado del movimiento.",
        valores: {
          activa: "Pago vigente",
          devuelta: "Pago anulado por devolución total (tiene un reverso asociado)",
          reverso: "Fila CREDITO que compensa un pago devuelto",
        },
      },
      devolucion_de: { descripcion: "En un reverso, id del pago original que anula.", relacion: "devengados_entregas.id" },
      devolucion_motivo: { descripcion: "Motivo de la devolución; se guarda en el pago devuelto y en su reverso." },
      devuelta_at: { descripcion: "Momento en que se registró la devolución (en el pago original).", formato: "timestamptz UTC" },
      devuelta_por: { descripcion: "UUID del usuario que registró la devolución (en el pago original)." },
      segundo_pago: { descripcion: "true si es el segundo pago del día al mismo conductor, que exige autorización de un administrador." },
      autorizado_por: {
        descripcion:
          "Solo cuando segundo_pago = true: correo del administrador que autorizó el pago. Si un administrador registró el pago a nombre de un cajero, es su propio correo. Nulo en los demás casos.",
        sensible: true,
      },
      autorizacion_motivo: { descripcion: "Motivo de la autorización del segundo pago." },
      autorizado_at: { descripcion: "Momento de la autorización del segundo pago.", formato: "timestamptz UTC" },
      saldo_antes: {
        descripcion: "Excedente disponible de la quincena para el conductor justo antes del pago.",
        unidad: "COP",
        advertencia: "Es nulo en los reversos y en los pagos anteriores a la migración 034.",
      },
      saldo_despues: {
        descripcion: "Disponible después del pago (saldo_antes − valor_entregado).",
        unidad: "COP",
        advertencia: "Es nulo en los reversos y en los pagos anteriores a la migración 034.",
      },
      extemporanea: {
        descripcion: "true si un administrador registró el pago con la fecha contable de un día ya cerrado.",
      },
      registrada_por: {
        descripcion: "UUID del administrador que digitó un pago a nombre de un cajero (día cerrado o día en curso). Es nulo en los pagos normales de caja.",
      },
      registrada_por_email: { descripcion: "Correo de ese administrador.", sensible: true },
      registro_motivo: { descripcion: "Motivo obligatorio del registro hecho a nombre de un cajero." },
      registro_at: { descripcion: "Momento de ese registro.", formato: "timestamptz UTC" },
    },
    relaciones: [
      { recurso: "conductores_con_grupo", mediante: "cedula_conductor = cedula", descripcion: "Estado del conductor (a un RETIRADO no se le paga por caja normal)." },
      { recurso: "cierres_diarios", mediante: "cedula_conductor y fecha dentro de periodo y quincena", descripcion: "Producción neta que libera el tope de pago." },
      { recurso: "viajes_recaudados", mediante: "viajes contiene numero", descripcion: "Viajes de soporte del pago." },
    ],
    advertencias: [
      "Total pagado = suma de valor_entregado con movimiento = DEBITO y estado = activa. Sumar todas las filas cuenta dos veces el dinero devuelto.",
      "Desde las migraciones 037/038 el reverso lleva la fecha, el periodo y la quincena del pago original, así que el débito y el crédito se anulan el mismo día.",
      "La migración 039 movió 22 pagos del 2026-07-21 al 2026-07-18 porque se registraron mientras la fecha operativa estaba mal puesta.",
      "Un registro con registrada_por distinto de aprobada_por es una novedad: quien digitó no es quien entregó el dinero.",
      "Los pagos a conductores retirados (liquidación de su excedente) solo los registra un administrador.",
    ],
    noConfundirCon: [
      { recurso: "incentivos", diferencia: "`incentivos` son bonificaciones mensuales que registra RRHH en Excel; aquí están los pagos diarios en efectivo del excedente de producción." },
      { recurso: "cierres_diarios", diferencia: "`cierres_diarios` es lo producido y liquidado por GEMA; aquí está lo que efectivamente salió de la caja." },
      { recurso: "viajes_recaudados", diferencia: "`viajes_recaudados` es el recaudo de cada viaje; aquí esos viajes solo aparecen como soporte del pago." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuánto entregó la caja en un día?",
        como: "Filtrar fecha, movimiento = DEBITO y estado = activa; sumar valor_entregado (agrupar por aprobada_por para ver cada cajero).",
      },
      {
        pregunta: "¿Cuánto recibió un conductor en la quincena?",
        como: "Filtrar cedula_conductor, periodo, quincena, movimiento = DEBITO y estado = activa; sumar valor_entregado.",
      },
      {
        pregunta: "¿Qué pagos faltan por trasladar a GEMA?",
        como: "Filtrar trasladada_gema = false y movimiento = DEBITO (revisar aparte los CREDITO); ordenar por fecha.",
      },
      {
        pregunta: "¿Qué devoluciones hubo y por qué?",
        como: "Filtrar estado = devuelta; leer devolucion_motivo, devuelta_at y devuelta_por.",
      },
    ],
  },
];
