"use client";

import { useState, useTransition } from "react";
import { Users, Check, Plus, X, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { MODULE_SUBS, SUBMODULE_LABELS } from "@/lib/permissions-shared";
import { createUser, updateUserType, updateTypeSubmodules } from "./actions";

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
}

export function UsuariosClient({
  users, types, departments,
}: {
  users: UserRow[];
  types: UserType[];
  departments: string[];
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

function UserRowItem({
  user, types, departments, typeByKey,
}: {
  user: UserRow;
  types: UserType[];
  departments: string[];
  typeByKey: Map<string, UserType>;
}) {
  const [tipo, setTipo] = useState(user.user_type ?? "consulta");
  const [scope, setScope] = useState<string[]>(user.scope_departments ?? []);
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

  return (
    <div className="rounded-lg border border-[#E2E8F0] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{user.full_name}</p>
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
      </div>
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
