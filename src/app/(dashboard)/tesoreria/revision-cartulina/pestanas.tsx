import Link from "next/link";

type Pestana = "revision" | "consolidado" | "mapa" | "solicitudes" | "recobros";

/**
 * Pestañas de Revisión cartulina: la revisión del día, el consolidado, el mapa
 * de calor y las solicitudes a cámaras. `alarma` es lo pendiente de las
 * solicitudes (respuestas sin ver + recobros sin caja) y se pinta en rojo.
 * `soloSolicitudes` es para caja sin acceso a cartulina: las otras tres lo
 * rebotarían.
 */
export function PestanasCartulina({ activa, alarma = 0, soloSolicitudes = false }: {
  activa: Pestana;
  alarma?: number;
  soloSolicitudes?: boolean;
}) {
  const cls = (a: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${a ? "bg-primary text-white" : "bg-white text-text-secondary hover:bg-slate-50"}`;
  const pestanas: { key: Pestana; href: string; label: string }[] = [
    { key: "revision", href: "/tesoreria/revision-cartulina", label: "Revisión del día" },
    { key: "consolidado", href: "/tesoreria/revision-cartulina/consolidado", label: "Consolidado" },
    { key: "mapa", href: "/tesoreria/revision-cartulina/mapa", label: "Mapa de calor" },
    { key: "solicitudes", href: "/tesoreria/revision-cartulina/solicitudes-camaras", label: "Solicitudes a cámaras" },
    { key: "recobros", href: "/tesoreria/recobros", label: "Recobros" },
  ];
  return (
    <nav className="flex max-w-full overflow-x-auto rounded-lg border border-border" aria-label="Vistas de revisión cartulina">
      {pestanas
        .filter((p) => !soloSolicitudes || p.key === "solicitudes" || p.key === "recobros")
        .map((p) => (
          <Link key={p.key} href={p.href} className={cls(activa === p.key)} aria-current={activa === p.key ? "page" : undefined}>
            {p.label}
            {p.key === "solicitudes" && alarma > 0 && (
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
