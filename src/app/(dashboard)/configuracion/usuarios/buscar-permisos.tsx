"use client";

import { useMemo } from "react";
import { KeyRound, Lock, ShieldAlert } from "lucide-react";
import {
  ALL_MODULES,
  ALL_SUBS,
  MODULE_LABELS,
  SUB_TO_MODULE,
  type PermisosIndividuales,
} from "@/lib/permissions-shared";
import {
  partirEtiqueta,
  permisoDesdeClave,
  quienTienePermiso,
  type RolConsulta,
} from "@/lib/permisos-consulta";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import { CampoBusqueda } from "./filtros-usuarios";
import { PastillaEfectivo, TEXTO_ORIGEN } from "./permisos-individuales-panel";

export interface UsuarioBuscable {
  id: string;
  full_name: string;
  email: string;
  user_type: string | null;
  activo: boolean;
  permisos_individuales: PermisosIndividuales;
}

/**
 * Buscar permisos: filtra los tableros de permisos de abajo y, sobre todo,
 * responde al revés —«¿quién tiene este permiso?»—, que es la pregunta que
 * apareció cuando el acceso dejó de venir solo del rol.
 *
 * Todo se resuelve en el cliente con los datos que la pantalla ya recibió, y
 * con las mismas funciones puras que aplican el middleware y el servidor.
 */
