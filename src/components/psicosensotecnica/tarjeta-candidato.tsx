"use client";

/**
 * La prueba psicosensotécnica dentro de la ficha del candidato
 * (/candidatos/[id]): asignarla, ver si ya la presentó y el concepto de
 * psicología. Los puntajes y las alertas solo llegan aquí para quien tiene el
 * módulo de la psicóloga; los demás ven el estado y el concepto.
 */

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrainCircuit, Copy } from "lucide-react";
import { asignarPrueba } from "@/app/(dashboard)/psicosensotecnica/actions";
import { RUTA_MODULO, estadoLegible, type ResumenIntento } from "@/lib/psicosensotecnica/tipos";
import { useEnlacePublico } from "./comun";
import { colorEstado, fechaHora } from "./detalle-intento";

export function TarjetaPsicoCandidato({
  candidateId, cedula, nombre, pruebas, puedeAsignar, verDetalle,
}: {
  candidateId: string;
  cedula: string | null;
  nombre: string;
  pruebas: ResumenIntento[];
  puedeAsignar: boolean;
  /** Tiene el módulo: se le muestran alertas, puntaje y el enlace al detalle. */
  verDetalle: boolean;
}) {
  const router = useRouter();
  const [ocupado, enTransicion] = useTransition();
  const enlace = useEnlacePublico();

  const [ultima, ...anteriores] = pruebas;
  const pendiente = ultima && (ultima.estado === "asignado" || ultima.estado === "en_curso");

  const asignar = () =>
    enTransicion(async () => {
      const r = await asignarPrueba({ cedula: cedula ?? "", nombre, candidateId });
      if (!r.success) return void toast.error(r.error);
      toast.success("Prueba psicosensotécnica asignada");
      router.refresh();
    });

  return (
    <section className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-gray-900">
          <BrainCircuit className="h-4 w-4 text-primary" /> Prueba psicosensotécnica
        </h2>
        {ultima && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colorEstado(ultima)}`}>{estadoLegible(ultima)}</span>}
      </div>

      {!ultima && <p className="mt-2 text-sm text-gray-500">No se le ha asignado la prueba.</p>}

      {pendiente && (
        <div className="mt-2 text-sm text-gray-700">
          <p>
            {ultima.estado === "en_curso" ? "La empezó y no la ha terminado." : "Pendiente por presentar"}
            {ultima.asignadoEn ? ` · asignada el ${fechaHora(ultima.asignadoEn)}` : ""}
          </p>
          <p className="mt-2 text-xs text-gray-500">La presenta entrando a este enlace con su cédula:</p>
          <div className="mt-1 flex gap-2">
            <input className="min-w-0 flex-1 rounded-md border border-border bg-gray-50 px-3 py-1.5 text-sm" readOnly value={enlace} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => navigator.clipboard.writeText(enlace).then(() => toast.success("Enlace copiado"), () => toast.error("No se pudo copiar"))}
            >
              <Copy className="h-4 w-4" /> Copiar
            </button>
          </div>
        </div>
      )}

      {ultima?.estado === "terminado" && (
        <div className="mt-2 space-y-2 text-sm text-gray-700">
          <p>
            Presentada el {fechaHora(ultima.terminadoEn)}
            {ultima.concepto ? ` · concepto de ${ultima.conceptoPorEmail ?? "psicología"} el ${fechaHora(ultima.conceptoEn)}` : " · pendiente del concepto de psicología"}
          </p>
          {ultima.conceptoObservacion && <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-700">{ultima.conceptoObservacion}</p>}
          {verDetalle && ultima.sugerencia && (
            <p className={ultima.alertas.length ? "text-amber-700" : "text-green-700"}>
              {ultima.alertas.length ? `El sistema resalta ${ultima.alertas.length} ${ultima.alertas.length === 1 ? "punto" : "puntos"} para revisar` : "Sin alertas del sistema"}
              {ultima.puntajeGlobal != null ? ` · puntaje orientativo ${ultima.puntajeGlobal} / 100` : ""}
            </p>
          )}
        </div>
      )}

      {ultima && (ultima.estado === "anulado" || ultima.estado === "abandonado") && (
        <p className="mt-2 text-sm text-gray-500">{ultima.estado === "anulado" ? "La última prueba se anuló." : "Empezó la prueba y no la terminó a tiempo."}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {puedeAsignar && !pendiente && (
          <button
            type="button"
            disabled={ocupado || !cedula}
            title={cedula ? undefined : "El candidato no tiene cédula registrada"}
            onClick={asignar}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {ocupado ? "Asignando…" : ultima ? "Asignar otra vez" : "Asignar la prueba"}
          </button>
        )}
        {verDetalle && ultima && ultima.estado !== "asignado" && (
          <Link href={`${RUTA_MODULO}/${ultima.id}`} className="text-sm font-medium text-primary hover:underline">
            Ver el resultado completo
          </Link>
        )}
      </div>

      {anteriores.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-[#F1F5F9] pt-3 text-xs text-gray-500">
          {anteriores.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <span>{fechaHora(p.terminadoEn ?? p.asignadoEn)}</span>
              <span>· {estadoLegible(p)}</span>
              {verDetalle && p.estado !== "asignado" && (
                <Link href={`${RUTA_MODULO}/${p.id}`} className="text-primary hover:underline">
                  ver
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
