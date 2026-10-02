import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { diasEntre, hoyBogota } from "@/lib/operativo/constants";
import { getHistorialPreop, type RevisionPreop } from "@/lib/operativo/preoperacional-data";
import { RESULTADOS_PREOP, type ResultadoPreop } from "@/lib/operativo/preoperacional-reglas";
import { EncabezadoOperativo, PestanasOperativo } from "../../ui";
import { PestanasPreop } from "../pestanas";
import { HistorialClient } from "./historial-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 93;

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Historial de revisiones preoperacionales: por fecha, bus y resultado, con Excel. */
export default async function HistorialPreopPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; codigo?: string; resultado?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "preoperacional")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  let hasta = sp.hasta && FECHA_RE.test(sp.hasta) ? sp.hasta : hoy;
  if (hasta > hoy) hasta = hoy;
  let desde = sp.desde && FECHA_RE.test(sp.desde) ? sp.desde : restarDias(hasta, 6);
  if (desde > hasta) desde = hasta;
  let aviso: string | null = null;
  if (diasEntre(desde, hasta) + 1 > MAX_DIAS) {
    desde = restarDias(hasta, MAX_DIAS - 1);
    aviso = `El periodo se recortó a los últimos ${MAX_DIAS} días (desde el ${desde}).`;
  }
  const codigo = sp.codigo?.trim() || null;
  const resultado = RESULTADOS_PREOP.includes(sp.resultado as ResultadoPreop) ? (sp.resultado as ResultadoPreop) : null;

  let revisiones: RevisionPreop[] = [];
  let error: string | null = null;
  try {
    revisiones = await getHistorialPreop({ desde, hasta, codigo, resultado });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const verOperativo = perms.isAdmin || canAccess(perms, "operativo");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · Revisión preoperacional">
        {verOperativo && <PestanasOperativo activa="preoperacional" />}
      </EncabezadoOperativo>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PestanasPreop activa="historial" />
      </div>
      <HistorialClient
        desde={desde}
        hasta={hasta}
        codigo={codigo ?? ""}
        resultado={resultado ?? ""}
        revisiones={revisiones}
        aviso={aviso}
        error={error}
      />
    </div>
  );
}
