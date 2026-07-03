"use client";

import { useState, useTransition } from "react";
import { Users, Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createUser, updateUserType } from "./actions";

interface UserType {
  key: string;
  nombre: string;
  descripcion: string | null;
  alcance: string;
  modulos: string[];
  puede_editar: boolean;
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
      </div>
    </div>
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