export function BuscarPermisos({
  filtroMatriz,
  onFiltroMatriz,
  permiso,
  onPermiso,
  roles,
  usuarios,
  permisosIndividualesDisponible,
  onVerUsuario,
}: {
  filtroMatriz: string;
  onFiltroMatriz: (v: string) => void;
  /** Clave del permiso elegido para la búsqueda inversa; "" = ninguno. */
  permiso: string;
  onPermiso: (v: string) => void;
  roles: RolConsulta[];
  usuarios: UsuarioBuscable[];
  permisosIndividualesDisponible: boolean;
  /** Lleva al usuario en el listado de arriba (pone su correo en el buscador). */
  onVerUsuario: (email: string) => void;
}) {
  const opciones = useMemo<OpcionBuscable[]>(
    () => [
      ...ALL_MODULES.map((m) => ({
        valor: m,
        etiqueta: `Módulo: ${MODULE_LABELS[m]}`,
        secundario: m,
        claves: [MODULE_LABELS[m], m],
      })),
      ...ALL_SUBS.map((s) => {
        const mod = SUB_TO_MODULE[s];
        const { nombre } = partirEtiqueta(s);
        return {
          valor: s,
          etiqueta: `${MODULE_LABELS[mod]} › ${nombre}`,
          secundario: s,
          claves: [nombre, s, MODULE_LABELS[mod]],
        };
      }),
    ],
    []
  );

  const elegido = permisoDesdeClave(permiso);
  const resultado = useMemo(
    () => (elegido ? quienTienePermiso(elegido, roles, usuarios) : null),
    [elegido, roles, usuarios]
  );

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-[#4F46E5]" />
        <h2 className="text-base font-semibold text-gray-900">Buscar permisos</h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Filtra los tableros de permisos de abajo, o consulta quién puede usar un
        permiso concreto y de dónde le viene el acceso.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Filtrar los tableros de permisos
          </label>
          <CampoBusqueda
            valor={filtroMatriz}
            onChange={onFiltroMatriz}
            placeholder="Por rol o por función: «auditoría», «Tesorero»…"
            etiqueta="Filtrar los tableros de permisos"
            ancho="w-full"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Oculta las columnas y los roles que no coinciden. No cambia ningún
            permiso.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            ¿Quién tiene este permiso?
          </label>
          <BuscadorOpciones
            opciones={opciones}
            value={permiso}
            onChange={onPermiso}
            placeholder="Elige un módulo o una función"
            ayuda="Busca por nombre de módulo o de función."
            vacio={(b) => `Ningún permiso coincide con «${b}».`}
          />
        </div>
      </div>

      {resultado && (
        <div className="mt-5 border-t border-[#F1F5F9] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">
              Quién puede usar «{resultado.etiqueta}»
            </h3>
            {resultado.sensible && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-medium text-[#B45309]">
                <ShieldAlert className="h-3 w-3" /> Sensible
              </span>
            )}
            {resultado.reservadoAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-gray-600">
                <Lock className="h-3 w-3" /> Reservado al administrador
              </span>
            )}
          </div>

          {resultado.reservadoAdmin && (
            <p className="mt-1 text-xs text-[#B45309]">
              Ningún rol ni permiso individual lo concede: solo el administrador.
            </p>
          )}
          {resultado.sensible && !resultado.reservadoAdmin && (
            <p className="mt-1 text-xs text-gray-500">
              El rol no la da por defecto: hay que concederla explícitamente, en
              el rol o en los permisos individuales del usuario.
            </p>
          )}
          {!permisosIndividualesDisponible && (
            <p className="mt-2 rounded-lg bg-[#FEF3C7] px-3 py-2 text-xs text-[#B45309]">
              La migración de permisos individuales no está aplicada: aquí solo se
              ve lo que dan los roles.
            </p>
          )}

          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Roles que lo dan ({resultado.resumen.rolesConAcceso} de{" "}
                {resultado.resumen.rolesTotal})
              </p>
              <ul className="space-y-1">
                {resultado.roles.map((r) => (
                  <li
                    key={r.key}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm odd:bg-[#F8FAFC]"
                  >
                    <span className={r.permitido ? "text-gray-900" : "text-gray-400"}>
                      {r.nombre}
                    </span>
                    <PastillaEfectivo permitido={r.permitido} origen={r.origen} />
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Usuarios con acceso ({resultado.resumen.usuariosConAcceso} de{" "}
                {resultado.resumen.usuariosTotal} activos)
              </p>
              <p className="mb-2 text-[11px] text-gray-400">
                {resultado.resumen.porRol} por su rol ·{" "}
                {resultado.resumen.concedidos} concedido
                {resultado.resumen.concedidos === 1 ? "" : "s"} individualmente ·{" "}
                {resultado.resumen.denegados} denegado
                {resultado.resumen.denegados === 1 ? "" : "s"}
                {resultado.resumen.inactivosConAcceso > 0
                  ? ` · ${resultado.resumen.inactivosConAcceso} desactivado${resultado.resumen.inactivosConAcceso === 1 ? "" : "s"}`
                  : ""}
              </p>
              <ul className="space-y-1">
                {resultado.usuarios
                  .filter((u) => u.permitido || u.origen === "denegado")
                  .map((u) => (
                    <li
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm odd:bg-[#F8FAFC]"
                    >
                      <button
                        onClick={() => onVerUsuario(u.email)}
                        title="Ver este usuario en el listado de arriba"
                        className="min-w-0 text-left hover:underline"
                      >
                        <span className={u.permitido ? "text-gray-900" : "text-gray-400"}>
                          {u.nombre}
                        </span>
                        <span className="ml-1 text-xs text-gray-400">· {u.rolNombre}</span>
                        {!u.activo && (
                          <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                            Desactivado
                          </span>
                        )}
                      </button>
                      <span className="flex items-center gap-1">
                        {u.bloqueadoPorModulo && (
                          <span
                            title={`Tiene la función concedida pero no el módulo ${MODULE_LABELS[resultado.permiso.modulo]}, así que no la puede abrir`}
                            className="rounded-full bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-medium text-[#B45309]"
                          >
                            sin el módulo
                          </span>
                        )}
                        <PastillaEfectivo permitido={u.permitido} origen={u.origen} />
                      </span>
                    </li>
                  ))}
                {resultado.usuarios.every((u) => !u.permitido && u.origen !== "denegado") && (
                  <li className="px-2 py-1 text-sm text-gray-400">
                    Ningún usuario tiene este permiso.
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[11px] text-gray-400">
                «{TEXTO_ORIGEN.rol}» = se lo da su rol · «{TEXTO_ORIGEN.concedido}» y
                «{TEXTO_ORIGEN.denegado}» = ajuste individual sobre el rol.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
