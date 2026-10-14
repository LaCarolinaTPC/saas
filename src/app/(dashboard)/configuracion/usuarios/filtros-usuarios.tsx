"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Campo de búsqueda de esta pantalla. Local a propósito: la cadena de clases
 * está copiada en más de diez archivos con variantes de ancho, alto y zona
 * visual, así que unificarla en un componente compartido es un refactor aparte.
 */
export function CampoBusqueda({
  valor,
  onChange,
  placeholder,
  etiqueta,
  ancho = "w-64",
  compacto = false,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** aria-label: no hay <label> visible. */
  etiqueta: string;
  ancho?: string;
  compacto?: boolean;
}) {
  return (
    <div className="relative">
      <Search
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400",
          compacto ? "left-2.5 h-3.5 w-3.5" : "left-3 h-4 w-4"
        )}
      />
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className={cn(
          "rounded-lg border border-[#E2E8F0] bg-white text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20",
          compacto ? "h-8 pl-8 pr-2 text-xs" : "h-9 pl-9 pr-3 text-sm",
          ancho
        )}
      />
      {valor && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar la búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-[#F8FAFC] hover:text-gray-600"
        >
          <X className={compacto ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      )}
    </div>
  );
}

const selectCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";

/** Valor del filtro de rol que significa «sin rol asignado». */
export const SIN_ROL = "__sin_rol__";

export interface FiltrosUsuarios {
  q: string;
  rol: string;
  estado: string;
  ind: string;
}

/**
 * Barra de filtros del listado de usuarios: texto, rol, estado y permisos
 * individuales, con las pastillas de lo que está activo y un botón para
 * limpiarlo todo.
 */
export function BarraFiltrosUsuarios({
  filtros,
  onCambiar,
  onLimpiar,
  roles,
  conteoPorRol,
  mostrarIndividuales,
}: {
  filtros: FiltrosUsuarios;
  onCambiar: (clave: keyof FiltrosUsuarios, valor: string) => void;
  onLimpiar: () => void;
  roles: { key: string; nombre: string }[];
  conteoPorRol: Record<string, number>;
  /** false si falta la migración de permisos individuales: el filtro se oculta. */
  mostrarIndividuales: boolean;
}) {
  const nombreRol = roles.find((r) => r.key === filtros.rol)?.nombre ?? filtros.rol;
  const chips: { clave: keyof FiltrosUsuarios; etiqueta: string }[] = [];
  if (filtros.q.trim()) chips.push({ clave: "q", etiqueta: `«${filtros.q.trim()}»` });
  if (filtros.rol) {
    chips.push({
      clave: "rol",
      etiqueta: filtros.rol === SIN_ROL ? "Sin rol asignado" : `Rol: ${nombreRol}`,
    });
  }
  if (filtros.estado) {
    chips.push({
      clave: "estado",
      etiqueta: filtros.estado === "activos" ? "Solo activos" : "Solo desactivados",
    });
  }
  if (filtros.ind) {
    chips.push({
      clave: "ind",
      etiqueta: filtros.ind === "si" ? "Con permisos individuales" : "Sin permisos individuales",
    });
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CampoBusqueda
          valor={filtros.q}
          onChange={(v) => onCambiar("q", v)}
          placeholder="Buscar por nombre, correo, rol o departamento"
          etiqueta="Buscar usuarios"
          ancho="w-72"
        />
        <select
          value={filtros.rol}
          onChange={(e) => onCambiar("rol", e.target.value)}
          aria-label="Filtrar por rol"
          className={selectCls}
        >
          <option value="">Todos los roles</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.nombre}
              {conteoPorRol[r.key] ? ` (${conteoPorRol[r.key]})` : ""}
            </option>
          ))}
          {/* Un rol eliminado deja perfiles con user_type nulo o colgado. */}
          <option value={SIN_ROL}>Sin rol asignado</option>
        </select>
        <select
          value={filtros.estado}
          onChange={(e) => onCambiar("estado", e.target.value)}
          aria-label="Filtrar por estado"
          className={selectCls}
        >
          <option value="">Activos y desactivados</option>
          <option value="activos">Solo activos</option>
          <option value="desactivados">Solo desactivados</option>
        </select>
        {mostrarIndividuales && (
          <select
            value={filtros.ind}
            onChange={(e) => onCambiar("ind", e.target.value)}
            aria-label="Filtrar por permisos individuales"
            className={selectCls}
          >
            <option value="">Con y sin permisos individuales</option>
            <option value="si">Con permisos individuales</option>
            <option value="no">Sin permisos individuales</option>
          </select>
        )}
        {chips.length > 0 && (
          <button
            onClick={onLimpiar}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            <X className="h-4 w-4 text-[#64748B]" /> Limpiar
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.clave}
              onClick={() => onCambiar(c.clave, "")}
              title="Quitar este filtro"
              className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4338CA] hover:bg-[#E0E7FF]"
            >
              {c.etiqueta}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
