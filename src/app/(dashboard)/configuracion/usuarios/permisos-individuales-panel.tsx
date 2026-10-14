"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Check, Lock, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_MODULES,
  MODULE_LABELS,
  MODULE_SUBS,
  modulosEfectivos,
  origenModulo,
  origenSub,
  SUB_TO_MODULE,
  SUBMODULE_LABELS,
  SUBS_SENSIBLES,
  SUBS_SOLO_ADMIN,
  type OrigenPermiso,
  type PermisosIndividuales,
} from "@/lib/permissions-shared";
import { cn } from "@/lib/utils";
import {
  clearUserIndividualPermissions,
  updateUserIndividualPermissions,
} from "./actions";

/** Tres estados por permiso: hereda del rol, se concede o se deniega. */
type Estado = "rol" | "conceder" | "denegar";

const ESTADOS: { valor: Estado; etiqueta: string }[] = [
  { valor: "rol", etiqueta: "Según el rol" },
  { valor: "conceder", etiqueta: "Conceder" },
  { valor: "denegar", etiqueta: "Denegar" },
];

function estadoDe(mapa: Record<string, boolean>, clave: string): Estado {
  const v = mapa[clave];
  if (v === true) return "conceder";
  if (v === false) return "denegar";
  return "rol";
}

/** Vuelve del mapa de tres estados al mapa de booleanos que guarda el servidor. */
function aMapaBooleano(estados: Record<string, Estado>): Record<string, boolean> {
  const salida: Record<string, boolean> = {};
  for (const [clave, estado] of Object.entries(estados)) {
    if (estado === "conceder") salida[clave] = true;
    else if (estado === "denegar") salida[clave] = false;
  }
  return salida;
}

/** Nombre corto y detalle de una sub-función: la etiqueta trae "(explicación)". */
function partirEtiqueta(sub: string): { nombre: string; detalle: string | null } {
  const texto = SUBMODULE_LABELS[sub] ?? sub;
  const i = texto.indexOf("(");
  if (i === -1) return { nombre: texto, detalle: null };
  return {
    nombre: texto.slice(0, i).trim(),
    detalle: texto.slice(i + 1).replace(/\)$/, "").trim(),
  };
}

const TEXTO_ORIGEN: Record<OrigenPermiso, string> = {
  rol: "del rol",
  concedido: "concedido",
  denegado: "denegado",
  reservado: "solo administrador",
  admin: "administrador",
};

function PastillaEfectivo({
  permitido,
  origen,
}: {
  permitido: boolean;
  origen: OrigenPermiso;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        permitido ? "bg-[#DCFCE7] text-green-800" : "bg-[#F1F5F9] text-gray-500"
      )}
    >
      {permitido ? "Sí" : "No"}
      <span className="font-normal opacity-70">· {TEXTO_ORIGEN[origen]}</span>
    </span>
  );
}

