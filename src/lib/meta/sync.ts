import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Integración con Meta Ads (Graph API) para el módulo Campañas.
 * Trae gasto/resultados por campaña y por día, y los guarda en
 * meta_campaigns + meta_spend_daily.
 *
 * Credenciales (env / Vercel):
 *   META_ACCESS_TOKEN     — token de acceso de la app/usuario de sistema
 *   META_AD_ACCOUNT_ID    — id de la cuenta publicitaria (sin el prefijo act_)
 *   META_API_VERSION      — opcional, por defecto v21.0
 */

const API_VERSION = process.env.META_API_VERSION ?? "v21.0";

interface MetaInsight {
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
  date_start: string;
}

function leadsFromActions(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  // Mensajes/conversaciones iniciadas o leads.
  const tipos = [
    "onsite_conversion.messaging_conversation_started_7d",
    "lead",
    "onsite_conversion.lead_grouped",
  ];
  return actions
    .filter((a) => tipos.includes(a.action_type))
    .reduce((s, a) => s + (Number(a.value) || 0), 0);
}

export async function syncMetaAds(
  since: string,
  until: string
): Promise<{ campañas: number; dias: number }> {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error(
      "Faltan credenciales de Meta (META_ACCESS_TOKEN / META_AD_ACCOUNT_ID)."
    );
  }

  const fields = "campaign_id,campaign_name,spend,impressions,clicks,actions";
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    fields,
    time_range: JSON.stringify({ since, until }),
    limit: "500",
    access_token: token,
  });

  const insights: MetaInsight[] = [];
  let url = `https://graph.facebook.com/${API_VERSION}/act_${accountId}/insights?${params}`;
  // Paginación de la Graph API.
  for (let guard = 0; url && guard < 50; guard++) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Meta API: ${json?.error?.message ?? res.statusText}`);
    }
    insights.push(...(json.data ?? []));
    url = json.paging?.next ?? "";
  }

  const db = createAdminClient();

  // Gasto diario por campaña.
  const diaRows = insights.map((i) => ({
    fecha: i.date_start,
    meta_campaign_id: i.campaign_id,
    gasto: Number(i.spend) || 0,
    impresiones: Number(i.impressions) || 0,
    clics: Number(i.clicks) || 0,
    leads: leadsFromActions(i.actions),
  }));
  if (diaRows.length) {
    const { error } = await db
      .from("meta_spend_daily")
      .upsert(diaRows, { onConflict: "fecha,meta_campaign_id" });
    if (error) throw new Error(`meta_spend_daily: ${error.message}`);
  }

  // Resumen por campaña.
  const porCampaña = new Map<string, { nombre: string; gasto: number; impresiones: number; clics: number; leads: number }>();
  for (const i of insights) {
    const cur = porCampaña.get(i.campaign_id) ?? {
      nombre: i.campaign_name, gasto: 0, impresiones: 0, clics: 0, leads: 0,
    };
    cur.gasto += Number(i.spend) || 0;
    cur.impresiones += Number(i.impressions) || 0;
    cur.clics += Number(i.clicks) || 0;
    cur.leads += leadsFromActions(i.actions);
    porCampaña.set(i.campaign_id, cur);
  }
  const campRows = [...porCampaña.entries()].map(([id, v]) => ({
    meta_campaign_id: id,
    nombre: v.nombre,
    gasto: v.gasto,
    impresiones: v.impresiones,
    clics: v.clics,
    leads: v.leads,
  }));
  if (campRows.length) {
    const { error } = await db
      .from("meta_campaigns")
      .upsert(campRows, { onConflict: "meta_campaign_id" });
    if (error) throw new Error(`meta_campaigns: ${error.message}`);
  }

  return { campañas: campRows.length, dias: diaRows.length };
}
