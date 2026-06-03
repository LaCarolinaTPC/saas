const GRUPO_STYLES: Record<string, string> = {
  "0-3m": "bg-purple-100 text-purple-800",
  "3-6m": "bg-blue-100 text-blue-800",
  "6-12m": "bg-emerald-100 text-emerald-800",
  "1+a": "bg-amber-100 text-amber-800",
};

const GRUPO_LABELS: Record<string, string> = {
  "0-3m": "0-3 meses",
  "3-6m": "3-6 meses",
  "6-12m": "6-12 meses",
  "1+a": "+1 ano",
};

export function GrupoBadge({ grupo }: { grupo: string | null }) {
  if (!grupo) return null;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${GRUPO_STYLES[grupo] || "bg-slate-100 text-slate-700"}`}
    >
      {GRUPO_LABELS[grupo] || grupo}
    </span>
  );
}

export function TipoBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return null;
  const t = tipo.toUpperCase();
  let style = "bg-slate-100 text-slate-700";
  let label = tipo;
  if (t.includes("FIJO")) {
    style = "bg-emerald-100 text-emerald-800";
    label = "Fijo";
  } else if (t.includes("RELEVO")) {
    style = "bg-blue-100 text-blue-800";
    label = "Relevo";
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${style}`}
    >
      {label}
    </span>
  );
}

const AFILIACION_STYLES: Record<string, string> = {
  EMPRESA:  "bg-violet-100 text-violet-800",
  AFILIADO: "bg-orange-100 text-orange-800",
};

const AFILIACION_LABELS: Record<string, string> = {
  EMPRESA:  "Empresa",
  AFILIADO: "Afiliado",
};

export function AfiliacionBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return null;
  const t = tipo.toUpperCase();
  const key = t.includes("EMPRESA") ? "EMPRESA"
            : t.includes("AFILIADO") ? "AFILIADO"
            : null;
  if (!key) return null;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${AFILIACION_STYLES[key]}`}>
      {AFILIACION_LABELS[key]}
    </span>
  );
}

const ESTADO_STYLES: Record<string, string> = {
  ACTIVO:     "bg-emerald-100 text-emerald-800",
  RETIRADO:   "bg-red-100 text-red-800",
  SUSPENDIDO: "bg-amber-100 text-amber-800",
};

const ESTADO_LABELS: Record<string, string> = {
  ACTIVO:     "Activo",
  RETIRADO:   "Retirado",
  SUSPENDIDO: "Suspendido",
};

export function EstadoBadge({ estado }: { estado: string }) {
  const key = (estado || "").toUpperCase();
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
        ESTADO_STYLES[key] || "bg-slate-100 text-slate-700"
      }`}
    >
      {ESTADO_LABELS[key] || estado}
    </span>
  );
}
