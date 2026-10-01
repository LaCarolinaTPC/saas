import Link from "next/link";

/** Pestañas de Revisión cartulina: la revisión del día, el consolidado y el mapa de calor. */
export function PestanasCartulina({ activa }: { activa: "revision" | "consolidado" | "mapa" }) {
  const cls = (a: boolean) =>
    `inline-flex items-center px-3 py-1.5 text-sm font-medium ${a ? "bg-primary text-white" : "bg-white text-text-secondary hover:bg-slate-50"}`;
  return (
    <nav className="flex overflow-hidden rounded-lg border border-border" aria-label="Vistas de revisión cartulina">
      <Link href="/tesoreria/revision-cartulina" className={cls(activa === "revision")} aria-current={activa === "revision" ? "page" : undefined}>
        Revisión del día
      </Link>
      <Link href="/tesoreria/revision-cartulina/consolidado" className={cls(activa === "consolidado")} aria-current={activa === "consolidado" ? "page" : undefined}>
        Consolidado
      </Link>
      <Link href="/tesoreria/revision-cartulina/mapa" className={cls(activa === "mapa")} aria-current={activa === "mapa" ? "page" : undefined}>
        Mapa de calor
      </Link>
    </nav>
  );
}
