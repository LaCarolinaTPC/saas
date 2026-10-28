/**
 * Modo sombra: mientras el sistema viejo decide, el nuevo calcula los permisos
 * del mismo usuario y anota cualquier diferencia en `permisos_discrepancias`
 * (una fila por usuario y día). Antes de pasar al sistema nuevo esa tabla tiene
 * que estar vacía de «perdidos».
 *
 * Corre después de responder (`after`), como mucho una vez cada 10 minutos por
 * usuario y proceso, y nunca lanza: la sombra no puede afectar a nadie.
 */
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/operativo/constants";
import { MODULOS } from "./catalogo";
import { accesoViejo, type RolViejo } from "./equivalencia";
import { compararAcceso, HREFS_MENU } from "./comparar";
import { anotarIncidencia } from "./registro";
import { efectivosNuevosDe, leerMotor, mantenerAlDia, reconstruirDesdeViejo, type Motor } from "./bd";

const CADA_MS = 10 * 60_000;
const vistos = new Map<string, number>();


const RUTAS = [...new Set([...HREFS_MENU, ...MODULOS.map((m) => m.inicio)])];

/** Agenda la comparación para después de la respuesta. Nunca lanza. */
export function vigilarSombra(userId: string): void {
  const ultimo = vistos.get(userId) ?? 0;
  if (Date.now() - ultimo < CADA_MS) return;
  vistos.set(userId, Date.now());
  try {
    after(() => compararUsuario(userId));
  } catch {
    // Fuera de una petición (scripts, pruebas): no hay sombra.
  }
}

export async function compararUsuario(userId: string): Promise<void> {
  try {
    const m: Motor = await leerMotor();
    if (m === "viejo") return;
    await mantenerAlDia(m);

    const db = createAdminClient();
    const { data: perfil } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!perfil) return;
    const { data: rol } = perfil.user_type
      ? await db.from("user_types").select("*").eq("key", perfil.user_type).maybeSingle()
      : { data: null };
    const viejo = accesoViejo(
      { id: userId, user_type: perfil.user_type ?? null, permisos_individuales: perfil.permisos_individuales, role: perfil.role ?? null },
      (rol as RolViejo | null) ?? null
    );
    let dif = compararAcceso(viejo, await efectivosNuevosDe(userId, db), RUTAS);
    // Si alguien acaba de cambiar algo en la pantalla vieja, lo nuevo puede ir
    // un minuto atrás: se reconstruye (solo si lo viejo cambió) y se repite.
    if (dif.perdidos.length || (!viejo.isAdmin && dif.ganados.length)) {
      if (await reconstruirDesdeViejo({}, db)) dif = compararAcceso(viejo, await efectivosNuevosDe(userId, db), RUTAS);
    }
    // Lo que gana el admin al pasar a super es esperado: no se anota.
    const ganados = viejo.isAdmin ? [] : dif.ganados;
    if (dif.perdidos.length === 0 && ganados.length === 0) return;

    console.warn(`[permisos] sombra: ${perfil.email ?? userId} perdidos=${dif.perdidos.length} ganados=${ganados.length}`);
    // También a la bitácora de incidencias, con historia y estado de revisión.
    for (const [lista, viejoDa] of [[dif.perdidos, true], [ganados, false]] as const) {
      for (const clave of lista) {
        anotarIncidencia({
          tipo: "sombra_teorica",
          userId,
          email: perfil.email ?? null,
          clave,
          origen: "sombra",
          viejo: viejoDa,
          nuevo: !viejoDa,
          motor: m,
          rolViejo: perfil.user_type ?? null,
        });
      }
    }
    await db.from("permisos_discrepancias").upsert(
      {
        user_id: userId,
        dia: hoyBogota(),
        email: perfil.email ?? null,
        perdidos: dif.perdidos,
        ganados,
        visto_at: new Date().toISOString(),
      },
      { onConflict: "user_id,dia" }
    );
  } catch (e) {
    console.error("[permisos] sombra:", e instanceof Error ? e.message : e);
  }
}
