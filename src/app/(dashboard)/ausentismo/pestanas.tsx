import Link from "next/link";

/**
 * Pestañas de Ausentismo para las pantallas que NO son `/ausentismo`.
 *
 * Las cinco vistas originales viven en `/ausentismo` con `?tab=` y las pinta
 * `ausentismo-client.tsx` con botones (necesita el contador de alertas en
 * Reincidentes). Marcaciones es una ruta propia, porque carga el biométrico y
 * la programación de GEMA y no tiene por qué pesar sobre las demás; desde ella
 * se vuelve con enlaces. Las clases son las mismas para que la tira se vea
 * igual en los dos lados.
 */
export type PestanaAusentismo =
  | "dia"
  | "historial"
  | "reincidentes"
  | "matriz"
  | "indicadores"
  | "marcaciones";

const TABS: { key: PestanaAusentismo; label: string; href: string }[] = [
  { key: "dia", label: "Registro del día", href: "/ausentismo" },
  { key: "marcaciones", label: "Marcaciones", href: "/ausentismo/marcaciones" },
  { key: "historial", label: "Historial", href: "/ausentismo?tab=historial" },
  { key: "reincidentes", label: "Reincidentes", href: "/ausentismo?tab=reincidentes" },
  { key: "matriz", label: "Matriz EPS", href: "/ausentismo?tab=matriz" },
  { key: "indicadores", label: "Indicadores", href: "/ausentismo?tab=indicadores" },
];

export function PestanasAusentismo({ activa }: { activa: PestanaAusentismo }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium ${
            activa === t.key
              ? "bg-[#4F46E5] text-white"
              : "bg-white text-gray-600 hover:bg-[#F8FAFC]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
