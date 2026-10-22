// Catálogo semántico: estado de la copia de MGX (qué tan fresca está cada
// tabla). Verificado contra la migración 20261021193546_tablas_espejo_de_mgx.sql
// (mgx_tablas, mgx_corridas), src/lib/mgx/sync.ts y docs/mgx-sincronizacion.md.

import type { DocRecurso } from "./tipos";
import { COLUMNA_EMPRESA } from "./mgx-comun";

export const RECURSOS_MGX_ESTADO: DocRecurso[] = [
  {
    nombre: "mgx_v_estado",
    dominio: "mgx",
    titulo: "Estado de la copia de MGX por tabla",
    resumen:
      "Para cada tabla de MGX que Gestivo copia (por empresa): cuándo se sincronizó por última vez, cómo terminó, cuántas filas tiene y si MGX agregó columnas.",
    granularidad: "Una fila = una tabla de MGX de una empresa (109 en total), con su última corrida.",
    descripcion:
      "Vista de Gestivo sobre mgx_tablas (el plan de sincronización) y mgx_corridas (la bitácora). Sirve para saber si los datos de MGX están al día antes de responder sobre los últimos días. Es lo mismo que resume estado_de_los_datos en su bloque mgx.",
    origen:
      "La escribe la sincronización de MGX en cada corrida, que se lanza a mano (Tesorería › Parámetros o npm run mgx:sincronizar). No hay cron.",
    identificador: "id",
    columnaFecha: "ultima_corrida_at",
    volumen: "109 filas.",
    columnasPorDefecto: ["empresa", "modulo", "tabla", "tabla_espejo", "estado", "ultima_corrida_at", "filas", "estrategia", "error", "aviso", "id"],
    columnas: {
      empresa: COLUMNA_EMPRESA,
      modulo: {
        descripcion: "Módulo de MGX de la tabla.",
        valores: { co: "Contable", no: "Nómina", in: "Inventarios", rh: "Empleados" },
      },
      tabla: { descripcion: "Nombre de la tabla en MGX (cabeza, cuerpo, pri_cta…)." },
      tabla_espejo: { descripcion: "Tabla de Gestivo que la copia (mgx_<módulo>_<tabla>), sobre la que se calculan las vistas mgx_v_*." },
      activa: { descripcion: "false si la tabla se sacó de las corridas a propósito." },
      estrategia: {
        descripcion: "Cómo se sincroniza la tabla.",
        valores: {
          reemplazo: "Se borra y se vuelve a cargar entera en cada corrida (tablas chicas); refleja también lo borrado en MGX",
          incremental_edicion: "Trae lo nuevo por ide y lo editado por fecha de edición (encabezados grandes)",
          incremental_documento: "Trae líneas nuevas y vuelve a traer enteros los documentos editados (cuerpos grandes)",
        },
      },
      estado: {
        descripcion: "Cómo terminó la última sincronización de la tabla.",
        valores: {
          nunca: "Nunca se ha sincronizado",
          ok: "La última corrida terminó bien",
          pendiente: "Se acabó el tiempo del paso; la próxima corrida sigue desde ahí",
          corriendo: "Hay una corrida trabajando (si lleva más de 15 minutos sin moverse, se cortó)",
          error: "Falló; el detalle está en error",
        },
      },
      fase: { descripcion: "Fase interna del motor en la que quedó la tabla." },
      ultima_corrida_at: {
        descripcion: "Momento en que la tabla se sincronizó por última vez. Es la columna para juzgar la frescura.",
        formato: "timestamptz UTC; reste 5 horas para hora de Colombia",
      },
      filas: { descripcion: "Filas que tiene la copia de esa empresa y tabla.", unidad: "filas" },
      filas_origen_estimadas: { descripcion: "Filas que tenía la tabla en MGX al generar la migración (estimado)." },
      ultimo_ide: { descripcion: "Mayor ide copiado: hasta dónde llegó la carga incremental." },
      ultima_edicion: { descripcion: "Marca de edición de MGX hasta la que se trajeron cambios.", formato: "timestamp sin zona, hora de Colombia" },
      error: { descripcion: "Mensaje del último fallo; NULL si terminó bien." },
      aviso: {
        descripcion: "Aviso de la sincronización; en la práctica, que MGX tiene columnas nuevas que la copia todavía no tiene.",
      },
      corrida_id: { descripcion: "Id de la última corrida que tocó la tabla (bitácora mgx_corridas)." },
      corrida_estado: {
        descripcion: "Cómo terminó esa corrida completa.",
        valores: { corriendo: "En curso", ok: "Terminó bien", error: "Falló", parcial: "Terminó con alguna tabla en error" },
      },
      corrida_origen: {
        descripcion: "Desde dónde se lanzó la corrida.",
        valores: { manual: "Pantalla de Tesorería › Parámetros", script: "Consola (npm run mgx:sincronizar)" },
      },
      corrida_iniciada_at: { descripcion: "Inicio de la corrida.", formato: "timestamptz UTC" },
      corrida_terminada_at: { descripcion: "Fin de la corrida; NULL si sigue o se cortó.", formato: "timestamptz UTC" },
      id: { descripcion: "Identificador empresa|módulo|tabla." },
    },
    advertencias: [
      "MGX replica a las 2:00 a. m. y la copia se dispara a mano: aunque todo esté en 'ok', los datos llegan solo hasta la réplica anterior a ultima_corrida_at. Lo registrado hoy en MGX no está.",
      "Los borrados de MGX en tablas incrementales solo se reflejan con la reconciliación mensual por consola.",
    ],
    noConfundirCon: [
      { recurso: "gema_sync_state", diferencia: "Es la frescura de la copia de GEMA (operación y recaudo), que sí tiene cron diario." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Están al día los datos de MGX?",
        como: "Llame estado_de_los_datos y lea el bloque mgx; o consulte esta vista ordenando por ultima_corrida_at ascendente y revise estado y error.",
      },
    ],
  },
];
