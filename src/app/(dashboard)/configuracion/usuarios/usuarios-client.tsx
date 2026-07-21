"use client";

import { useState, useTransition } from "react";
import {
  Users, Check, Plus, X, HandCoins, KeyRound, Ban, RotateCcw, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { MODULE_SUBS, SUBMODULE_LABELS } from "@/lib/permissions-shared";
import { cn } from "@/lib/utils";
import {
  createUser, updateUserType, updateTypeSubmodules, resetUserPassword, setUserActive,
} from "./actions";

interface UserType {
  key: string;
  nombre: string;
  descripcion: string | null;
  alcance: string;
  modulos: string[];
  puede_editar: boolean;
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
  users, types, departments, currentUserId,
}: {
  users: UserRow[];
  types: UserType[];
  departments: string[];
  currentUserId: string | null;
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

        <TesoreriaPermisosBoard types={types} />
      </div>
    </div>
  );
}

/**
 * Tablero de permisos de Tesorería: qué sub-funciones del módulo tiene cada
 * tipo de usuario. El admin siempre tiene todas; los demás tipos se pueden
 * restringir por grupo.
 */
function TesoreriaPermisosBoard({ types }: { types: UserType[] }) {
  const subs = MODULE_SUBS.tesoreria;
  const editables = types.filter(
    (t) => t.key !== "admin" && t.modulos.includes("tesoreria")
  );

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="mb-1 flex items-center gap-2">
        <HandCoins className="h-5 w-5 text-[#4F46E5]" />
        <h2 className="text-base font-semibold text-gray-900">Permisos de Tesorería</h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Define qué opciones del módulo de Tesorería puede usar cada tipo de usuario.
        Se aplica en el menú, en las pantallas y en el servidor. El administrador
        siempre tiene todas.
      </p>

      {editables.length === 0 ? (
        <p className="text-sm text-gray-400">
          Ningún tipo de usuario (aparte del administrador) tiene el módulo de
          Tesorería asignado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Tipo de usuario</th>
                {subs.map((s) => (
                  <th key={s} className="px-3 py-2 text-center font-medium normal-case">
                    {SUBMODULE_LABELS[s]?.split(" (")[0] ?? s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editables.map((t) => (
                <TesoreriaPermisosRow key={t.key} type={t} subs={subs} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TesoreriaPermisosRow({
  type,
  subs,
}: {
  type: UserType;
  subs: readonly string[];
}) {
  // Módulo sin clave en submodulos = todas las sub-funciones.
  const inicial = Array.isArray(type.submodulos?.tesoreria)
    ? type.submodulos.tesoreria
    : [...subs];
  const [activos, setActivos] = useState<string[]>(inicial);
  const [pending, start] = useTransition();

  function toggle(sub: string, checked: boolean) {
    const next = checked ? [...activos, sub] : activos.filter((s) => s !== sub);
    setActivos(next);
    start(async () => {
      try {
        // Si quedan todas marcadas, se quita la restricción (equivalente).
        await updateTypeSubmodules(
          type.key,
          "tesoreria",
          next.length === subs.length ? null : next
        );
        toast.success(`Permisos de Tesorería actualizados: ${type.nombre}`);
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
      {subs.map((s) => (
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
      ))}
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
            {user.full_name}
            {!activo && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                Desactivado
              </span>
            )}
          </p>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
        </div>
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

      {claveNueva && (
        <ClaveProvisional
          clave={claveNueva}
          nombre={user.full_name}
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
