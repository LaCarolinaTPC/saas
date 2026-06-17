import { NextRequest, NextResponse } from "next/server";
import { syncMetaAds } from "@/lib/meta/sync";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const DESDE_DEFECTO = "2026-01-01";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sincroniza Meta Ads → meta_campaigns / meta_spend_daily.
 * Protegido con CRON_SECRET. Acepta ?from=YYYY-MM-DD&to=YYYY-MM-DD.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const since = request.nextUrl.searchParams.get("from") ?? DESDE_DEFECTO;
  const until = request.nextUrl.searchParams.get("to") ?? hoyISO();

  try {
    const result = await syncMetaAds(since, until);
    return NextResponse.json({ ok: true, rango: { since, until }, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
