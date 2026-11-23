"use client";

/**
 * Ficha › Exámenes médicos: el laboratorio del aspirante (la fase 2 va al
 * mismo), la orden de exámenes y la carta del banco para descargar, y el
 * reenvío por WhatsApp (Salud Ocupacional, 21-nov-2026).
 */
import { useEffect, useState, useTransition } from "react";
import { Download, MessageCircle } from "lucide-react";
import {
  asignarLaboratorioAccion, documentosAspiranteAccion, enviarDocumentosAccion, laboratorioDelProcesoAccion, type DocumentoDescarga,
} from "@/app/(dashboard)/candidatos/seleccion/laboratorios-actions";

const campo = "rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#4F46E5]";
const boton = "inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50";

const RESULTADO: Record<string, string> = {
  enviado: "Enviados por WhatsApp.",
  pendiente_ventana: "La ventana de 24 horas está cerrada: salen apenas el aspirante escriba.",
  prueba: "Es un candidato de prueba: no se envía nada.",
  sin_documentos: "No hay plantillas para generar los documentos.",
  sin_conversacion: "El aspirante no tiene conversación de WhatsApp.",
  fallido: "No se pudieron enviar.",
};

function descargar(d: DocumentoDescarga) {
  const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: d.mime ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = d.nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export function LaboratorioFicha({ procesoId, puedeEditar }: { procesoId: string; puedeEditar: boolean }) {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof laboratorioDelProcesoAccion>>>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  useEffect(() => {
    laboratorioDelProcesoAccion(procesoId).then(setDatos).catch(() => setDatos(null));
  }, [procesoId]);
  if (!datos) return null;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[#E2E8F0] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-900">Laboratorio:</span>
        <select
          className={campo}
          value={datos.laboratorioId ?? ""}
          disabled={!puedeEditar || ocupado}
          onChange={(e) =>
            enTransicion(async () => {
              const r = await asignarLaboratorioAccion(procesoId, e.target.value || null);
              setAviso(r.ok ? { ok: true, texto: "Laboratorio guardado." } : { ok: false, texto: r.error });
              setDatos(await laboratorioDelProcesoAccion(procesoId));
            })
          }
        >
          <option value="">{datos.predeterminado ? `El predeterminado (${datos.predeterminado})` : "Sin laboratorio"}</option>
          {datos.laboratorios.map((l) => (
            <option key={l.id} value={l.id}>{l.nombre}</option>
          ))}
        </select>
        <span className="text-xs text-gray-500">La fase 2 se hace en el mismo.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={boton}
          disabled={ocupado}
          onClick={() =>
            enTransicion(async () => {
              const r = await documentosAspiranteAccion(procesoId);
              if (!r.ok) return setAviso({ ok: false, texto: r.error });
              r.documentos.forEach(descargar);
              setAviso(r.avisos.length ? { ok: false, texto: r.avisos.join(" ") } : null);
            })
          }
        >
          <Download className="h-3.5 w-3.5" /> Orden y carta del banco
        </button>
        {puedeEditar && (
          <button
            className={boton}
            disabled={ocupado}
            onClick={() =>
              confirm("¿Enviarle al aspirante la carta del banco por WhatsApp? (La orden de exámenes va solo al laboratorio.)") &&
              enTransicion(async () => {
                const r = await enviarDocumentosAccion(procesoId, false);
                setAviso(r.ok ? { ok: r.resultado === "enviado" || r.resultado === "prueba", texto: `${RESULTADO[r.resultado] ?? r.resultado} ${r.avisos.join(" ")}`.trim() } : { ok: false, texto: r.error });
              })
            }
          >
            <MessageCircle className="h-3.5 w-3.5" /> Enviar la carta por WhatsApp
          </button>
        )}
      </div>
      {aviso && <p className={`text-xs ${aviso.ok ? "text-emerald-700" : "text-red-600"}`}>{aviso.texto}</p>}
    </div>
  );
}
