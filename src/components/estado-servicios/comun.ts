/** Textos compartidos del estado de los servicios (24-nov-2026). */
import type { NivelServicio } from "@/lib/estado-servicios";

export const ETIQUETA_NIVEL: Record<NivelServicio, string> = {
  ok: "Funcionando",
  fallando: "Fallando",
  sin_datos: "Sin uso reciente",
  pausado: "En pausa",
  sin_configurar: "Sin configurar",
};

export const TONO_NIVEL: Record<NivelServicio, { punto: string; texto: string }> = {
  ok: { punto: "bg-emerald-500", texto: "text-emerald-700" },
  fallando: { punto: "bg-red-500", texto: "text-red-700" },
  sin_datos: { punto: "bg-slate-300", texto: "text-slate-500" },
  pausado: { punto: "bg-amber-500", texto: "text-amber-700" },
  sin_configurar: { punto: "bg-slate-300", texto: "text-slate-500" },
};

/** «hace 5 min», «hace 3 h», «hace 2 días». */
export function haceCuanto(iso: string | null, ahora: Date = new Date()): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}
