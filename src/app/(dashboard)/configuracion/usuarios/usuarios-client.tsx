"use client";

import { memo, useMemo, useRef, useState, useTransition } from "react";
import {
  Users, Check, Plus, X, HandCoins, KeyRound, Ban, RotateCcw, Copy,
  ShieldCheck, Trash2, Pencil, Lock, Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL_MODULES,
  MODULE_LABELS,
  MODULE_SUBS,
  SUBS_SENSIBLES,
  SUBS_SOLO_ADMIN,
  type ModuleKey,
  type PermisosIndividuales,
} from "@/lib/permissions-shared";
import { PermisosIndividualesPanel } from "./permisos-individuales-panel";
import { filtrarMatrizPermisos, partirEtiqueta } from "@/lib/permisos-consulta";
import { coincideTexto } from "@/lib/tabla/filtros";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { RETARDO_TEXTO_MS, useFiltroUrl } from "@/components/shared/filtros-url";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarraFiltrosUsuarios, CampoBusqueda, SIN_ROL } from "./filtros-usuarios";
import { BuscarPermisos } from "./buscar-permisos";
import { ConfirmarAccion } from "./confirmar-accion";

/** Pestañas de la pantalla. La activa va en la URL (?tab=). */
const TABS = ["usuarios", "roles", "permisos"];
import {
  createUser, updateUserType, updateTypeSubmodules, resetUserPassword, setUserActive,
  updateUserProfile, createRole, updateRole, deleteRole,
} from "./actions";

interface UserType {
  key: string;
  nombre: string;
  descripcion: string | null;
  alcance: string;
  modulos: string[];
  puede_editar: boolean;
  es_sistema: boolean;
  submodulos?: Record<string, string[]> | null;
}
interface UserRow {
  id: string;
  full_name: string;
  email: string;
  user_type: string | null;
  scope_departments: string[] | null;
  /** Ajustes sobre el rol; {} = hereda todo. */
  permisos_individuales: PermisosIndividuales;
  activo: boolean;
}

/** Cuántos permisos tiene ajustados un usuario, para la pastilla del listado. */
function contarAjustes(p: PermisosIndividuales) {
  const valores = [
    ...Object.values(p.modulos ?? {}),
    ...Object.values(p.submodulos ?? {}),
  ];
  return {
    concedidos: valores.filter((v) => v).length,
    denegados: valores.filter((v) => !v).length,
  };
}

