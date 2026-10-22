"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";
import type { SolicitudTesoreria } from "@/lib/mantenimiento/camaras-data";
import { resolverSolicitudCamaras } from "../actions";

const RESULTADO_LABEL: Record<string, string> = {
  recobro: "Recobro",
  normalidad_timbradas: "Normalidad de timbradas",
};

const FILTROS: { key: string; label: string }[] = [
  { key: "pendiente", label: "Pendientes" },
  { key: "resuelto", label: "Resueltas" },
  { key: "todas", label: "Todas" },
];

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export function SolicitudesClient({
  solicitudes,
  estado,
  puedeEditar,
  error,
}: {
  solicitudes: SolicitudTesoreria[];
  estado: string;
  puedeEditar: boolean;
  error: string | null;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error.includes("tesoreria_camaras_solicitudes")
            ? "Falta aplicar la migración de solicitudes de cámaras."
            : error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.key}
            href={`/mantenimiento/camaras/solicitudes?estado=${f.key}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              estado === f.key ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] bg-white text-gray-600"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {solicitudes.length === 0 ? (
        <p className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-gray-400">
          No hay solicitudes {estado === "pendiente" ? "pendientes" : estado === "resuelto" ? "resueltas" : ""}.
        </p>
      ) : (
        <ul className="space-y-3">
          {solicitudes.map((s) => (
            <SolicitudCard key={s.id} s={s} puedeEditar={puedeEditar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SolicitudCard({ s, puedeEditar }: { s: SolicitudTesoreria; puedeEditar: boolean }) {
  const [nota, setNota] = useState("");
  const [guardando, start] = useTransition();
  const resuelto = s.estado === "resuelto";

  function resolver(resultado: "recobro" | "normalidad_timbradas") {
    start(async () => {
      const r = await resolverSolicitudCamaras({ id: s.id, resultado, nota });
      if (r.success) {
        (r.avisos ?? []).forEach((a) => toast.warning(a));
        toast.success("Solicitud resuelta.");
      } else {
        toast.error(r.error ?? "No se pudo resolver.");
      }
    });
  }

  return (
    <li className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">
            Bus {s.vehiculo_codigo ?? "—"} · placa {s.placa ?? "—"} · viaje {s.viaje ?? "—"}
          </p>
          <p className="text-xs text-gray-500">
            {s.fecha_viaje} · despacho n.º {s.numero} · {s.ruta ?? "Sin ruta"}
          </p>
          <p className="text-xs text-gray-500">
            {s.conductor_nombre ?? "Sin conductor"}
            {s.conductor_cedula ? ` (${s.conductor_cedula})` : ""}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Enviado por {s.solicitado_por_email ?? "—"} · {fmt(s.solicitado_at)}
          </p>
          {s.nota_solicitud && <p className="mt-1 text-sm text-gray-700">“{s.nota_solicitud}”</p>}
        </div>
        <Link
          href={`/tesoreria/revision-cartulina?fecha=${s.fecha_viaje}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#4F46E5] hover:underline"
          title="Ver en Revisión cartulina"
        >
          Cartulina <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {resuelto ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="font-semibold">{RESULTADO_LABEL[s.resultado ?? ""] ?? "Resuelto"}</span>
          {s.nota_camaras ? ` · ${s.nota_camaras}` : ""}
          <span className="block text-xs text-emerald-700">
            Por {s.resuelto_por_email ?? "—"} · {fmt(s.resuelto_at)}
          </span>
        </div>
      ) : puedeEditar ? (
        <div className="mt-3 space-y-2 border-t border-[#F1F5F9] pt-3">
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Nota de la revisión (opcional)"
            className="w-full rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => resolver("recobro")}
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Recobro
            </button>
            <button
              type="button"
              onClick={() => resolver("normalidad_timbradas")}
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Normalidad de timbradas
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">Pendiente · tu usuario es de solo consulta.</p>
      )}
    </li>
  );
}
