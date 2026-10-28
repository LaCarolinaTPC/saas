"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { coincideTexto } from "@/lib/tabla/filtros";
import {
  aplicarNivel,
  arbolDePermisos,
  nivelDelModulo,
  permisosDelModulo,
  type ModuloNodo,
  type NivelModulo,
} from "@/lib/permisos/arbol";

const NIVELES: { valor: Exclude<NivelModulo, "personalizado">; etiqueta: string }[] = [
  { valor: "ninguno", etiqueta: "Sin acceso" },
  { valor: "ver", etiqueta: "Ver" },
  { valor: "editar", etiqueta: "Editar" },
  { valor: "todo", etiqueta: "Todo" },
];

/**
 * Los permisos agrupados como el menú: cada módulo con su atajo de nivel
 * (Sin acceso · Ver · Editar · Todo) y, desplegado, una casilla por acción y
 * por función. Las funciones sensibles llevan candado: los atajos Ver y Editar
 * no las marcan, hay que marcarlas a propósito.
 *
 * `base` (opcional) es lo que da el rol: lo que difiere se marca como
 * «individual», para editar los permisos de UNA persona sin crearle un rol.
 */
export function ArbolPermisos({
  valor,
  onCambio,
  base,
  soloLectura = false,
}: {
  valor: ReadonlySet<string>;
  onCambio?: (nuevo: Set<string>) => void;
  base?: ReadonlySet<string>;
  soloLectura?: boolean;
}) {
  const arbol = useMemo(() => arbolDePermisos(), []);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [soloConAcceso, setSoloConAcceso] = useState(false);

  const cambiar = (clave: string, si: boolean) => {
    if (soloLectura || !onCambio) return;
    const s = new Set(valor);
    if (si) s.add(clave);
    else s.delete(clave);
    onCambio(s);
  };
  const alternar = (m: string) =>
    setAbiertos((a) => {
      const s = new Set(a);
      if (s.has(m)) s.delete(m);
      else s.add(m);
      return s;
    });

  const visible = (m: ModuloNodo) =>
    (!busqueda ||
      coincideTexto(m.etiqueta, busqueda) ||
      m.funciones.some((f) => coincideTexto(f.etiqueta, busqueda))) &&
    (!soloConAcceso || permisosDelModulo(m).some((p) => valor.has(p)));

  const casilla = (clave: string, etiqueta: string, candado = false) => {
    const marcado = valor.has(clave);
    const difiere = base && marcado !== base.has(clave);
    return (
      <label key={clave} className={cn("flex items-center gap-2 rounded px-2 py-1 text-sm", !soloLectura && "cursor-pointer hover:bg-[#F8FAFC]")}>
        <Checkbox checked={marcado} disabled={soloLectura} onCheckedChange={(c) => cambiar(clave, c === true)} aria-label={etiqueta} />
        <span className="text-gray-700">{etiqueta}</span>
        {candado && <Lock className="h-3 w-3 text-amber-600" aria-label="Sensible: se marca a propósito" />}
        {difiere && (
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", marcado ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
            {marcado ? "individual: concedido" : "individual: quitado"}
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar módulo o función"
            className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white pl-8 pr-3 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <Checkbox checked={soloConAcceso} onCheckedChange={(c) => setSoloConAcceso(c === true)} />
          Solo con acceso
        </label>
      </div>

      {arbol.map((g) => {
        const modulos = g.modulos.filter(visible);
        if (!modulos.length) return null;
        return (
          <section key={g.clave} className="rounded-xl border border-[#E2E8F0] bg-white">
            <h3 className="border-b border-[#F1F5F9] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.etiqueta}</h3>
            <ul className="divide-y divide-[#F1F5F9]">
              {modulos.map((m) => {
                const nivel = nivelDelModulo(m, valor);
                const total = permisosDelModulo(m).length;
                const marcados = permisosDelModulo(m).filter((p) => valor.has(p)).length;
                const abierto = abiertos.has(m.clave) || !!busqueda;
                return (
                  <li key={m.clave} className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => alternar(m.clave)}
                        aria-expanded={abierto}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium text-gray-900"
                      >
                        {abierto ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                        <span className="truncate">{m.etiqueta}</span>
                        <span className="ml-1 shrink-0 text-xs font-normal text-gray-400">
                          {marcados}/{total}
                        </span>
                      </button>
                      <div className="flex shrink-0 overflow-hidden rounded-lg border border-[#E2E8F0]" role="group" aria-label={`Nivel en ${m.etiqueta}`}>
                        {NIVELES.map((n) => (
                          <button
                            key={n.valor}
                            type="button"
                            disabled={soloLectura}
                            onClick={() => onCambio?.(aplicarNivel(m, valor, n.valor))}
                            aria-pressed={nivel === n.valor}
                            className={cn(
                              "px-2.5 py-1 text-xs transition-colors",
                              nivel === n.valor ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#EEF2FF]",
                              soloLectura && "cursor-default hover:bg-white"
                            )}
                          >
                            {n.etiqueta}
                          </button>
                        ))}
                        {nivel === "personalizado" && <span className="bg-amber-50 px-2.5 py-1 text-xs text-amber-700">Personalizado</span>}
                      </div>
                    </div>
                    {abierto && (
                      <div className="mt-2 grid gap-x-6 gap-y-1 pl-6 sm:grid-cols-2">
                        {m.acciones.map((a) => casilla(a.clave, a.etiqueta))}
                        {m.funciones.map((f) => (
                          <div key={f.clave} className="sm:col-span-2">
                            <p className="mt-1 flex items-center gap-1.5 px-2 text-xs font-medium text-gray-500">
                              {f.etiqueta}
                              {f.soloSuper && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px]">solo administrador</span>}
                            </p>
                            {!f.soloSuper && (
                              <div className="grid gap-x-6 sm:grid-cols-2">
                                {f.acciones.map((a) => casilla(a.clave, a.etiqueta, f.sensible))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
