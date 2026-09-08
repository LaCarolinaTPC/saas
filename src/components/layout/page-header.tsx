import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cabecera fija de las páginas del dashboard. Reemplaza el bloque
 * `sticky top-0 z-30 border-b ...` que estaba copiado a mano en cada página,
 * con menos alto para dejar más pantalla al contenido.
 *
 * Funciona en Server y Client Components (no usa hooks).
 *
 *   <PageHeader titulo="Mantenimiento" icono={Wrench} />
 *   <PageHeader titulo="Empleados" junto={<Chip>{total}</Chip>}>
 *     <input ... />              // controles del lado derecho
 *   </PageHeader>
 *   <PageHeader volver={{ href: "/conductores", label: "Conductores" }} />
 */
export function PageHeader({
  titulo,
  icono: Icon,
  claseIcono,
  descripcion,
  junto,
  volver,
  children,
  pie,
  className,
}: {
  titulo?: React.ReactNode;
  icono?: LucideIcon;
  /** Color del icono si no es el primario (p. ej. "text-amber-600"). */
  claseIcono?: string;
  /** Línea de apoyo debajo del título. */
  descripcion?: React.ReactNode;
  /** Chips, contadores o controles pequeños pegados al título. */
  junto?: React.ReactNode;
  /** Enlace de regreso que va antes del título. */
  volver?: { href: string; label: string };
  /** Controles del lado derecho (filtros, pestañas, botones). */
  children?: React.ReactNode;
  /** Segunda fila fija debajo de la principal (p. ej. barra de reportes). */
  pie?: React.ReactNode;
  className?: string;
}) {
  const hayIzquierda = Boolean(titulo || Icon || junto || volver);
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border bg-white px-4 py-2.5 sm:px-6",
        className
      )}
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {hayIzquierda && (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {volver && (
              <Link
                href={volver.href}
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" /> {volver.label}
              </Link>
            )}
            {Icon && <Icon className={cn("h-5 w-5 shrink-0 text-primary", claseIcono)} />}
            {titulo && (
              <h1 className="text-lg font-semibold leading-tight text-foreground">{titulo}</h1>
            )}
            {junto}
          </div>
        )}
        {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
      </div>
      {descripcion && (
        <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>
      )}
      {pie}
    </header>
  );
}
