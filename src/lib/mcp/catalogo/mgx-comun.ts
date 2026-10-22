// Piezas comunes del catálogo de MGX: la columna `empresa`, el identificador
// `ide`, el filtro por defecto (La Carolina) y las advertencias que valen para
// toda la copia. Las usan mgx-contable.ts, mgx-nomina.ts, mgx-inventarios.ts y
// mgx-estado.ts.
//
// Fuentes: docs/mgx-sincronizacion.md, src/lib/mgx/{catalogo,limpieza,sync,
// esquema}.ts, la migración 20261021193546_tablas_espejo_de_mgx.sql y el
// documento de MGX «etl00027v2» (que describe las vistas, no sus columnas).
// Los valores observados salen de la inspección del 2026-10-22 sobre la copia
// completa (109 pares al día, corrida del 2026-10-21).

import type { DocColumna, DocRecurso } from "./tipos";

/** Las siete empresas de MGX, con lo que tiene cada una. */
export const EMPRESAS_MGX: Record<string, string> = {
  emp0: "MET. TRANSP. LA CAROLINA SAS (contable, nómina, inventarios y empleados)",
  emp2: "ANAYA GIRALDO S.A.S. (contable, nómina y empleados)",
  emp3: "NORMA SOFIA GIRALDO DE ANAYA (contable, nómina y empleados)",
  emp8: "SISTEMA METROPOLITANO DE RECAUDO S.A.S. (contable, nómina y empleados)",
  emp10: "WILFRED SMITH ANAYA ORTEGA (solo contable; hoy vacía)",
  emp11: "SISTEMAS PRACTICOS SAS (contable, nómina y empleados)",
  emp12: "COMERCIALIZADORA Y DISTRIBUIDORA EL TAMARAL S.A.S. (solo contable; hoy vacía)",
};

export const COLUMNA_EMPRESA: DocColumna = {
  descripcion:
    "Empresa del grupo a la que pertenece la fila en MGX. Cada empresa tiene su propia contabilidad, nómina y códigos: un mismo código (cuenta, empleado, centro de costo) puede significar cosas distintas en dos empresas.",
  valores: EMPRESAS_MGX,
  advertencia:
    "Por defecto se filtra emp0 (La Carolina). No sume cifras de varias empresas salvo que la pregunta lo pida de forma explícita.",
};

/** El `ide` de MGX: único dentro de una empresa, no entre empresas. */
export function columnaIde(tabla: string): DocColumna {
  return {
    descripcion: `Identificador interno del registro en MGX (campo ide de ${tabla}), creciente en el tiempo. Es el identificador de este recurso para obtener_registro.`,
    advertencia:
      "Es único dentro de una empresa, no entre empresas: con el filtro por defecto (emp0) identifica una sola fila; para otra empresa filtre también por empresa.",
  };
}

export const FILTRO_EMPRESA: NonNullable<DocRecurso["filtroPorDefecto"]> = {
  columna: "empresa",
  operador: "eq",
  valor: "emp0",
  motivo:
    "MGX guarda siete empresas y emp0 es MET. TRANSP. LA CAROLINA SAS. Desactívelo o filtre otra empresa solo si la pregunta es sobre Anaya Giraldo (emp2), Norma Sofía Giraldo de Anaya (emp3), Sistema Metropolitano de Recaudo (emp8) o Sistemas Prácticos (emp11); emp10 y emp12 están vacías.",
};

export const ORIGEN_MGX =
  "Copia de MGX, el ERP del grupo. MGX entrega una base de solo lectura (etl_00027) que replica cada noche a las 2:00 a. m.; Gestivo copia esas tablas a mgx_* a MANO, desde Tesorería › Parámetros «Sincronización con MGX» o por consola (npm run mgx:sincronizar), de forma incremental. No hay cron. Esta vista se calcula sobre esa copia.";

/** Advertencias que valen para todos los recursos de MGX. */
export const ADVERTENCIAS_MGX: string[] = [
  "Frescura: lo registrado hoy en MGX llega como pronto mañana (réplica de las 2:00 a. m.) y solo si alguien sincroniza. Antes de hablar de los últimos días, mire estado_de_los_datos (bloque mgx) o mgx_v_estado.",
  "Los borrados de MGX no llegan con la sincronización incremental: un documento que MGX borró sigue aquí hasta la reconciliación mensual (npm run mgx:sincronizar -- --reconciliar).",
  "Textos sin espacios de relleno (MGX los guarda con espacios a la derecha; la copia no) y fechas centinela de MGX (años 0001, 0100 o 1001) en NULL.",
  "Fechas y horas de MGX: date o timestamp SIN zona, ya en hora de Colombia. No les reste 5 horas.",
  "Los importes son pesos colombianos (COP) y viajan como numeric: según el cliente pueden llegar como texto. Conviértalos antes de comparar; para totales use agregar_datos.",
  "MGX no documenta el significado de sus columnas; su documento solo nombra las vistas. Lo que aquí se dice de un código o una bandera es lo observado en los datos y se marca así; no lo extienda a casos que no se observaron.",
];
