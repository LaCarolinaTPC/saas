"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Copy,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { coincideTexto } from "@/lib/tabla/filtros";
import { NAV_TREE } from "@/lib/constants";
import { PERMISOS } from "@/lib/permisos/catalogo";
import { menuVisible } from "@/lib/permisos/motor";
import { efectivosDeUsuario, permisosQuePierde, quienTiene, type RolDatos } from "@/lib/permisos/arbol";
import { ArbolPermisos } from "./arbol-permisos";
import { ConfirmarAccion } from "./confirmar-accion";
import { MonitoreoPermisos } from "./monitoreo-permisos";
import type { DatosRoles, RolFila, UsuarioFila } from "./datos-roles";
import {
  asignarRolesUsuario,
  cambiarMotorPermisos,
  crearUsuarioConRoles,
  eliminarRolNuevo,
  guardarPermisosIndividuales,
  guardarRol,
} from "./roles-actions";
import { resetUserPassword, setUserActive } from "./actions";

const boton = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const primario = cn(boton, "bg-[#4F46E5] text-white hover:bg-[#4338CA]");
const secundario = cn(boton, "border border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]");
const campo = "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm";

/**
 * Usuarios y roles con el sistema nuevo de permisos (src/lib/permisos):
 * varios roles por persona, permisos individuales sin crear roles, roles con
 * casillas por acción agrupadas como el menú, «¿quién tiene?» y el estado del
 * sistema. Con `soloLectura` es la vista previa mientras manda el viejo.
 */