function SelectorEstado({
  valor,
  onChange,
  disabled,
}: {
  valor: Estado;
  onChange: (e: Estado) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-[#E2E8F0]">
      {ESTADOS.map((e) => (
        <button
          key={e.valor}
          type="button"
          disabled={disabled}
          onClick={() => onChange(e.valor)}
          className={cn(
            "px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40",
            valor === e.valor
              ? e.valor === "denegar"
                ? "bg-red-600 text-white"
                : e.valor === "conceder"
                  ? "bg-[#4F46E5] text-white"
                  : "bg-[#F8FAFC] text-[#334155]"
              : "bg-white text-gray-500 hover:bg-[#F8FAFC]"
          )}
        >
          {e.etiqueta}
        </button>
      ))}
    </div>
  );
}

/**
 * Permisos de UN usuario por encima de su rol. Panel en línea (esta pantalla
 * no usa diálogos) con tres estados por módulo y por sub-función, el permiso
 * del rol a la izquierda y el efectivo calculado en vivo a la derecha con las
 * mismas funciones puras que usan el menú, el middleware y el servidor.
 */
export function PermisosIndividualesPanel({
  userId,
  nombre,
  rolNombre,
  modulosDelRol,
  submodulosDelRol,
  iniciales,
  onCerrar,
}: {
  userId: string;
  nombre: string;
  rolNombre: string;
  modulosDelRol: string[];
  submodulosDelRol: Record<string, string[]>;
  iniciales: PermisosIndividuales;
  onCerrar: () => void;
}) {
  const [modulos, setModulos] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(
      ALL_MODULES.map((m) => [m, estadoDe(iniciales.modulos ?? {}, m)])
    )
  );
  const [submodulos, setSubmodulos] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(
      Object.keys(SUB_TO_MODULE).map((s) => [
        s,
        // Las reservadas al administrador se fuerzan a "según el rol": si una
        // llegara con valor guardado (edición manual en SQL), el servidor
        // rechazaría todo el guardado sin que el panel explicara por qué.
        SUBS_SOLO_ADMIN.has(s) ? "rol" : estadoDe(iniciales.submodulos ?? {}, s),
      ])
    )
  );
  const [filtro, setFiltro] = useState("");
  const [soloAjustados, setSoloAjustados] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  // Lo que se enviaría ahora: con esto se calcula el efectivo en vivo, sin
  // duplicar la regla de permisos en el cliente.
  const propuesta: PermisosIndividuales = useMemo(
    () => ({
      modulos: aMapaBooleano(modulos),
      submodulos: aMapaBooleano(submodulos),
    }),
    [modulos, submodulos]
  );
  const efectivos = useMemo(
    () => modulosEfectivos(modulosDelRol, propuesta),
    [modulosDelRol, propuesta]
  );

  const totalConcedidos = Object.values({ ...modulos, ...submodulos }).filter(
    (e) => e === "conceder"
  ).length;
  const totalDenegados = Object.values({ ...modulos, ...submodulos }).filter(
    (e) => e === "denegar"
  ).length;

  const coincide = (texto: string) =>
    !filtro.trim() ||
    texto.toLocaleLowerCase().includes(filtro.trim().toLocaleLowerCase());

  function guardar() {
    start(async () => {
      try {
        await updateUserIndividualPermissions(userId, {
          modulos: propuesta.modulos ?? {},
          submodulos: propuesta.submodulos ?? {},
          motivo,
        });
        toast.success(`Permisos individuales guardados: ${nombre}`);
        onCerrar();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function restablecer() {
    const ok = window.confirm(
      `¿Quitar todos los permisos individuales de ${nombre}?\n\n` +
        "Volverá a tener exactamente lo que da su rol."
    );
    if (!ok) return;
    start(async () => {
      try {
        await clearUserIndividualPermissions(userId, motivo);
        toast.success("Permisos restablecidos al rol");
        onCerrar();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al restablecer");
      }
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF]/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Permisos individuales de {nombre}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Rol: <span className="font-medium text-[#334155]">{rolNombre}</span> ·{" "}
            {totalConcedidos} concedido{totalConcedidos === 1 ? "" : "s"},{" "}
            {totalDenegados} denegado{totalDenegados === 1 ? "" : "s"} ·{" "}
            {efectivos.length} módulo{efectivos.length === 1 ? "" : "s"} efectivo
            {efectivos.length === 1 ? "" : "s"}
          </p>
          {iniciales.meta?.email && (
            <p className="mt-0.5 text-[11px] text-gray-400">
              Último cambio: {iniciales.meta.email}
              {iniciales.meta.at
                ? ` · ${new Date(iniciales.meta.at).toLocaleString("es-CO")}`
                : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar módulo o función"
              className="h-8 w-56 rounded-lg border border-[#E2E8F0] bg-white pl-7 pr-2 text-xs text-gray-700 outline-none focus:border-[#4F46E5]"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={soloAjustados}
              onChange={(e) => setSoloAjustados(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#4F46E5]"
            />
            Solo con ajuste
          </label>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Módulo / función</th>
              <th className="px-3 py-2 text-center font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Individual</th>
              <th className="px-3 py-2 font-medium">Efectivo</th>
            </tr>
          </thead>
          <tbody>
            {ALL_MODULES.map((m) => {
              const subs = (MODULE_SUBS[m as keyof typeof MODULE_SUBS] ??
                []) as readonly string[];
              const estadoModulo = modulos[m];
              const visibleModulo =
                coincide(MODULE_LABELS[m]) &&
                (!soloAjustados || estadoModulo !== "rol");
              // Las sub-funciones se muestran si el módulo pasa el filtro o si
              // ellas mismas coinciden: así buscar "auditoría" encuentra la sub
              // aunque el nombre del módulo no la contenga.
              const subsVisibles = subs.filter(
                (s) =>
                  (coincide(MODULE_LABELS[m]) || coincide(SUBMODULE_LABELS[s] ?? s)) &&
                  (!soloAjustados || submodulos[s] !== "rol")
              );
              if (!visibleModulo && !subsVisibles.length) return null;

              const delRol = modulosDelRol.includes(m);
              const efectivoModulo = origenModulo(modulosDelRol, propuesta, m);
              const moduloActivo = efectivos.includes(m);

              return (
                <Fragment key={m}>
                  {visibleModulo && (
                    <tr className="border-b border-[#F1F5F9]">
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {MODULE_LABELS[m]}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-400">
                        {delRol ? "✓" : "✗"}
                      </td>
                      <td className="px-3 py-2">
                        <SelectorEstado
                          valor={estadoModulo}
                          disabled={pending}
                          onChange={(e) => setModulos((p) => ({ ...p, [m]: e }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PastillaEfectivo
                          permitido={efectivoModulo.permitido}
                          origen={efectivoModulo.origen}
                        />
                      </td>
                    </tr>
                  )}

                  {subsVisibles.map((s) => {
                    const reservada = SUBS_SOLO_ADMIN.has(s);
                    const { nombre: nombreSub, detalle } = partirEtiqueta(s);
                    const efectivoSub = origenSub(
                      submodulosDelRol,
                      propuesta,
                      m,
                      s,
                      false
                    );
                    const delRolSub = origenSub(
                      submodulosDelRol,
                      {},
                      m,
                      s,
                      false
                    ).permitido;
                    return (
                      <tr key={s} className="border-b border-[#F1F5F9] bg-[#FCFCFD]">
                        <td className="py-2 pl-3 pr-3">
                          <div className="border-l-2 border-[#E2E8F0] pl-3">
                            <p className="flex items-center gap-1.5 text-[13px] text-gray-700">
                              {nombreSub}
                              {reservada && (
                                <span title="Reservado a administradores">
                                  <Lock className="h-3 w-3 text-[#94A3B8]" />
                                </span>
                              )}
                              {SUBS_SENSIBLES.has(s) && (
                                <span className="rounded-full bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-medium text-[#B45309]">
                                  Sensible
                                </span>
                              )}
                            </p>
                            {detalle && (
                              <p className="mt-0.5 text-[11px] leading-snug text-gray-400">
                                {detalle}
                              </p>
                            )}
                            {!reservada && !moduloActivo && (
                              <p className="mt-0.5 text-[11px] text-[#B45309]">
                                Concede primero el módulo {MODULE_LABELS[m]}.
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-400">
                          {reservada ? "—" : delRolSub ? "✓" : "✗"}
                        </td>
                        <td className="px-3 py-2">
                          <SelectorEstado
                            valor={reservada ? "rol" : submodulos[s]}
                            disabled={pending || reservada}
                            onChange={(e) =>
                              setSubmodulos((p) => ({ ...p, [s]: e }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <PastillaEfectivo
                            permitido={moduloActivo && efectivoSub.permitido}
                            origen={efectivoSub.origen}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {!efectivos.length && (
        <p className="mt-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-xs text-red-700">
          Así el usuario no podría abrir ninguna pantalla. Si quieres retirarle el
          acceso, usa «Desactivar» en su fila.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Motivo (queda en la bitácora)
          </label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            placeholder="Opcional: por qué se le ajustan los permisos"
            className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
          />
        </div>
        <button
          onClick={guardar}
          disabled={pending || !efectivos.length}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {pending ? "Guardando…" : "Guardar permisos"}
        </button>
        <button
          onClick={restablecer}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4 text-[#64748B]" /> Restablecer al rol
        </button>
      </div>

      <p className="mt-2 text-[11px] text-gray-400">
        «Según el rol» no guarda nada: el permiso se hereda y sigue al rol si este
        cambia. Las funciones reservadas al administrador no se conceden por aquí, y
        al cambiar el rol del usuario estos ajustes se retiran.
      </p>
    </div>
  );
}
