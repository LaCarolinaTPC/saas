import { redirect } from "next/navigation";
import { getCurrentPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgenteConfig } from "@/lib/comunicaciones/agente/config";
import { getEstadoClavesIA } from "@/lib/ia/claves";
import AgenteClient, { type Ejecucion } from "./AgenteClient";

/** Configuración del agente de IA que responde el WhatsApp (solo administradores). */
export default async function AgentePage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) redirect("/comunicaciones");

  const db = createAdminClient();
  const [config, estados, { data: ejecuciones }] = await Promise.all([
    getAgenteConfig(),
    getEstadoClavesIA(),
    db
      .from("wa_agente_ejecuciones")
      .select("id, created_at, proveedor, modelo_usado, modelo_solicitado, tokens_entrada, tokens_salida, duracion_ms, resultado, error, wa_conversaciones(wa_contactos(telefono, nombre))")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const filas: Ejecucion[] = (ejecuciones ?? []).map((e) => {
    // Embeds de PostgREST: objeto por FK única, tipado como array.
    const conv = (Array.isArray(e.wa_conversaciones) ? e.wa_conversaciones[0] : e.wa_conversaciones) as
      | { wa_contactos: { telefono: string; nombre: string | null } | { telefono: string; nombre: string | null }[] | null }
      | null;
    const contacto = Array.isArray(conv?.wa_contactos) ? conv?.wa_contactos[0] : conv?.wa_contactos;
    return {
      id: e.id,
      fecha: e.created_at,
      contacto: contacto?.nombre ?? (contacto?.telefono ? `+${contacto.telefono}` : "—"),
      modelo: e.modelo_usado ?? e.modelo_solicitado ?? e.proveedor,
      tokensEntrada: e.tokens_entrada,
      tokensSalida: e.tokens_salida,
      duracionMs: e.duracion_ms,
      resultado: e.resultado,
      error: e.error,
    };
  });

  // Proveedores con API key en Configuración → Proveedores de IA: los únicos que se ofrecen.
  const disponibles = Object.fromEntries(estados.map((e) => [e.proveedor, e.configurada])) as Record<
    "anthropic" | "openai" | "openrouter",
    boolean
  >;

  return <AgenteClient config={config} disponibles={disponibles} ejecuciones={filas} />;
}
