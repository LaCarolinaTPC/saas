import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const BOGOTA_TZ = "America/Bogota";

export function formatDateBogota(dateStr: string | null | undefined, options?: { time?: boolean }): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", {
    timeZone: BOGOTA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(options?.time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function formatDateTimeBogota(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", {
    timeZone: BOGOTA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgoBogota(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const now = new Date();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} hora${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days} dia${days > 1 ? "s" : ""}`;
  return formatDateBogota(dateStr);
}

export function nowBogotaISO(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: BOGOTA_TZ }).replace(" ", "T") + "-05:00";
}
