import Link from "next/link";

/**
 * Las dos páginas de indicadores de Candidatos: la selección y la atención del
 * WhatsApp (esta estuvo en Comunicaciones hasta el 21-nov-2026). Cada una lee
 * su periodo de la URL; al cambiar se conserva `dias`, `desde` y `hasta`.
 */
export function PestanasIndicadores({ actual, periodo }: { actual: "seleccion" | "whatsapp" | "proveedores" | "examenes"; periodo?: URLSearchParams }) {
  const q = periodo?.toString();
  const con = (ruta: string) => (q ? `${ruta}?${q}` : ruta);
  const pestanas = [
    { id: "seleccion", nombre: "Selección", href: con("/candidatos/indicadores") },
    { id: "whatsapp", nombre: "Atención del WhatsApp", href: con("/candidatos/indicadores/whatsapp") },
    { id: "examenes", nombre: "Exámenes médicos", href: "/candidatos/indicadores/examenes" },
    { id: "proveedores", nombre: "Proveedores", href: con("/candidatos/indicadores/proveedores") },
  ] as const;
  return (
    <nav className="mb-4 flex w-fit gap-1 rounded-xl border border-border bg-white p-1" aria-label="Indicadores">
      {pestanas.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          aria-current={p.id === actual ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm ${p.id === actual ? "bg-primary text-white" : "text-text-secondary hover:bg-slate-50"}`}
        >
          {p.nombre}
        </Link>
      ))}
    </nav>
  );
}

/** `dias`, `desde` y `hasta` de la URL, para pasarlos a la otra página. */
export function periodoDeLaUrl(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const q = new URLSearchParams();
  for (const k of ["dias", "desde", "hasta"]) {
    const v = Array.isArray(sp[k]) ? sp[k]![0] : sp[k];
    if (v) q.set(k, v);
  }
  return q;
}
