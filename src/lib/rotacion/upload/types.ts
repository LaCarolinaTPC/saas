export type FileType =
  | "conductores_activos"
  | "conductores_retirados"
  | "cierres_diarios"
  | "viajes_perdidos"
  | "ausentismo"
  | "familia"
  | "reingresos"
  | "incentivos";

export interface ProcessResult {
  records: Record<string, unknown>[];
  errors: string[];
  periodos?: string[];
}

export interface UploadResult {
  success: boolean;
  fileName: string;
  rowsProcessed: number;
  rowsErrors: number;
  errors: string[];
  /** Situaciones que no son error pero el usuario debe saber (filas omitidas, retiradas). */
  avisos?: string[];
}

export const FILE_TYPE_CONFIG: Record<
  FileType,
  {
    label: string;
    description: string;
    table: string;
    multiple: boolean;
    /**
     * upsert_lote: upsert por llave natural estampando un lote de carga; al
     * terminar se retiran las filas de origen excel que no vinieron en el lote
     * y se respetan las capturadas en el formulario (ver ausentismo-carga.ts).
     */
    strategy: "upsert" | "delete_insert" | "periodo_replace" | "reingresos_update" | "upsert_lote";
    onConflict?: string;
    /**
     * Carga retirada: el dato ya se captura por otro medio. La configuración se
     * conserva para leer el historial de `data_uploads`, pero la UI no muestra
     * la tarjeta y las rutas de carga rechazan el tipo.
     */
    deshabilitado?: { motivo: string };
  }
> = {
  conductores_activos: {
    label: "Conductores Activos",
    description: "vstConductoresactivos.xlsx",
    table: "conductores",
    multiple: false,
    strategy: "upsert",
    onConflict: "cedula",
  },
  conductores_retirados: {
    label: "Conductores Retirados",
    description: "vstConductoresretirados.xlsx",
    table: "conductores",
    multiple: false,
    strategy: "upsert",
    onConflict: "cedula",
  },
  cierres_diarios: {
    label: "Cierres Diarios",
    description: "CIERRE DEFINITIVO CONDUCTOR *.xlsx — Multiples archivos",
    table: "cierres_diarios",
    multiple: true,
    strategy: "upsert",
    onConflict: "cod_conductor,fecha,ruta",
  },
  viajes_perdidos: {
    label: "Viajes Perdidos",
    description: "Feb_2026.xlsx, Mar_2026.xlsx — Un archivo por mes",
    table: "viajes_perdidos",
    multiple: false,
    strategy: "periodo_replace",
  },
  ausentismo: {
    label: "Matriz de Ausentismo",
    description:
      "MATRIZ DE AUSENTISMO *.xlsx — Actualiza por incapacidad; conserva lo capturado en el formulario",
    table: "ausentismo",
    multiple: false,
    strategy: "upsert_lote",
    // Llave natural creada en la migración 20260902220946. `consecutivo_llave`
    // es una columna generada (consecutivo o cadena vacía), así el upsert de
    // PostgREST puede apuntarla.
    onConflict: "cedula,fecha_inicio,consecutivo_llave",
    // La matriz se captura entera en el formulario (registrar, editar, eliminar
    // y restaurar en Ausentismo › Matriz EPS), así que el Excel dejó de ser una
    // fuente y solo era un riesgo: al terminar, la estrategia `upsert_lote`
    // retira toda fila de origen excel que no viniera en el archivo, de modo
    // que un archivo parcial borraba el histórico cargado antes.
    deshabilitado: {
      motivo:
        "La carga por Excel de la matriz de incapacidades está deshabilitada: " +
        "las incapacidades se registran en Ausentismo › Matriz EPS.",
    },
  },
  familia: {
    label: "Nucleo Familiar",
    description: "Hijos y Conyugues *.xlsx — Reemplaza todos los registros",
    table: "familia",
    multiple: false,
    strategy: "delete_insert",
  },
  reingresos: {
    label: "Reingresos",
    description: "reingresos.csv — Columnas: Cedula, Fecha Reingreso",
    table: "conductores",
    multiple: false,
    strategy: "reingresos_update",
  },
  incentivos: {
    label: "Incentivos",
    description: "Incentivos entregados *.xlsx — Reemplaza todos los registros",
    table: "incentivos",
    multiple: false,
    strategy: "delete_insert",
  },
};

/** Tras migrar a GEMA, los únicos tipos que alguna vez se subieron a mano. */
const CANDIDATOS_CARGA_MANUAL: FileType[] = ["ausentismo", "familia", "incentivos"];

/**
 * Los que la página de Carga de Datos ofrece: los candidatos que no están
 * deshabilitados. Se deriva de la config para que la UI y las rutas de carga
 * no se puedan desalinear.
 */
export const CARGAS_MANUALES: FileType[] = CANDIDATOS_CARGA_MANUAL.filter(
  (ft) => !FILE_TYPE_CONFIG[ft].deshabilitado
);
