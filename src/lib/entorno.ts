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
 *
 * Desde el 24-nov-2026 el fondo del panel y del menú también cambia de color
 * fuera de producción (crema en desarrollo, rosado en local contra
 * producción), para no confundirlos. GESTIVO_COLOR_FONDO (#rrggbb) cambia el
 * tono; en producción no se usa.
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
  /** Fondo del panel y del menú lateral, para distinguirlo de producción. */
  fondo: string;
  fondoMenu: string;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** El color de GESTIVO_COLOR_FONDO si es un #hex válido. */
function colorDeEntorno(): string | null {
  const v = process.env.GESTIVO_COLOR_FONDO?.trim();
  return v && HEX.test(v) ? v : null;
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
      etiqueta: "DESARROLLO · copia de producción · WhatsApp y correo solo a destinos de prueba",
      prefijoTitulo: "[DEV] ",
      baseDatos,
      // Crema: se nota que no es producción sin cansar la vista.
      fondo: colorDeEntorno() ?? "#FFF8E6",
      fondoMenu: colorDeEntorno() ?? "#FDF1D6",
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
      fondo: colorDeEntorno() ?? "#FFF1F2",
      fondoMenu: colorDeEntorno() ?? "#FFE4E6",
    };
  }

  return null;
}
