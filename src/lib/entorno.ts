/**
 * En qué entorno corre la aplicación, para avisarlo en pantalla
 * (ver src/components/layout/indicador-entorno.tsx).
 *
 * Se decide con GESTIVO_ENTORNO:
 *   - "desarrollo": base de desarrollo (copia de producción). Franja ámbar.
 *   - "produccion" o sin definir: no se muestra nada en un despliegue normal.
 *
 * Con `next dev` y sin GESTIVO_ENTORNO=desarrollo se muestra una franja roja:
 * es el caso peligroso de trabajar en local contra la base real.
 */

export type TipoEntorno = "desarrollo" | "local-produccion";

export interface Entorno {
  tipo: TipoEntorno;
  /** Texto corto de la etiqueta flotante. */
  etiqueta: string;
  /** Prefijo para el título de la pestaña del navegador. */
  prefijoTitulo: string;
  /** Host de Supabase al que apunta la app, para que se vea a qué base se escribe. */
  baseDatos: string | null;
}

function hostSupabase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function entornoActual(): Entorno | null {
  const valor = process.env.GESTIVO_ENTORNO?.trim().toLowerCase();
  const local = process.env.NODE_ENV === "development";
  const baseDatos = hostSupabase();

  if (valor === "desarrollo") {
    return {
      tipo: "desarrollo",
      etiqueta: "DESARROLLO · copia de producción",
      prefijoTitulo: "[DEV] ",
      baseDatos,
    };
  }

  if (local) {
    return {
      tipo: "local-produccion",
      etiqueta:
        valor === "produccion"
          ? "LOCAL CONECTADO A PRODUCCIÓN"
          : "LOCAL · GESTIVO_ENTORNO sin definir: ¿base de producción?",
      prefijoTitulo: "[PROD LOCAL] ",
      baseDatos,
    };
  }

  return null;
}
