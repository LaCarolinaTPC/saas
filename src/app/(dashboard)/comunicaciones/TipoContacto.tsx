"use client";

/**
 * Marca el número como laboratorio (entrega 3 de selección): el asistente, el
 * seguimiento y la reactivación lo saltan, para que no le lleguen mensajes de
 * aspirante ni se le cree un proceso con sus datos.
 */
import { useEffect, useState, useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { marcarContactoBandeja, tipoContactoBandeja } from "@/app/(dashboard)/candidatos/entrega3-actions";

export function TipoContacto({ telefono }: { telefono: string }) {
  const [tipo, setTipo] = useState<"persona" | "laboratorio" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, enTransicion] = useTransition();

  useEffect(() => {
    let vivo = true;
    tipoContactoBandeja(telefono)
      .then((t) => vivo && setTipo(t))
      .catch(() => vivo && setTipo(null));
    return () => {
      vivo = false;
    };
  }, [telefono]);

  if (tipo == null) return null;
  const esLab = tipo === "laboratorio";
  return (
    <div className="mt-2 rounded-lg border border-border bg-white p-2.5">
      <label className="flex cursor-pointer items-start gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={esLab}
          disabled={ocupado}
          onChange={(e) => {
            const nuevo = e.target.checked ? "laboratorio" : "persona";
            setError(null);
            enTransicion(async () => {
              const r = await marcarContactoBandeja(telefono, nuevo);
              if (r.ok) setTipo(nuevo);
              else setError(r.error ?? "No se pudo guardar.");
            });
          }}
        />
        <span>
          <span className="flex items-center gap-1 font-medium text-text-primary">
            <FlaskConical className="h-3 w-3" /> Es el laboratorio
          </span>
          El asistente no le contesta y no recibe recordatorios de aspirante.
        </span>
      </label>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
