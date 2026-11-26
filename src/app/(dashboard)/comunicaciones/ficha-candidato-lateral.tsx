"use client";

/**
 * La ficha del candidato en el panel derecho de Comunicaciones (26-nov-2026):
 * el mismo panel de Candidatos (Resumen, Citas, Antecedentes con «Lo revisé a
 * mano», Carpeta, Historial), para hacer los cambios manuales sin salir de la
 * conversación; por ejemplo, revisar el RNMC cuando Croma no responde. Editar
 * exige el mismo permiso que en Candidatos y no pausa al asistente.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PanelSeleccion } from "@/components/seleccion/panel-seleccion";
import { usePermisos } from "@/components/permisos/permisos-provider";
import { procesoParaFicha } from "@/lib/contratacion/actions";
import type { ProcesoContratacion } from "@/lib/contratacion/constants";

export function FichaCandidatoLateral({ procesoId, estado }: { procesoId: string; estado: string }) {
  const puede = usePermisos();
  const [proceso, setProceso] = useState<ProcesoContratacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Se vuelve a leer al cambiar de conversación o cuando el proceso cambia de estado.
  useEffect(() => {
    let vivo = true;
    procesoParaFicha(procesoId)
      .then((p) => {
        if (!vivo) return;
        setProceso(p);
        setError(p ? null : "No se encontró el proceso.");
        setVersion((n) => n + 1);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer el proceso."));
    return () => {
      vivo = false;
    };
  }, [procesoId, estado]);

  if (!puede("candidatos")) return null;
  if (error) return <p className="px-3 text-xs text-red-700">{error}</p>;
  if (!proceso || proceso.id !== procesoId) {
    return (
      <p className="flex items-center gap-1.5 px-3 text-xs text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando la ficha del candidato…
      </p>
    );
  }
  return (
    <div className="min-w-0 px-1 text-sm">
      <PanelSeleccion key={proceso.id} proceso={proceso} puedeEditar={puede("candidatos.editar")} onCerrado={() => setVersion((n) => n + 1)} version={version} lateral />
    </div>
  );
}
