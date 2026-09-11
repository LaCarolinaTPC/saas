// Punto de entrada del catálogo semántico del MCP. Reúne la documentación de
// todos los dominios y la indexa por nombre de recurso.
//
// Invariante (la verifica scripts/verificar-catalogo-mcp.ts): cada recurso de
// EXTERNAL_RESOURCES tiene su DocRecurso y viceversa.

import type { DocRecurso, DominioKey } from "./tipos";
import { RECURSOS_ROTACION } from "./rotacion";
import { RECURSOS_AUSENTISMO_ACCIDENTABILIDAD } from "./ausentismo-accidentabilidad";
import { RECURSOS_AUSENTISMO_DIARIO } from "./ausentismo-diario";
import { RECURSOS_RECLUTAMIENTO } from "./reclutamiento";
import { RECURSOS_GEMA } from "./gema";
import { RECURSOS_GEMA_OPERACION } from "./gema-operacion";
import { RECURSOS_OPERATIVO } from "./operativo";
import { RECURSOS_MANTENIMIENTO } from "./mantenimiento";
import { RECURSOS_RIESGO } from "./riesgo";

export type { DocColumna, DocRecurso, DominioKey, TerminoGlosario } from "./tipos";
export { CONTEXTO_NEGOCIO, DOMINIOS, GLOSARIO, REGLAS_GENERALES } from "./contexto";

export const CATALOGO: DocRecurso[] = [
  ...RECURSOS_ROTACION,
  ...RECURSOS_AUSENTISMO_ACCIDENTABILIDAD,
  ...RECURSOS_AUSENTISMO_DIARIO,
  ...RECURSOS_RECLUTAMIENTO,
  ...RECURSOS_GEMA,
  ...RECURSOS_GEMA_OPERACION,
  ...RECURSOS_OPERATIVO,
  ...RECURSOS_MANTENIMIENTO,
  ...RECURSOS_RIESGO,
];

const POR_NOMBRE = new Map(CATALOGO.map((d) => [d.nombre, d] as const));

export function obtenerDocRecurso(nombre: string): DocRecurso | undefined {
  return POR_NOMBRE.get(nombre);
}

/** Orden de presentación de los dominios en la guía. */
export const ORDEN_DOMINIOS: DominioKey[] = [
  "rotacion",
  "ausentismo",
  "accidentabilidad",
  "riesgo",
  "reclutamiento",
  "rrhh",
  "tesoreria",
  "gema",
  "operativo",
  "mantenimiento",
  "campanas",
  "organizacion",
];
