import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Tv } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { tieneAccesoPantalla } from "@/lib/pantalla/acceso";
import { getCurrentPermissions } from "@/lib/permissions";
import {
  getDispositivos,
  getMediosBiblioteca,
  getPresentaciones,
  type DispositivoFila,
  type MedioBiblioteca,
  type PresentacionResumen,
} from "@/lib/pantalla/consultas";
import { PantallaClient } from "./pantalla-client";

export const dynamic = "force-dynamic";

const PESTANAS = ["presentaciones", "pantallas", "medios"] as const;

export default async function PantallaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await tieneAccesoPantalla())) {
    const perms = await getCurrentPermissions();
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const tab = (PESTANAS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof PESTANAS)[number]) : "presentaciones";

  let presentaciones: PresentacionResumen[] = [];
  let dispositivos: DispositivoFila[] = [];
  let medios: MedioBiblioteca[] = [];
  let error: string | null = null;
  try {
    [presentaciones, dispositivos, medios] = await Promise.all([getPresentaciones(), getDispositivos(), getMediosBiblioteca()]);
  } catch (e) {
    // Sin la migración aplicada las tablas no existen: se dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const urlDisplay = host ? `${proto}://${host}/display` : "/display";

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Pantalla informativa"
        icono={Tv}
        descripcion="Diapositivas para el televisor de la empresa: accidentabilidad, ausentismo, cumpleaños, imágenes y videos."
      />
      <div className="px-4 py-6 sm:px-6">
        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">El módulo todavía no está listo en la base de datos.</p>
            <p className="mt-1">
              Falta aplicar la migración <code>20261026140836_pantalla_informativa_presentaciones_dispositivos_medios_y_vinculaciones.sql</code> en
              el SQL Editor.
            </p>
            <p className="mt-2 text-xs text-amber-700">Detalle: {error}</p>
          </div>
        ) : (
          <PantallaClient
            tabInicial={tab}
            presentaciones={presentaciones}
            dispositivos={dispositivos}
            medios={medios}
            urlDisplay={urlDisplay}
          />
        )}
      </div>
    </div>
  );
}
