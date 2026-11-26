/**
 * Registro de cada llamada a un proveedor externo (Croma, IA) en
 * servicios_llamadas (26-nov-2026), para las estadísticas de proveedores:
 * cuántas responden, cuánto tardan y cuándo se caen.
 *
 * Nunca detiene ni demora la operación: el guardado va después de responder
 * (`after` de Next) o en segundo plano, y cualquier error se ignora. Sin la
 * clave de servicio (pruebas unitarias) o con SERVICIOS_SIN_REGISTRO=1, no
 * registra nada.
 */

export interface LlamadaServicio {
  servicio: "croma" | "ia";
  proveedor: string;
  fuente: string;
  modelo?: string | null;
  ok: boolean;
  status?: number | null;
  duracionMs: number;
  error?: string | null;
}

let sinTabla = false;

function activo(): boolean {
  return typeof window === "undefined" && !sinTabla && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.SERVICIOS_SIN_REGISTRO !== "1";
}

async function insertar(l: LlamadaServicio): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { error } = await createAdminClient()
      .from("servicios_llamadas")
      .insert({
        servicio: l.servicio,
        proveedor: l.proveedor,
        fuente: l.fuente,
        modelo: l.modelo ?? null,
        ok: l.ok,
        status: l.status ?? null,
        duracion_ms: Math.max(0, Math.round(l.duracionMs)),
        error: l.error ? String(l.error).slice(0, 500) : null,
      });
    // Sin la migración 20261126191610 no se vuelve a intentar en este proceso.
    if (error && (error.code === "PGRST205" || error.code === "42P01")) sinTabla = true;
  } catch {
    // Registrar nunca rompe la operación.
  }
}

/** Guarda la llamada sin esperar. */
export function registrarLlamada(l: LlamadaServicio): void {
  if (!activo()) return;
  void (async () => {
    try {
      const { after } = await import("next/server");
      // Dentro de una petición: después de responder, sin que el servidor la corte.
      after(() => insertar(l));
    } catch {
      // Fuera de una petición (scripts, pruebas): en segundo plano.
      void insertar(l);
    }
  })();
}

/**
 * Llama y registra: si lanza, cuenta como error (y se vuelve a lanzar). `evaluar`
 * dice si una respuesta que no lanzó salió bien (p. ej. `{ ok: false }`).
 */
export async function medirLlamada<T>(
  base: Omit<LlamadaServicio, "ok" | "duracionMs" | "error" | "status">,
  llamar: () => Promise<T>,
  evaluar?: (r: T) => { ok: boolean; error?: string | null; modelo?: string | null }
): Promise<T> {
  const inicio = Date.now();
  try {
    const r = await llamar();
    const e = evaluar ? evaluar(r) : { ok: true };
    registrarLlamada({ ...base, modelo: e.modelo ?? base.modelo ?? null, ok: e.ok, error: e.ok ? null : (e.error ?? null), duracionMs: Date.now() - inicio });
    return r;
  } catch (err) {
    registrarLlamada({ ...base, ok: false, error: err instanceof Error ? err.message : String(err), duracionMs: Date.now() - inicio });
    throw err;
  }
}
