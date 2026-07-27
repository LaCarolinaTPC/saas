"use client";

import { useState, useTransition } from "react";
import {
  Users, Check, Plus, X, HandCoins, KeyRound, Ban, RotateCcw, Copy,
  ShieldCheck, Trash2, Pencil, Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALL_MODULES,
  MODULE_LABELS,
  MODULE_SUBS,
  SUBMODULE_LABELS,
  SUBS_SOLO_ADMIN,
  type ModuleKey,
} from "@/lib/permissions-shared";
import { cn } from "@/lib/utils";
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
  activo: boolean;
}

export function UsuariosClient({
  users, types, departments, currentUserId, userCounts,
}: {
  users: UserRow[];
  types: UserType[];
  departments: string[];
  currentUserId: string | null;
  /** Usuarios por rol (para impedir eliminar roles en uso). */
  userCounts: Record<string, number>;
}) {
  const typeByKey = new Map(types.map((t) => [t.key, t]));
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Usuarios y permisos</h1>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#4F46E5]" />
              <h2 className="text-base font-semibold text-gray-900">Usuarios ({users.length})</h2>
            </div>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showCreate ? "Cancelar" : "Crear usuario"}
            </button>
          </div>

          {showCreate && (
            <CreateUserForm
              types={types}
              departments={departments}
              typeByKey={typeByKey}
              onCreated={() => setShowCreate(false)}
            />
          )}

          <div className="space-y-2">
            {users.map((u) => (
              <UserRowItem
                key={u.id}
                user={u}
                types={types}
                departments={departments}
                typeByKey={typeByKey}
                esYo={u.id === currentUserId}
              />
            ))}
            {users.length === 0 && (
              <p className="text-sm text-gray-400">No hay usuarios registrados.</p>
            )}
          </div>
        </section>

        <RolesBoard types={types} userCounts={userCounts} />

        <SubPermisosBoard types={types} />
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
}: {
  types: UserType[];
  userCounts: Record<string, number>;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#4F46E5]" />
          <h2 className="text-base font-semibold text-gray-900">
            Tipos de usuario (roles)
          </h2>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA]"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? "Cancelar" : "Crear rol"}
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Cada rol define qué módulos ve y si puede editar datos. El rol
        administrador siempre tiene acceso total y no se puede modificar.
      </p>

      {showCreate && <RoleForm onDone={() => setShowCreate(false)} />}

      <div className="space-y-2">
        {types.map((t) => (
          <RoleRow key={t.key} type={t} enUso={userCounts[t.key] ?? 0} />
        ))}
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

  function eliminar() {
    const ok = window.confirm(
      `¿Eliminar el rol "${type.nombre}"?\n\nEsta acción no se puede deshacer.`
    );
    if (!ok) return;
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
          <p className="truncate text-xs text-gray-500">
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
              onClick={eliminar}
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
function SubPermisosBoard({ types }: { types: UserType[] }) {
  return (
    <>
      {(Object.keys(MODULE_SUBS) as (keyof typeof MODULE_SUBS)[]).map((module) => (
        <ModuloPermisosBoard key={module} module={module} types={types} />
      ))}
    </>
  );
}

function ModuloPermisosBoard({
  module,
  types,
}: {
  module: keyof typeof MODULE_SUBS;
  types: UserType[];
}) {
  const subs = MODULE_SUBS[module] as readonly string[];
  const editables = types.filter(
    (t) => t.key !== "admin" && t.modulos.includes(module)
  );

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

      {editables.length === 0 ? (
        <p className="text-sm text-gray-400">
          Ningún tipo de usuario (aparte del administrador) tiene el módulo de{" "}
          {MODULE_LABELS[module]} asignado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Tipo de usuario</th>
                {subs.map((s) => (
                  <th key={s} className="px-3 py-2 text-center font-medium normal-case">
                    <span className="inline-flex items-center gap-1">
                      {SUBMODULE_LABELS[s]?.split(" (")[0] ?? s}
                      {SUBS_SOLO_ADMIN.has(s) && (
                        <Lock className="h-3 w-3 text-gray-400" aria-label="Solo administradores" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editables.map((t) => (
                <ModuloPermisosRow key={t.key} type={t} module={module} subs={subs} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ModuloPermisosRow({
  type,
  module,
  subs,
}: {
  type: UserType;
  module: string;
  subs: readonly string[];
}) {
  // Las reservadas al admin no se conceden: quedan fuera de los toggles.
  const concesibles = subs.filter((s) => !SUBS_SOLO_ADMIN.has(s));
  // Módulo sin clave en submodulos = todas las sub-funciones concesibles.
  const guardadas = type.submodulos?.[module];
  const inicial = Array.isArray(guardadas)
    ? guardadas.filter((s) => !SUBS_SOLO_ADMIN.has(s))
    : [...concesibles];
  const [activos, setActivos] = useState<string[]>(inicial);
  const [pending, start] = useTransition();

  function toggle(sub: string, checked: boolean) {
    const next = checked ? [...activos, sub] : activos.filter((s) => s !== sub);
    setActivos(next);
    start(async () => {
      try {
        // Si quedan todas las concesibles marcadas, se quita la restricción.
        await updateTypeSubmodules(
          type.key,
          module,
          next.length === concesibles.length ? null : next
        );
        toast.success(`Permisos actualizados: ${type.nombre}`);
      } catch (e) {
        setActivos(activos);
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  return (
    <tr className="border-b border-[#F1F5F9]">
      <td className="px-3 py-2">
        <p className="font-medium text-gray-900">{type.nombre}</p>
        {type.descripcion && (
          <p className="text-xs text-gray-400">{type.descripcion}</p>
        )}
      </td>
      {subs.map((s) =>
        SUBS_SOLO_ADMIN.has(s) ? (
          <td key={s} className="px-3 py-2 text-center">
            <input
              type="checkbox"
              checked={false}
              disabled
              title="Reservado a administradores"
              className="h-4 w-4 accent-[#4F46E5] opacity-40"
            />
          </td>
        ) : (
          <td key={s} className="px-3 py-2 text-center">
            <input
              type="checkbox"
              checked={activos.includes(s)}
              disabled={pending}
              onChange={(e) => toggle(s, e.target.checked)}
              title={SUBMODULE_LABELS[s] ?? s}
              className="h-4 w-4 accent-[#4F46E5]"
            />
          </td>
        )
      )}
    </tr>
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
        await createUser({
          fullName,
          email,
          password,
          userType: tipo,
          scopeDepartments: needsScope ? scope : [],
        });
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
          <p className="mb-1 text-xs font-medium text-gray-600">Departamentos visibles (alcance)</p>
          <select
            multiple
            value={scope}
            onChange={(e) => setScope(Array.from(e.target.selectedOptions).map((o) => o.value))}
            className="h-28 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
          >
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400">
            Ctrl/Cmd + clic para seleccionar varios. Vacío = sin acceso a datos.
          </p>
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

function UserRowItem({
  user, types, departments, typeByKey, esYo,
}: {
  user: UserRow;
  types: UserType[];
  departments: string[];
  typeByKey: Map<string, UserType>;
  esYo: boolean;
}) {
  const [tipo, setTipo] = useState(user.user_type ?? "consulta");
  const [scope, setScope] = useState<string[]>(user.scope_departments ?? []);
  const [activo, setActivo] = useState(user.activo);
  // Edición de identidad (nombre/correo): panel aparte del rol.
  const [editando, setEditando] = useState(false);
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
    const ok = window.confirm(
      `¿Restablecer la contraseña de ${user.full_name}?\n\n` +
        "Se generará una clave provisional que deberás entregarle. " +
        "El usuario tendrá que cambiarla al ingresar."
    );
    if (!ok) return;
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
    const ok = window.confirm(
      siguiente
        ? `¿Reactivar a ${user.full_name}? Podrá volver a iniciar sesión.`
        : `¿Desactivar a ${user.full_name}?\n\n` +
            "No podrá iniciar sesión, pero se conservan su perfil y su historial. " +
            "Se puede reactivar en cualquier momento."
    );
    if (!ok) return;
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
          <p className="flex items-center gap-2 truncate text-sm font-medium text-gray-900">
            {nombre}
            {!activo && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                Desactivado
              </span>
            )}
          </p>
          <p className="truncate text-xs text-gray-500">{correo}</p>
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
          onClick={restablecer}
          disabled={pending}
          title="Generar una clave provisional para este usuario"
          className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4 text-[#64748B]" /> Restablecer clave
        </button>
        <button
          onClick={cambiarEstado}
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
          <p className="mb-1 text-xs font-medium text-gray-600">Departamentos visibles (alcance)</p>
          <select
            multiple
            value={scope}
            onChange={(e) =>
              setScope(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
            className="h-28 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
          >
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400">
            Ctrl/Cmd + clic para seleccionar varios. Vacío = sin acceso a datos.
          </p>
        </div>
      )}
    </div>
  );
}
