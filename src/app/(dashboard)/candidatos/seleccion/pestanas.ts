/** Pestañas de Candidatos › Selección. Fuera del componente de cliente: la página del servidor también las lee (`?pestana=`). */
export const PESTANAS = ["mensajes", "tiempos", "antecedentes", "laboratorios", "ia", "canal", "probar"] as const;
/** Solo las ve el administrador. */
export const SOLO_ADMIN: readonly Pestana[] = ["ia", "canal"];
export type Pestana = (typeof PESTANAS)[number];
export const esPestana = (p: string | null | undefined): p is Pestana => !!p && (PESTANAS as readonly string[]).includes(p);
