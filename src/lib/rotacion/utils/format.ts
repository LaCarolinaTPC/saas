export function normalizeCedula(raw: string | number): string {
  return String(raw).replace(/[.\s,-]/g, "").trim();
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatNumber(n: number | null, decimals = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCOP(n: number | null): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString("es-CO");
}

export function getInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || "?")[0].toUpperCase();
}