export function SistemaRolesClient({ datos, soloLectura, yo }: { datos: DatosRoles; soloLectura: boolean; yo: string | null }) {
  const [tab, setTab] = useState(soloLectura ? "sistema" : "usuarios");
  const roles = useMemo(() => new Map<string, RolDatos>(datos.roles.map((r) => [r.clave, r])), [datos.roles]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-6 py-8">
      {soloLectura && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Vista previa del sistema nuevo.</strong> Todavía decide el sistema actual: estos roles y asignaciones se copian de él
            automáticamente. Para poder editarlos aquí, pase al sistema nuevo en la pestaña «Sistema».
          </p>
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="usuarios" className="px-3">
            <Users className="h-4 w-4" /> Usuarios
          </TabsTrigger>
          <TabsTrigger value="roles" className="px-3">
            <ShieldCheck className="h-4 w-4" /> Roles
          </TabsTrigger>
          <TabsTrigger value="quien" className="px-3">
            <Search className="h-4 w-4" /> ¿Quién tiene?
          </TabsTrigger>
          <TabsTrigger value="sistema" className="px-3">
            <Workflow className="h-4 w-4" /> Sistema
          </TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios">
          <PestanaUsuarios datos={datos} roles={roles} soloLectura={soloLectura} yo={yo} />
        </TabsContent>
        <TabsContent value="roles">
          <PestanaRoles datos={datos} soloLectura={soloLectura} />
        </TabsContent>
        <TabsContent value="quien">
          <PestanaQuien datos={datos} roles={roles} />
        </TabsContent>
        <TabsContent value="sistema">
          <PestanaSistema datos={datos} soloLectura={soloLectura} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Usuarios ─────────────────────────────────────────────────────────────────

function PestanaUsuarios({ datos, roles, soloLectura, yo }: { datos: DatosRoles; roles: Map<string, RolDatos>; soloLectura: boolean; yo: string | null }) {
  const [q, setQ] = useState("");
  const [rolFiltro, setRolFiltro] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const filas = datos.usuarios.filter(
    (u) => (!q || coincideTexto(u.nombre, q) || coincideTexto(u.email, q)) && (!rolFiltro || u.roles.includes(rolFiltro))
  );
  const usuario = datos.usuarios.find((u) => u.id === abierto) ?? null;

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#F1F5F9] px-4 py-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o email" className={cn(campo, "max-w-xs")} />
        <select value={rolFiltro} onChange={(e) => setRolFiltro(e.target.value)} className={cn(campo, "max-w-56")} aria-label="Filtrar por rol">
          <option value="">Todos los roles</option>
          {datos.roles.map((r) => (
            <option key={r.clave} value={r.clave}>
              {r.nombre}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {filas.length} de {datos.usuarios.length}
        </span>
        {!soloLectura && (
          <button type="button" className={cn(primario, "ml-auto")} onClick={() => setCreando(true)}>
            <UserPlus className="h-4 w-4" /> Nuevo usuario
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Usuario</th>
              <th className="px-4 py-2">Roles</th>
              <th className="px-4 py-2">Individuales</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {filas.map((u) => (
              <tr key={u.id} className="hover:bg-[#F8FAFC]">
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-900">{u.nombre}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 && <span className="text-xs text-red-600">Sin rol</span>}
                    {u.roles.map((r) => (
                      <span key={r} className={cn("rounded-full px-2 py-0.5 text-xs", roles.get(r)?.super ? "bg-[#4F46E5] text-white" : "bg-[#EEF2FF] text-[#4F46E5]")}>
                        {roles.get(r)?.nombre ?? r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  {u.concedidos.length + u.quitados.length === 0 ? "—" : `+${u.concedidos.length} / −${u.quitados.length}`}
                </td>
                <td className="px-4 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", u.activo ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                    {u.activo ? "Activo" : "Desactivado"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" className={secundario} onClick={() => setAbierto(u.id)}>
                    {soloLectura ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />} {soloLectura ? "Ver" : "Permisos"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!usuario} onOpenChange={(o) => !o && setAbierto(null)}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
          {usuario && <PanelUsuario key={usuario.id} u={usuario} datos={datos} roles={roles} soloLectura={soloLectura} yo={yo} onCerrar={() => setAbierto(null)} />}
        </SheetContent>
      </Sheet>
      <Sheet open={creando} onOpenChange={setCreando}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          {creando && <NuevoUsuario datos={datos} onCerrar={() => setCreando(false)} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function PanelUsuario({
  u,
  datos,
  roles,
  soloLectura,
  yo,
  onCerrar,
}: {
  u: UsuarioFila;
  datos: DatosRoles;
  roles: Map<string, RolDatos>;
  soloLectura: boolean;
  yo: string | null;
  onCerrar: () => void;
}) {
  const [misRoles, setMisRoles] = useState<string[]>(u.roles);
  // Lo que dan SOLO sus roles; sobre eso se marcan las diferencias individuales.
  const deRoles = useMemo(() => efectivosDeUsuario({ id: u.id, roles: misRoles, concedidos: [], quitados: [] }, roles), [misRoles, roles, u.id]);
  const inicial = useMemo(() => efectivosDeUsuario({ ...u, roles: misRoles }, roles).permisos, [u, misRoles, roles]);
  const [valor, setValor] = useState<Set<string> | null>(null);
  const permisosVista = valor ?? new Set(inicial);
  const [pending, start] = useTransition();
  const [confirmar, setConfirmar] = useState<string[] | null>(null);
  const [clave, setClave] = useState<string | null>(null);

  const propuesta = {
    id: u.id,
    roles: misRoles,
    concedidos: [...permisosVista].filter((p) => !deRoles.permisos.has(p)),
    quitados: [...deRoles.permisos].filter((p) => !permisosVista.has(p)),
  };
  const efectivoPropuesto = efectivosDeUsuario(propuesta, roles);
  const menu = menuVisible(efectivoPropuesto, NAV_TREE);
  const cambio =
    JSON.stringify([...misRoles].sort()) !== JSON.stringify([...u.roles].sort()) ||
    JSON.stringify(propuesta.concedidos.sort()) !== JSON.stringify([...u.concedidos].sort()) ||
    JSON.stringify(propuesta.quitados.sort()) !== JSON.stringify([...u.quitados].sort());

  const guardar = () =>
    start(async () => {
      const r1 = await asignarRolesUsuario(u.id, misRoles);
      if (!r1.ok) return void toast.error(r1.error);
      const r2 = deRoles.super ? r1 : await guardarPermisosIndividuales(u.id, propuesta.concedidos, propuesta.quitados);
      if (!r2.ok) return void toast.error(r2.error);
      toast.success("Permisos guardados.");
      onCerrar();
    });
  const intentarGuardar = () => {
    const pierde = permisosQuePierde(u, propuesta, roles);
    if (pierde.length) setConfirmar(pierde);
    else guardar();
  };

  return (
    <div className="space-y-5 p-6">
      <SheetHeader className="p-0">
        <SheetTitle>{u.nombre}</SheetTitle>
        <SheetDescription>
          {u.email} · {u.activo ? "Activo" : "Desactivado"}
        </SheetDescription>
      </SheetHeader>

      {!soloLectura && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secundario}
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const r = await resetUserPassword(u.id);
                  setClave(r.password);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                }
              })
            }
          >
            <KeyRound className="h-4 w-4" /> Restablecer contraseña
          </button>
          {u.id !== yo && (
            <button
              type="button"
              className={secundario}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await setUserActive(u.id, !u.activo);
                    toast.success(u.activo ? "Usuario desactivado." : "Usuario activado.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e));
                  }
                })
              }
            >
              {u.activo ? "Desactivar" : "Activar"}
            </button>
          )}
        </div>
      )}
      {clave && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Clave provisional: <strong className="font-mono">{clave}</strong> — la cambia en su próximo ingreso. Se muestra una sola vez.
        </p>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Roles</h3>
        <div className="grid gap-1 sm:grid-cols-2">
          {datos.roles
            .filter((r) => r.activo || misRoles.includes(r.clave))
            .map((r) => (
              <label key={r.clave} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[#F8FAFC]">
                <Checkbox
                  checked={misRoles.includes(r.clave)}
                  disabled={soloLectura}
                  onCheckedChange={(c) => {
                    setValor(null);
                    setMisRoles((m) => (c === true ? [...m, r.clave] : m.filter((x) => x !== r.clave)));
                  }}
                />
                <span>{r.nombre}</span>
                {r.super && <span className="rounded-full bg-[#4F46E5] px-1.5 text-[10px] text-white">todo</span>}
              </label>
            ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-900">Permisos</h3>
        {deRoles.super ? (
          <p className="text-sm text-gray-600">Tiene un rol de administrador: tiene todos los permisos, también los que se agreguen después.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-500">
              Lo que le dan sus roles viene marcado. Si marca o desmarca algo, queda como <strong>permiso individual</strong> de esta persona,
              sin crear un rol para ella.
            </p>
            <ArbolPermisos valor={permisosVista} base={deRoles.permisos} onCambio={setValor} soloLectura={soloLectura} />
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Su menú</h3>
        <div className="grid gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 sm:grid-cols-2 lg:grid-cols-3">
          {menu.length === 0 && <p className="text-sm text-red-600">No vería ninguna pantalla.</p>}
          {menu.map((e) =>
            e.kind === "link" ? (
              <p key={e.href} className="text-sm font-medium text-gray-800">
                {e.label}
              </p>
            ) : (
              <div key={e.key}>
                <p className="text-xs font-semibold uppercase text-gray-500">{e.label}</p>
                <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
                  {e.items.map((i) => (
                    <li key={i.href}>{i.seccion ? `${i.seccion} › ${i.label}` : i.label}</li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      </section>

      {!soloLectura && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#F1F5F9] bg-white pt-3">
          <button type="button" className={secundario} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className={primario} disabled={!cambio || pending} onClick={intentarGuardar}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
      <ConfirmarAccion
        abierto={!!confirmar}
        onAbrir={(v) => !v && setConfirmar(null)}
        titulo="Va a quitarle permisos"
        descripcion={
          <span className="block max-h-60 overflow-y-auto">
            {u.nombre} dejará de tener:
            <span className="mt-2 block font-mono text-xs">{(confirmar ?? []).join(", ")}</span>
          </span>
        }
        textoConfirmar="Quitar y guardar"
        destructivo
        onConfirmar={guardar}
      />
    </div>
  );
}

function NuevoUsuario({ datos, onCerrar }: { datos: DatosRoles; onCerrar: () => void }) {
  const [f, setF] = useState({ fullName: "", email: "", password: "", roles: [] as string[] });
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4 p-6">
      <SheetHeader className="p-0">
        <SheetTitle>Nuevo usuario</SheetTitle>
        <SheetDescription>La contraseña es provisional: la cambia en su primer ingreso.</SheetDescription>
      </SheetHeader>
      <input className={campo} placeholder="Nombre completo" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      <input className={campo} placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input className={campo} placeholder="Contraseña provisional (mín. 6)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <div>
        <p className="mb-1 text-sm font-medium text-gray-900">Roles</p>
        {datos.roles
          .filter((r) => r.activo)
          .map((r) => (
            <label key={r.clave} className="flex items-center gap-2 py-0.5 text-sm">
              <Checkbox
                checked={f.roles.includes(r.clave)}
                onCheckedChange={(c) => setF({ ...f, roles: c === true ? [...f.roles, r.clave] : f.roles.filter((x) => x !== r.clave) })}
              />
              {r.nombre}
            </label>
          ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={secundario} onClick={onCerrar}>
          Cancelar
        </button>
        <button
          type="button"
          className={primario}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await crearUsuarioConRoles(f);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Usuario creado.");
              onCerrar();
            })
          }
        >
          <UserPlus className="h-4 w-4" /> Crear
        </button>
      </div>
    </div>
  );
}

// ── Roles ────────────────────────────────────────────────────────────────────

function PestanaRoles({ datos, soloLectura }: { datos: DatosRoles; soloLectura: boolean }) {
  const [editando, setEditando] = useState<{ rol: RolFila; nuevo: boolean } | null>(null);
  const [borrar, setBorrar] = useState<RolFila | null>(null);
  const [pending, start] = useTransition();
  const usuariosDe = (clave: string) => datos.usuarios.filter((u) => u.roles.includes(clave)).length;
  const vacio: RolFila = { clave: "", nombre: "", descripcion: null, super: false, sistema: false, activo: true, permisos: [] };

  return (
    <section className="space-y-3">
      {!soloLectura && (
        <div className="flex justify-end">
          <button type="button" className={primario} onClick={() => setEditando({ rol: vacio, nuevo: true })}>
            <Plus className="h-4 w-4" /> Nuevo rol
          </button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {datos.roles.map((r) => (
          <article key={r.clave} className={cn("rounded-xl border border-[#E2E8F0] bg-white p-4", !r.activo && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">{r.nombre}</h3>
                <p className="text-xs text-gray-400">{r.clave}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {r.super && <span className="rounded-full bg-[#4F46E5] px-2 py-0.5 text-[10px] text-white">Todo</span>}
                {!r.activo && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">Inactivo</span>}
              </div>
            </div>
            {r.descripcion && <p className="mt-1 text-sm text-gray-600">{r.descripcion}</p>}
            <p className="mt-2 text-xs text-gray-500">
              {usuariosDe(r.clave)} usuario(s) · {r.super ? "todos los permisos" : `${r.permisos.length} permisos`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={secundario} onClick={() => setEditando({ rol: r, nuevo: false })}>
                {soloLectura || r.super ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />} {soloLectura || r.super ? "Ver" : "Editar"}
              </button>
              {!soloLectura && !r.super && (
                <button
                  type="button"
                  className={secundario}
                  onClick={() => setEditando({ rol: { ...r, clave: `${r.clave}_copia`, nombre: `${r.nombre} (copia)`, sistema: false }, nuevo: true })}
                >
                  <Copy className="h-4 w-4" /> Duplicar
                </button>
              )}
              {!soloLectura && !r.super && !r.sistema && (
                <button type="button" className={cn(secundario, "text-red-600")} onClick={() => setBorrar(r)} disabled={pending}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <Sheet open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
          {editando && (
            <EditorRol
              key={editando.rol.clave + editando.nuevo}
              rol={editando.rol}
              nuevo={editando.nuevo}
              soloLectura={soloLectura || editando.rol.super}
              onCerrar={() => setEditando(null)}
            />
          )}
        </SheetContent>
      </Sheet>
      <ConfirmarAccion
        abierto={!!borrar}
        onAbrir={(v) => !v && setBorrar(null)}
        titulo={`Borrar el rol «${borrar?.nombre}»`}
        descripcion="Solo se puede borrar si nadie lo tiene. No se puede deshacer."
        textoConfirmar="Borrar"
        destructivo
        onConfirmar={() =>
          start(async () => {
            const r = await eliminarRolNuevo(borrar!.clave);
            if (!r.ok) toast.error(r.error);
            else toast.success("Rol borrado.");
          })
        }
      />
    </section>
  );
}

function EditorRol({ rol, nuevo, soloLectura, onCerrar }: { rol: RolFila; nuevo: boolean; soloLectura: boolean; onCerrar: () => void }) {
  const [f, setF] = useState({ clave: rol.clave, nombre: rol.nombre, descripcion: rol.descripcion ?? "", activo: rol.activo });
  const [permisos, setPermisos] = useState<Set<string>>(new Set(rol.permisos));
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4 p-6">
      <SheetHeader className="p-0">
        <SheetTitle>{nuevo ? "Nuevo rol" : rol.nombre}</SheetTitle>
        <SheetDescription>
          {rol.super
            ? "El rol administrador tiene todos los permisos, también los que se agreguen después. No se edita."
            : "Marque lo que puede hacer quien tenga este rol. Una persona puede tener varios roles: sus permisos se suman."}
        </SheetDescription>
      </SheetHeader>
      {!rol.super && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Nombre</span>
              <input className={campo} value={f.nombre} disabled={soloLectura} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Clave</span>
              <input
                className={campo}
                value={f.clave}
                disabled={!nuevo || soloLectura}
                onChange={(e) => setF({ ...f, clave: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-gray-600">Descripción</span>
              <input className={campo} value={f.descripcion} disabled={soloLectura} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.activo} disabled={soloLectura} onCheckedChange={(c) => setF({ ...f, activo: c === true })} />
              Activo (un rol inactivo no da permisos)
            </label>
          </div>
          <ArbolPermisos valor={permisos} onCambio={setPermisos} soloLectura={soloLectura} />
        </>
      )}
      {!soloLectura && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#F1F5F9] bg-white pt-3">
          <button type="button" className={secundario} onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className={primario}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await guardarRol({ ...f, descripcion: f.descripcion || null, permisos: [...permisos] }, nuevo);
                if (!r.ok) return void toast.error(r.error);
                toast.success(nuevo ? "Rol creado." : "Rol guardado.");
                onCerrar();
              })
            }
          >
            {pending ? "Guardando…" : "Guardar rol"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── ¿Quién tiene? ────────────────────────────────────────────────────────────

function PestanaQuien({ datos, roles }: { datos: DatosRoles; roles: Map<string, RolDatos> }) {
  const [q, setQ] = useState("");
  const [permiso, setPermiso] = useState<string | null>(null);
  const opciones = PERMISOS.filter((p) => !q || coincideTexto(p.etiqueta, q) || p.clave.includes(q.toLowerCase())).slice(0, 60);
  const resultado = permiso ? quienTiene(permiso, datos.usuarios, roles) : [];
  const porId = new Map(datos.usuarios.map((u) => [u.id, u]));
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar permiso (p. ej. «ausentismo editar»)" className={campo} />
        <ul className="mt-2 max-h-[60vh] divide-y divide-[#F1F5F9] overflow-y-auto">
          {opciones.map((p) => (
            <li key={p.clave}>
              <button
                type="button"
                onClick={() => setPermiso(p.clave)}
                className={cn("w-full px-2 py-1.5 text-left text-sm hover:bg-[#F8FAFC]", permiso === p.clave && "bg-[#EEF2FF]")}
              >
                {p.etiqueta}
                <span className="block font-mono text-[11px] text-gray-400">{p.clave}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        {!permiso ? (
          <p className="text-sm text-gray-500">Elija un permiso para ver quién lo tiene y por qué.</p>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-gray-900">
              {resultado.length} usuario(s) con <span className="font-mono">{permiso}</span>
            </h3>
            <ul className="mt-2 divide-y divide-[#F1F5F9]">
              {resultado.map((r) => (
                <li key={r.userId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span>
                    {porId.get(r.userId)?.nombre}
                    {!porId.get(r.userId)?.activo && <span className="ml-1 text-xs text-gray-400">(desactivado)</span>}
                  </span>
                  <span className="text-xs text-gray-500">{r.origen.join(" · ")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

// ── Sistema ──────────────────────────────────────────────────────────────────

function PestanaSistema({ datos, soloLectura }: { datos: DatosRoles; soloLectura: boolean }) {
  const [confirmar, setConfirmar] = useState<"nuevo" | "sombra" | null>(null);
  const [pending, start] = useTransition();
  const cambiar = (destino: "nuevo" | "sombra") =>
    start(async () => {
      const r = await cambiarMotorPermisos(destino);
      if (!r.ok) toast.error(r.error);
      else toast.success(destino === "nuevo" ? "Ahora decide el sistema nuevo de roles." : "Volvió a decidir el sistema anterior.");
    });
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
        <h3 className="font-semibold text-gray-900">{soloLectura ? "Decide el sistema anterior (modo sombra)" : "Decide el sistema nuevo de roles"}</h3>
        <p className="mt-1 text-sm text-gray-600">
          {soloLectura
            ? "El sistema nuevo calcula en paralelo y compara a cada persona que entra. Lo que difiera queda anotado aquí abajo."
            : "Varios roles por persona, permisos individuales y permisos por acción. Los módulos y acciones nuevos aparecen solos."}
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[#F8FAFC] p-3">
            <dt className="text-xs text-gray-500">Personas que perderían acceso (7 días)</dt>
            <dd className={cn("text-2xl font-semibold", datos.discrepancias.conPerdidos ? "text-red-600" : "text-green-700")}>{datos.discrepancias.conPerdidos}</dd>
          </div>
          <div className="rounded-lg bg-[#F8FAFC] p-3">
            <dt className="text-xs text-gray-500">Personas que ganarían acceso (7 días)</dt>
            <dd className="text-2xl font-semibold text-gray-900">{datos.discrepancias.conGanados}</dd>
          </div>
          <div className="rounded-lg bg-[#F8FAFC] p-3">
            <dt className="text-xs text-gray-500">Roles · usuarios</dt>
            <dd className="text-2xl font-semibold text-gray-900">
              {datos.roles.length} · {datos.usuarios.length}
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          {soloLectura ? (
            <button type="button" className={primario} disabled={pending || datos.discrepancias.conPerdidos > 0} onClick={() => setConfirmar("nuevo")}>
              Pasar al sistema nuevo
            </button>
          ) : (
            <button type="button" className={secundario} disabled={pending} onClick={() => setConfirmar("sombra")}>
              Volver al sistema anterior
            </button>
          )}
          {soloLectura && datos.discrepancias.conPerdidos > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" /> Hay personas que perderían acceso: revíselo con «npm run permisos:discrepancias» antes de pasar.
            </p>
          )}
        </div>
      </div>

      <MonitoreoPermisos m={datos.monitoreo} />

      {datos.obsoletos.length > 0 && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
          <h3 className="font-semibold text-gray-900">Permisos retirados ({datos.obsoletos.length})</h3>
          <p className="mt-1 text-sm text-gray-600">Ya no existen en el sistema: no dan acceso. Se conservan por si vuelven.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {datos.obsoletos.map((o) => (
              <li key={o.clave} className="flex justify-between gap-2">
                <span>{o.etiqueta}</span>
                <span className="text-xs text-gray-400">{o.enUso} asignación(es)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmarAccion
        abierto={!!confirmar}
        onAbrir={(v) => !v && setConfirmar(null)}
        titulo={confirmar === "nuevo" ? "Pasar al sistema nuevo de roles" : "Volver al sistema anterior"}
        descripcion={
          confirmar === "nuevo"
            ? "Desde ahora los permisos se deciden con los roles nuevos, y se editan en esta pantalla. Antes de pasar se copia lo último del sistema actual. Se puede volver atrás."
            : "Volverá a decidir el sistema anterior. Lo que se haya cambiado en los roles nuevos se reemplazará por lo del sistema anterior en la siguiente sincronización."
        }
        textoConfirmar={confirmar === "nuevo" ? "Pasar al sistema nuevo" : "Volver"}
        destructivo={confirmar === "sombra"}
        onConfirmar={() => confirmar && cambiar(confirmar)}
      />
    </section>
  );
}
