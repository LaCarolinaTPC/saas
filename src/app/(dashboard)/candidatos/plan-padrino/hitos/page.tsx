import { HandCoins } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccessSub, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { cedulaDelUsuario, hoyBogota, listarHitos, VISTAS_HITOS } from "@/lib/padrino/datos";
import { HitosClient } from "./hitos-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function HitosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "candidatos", "padrino_consulta")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const edita = puedeEditarEn(perms, "candidatos.padrino_consulta", "candidatos.padrino_registro", "candidatos.padrino_aprobacion", "candidatos.padrino_pago");
  const puedeAprobar = edita && canAccessSub(perms, "candidatos", "padrino_aprobacion");
  const puedePagar = edita && canAccessSub(perms, "candidatos", "padrino_pago");
  const vistaDefecto = puedePagar && !puedeAprobar ? "aprobado" : "por_aprobar";
  const filtros = {
    vista: VISTAS_HITOS.some((v) => v.value === sp.vista) ? (sp.vista as string) : vistaDefecto,
    desde: FECHA_RE.test(sp.desde ?? "") ? (sp.desde as string) : null,
    hasta: FECHA_RE.test(sp.hasta ?? "") ? (sp.hasta as string) : null,
    q: sp.q ?? "",
  };

  const cedula = await cedulaDelUsuario(perms.userId, perms.userEmail);
  const { hitos, error } = await listarHitos(filtros, cedula).then(
    (h) => ({ hitos: h, error: null as string | null }),
    (e: Error) => ({ hitos: [], error: e.message })
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Hitos del Plan Padrino"
        icono={HandCoins}
        volver={{ href: "/candidatos/plan-padrino", label: "Plan Padrino" }}
        descripcion="Cada hito se causa a su fecha si el referido sigue activo y el padrino mantiene contrato vigente. Se evalúan cada día después del sync de GEMA."
      />
      <HitosClient
        hitos={hitos}
        error={error}
        filtros={filtros}
        hoy={hoyBogota()}
        usuarioId={perms.userId}
        puedeAprobar={puedeAprobar}
        puedePagar={puedePagar}
        puedeExportar={canAccessSub(perms, "candidatos", "padrino_pago") || canAccessSub(perms, "candidatos", "padrino_aprobacion")}
      />
    </div>
  );
}
