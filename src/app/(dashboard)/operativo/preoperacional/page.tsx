import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { hoyBogota } from "@/lib/operativo/constants";
import {
  getConductoresPreop, getDocumentosPreop, getRevisionesDia, getVehiculosPreop,
  type ConductorPreop, type RevisionPreop, type VehiculoPreop,
} from "@/lib/operativo/preoperacional-data";
import type { DocumentoPreop } from "@/lib/operativo/preoperacional-reglas";
import { EncabezadoOperativo, PestanasOperativo } from "../ui";
import { PestanasPreop } from "./pestanas";
import { PreoperacionalClient } from "./preoperacional-client";

export const dynamic = "force-dynamic";

/**
 * Operativo · Revisión preoperacional del día. El inspector de patio revisa
 * cada bus antes del despacho: todo arranca en «cumple», marca solo lo que
 * falla y la pantalla dice si sale (apto, con observación, no apto). Las
 * vigencias de documentos salen de GEMA y de lo cargado en Operativo.
 */
export default async function PreoperacionalPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "preoperacional")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const hoy = hoyBogota();
  let vehiculos: VehiculoPreop[] = [];
  let conductores: ConductorPreop[] = [];
  let documentos: Record<string, DocumentoPreop[]> = {};
  let revisiones: RevisionPreop[] = [];
  let error: string | null = null;
  try {
    [vehiculos, conductores, documentos, revisiones] = await Promise.all([
      getVehiculosPreop(), getConductoresPreop(), getDocumentosPreop(hoy), getRevisionesDia(hoy),
    ]);
  } catch (e) {
    // Sin la migración aplicada la tabla no existe: la pantalla lo dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }
  // El inspector de patio solo tiene esta pantalla: no se le muestran las
  // pestañas del resto de Operativo, que lo devolverían aquí.
  const verOperativo = perms.isAdmin || canAccess(perms, "operativo");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · Revisión preoperacional">
        {verOperativo && <PestanasOperativo activa="preoperacional" />}
      </EncabezadoOperativo>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PestanasPreop activa="dia" />
      </div>
      <PreoperacionalClient
        hoy={hoy}
        vehiculos={vehiculos}
        conductores={conductores}
        documentos={documentos}
        revisiones={revisiones}
        puedeEditar={perms.isAdmin || perms.puedeEditar}
        error={error}
      />
    </div>
  );
}
