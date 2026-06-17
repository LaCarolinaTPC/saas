"use client";

import { useState, useTransition } from "react";
import { Users, Shield, Briefcase, Check } from "lucide-react";
import { toast } from "sonner";
import { MODULE_LABELS, type ModuleKey } from "@/lib/permissions-shared";
import { updateUserType, setCargoMapping } from "./actions";

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
interface CargoMap {
  cargo: string;
  user_type: string;
}

export function UsuariosClient({
  users, types, departments, cargos, cargoMap,
}: {
  users: UserRow[];
  types: UserType[];
  departments: string[];
  cargos: string[];
  cargoMap: CargoMap[];
}) {
  const typeByKey = new Map(types.map((t) => [t.key, t]));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Usuarios y permisos</h1>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {/* Tipos de usuario */}
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#4F46E5]" />
            <h2 className="text-base font-semibold text-gray-900">Tipos de usuario</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {types.map((t) => (
              <div key={t.key} className="rounded-lg border border-[#E2E8F0] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{t.nombre}</span>
                  <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-medium text-[#4F46E5]">
                    {t.alcance === "all" ? "Todos los datos" : "Por departamento"}
                  </span>
                </div>
                {t.descripcion && <p className="mt-1 text-xs text-gray-500">{t.descripcion}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {(t.modulos ?? []).map((m) => (
                    <span key={m} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                      {MODULE_LABELS[m as ModuleKey] ?? m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Usuarios */}
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-[#4F46E5]" />
            <h2 className="text-base font-semibold text-gray-900">Usuarios ({users.length})</h2>
          </div>
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

        {/* Mapeo de cargos */}
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="mb-1 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-[#4F46E5]" />
            <h2 className="text-base font-semibold text-gray-900">Mapeo de cargos → tipo</h2>
          </div>
          <p className="mb-4 text-xs text-gray-500">
            Define qué tipo de usuario corresponde a cada cargo de la organización.
          </p>
          <div className="max-h-[420px] divide-y divide-[#F1F5F9] overflow-y-auto">
            {cargos.map((cargo) => (
              <CargoRowItem
                key={cargo}
                cargo={cargo}
                types={types}
                initial={cargoMap.find((c) => c.cargo === cargo)?.user_type ?? ""}
              />
            ))}
            {cargos.length === 0 && (
              <p className="py-4 text-sm text-gray-400">No hay cargos sincronizados todavía.</p>
            )}
          </div>
        </section>
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

function CargoRowItem({
  cargo, types, initial,
}: {
  cargo: string;
  types: UserType[];
  initial: string;
}) {
  const [tipo, setTipo] = useState(initial);
  const [pending, start] = useTransition();

  function change(value: string) {
    setTipo(value);
    start(async () => {
      try {
        await setCargoMapping(cargo, value);
        toast.success(`${cargo} → ${value || "sin tipo"}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{cargo}</span>
      <select
        value={tipo}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5] disabled:opacity-50"
      >
        <option value="">— Sin asignar —</option>
        {types.map((t) => (
          <option key={t.key} value={t.key}>{t.nombre}</option>
        ))}
      </select>
    </div>
  );
}
