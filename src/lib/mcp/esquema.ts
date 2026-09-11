import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerDocRecurso } from "@/lib/mcp/catalogo";

// Esquema vivo de las relaciones expuestas. El catálogo dice qué significa cada
// columna; esto dice cuáles existen hoy en la base y de qué tipo son, porque una
// vista o una migración aplicada a medias puede diferir de lo documentado.

export type ColumnaViva = {
  nombre: string;
  tipo: string;
  nulable: boolean;
  valoresEnum: string[] | null;
};

export type EsquemaRelacion = {
  relacion: string;
  columnas: ColumnaViva[];
  filasEstimadas: number | null;
  /**
   * completa: leída de pg_catalog.
   * parcial:  la función mcp_columnas no está disponible; nombres tomados de una
   *           fila de muestra o del catálogo, sin tipos.
   */
  introspeccion: "completa" | "parcial";
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expira: number; valor: EsquemaRelacion }>();

type FilaColumna = {
  relacion: string;
  columna: string;
  tipo: string;
  nulable: boolean;
  posicion: number;
  valores_enum: string[] | null;
  filas_estimadas: number | null;
};

async function esquemaParcial(relacion: string): Promise<EsquemaRelacion | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from(relacion).select("*").limit(1);
  if (error) return null;
  const nombres = data?.[0]
    ? Object.keys(data[0])
    : Object.keys(obtenerDocRecurso(relacion)?.columnas ?? {});
  return {
    relacion,
    columnas: nombres.map((nombre) => ({
      nombre,
      tipo: "desconocido",
      nulable: true,
      valoresEnum: null,
    })),
    filasEstimadas: null,
    introspeccion: "parcial",
  };
}

/**
 * Devuelve el esquema de cada relación pedida. Las que no existen en la base no
 * aparecen en el mapa: quien llama decide cómo reportarlo.
 */
export async function obtenerEsquemas(
  relaciones: string[]
): Promise<Map<string, EsquemaRelacion>> {
  const ahora = Date.now();
  const resultado = new Map<string, EsquemaRelacion>();
  const faltantes: string[] = [];

  for (const r of new Set(relaciones)) {
    const enCache = cache.get(r);
    if (enCache && enCache.expira > ahora) resultado.set(r, enCache.valor);
    else faltantes.push(r);
  }
  if (faltantes.length === 0) return resultado;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mcp_columnas", { p_relaciones: faltantes });

  if (error) {
    // Migración sin aplicar o función inaccesible: degradar sin romper el MCP.
    console.error("[mcp] mcp_columnas no disponible, esquema parcial:", error.message);
    const parciales = await Promise.all(faltantes.map(esquemaParcial));
    for (const p of parciales) {
      if (p) resultado.set(p.relacion, p);
    }
    return resultado;
  }

  const agrupadas = new Map<string, EsquemaRelacion>();
  for (const fila of (data ?? []) as FilaColumna[]) {
    let esquema = agrupadas.get(fila.relacion);
    if (!esquema) {
      esquema = {
        relacion: fila.relacion,
        columnas: [],
        filasEstimadas: fila.filas_estimadas,
        introspeccion: "completa",
      };
      agrupadas.set(fila.relacion, esquema);
    }
    esquema.columnas.push({
      nombre: fila.columna,
      tipo: fila.tipo,
      nulable: fila.nulable,
      valoresEnum: fila.valores_enum,
    });
  }

  for (const [nombre, esquema] of agrupadas) {
    cache.set(nombre, { expira: ahora + TTL_MS, valor: esquema });
    resultado.set(nombre, esquema);
  }
  return resultado;
}

export async function obtenerEsquema(relacion: string): Promise<EsquemaRelacion | null> {
  return (await obtenerEsquemas([relacion])).get(relacion) ?? null;
}
