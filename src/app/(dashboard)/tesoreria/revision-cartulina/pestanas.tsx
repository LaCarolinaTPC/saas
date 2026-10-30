import Link from "next/link";

type Pestana = "revision" | "consolidado" | "mapa" | "recobros";

/**
 * Pestañas de Revisión cartulina: la revisión del día, el consolidado, el mapa
 * de calor y el acceso a la página de Recobros. `alarma` es lo que esta
 * persona tiene por atender en Recobros según su rol, y se pinta en rojo.
 */
export function PestanasCartulina({ activa, alarma = 0 }: {
  activa: Pestana;
  alarma?: number;
}) {
  const cls = (a: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${a ? "bg-primary text-white" : "bg-white text-text-secondary hover:bg-slate-50"}`;
  const pestanas: { key: Pestana; href: string; label: string }[] = [
    { key: "revision", href: "/tesoreria/revision-cartulina", label: "Revisión del día" },
    { key: "consolidado", href: "/tesoreria/revision-cartulina/consolidado", label: "Consolidado" },
    { key: "mapa", href: "/tesoreria/revision-cartulina/mapa", label: "Mapa de calor" },
    { key: "recobros", href: "/tesoreria/recobros", label: "Recobros" },
  ];
  return (
    <nav className="flex max-w-full overflow-x-auto rounded-lg border border-border" aria-label="Vistas de revisión cartulina">
      {pestanas
        .map((p) => (
          <Link key={p.key} href={p.href} className={cls(activa === p.key)} aria-current={activa === p.key ? "page" : undefined}>
            {p.label}
            {p.key === "recobros" && alarma > 0 && (
              <span
                className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[11px] font-semibold leading-5 text-white"
                aria-label={`${alarma} pendientes`}
              >
                {alarma}
              </span>
            )}
          </Link>
        ))}
    </nav>
  );
}