export function UsuariosClient({
  users, types, departments, currentUserId, userCounts,
  permisosIndividualesDisponible = true,
}: {
  users: UserRow[];
  types: UserType[];
  departments: string[];
  currentUserId: string | null;
  /** Usuarios por rol (para impedir eliminar roles en uso). */
  userCounts: Record<string, number>;
  /** false si la migración de permisos individuales no está aplicada. */
  permisosIndividualesDisponible?: boolean;
}) {
  // useMemo: este mapa se pasa como prop a cada fila de usuario, así que una
  // identidad nueva en cada render anularía el memo de UserRowItem.
  const typeByKey = useMemo(() => new Map(types.map((t) => [t.key, t])), [types]);
  const [showCreate, setShowCreate] = useState(false);
  const ancla = useRef<HTMLElement>(null);

  // Filtros en la URL. El texto se escribe con retardo; los selectores, al
  // instante. El filtrado es en cliente, así que la URL es solo para recargar
  // y compartir el enlace.
  const [q, setQ] = useFiltroUrl("q", { retardoMs: RETARDO_TEXTO_MS });
  const [rolUrl, setRol] = useFiltroUrl("rol");
  const [estadoUrl, setEstado] = useFiltroUrl("estado");
  const [indUrl, setInd] = useFiltroUrl("ind");
  const [qroles, setQroles] = useFiltroUrl("qroles", { retardoMs: RETARDO_TEXTO_MS });
  const [qpermisos, setQpermisos] = useFiltroUrl("qpermisos", { retardoMs: RETARDO_TEXTO_MS });
  const [permiso, setPermiso] = useFiltroUrl("permiso");
  const [tabUrl, setTab] = useFiltroUrl("tab");
  const tab = TABS.includes(tabUrl) ? tabUrl : "usuarios";

  // La URL la escribe cualquiera: un valor que no existe se trata como «sin
  // filtro» en vez de dejar una lista vacía sin explicación.
  const rol = rolUrl === SIN_ROL || typeByKey.has(rolUrl) ? rolUrl : "";
  const estado = estadoUrl === "activos" || estadoUrl === "desactivados" ? estadoUrl : "";
  const ind = permisosIndividualesDisponible && (indUrl === "si" || indUrl === "no") ? indUrl : "";
  const hayFiltros = Boolean(q.trim() || rol || estado || ind);

  const visibles = useMemo(() => {
    return users.filter((u) => {
      if (rol === SIN_ROL ? Boolean(u.user_type) : rol && u.user_type !== rol) return false;
      if (estado === "activos" && !u.activo) return false;
      if (estado === "desactivados" && u.activo) return false;
      if (ind) {
        const a = contarAjustes(u.permisos_individuales);
        const tieneAjustes = a.concedidos + a.denegados > 0;
        if ((ind === "si") !== tieneAjustes) return false;
      }
      // Identidad y rol; los permisos se consultan en «Buscar permisos», para
      // no mezclar «¿quién se llama…?» con «¿quién puede…?».
      const t = u.user_type ? typeByKey.get(u.user_type) : undefined;
      return coincideTexto(
        q,
        u.full_name,
        u.email,
        t?.nombre,
        u.user_type,
        (u.scope_departments ?? []).join(" ")
      );
    });
  }, [users, typeByKey, q, rol, estado, ind]);

  // reiniciar: el hook solo vuelve a la página 1 cuando cambia la cantidad de
  // filas, y dos filtros distintos pueden dar el mismo número.
  const pagina = usePaginacion(visibles, { reiniciar: `${q}|${rol}|${estado}|${ind}` });

  const rolesConsulta = useMemo(
    () =>
      types.map((t) => ({
        key: t.key,
        nombre: t.nombre,
        modulos: t.modulos,
        submodulos: t.submodulos ?? null,
      })),
    [types]
  );

  function limpiarFiltros() {
    setQ("");
    setRol("");
    setEstado("");
    setInd("");
  }

  /** Lleva a un usuario desde «Buscar permisos» al listado de la otra pestaña. */
  function verUsuario(email: string) {
    limpiarFiltros();
    setQ(email);
    setTab("usuarios");
    // El scroll se pide tras pintar la pestaña nueva.
    requestAnimationFrame(() =>
      ancla.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Usuarios y permisos" />

      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList>
            <TabsTrigger value="usuarios" className="px-3">
              <Users className="h-4 w-4" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="roles" className="px-3">
              <ShieldCheck className="h-4 w-4" /> Roles
            </TabsTrigger>
            <TabsTrigger value="permisos" className="px-3">
              <HandCoins className="h-4 w-4" /> Permisos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="usuarios" className="space-y-6">
        <section ref={ancla} className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#4F46E5]" />
              <h2 className="text-base font-semibold text-gray-900">
                Usuarios (
                {hayFiltros ? `${visibles.length} de ${users.length}` : users.length})
              </h2>
            </div>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showCreate ? "Cancelar" : "Crear usuario"}
            </button>
          </div>

          <BarraFiltrosUsuarios
            filtros={{ q, rol, estado, ind }}
            onCambiar={(clave, valor) => {
              if (clave === "q") setQ(valor);
              else if (clave === "rol") setRol(valor);
              else if (clave === "estado") setEstado(valor);
              else setInd(valor);
            }}
            onLimpiar={limpiarFiltros}
            roles={types.map((t) => ({ key: t.key, nombre: t.nombre }))}
            conteoPorRol={userCounts}
            mostrarIndividuales={permisosIndividualesDisponible}
          />

          {showCreate && (
            <CreateUserForm
              types={types}
              departments={departments}
              typeByKey={typeByKey}
              onCreated={() => setShowCreate(false)}
            />
          )}

          <div className="space-y-2">
            {pagina.filas.map((u) => (
              <UserRowItem
                key={u.id}
                user={u}
                types={types}
                departments={departments}
                typeByKey={typeByKey}
                esYo={u.id === currentUserId}
                permisosIndividualesDisponible={permisosIndividualesDisponible}
              />
            ))}
            {/* Con 0 filas el Paginador no se pinta, así que este mensaje es lo
                único que queda: hay que distinguir «no hay» de «no coincide». */}
            {visibles.length === 0 && (
              <p className="text-sm text-gray-400">
                {hayFiltros
                  ? "Ningún usuario coincide con la búsqueda."
                  : "No hay usuarios registrados."}
              </p>
            )}
          </div>
          <Paginador p={pagina} unidad="usuarios" ancla={ancla} className="-mx-6 -mb-6 mt-4" />
        </section>
          </TabsContent>

          <TabsContent value="roles">
            <RolesBoard
              types={types}
              userCounts={userCounts}
              filtro={qroles}
              onFiltro={setQroles}
            />
          </TabsContent>

          <TabsContent value="permisos" className="space-y-6">
            <BuscarPermisos
              filtroMatriz={qpermisos}
              onFiltroMatriz={setQpermisos}
              permiso={permiso}
              onPermiso={setPermiso}
              roles={rolesConsulta}
              usuarios={users}
              permisosIndividualesDisponible={permisosIndividualesDisponible}
              onVerUsuario={verUsuario}
            />
            <SubPermisosBoard types={types} filtro={qpermisos} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Gestión de roles (user_types): crear, editar módulos/alcance y eliminar.
 * El rol administrador es intocable; los del sistema no se eliminan y un rol
 * con usuarios asignados tampoco (hay que reasignarlos primero).
 */
function RolesBoard({
  types,
  userCounts,
  filtro,
  onFiltro,
}: {
  types: UserType[];
  userCounts: Record<string, number>;
  filtro: string;
  onFiltro: (v: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  // Se busca por todo lo que la fila muestra: si algo está a la vista y el
  // buscador no lo encuentra, parece roto.
  const visibles = useMemo(
    () =>
      types.filter((t) =>
        coincideTexto(
          filtro,
          t.nombre,
          t.key,
          t.descripcion,
          t.alcance === "departamentos" ? "por departamentos" : "todos los datos",
          t.puede_editar ? "edita" : "solo consulta",
          t.es_sistema ? "sistema" : "",
          t.key === "admin"
            ? "todos acceso total"
            : t.modulos.map((m) => MODULE_LABELS[m as ModuleKey] ?? m).join(" ")
        )
      ),
    [types, filtro]
  );

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
      {/* Misma gramática que la pestaña de Usuarios: encabezado con la acción
          a la derecha, descripción, y después una fila propia de búsqueda. */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#4F46E5]" />
          <h2 className="text-base font-semibold text-gray-900">
            Tipos de usuario (roles)
          </h2>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA]"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? "Cancelar" : "Crear rol"}
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Cada rol define qué módulos ve y si puede editar datos. El rol
        administrador siempre tiene acceso total y no se puede modificar.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CampoBusqueda
          valor={filtro}
          onChange={onFiltro}
          placeholder="Buscar por nombre, clave, descripción o módulo"
          etiqueta="Buscar roles"
          ancho="w-72"
        />
        <p className="text-sm text-gray-500">
          {filtro.trim() ? (
            <>
              <span className="font-medium text-gray-900">{visibles.length}</span> de{" "}
              {types.length} {types.length === 1 ? "rol" : "roles"}
            </>
          ) : (
            <>
              <span className="font-medium text-gray-900">{types.length}</span>{" "}
              {types.length === 1 ? "rol" : "roles"}
            </>
          )}
        </p>
        {filtro.trim() && (
          <button
            onClick={() => onFiltro("")}
            className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4338CA] hover:bg-[#E0E7FF]"
          >
            «{filtro.trim()}»
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {showCreate && <RoleForm onDone={() => setShowCreate(false)} />}

      <div className="space-y-2">
        {visibles.map((t) => (
          <RoleRow key={t.key} type={t} enUso={userCounts[t.key] ?? 0} />
        ))}
        {visibles.length === 0 && (
          <div className="rounded-lg border border-dashed border-[#E2E8F0] px-4 py-8 text-center">
            <Search className="mx-auto h-5 w-5 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              Ningún rol coincide con «{filtro.trim()}».
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Se busca por nombre, clave, descripción, alcance y módulos del rol.
            </p>
            <button
              onClick={() => onFiltro("")}
              className="mt-3 inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC]"
            >
              <X className="h-4 w-4 text-[#64748B]" /> Quitar la búsqueda
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function RoleForm({
  type,
  onDone,
}: {
  /** Sin type = crear; con type = editar. */
  type?: UserType;
  onDone: () => void;
}) {
  const [key, setKey] = useState(type?.key ?? "");
  const [nombre, setNombre] = useState(type?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(type?.descripcion ?? "");
  const [alcance, setAlcance] = useState<"all" | "departamentos">(
    type?.alcance === "departamentos" ? "departamentos" : "all"
  );
  const [puedeEditar, setPuedeEditar] = useState(type?.puede_editar ?? false);
  const [modulos, setModulos] = useState<string[]>(type?.modulos ?? ["dashboard"]);
  const [pending, start] = useTransition();

  function toggleModulo(m: string, checked: boolean) {
    setModulos((prev) => (checked ? [...prev, m] : prev.filter((x) => x !== m)));
  }

  function submit() {
    start(async () => {
      try {
        const input = {
          nombre,
          descripcion: descripcion.trim() || null,
          modulos,
          alcance,
          puedeEditar,
        };
        if (type) {
          await updateRole(type.key, input);
          toast.success(`Rol actualizado: ${nombre.trim()}`);
        } else {
          await createRole({ key, ...input });
          toast.success(`Rol creado: ${nombre.trim()}`);
        }
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar el rol");
      }
    });
  }

  const inputClass =
    "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";

  return (
    <div className="mb-4 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF]/40 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {!type && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Clave (única, no cambia después)
            </label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
              className={inputClass}
              placeholder="ej. contabilidad"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} placeholder="Nombre visible del rol" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Descripción</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputClass} placeholder="Para qué sirve este rol" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Alcance de datos</label>
          <select
            value={alcance}
            onChange={(e) => setAlcance(e.target.value as "all" | "departamentos")}
            className={inputClass}
          >
            <option value="all">Todos los datos</option>
            <option value="departamentos">Limitado por departamentos del usuario</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={puedeEditar}
            onChange={(e) => setPuedeEditar(e.target.checked)}
            className="h-4 w-4 accent-[#4F46E5]"
          />
          Puede editar datos (no solo consulta)
        </label>
      </div>

      <p className="mb-1 mt-3 text-xs font-medium text-gray-600">Módulos permitidos</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
        {ALL_MODULES.map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={modulos.includes(m)}
              onChange={(e) => toggleModulo(m, e.target.checked)}
              className="h-4 w-4 accent-[#4F46E5]"
            />
            {MODULE_LABELS[m as ModuleKey]}
          </label>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {pending ? "Guardando…" : type ? "Guardar cambios" : "Crear rol"}
        </button>
      </div>
    </div>
  );
}

function RoleRow({ type, enUso }: { type: UserType; enUso: number }) {
  const [editando, setEditando] = useState(false);
  const [pending, start] = useTransition();
  const esAdmin = type.key === "admin";

  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  function eliminar() {
    start(async () => {
      try {
        await deleteRole(type.key);
        toast.success(`Rol eliminado: ${type.nombre}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar el rol");
      }
    });
  }

  return (
    <div className="rounded-lg border border-[#E2E8F0] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
            {type.nombre}
            <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
              {type.key}
            </span>
            {type.es_sistema && (
              <span className="rounded-full bg-[#E0E7FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#4338CA]">
                Sistema
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {type.descripcion || "Sin descripción"} · {enUso} usuario(s) ·{" "}
            {type.alcance === "departamentos" ? "por departamentos" : "todos los datos"} ·{" "}
            {type.puede_editar ? "edita" : "solo consulta"}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            Módulos:{" "}
            {esAdmin
              ? "todos (acceso total)"
              : type.modulos.length
                ? type.modulos
                    .map((m) => MODULE_LABELS[m as ModuleKey] ?? m)
                    .join(", ")
                : "ninguno"}
          </p>
        </div>
        {esAdmin ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-gray-400"
            title="El rol administrador no se puede modificar"
          >
            <Lock className="h-3.5 w-3.5" /> No editable
          </span>
        ) : (
          <>
            <button
              onClick={() => setEditando((v) => !v)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <Pencil className="h-4 w-4 text-[#64748B]" />
              {editando ? "Cerrar" : "Editar"}
            </button>
            <button
              onClick={() => setConfirmarBorrado(true)}
              disabled={pending || type.es_sistema || enUso > 0}
              title={
                type.es_sistema
                  ? "Los roles del sistema no se eliminan"
                  : enUso > 0
                    ? "Reasigna primero a los usuarios que tienen este rol"
                    : "Eliminar este rol"
              }
              className="inline-flex items-center gap-1 rounded-lg border border-[#FECACA] px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-[#FEF2F2] disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
            <ConfirmarAccion
              abierto={confirmarBorrado}
              onAbrir={setConfirmarBorrado}
              titulo={`¿Eliminar el rol «${type.nombre}»?`}
              descripcion="Esta acción no se puede deshacer."
              textoConfirmar="Eliminar el rol"
              destructivo
              onConfirmar={eliminar}
            />
          </>
        )}
      </div>
      {editando && !esAdmin && (
        <div className="mt-3">
          <RoleForm type={type} onDone={() => setEditando(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Tablero de sub-permisos por módulo: para cada módulo con sub-funciones
 * definidas (MODULE_SUBS), qué opciones tiene cada tipo de usuario. El admin
 * siempre tiene todas; las reservadas al administrador (p. ej. el simulador)
 * no se pueden conceder y aparecen bloqueadas.
 */
/**
 * Los tres tableros de permisos por rol. El filtro se resuelve AQUÍ, una sola
 * vez por módulo, para que haya una única fuente de verdad y para poder dar un
 * solo mensaje cuando ninguno tiene nada que mostrar.
 */
function SubPermisosBoard({ types, filtro }: { types: UserType[]; filtro: string }) {
  const modulos = Object.keys(MODULE_SUBS) as (keyof typeof MODULE_SUBS)[];

  const tableros = useMemo(
    () =>
      modulos.map((module) => {
        const subs = MODULE_SUBS[module] as readonly string[];
        const editables = types.filter(
          (t) => t.key !== "admin" && t.modulos.includes(module)
        );
        const { roles, subs: columnas } = filtrarMatrizPermisos({
          filtro,
          modulo: module,
          subs,
          roles: editables.map((t) => ({
            key: t.key,
            nombre: t.nombre,
            descripcion: t.descripcion,
          })),
        });
        const porClave = new Map(editables.map((t) => [t.key, t]));
        return {
          module,
          subs,
          columnas,
          // Se devuelven los UserType completos: la fila los necesita enteros.
          filas: roles.map((r) => porClave.get(r.key)!).filter(Boolean),
          // Sin filtro, un módulo sin roles sigue mostrando su explicación.
          visible: filtro.trim() ? roles.length > 0 && columnas.length > 0 : true,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `modulos` es constante
    [types, filtro]
  );

  const visibles = tableros.filter((t) => t.visible);

  if (filtro.trim() && visibles.length === 0) {
    return (
      <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
        <p className="text-sm text-gray-400">
          Ningún permiso coincide con «{filtro.trim()}».
        </p>
      </section>
    );
  }

  return (
    <>
      {visibles.map((t) => (
        <ModuloPermisosBoard
          key={t.module}
          module={t.module}
          subs={t.subs}
          columnas={t.columnas}
          filas={t.filas}
        />
      ))}
    </>
  );
}

/**
 * Matriz de permisos de UN módulo, con las sub-funciones en las FILAS y los
 * roles en las COLUMNAS.
 *
 * Antes era al revés y la tabla se desplazaba en horizontal: Tesorería tiene
 * once sub-funciones, cada columna pedía ~132 px, el nombre del rol se perdía
 * de vista (de ahí la columna fija) y la frase que explica cada opción no
 * cabía en la cabecera. Transponerla lo arregla de raíz porque la relación es
 * asimétrica: muchas opciones por módulo (4–11) y pocos roles con ese módulo
 * (la matriz ya excluye al administrador y a quien no lo tenga). Las filas
 * crecen hacia abajo, que es donde sobra espacio, y la explicación gana una
 * columna ancha en vez de vivir recortada. Misma disposición que el panel de
 * permisos individuales, que ya se leía de arriba abajo.
 *
 * El estado vive aquí y no en cada fila porque las casillas de un mismo rol
 * quedaron repartidas por toda la tabla. `ajustes` guarda SOLO los roles que
 * el administrador tocó en esta sesión; el resto se deriva de `type.submodulos`
 * al pintar, así que un cambio de filtro —que cambia `filas`— nunca deja una
 * columna sin estado ni resucita uno viejo.
 */
function ModuloPermisosBoard({
  module,
  subs,
  columnas,
  filas,
}: {
  module: keyof typeof MODULE_SUBS;
  /** TODAS las sub-funciones del módulo: es el contrato de guardado. */
  subs: readonly string[];
  /** Las que se pintan como filas. Subconjunto de `subs`; no se guarda. */
  columnas: readonly string[];
  /** Roles a pintar como columnas, ya filtrados y sin el administrador. */
  filas: UserType[];
}) {
  // Módulo sin clave en submodulos = todas las concesibles SALVO las sensibles
  // (auditoría, simulador), que el servidor solo concede si están listadas
  // explícitamente (subAllowed). Las reservadas al admin no se conceden nunca:
  // quedan fuera de los toggles.
  const porDefecto = useMemo(
    () => subs.filter((s) => !SUBS_SOLO_ADMIN.has(s) && !SUBS_SENSIBLES.has(s)),
    [subs]
  );
  /** Las que un rol puede llegar a tener: todas menos las del administrador. */
  const concedibles = useMemo(
    () => subs.filter((s) => !SUBS_SOLO_ADMIN.has(s)),
    [subs]
  );

  const [ajustes, setAjustes] = useState<Record<string, string[]>>({});
  // Roles con un guardado en vuelo. Es un conjunto y no una sola clave porque
  // cada columna se guarda por su cuenta: marcar en un rol mientras otro
  // todavía responde no debe rehabilitar sus casillas antes de tiempo.
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());
  const [, start] = useTransition();

  function marcarEnVuelo(key: string, activo: boolean) {
    setGuardando((p) => {
      const next = new Set(p);
      if (activo) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** Sub-funciones marcadas de un rol: lo tocado en esta sesión, o lo guardado. */
  function activosDe(type: UserType): string[] {
    const tocado = ajustes[type.key];
    if (tocado) return tocado;
    const guardadas = type.submodulos?.[module];
    return Array.isArray(guardadas)
      ? guardadas.filter((s) => !SUBS_SOLO_ADMIN.has(s))
      : porDefecto;
  }

  function toggle(type: UserType, sub: string, checked: boolean) {
    const previos = activosDe(type);
    const next = checked ? [...previos, sub] : previos.filter((s) => s !== sub);
    setAjustes((p) => ({ ...p, [type.key]: next }));
    marcarEnVuelo(type.key, true);
    start(async () => {
      try {
        // Sin restricción (null) solo si lo marcado coincide con lo que el
        // servidor concede por defecto; si hay una sensible marcada, la lista
        // debe guardarse explícita o subAllowed la negaría. Se compara contra
        // `porDefecto`, que sale de TODAS las sub-funciones y no de las
        // visibles: con el buscador puesto, lo contrario guardaría null y
        // abriría el módulo entero.
        const esDefecto =
          next.length === porDefecto.length &&
          porDefecto.every((s) => next.includes(s));
        await updateTypeSubmodules(type.key, module, esDefecto ? null : next);
        toast.success(`Permisos actualizados: ${type.nombre}`);
      } catch (e) {
        setAjustes((p) => ({ ...p, [type.key]: previos }));
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      } finally {
        marcarEnVuelo(type.key, false);
      }
    });
  }

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="mb-1 flex items-center gap-2">
        <HandCoins className="h-5 w-5 text-[#4F46E5]" />
        <h2 className="text-base font-semibold text-gray-900">
          Permisos de {MODULE_LABELS[module]}
        </h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Define qué opciones del módulo de {MODULE_LABELS[module]} puede usar cada tipo
        de usuario. Se aplica en el menú, en las pantallas y en el servidor. El
        administrador siempre tiene todas; las marcadas con candado son solo suyas.
      </p>

      {filas.length === 0 ? (
        <p className="text-sm text-gray-400">
          Ningún tipo de usuario (aparte del administrador) tiene el módulo de{" "}
          {MODULE_LABELS[module]} asignado.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-left text-xs uppercase tracking-wide text-gray-500">
              <TableHead className="w-full min-w-[280px] px-3 py-2 align-bottom">
                Opción del módulo
              </TableHead>
              {filas.map((t) => {
                const marcadas = activosDe(t).length;
                return (
                  <TableHead
                    key={t.key}
                    className="w-32 min-w-[112px] px-3 py-2 text-center align-bottom font-medium normal-case"
                  >
                    <span
                      className="block truncate text-[13px] text-gray-700"
                      title={t.descripcion ?? t.nombre}
                    >
                      {t.nombre}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-normal tabular-nums text-gray-400">
                      {marcadas} de {concedibles.length}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {columnas.map((s) => {
              const reservada = SUBS_SOLO_ADMIN.has(s);
              const sensible = SUBS_SENSIBLES.has(s);
              const { nombre, detalle } = partirEtiqueta(s);
              return (
                <TableRow key={s} className={cn(reservada && "bg-[#FCFCFD]")}>
                  <TableCell className="px-3 py-2 align-top">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-gray-900">
                      {nombre}
                      {reservada && (
                        <span title="Reservado a administradores">
                          <Lock className="h-3 w-3 text-[#94A3B8]" />
                        </span>
                      )}
                      {sensible && (
                        <span className="rounded-full bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-medium text-[#B45309]">
                          Sensible
                        </span>
                      )}
                    </p>
                    {detalle && (
                      <p className="mt-0.5 max-w-prose text-[11px] leading-snug text-gray-400">
                        {detalle}
                      </p>
                    )}
                  </TableCell>
                  {filas.map((t) =>
                    reservada ? (
                      <TableCell key={t.key} className="px-3 py-2 text-center align-top">
                        <span
                          title="Reservado a administradores"
                          className="inline-flex justify-center opacity-40"
                        >
                          <Checkbox
                            checked={false}
                            disabled
                            aria-label={`${nombre} · ${t.nombre}: reservado a administradores`}
                          />
                        </span>
                      </TableCell>
                    ) : (
                      <TableCell key={t.key} className="px-3 py-2 text-center align-top">
                        <span className="inline-flex justify-center">
                          <Checkbox
                            checked={activosDe(t).includes(s)}
                            disabled={guardando.has(t.key)}
                            onCheckedChange={(checked) => toggle(t, s, checked === true)}
                            aria-label={`${nombre} · ${t.nombre}`}
                          />
                        </span>
                      </TableCell>
                    )
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function CreateUserForm({
  types, departments, typeByKey, onCreated,
}: {
  types: UserType[];
  departments: string[];
  typeByKey: Map<string, UserType>;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tipo, setTipo] = useState(types[0]?.key ?? "consulta");
  const [scope, setScope] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const needsScope = typeByKey.get(tipo)?.alcance === "departamentos";

  function submit() {
    start(async () => {
      try {
        const result = await createUser({
          fullName,
          email,
          password,
          userType: tipo,
          scopeDepartments: needsScope ? scope : [],
        });
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.success(`Usuario creado: ${fullName.trim()}`);
        onCreated();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al crear el usuario");
      }
    });
  }

  const inputClass =
    "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";

  return (
    <div className="mb-4 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF]/40 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nombre completo</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} placeholder="Nombre y apellido" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="correo@empresa.com" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="Mínimo 6 caracteres" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tipo de usuario</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
            {types.map((t) => (
              <option key={t.key} value={t.key}>{t.nombre}</option>
            ))}
          </select>
        </div>
      </div>
      {needsScope && (
        <div className="mt-3">
          <SelectorDepartamentos
            departments={departments}
            value={scope}
            onChange={setScope}
          />
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {pending ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </div>
  );
}

/**
 * Muestra la clave provisional una sola vez, para que el administrador la
 * copie y se la entregue al usuario. Al cerrar el panel no hay forma de
 * volver a verla: hay que restablecer de nuevo.
 */
function ClaveProvisional({
  clave, nombre, onCerrar,
}: {
  clave: string;
  nombre: string;
  onCerrar: () => void;
}) {
  const [copiada, setCopiada] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
      toast.success("Clave copiada");
    } catch {
      toast.error("No se pudo copiar. Selecciónala y cópiala a mano.");
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#92400E]">
            Clave provisional de {nombre}
          </p>
          <p className="mt-0.5 text-[11px] text-[#B45309]">
            Anótala y entrégasela ahora: al cerrar este aviso no se puede volver a ver.
            El usuario deberá cambiarla al ingresar.
          </p>
          <p className="mt-2 select-all font-mono text-lg font-bold tracking-wider text-[#0F172A]">
            {clave}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <button
            onClick={copiar}
            className="inline-flex items-center gap-1 rounded-lg border border-[#FDE68A] bg-white px-3 py-1.5 text-xs font-medium text-[#92400E] hover:bg-[#FFFBEB]"
          >
            <Copy className="h-3.5 w-3.5" /> {copiada ? "Copiada" : "Copiar"}
          </button>
          <button
            onClick={onCerrar}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-[#92400E] hover:bg-[#FEF3C7]"
          >
            <X className="h-3.5 w-3.5" /> Ya la entregué
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fila de un usuario. Memoizada: cada fila pinta un <select> con una opción por
 * rol más seis botones y sus iconos, así que las 25 de una página suman cientos
 * de elementos que antes se volvían a renderizar por cualquier cambio de estado
 * del padre —por ejemplo al marcar una casilla de la matriz de permisos, que no
 * tiene nada que ver con ellas—. Depende de que typeByKey esté memoizado.
 */
const UserRowItem = memo(function UserRowItem({
  user, types, departments, typeByKey, esYo, permisosIndividualesDisponible,
}: {
  user: UserRow;
  types: UserType[];
  departments: string[];
  typeByKey: Map<string, UserType>;
  esYo: boolean;
  permisosIndividualesDisponible: boolean;
}) {
  const [tipo, setTipo] = useState(user.user_type ?? "consulta");
  const [scope, setScope] = useState<string[]>(user.scope_departments ?? []);
  const [activo, setActivo] = useState(user.activo);
  // Edición de identidad (nombre/correo): panel aparte del rol.
  const [editando, setEditando] = useState(false);
  // Permisos individuales: panel aparte, porque se guardan de una sola vez.
  const [verPermisos, setVerPermisos] = useState(false);
  const [confirmarClave, setConfirmarClave] = useState(false);
  const [confirmarEstado, setConfirmarEstado] = useState(false);
  // El administrador no admite ajustes: siempre tiene acceso total.
  const esAdmin = user.user_type === "admin";
  const ajustes = contarAjustes(user.permisos_individuales);
  const [nombre, setNombre] = useState(user.full_name);
  const [correo, setCorreo] = useState(user.email);
  // Clave provisional recién generada: se muestra una sola vez para que el
  // administrador se la entregue al usuario. No se guarda en ningún lado.
  const [claveNueva, setClaveNueva] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsScope = typeByKey.get(tipo)?.alcance === "departamentos";

  function save() {
    start(async () => {
      try {
        await updateUserType(user.id, tipo, needsScope ? scope : []);
        toast.success(`Actualizado: ${user.full_name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function guardarIdentidad() {
    start(async () => {
      try {
        await updateUserProfile(user.id, nombre, correo);
        toast.success("Nombre y correo actualizados");
        setEditando(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function restablecer() {
    start(async () => {
      try {
        const { password } = await resetUserPassword(user.id);
        setClaveNueva(password);
        toast.success("Contraseña restablecida");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al restablecer");
      }
    });
  }

  function cambiarEstado() {
    const siguiente = !activo;
    start(async () => {
      try {
        await setUserActive(user.id, siguiente);
        setActivo(siguiente);
        toast.success(siguiente ? "Usuario reactivado" : "Usuario desactivado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al cambiar el estado");
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        activo ? "border-[#E2E8F0]" : "border-[#FECACA] bg-[#FEF2F2]/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
            {nombre}
            {!activo && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                Desactivado
              </span>
            )}
            {/* Para ver de un golpe quién tiene permisos a la medida y no
                preguntarse por qué este usuario ve una pantalla que su rol no da. */}
            {(ajustes.concedidos > 0 || ajustes.denegados > 0) && (
              <span
                title="Tiene permisos individuales por encima de su rol"
                className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#4338CA]"
              >
                {ajustes.concedidos > 0 && `+${ajustes.concedidos}`}
                {ajustes.concedidos > 0 && ajustes.denegados > 0 && " / "}
                {ajustes.denegados > 0 && `−${ajustes.denegados}`} individuales
              </span>
            )}
          </p>
          <p className="break-all text-xs text-gray-500">{correo}</p>
        </div>
        <button
          onClick={() => setEditando((v) => !v)}
          disabled={pending}
          title="Editar nombre y correo"
          className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          <Pencil className="h-4 w-4 text-[#64748B]" /> {editando ? "Cerrar" : "Editar"}
        </button>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
        >
          {types.map((t) => (
            <option key={t.key} value={t.key}>{t.nombre}</option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Guardar
        </button>
        <button
          onClick={() => setVerPermisos((v) => !v)}
          disabled={pending || esAdmin || !permisosIndividualesDisponible}
          title={
            esAdmin
              ? "El administrador siempre tiene acceso total"
              : !permisosIndividualesDisponible
                ? "Falta aplicar la migración 20261014164506_permisos_individuales_por_usuario.sql"
                : "Conceder o quitar permisos a este usuario por encima de su rol"
          }
          className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4 text-[#64748B]" />
          {verPermisos ? "Cerrar" : "Permisos"}
        </button>
        <button
          onClick={() => setConfirmarClave(true)}
          disabled={pending}
          title="Generar una clave provisional para este usuario"
          className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4 text-[#64748B]" /> Restablecer clave
        </button>
        <button
          onClick={() => setConfirmarEstado(true)}
          disabled={pending || esYo}
          title={
            esYo
              ? "No puedes desactivar tu propio usuario"
              : activo
                ? "Impedir el ingreso de este usuario"
                : "Permitir de nuevo el ingreso"
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50",
            activo
              ? "border-[#FECACA] text-red-600 hover:bg-[#FEF2F2]"
              : "border-[#BBF7D0] text-green-700 hover:bg-[#F0FDF4]"
          )}
        >
          {activo ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          {activo ? "Desactivar" : "Reactivar"}
        </button>
      </div>

      <ConfirmarAccion
        abierto={confirmarClave}
        onAbrir={setConfirmarClave}
        titulo={`¿Restablecer la contraseña de ${nombre}?`}
        descripcion="Se generará una clave provisional que deberás entregarle. El usuario tendrá que cambiarla al ingresar."
        textoConfirmar="Restablecer la clave"
        onConfirmar={restablecer}
      />

      <ConfirmarAccion
        abierto={confirmarEstado}
        onAbrir={setConfirmarEstado}
        titulo={activo ? `¿Desactivar a ${nombre}?` : `¿Reactivar a ${nombre}?`}
        descripcion={
          activo
            ? "No podrá iniciar sesión, pero se conservan su perfil y su historial. Se puede reactivar en cualquier momento."
            : "Podrá volver a iniciar sesión."
        }
        textoConfirmar={activo ? "Desactivar" : "Reactivar"}
        destructivo={activo}
        onConfirmar={cambiarEstado}
      />

      {editando && (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF]/40 p-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Nombre completo</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
            />
          </div>
          <div className="self-end">
            <button
              onClick={guardarIdentidad}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Guardar
            </button>
          </div>
          <p className="text-[11px] text-gray-400 md:col-span-3">
            El correo cambia de inmediato y es el nuevo usuario de ingreso. Si además
            necesita clave nueva, usa &quot;Restablecer clave&quot;.
          </p>
        </div>
      )}

      {claveNueva && (
        <ClaveProvisional
          clave={claveNueva}
          nombre={nombre}
          onCerrar={() => setClaveNueva(null)}
        />
      )}

      {needsScope && (
        <div className="mt-3">
          <SelectorDepartamentos
            departments={departments}
            value={scope}
            onChange={setScope}
          />
        </div>
      )}

      {verPermisos && !esAdmin && (
        <PermisosIndividualesPanel
          userId={user.id}
          nombre={nombre}
          rolNombre={typeByKey.get(user.user_type ?? "")?.nombre ?? "sin rol"}
          modulosDelRol={typeByKey.get(user.user_type ?? "")?.modulos ?? []}
          submodulosDelRol={typeByKey.get(user.user_type ?? "")?.submodulos ?? {}}
          iniciales={user.permisos_individuales}
          onCerrar={() => setVerPermisos(false)}
        />
      )}
    </div>
  );
});

/**
 * Departamentos del alcance de un usuario. Antes era un <select multiple> de
 * alto fijo: mostraba cinco opciones y el resto quedaba tras el scroll, con la
 * instruccion de Ctrl/Cmd + clic. Ahora se ven todos a la vez.
 */
function SelectorDepartamentos({
  departments,
  value,
  onChange,
}: {
  departments: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-600">
          Departamentos visibles (alcance) · {value.length} de {departments.length}
        </p>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => onChange([...departments])}
            className="rounded border border-[#E2E8F0] px-2 py-0.5 font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded border border-[#E2E8F0] px-2 py-0.5 font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Ninguno
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-[#E2E8F0] bg-white p-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {departments.map((d) => (
          <label key={d} className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={value.includes(d)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, d] : value.filter((x) => x !== d))
              }
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#4F46E5]"
            />
            <span className="min-w-0 break-words">{d}</span>
          </label>
        ))}
        {departments.length === 0 && (
          <p className="text-sm text-gray-400">No hay departamentos registrados.</p>
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        Vacío = sin acceso a datos.
      </p>
    </div>
  );
}
