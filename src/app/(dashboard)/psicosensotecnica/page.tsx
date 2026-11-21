import Link from "next/link";
import { redirect } from "next/navigation";
import { BrainCircuit, Settings } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { canAccessSub, getCurrentPermissions, tienePermiso } from "@/lib/permissions";
import { listarIntentos, tieneAccesoPsico } from "@/lib/psicosensotecnica/servidor";
import { PESTANAS, type Intento, type Pestana } from "@/lib/psicosensotecnica/tipos";
import { PsicoClient } from "./psico-client";

export const dynamic = "force-dynamic";

/**
 * Prueba psicosensotécnica: la bandeja de la psicóloga. Lo que hay por
 * revisar, lo que está asignado y sin presentar, y lo ya revisado. La persona
 * presenta la prueba sin cuenta en /prueba-psicosensotecnica.
 */
export default async function PsicosensotecnicaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perms = await tieneAccesoPsico();
  if (!perms) {
    const p = await getCurrentPermissions();
    redirect(p.modules[0] ? (MODULE_HOME[p.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const tab: Pestana = (PESTANAS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Pestana) : "por_revisar";

  let intentos: Intento[] = [];
  let error: string | null = null;
  try {
    intentos = await listarIntentos();
  } catch (e) {
    // Sin la migración aplicada las tablas no existen: se dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Prueba psicosensotécnica"
        icono={BrainCircuit}
        descripcion="Revisión de las pruebas de los conductores y concepto de psicología."
      >
        {canAccessSub(perms, "psicosensotecnica", "psico_config") && (
          <Link href="/psicosensotecnica/configuracion" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Settings className="h-4 w-4" /> Configuración
          </Link>
        )}
      </PageHeader>
      <div className="px-4 py-6 sm:px-6">
        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">El módulo todavía no está listo en la base de datos.</p>
            <p className="mt-1">
              Falta aplicar la migración <code>20261120170136_psicosensotecnica_prueba_para_conductores.sql</code> en el SQL Editor.
            </p>
            <p className="mt-2 text-xs text-amber-700">Detalle: {error}</p>
          </div>
        ) : (
          <PsicoClient
            tabInicial={tab}
            intentos={intentos}
            puedeEditar={tienePermiso(perms, "psicosensotecnica.editar")}
            puedeConcepto={tienePermiso(perms, "psicosensotecnica.concepto")}
            puedeExportar={tienePermiso(perms, "psicosensotecnica.exportar")}
          />
        )}
      </div>
    </div>
  );
}
