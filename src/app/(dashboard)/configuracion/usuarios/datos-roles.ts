/**
 * Lo que lee la pantalla nueva de usuarios y roles, de las tablas nuevas.
 * Solo servidor.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { estaBloqueado } from "@/lib/auth-estado";

export interface UsuarioFila {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  roles: string[];
  concedidos: string[];
  quitados: string[];
}

export interface RolFila {
  clave: string;
  nombre: string;
  descripcion: string | null;
  super: boolean;
  sistema: boolean;
  activo: boolean;
  permisos: string[];
}

export interface DatosRoles {
  usuarios: UsuarioFila[];
  roles: RolFila[];
  obsoletos: { clave: string; etiqueta: string; enUso: number }[];
  discrepancias: { conPerdidos: number; conGanados: number };
}

async function todo<T>(db: ReturnType<typeof createAdminClient>, tabla: string, columnas: string): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from(tabla).select(columnas).range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    salida.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return salida;
  }
}

export async function cargarDatosRoles(): Promise<DatosRoles> {
  const db = createAdminClient();
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const [perfiles, roles, rp, ur, up, obsoletos, disc, auth] = await Promise.all([
    todo<{ id: string; full_name: string | null; email: string | null }>(db, "profiles", "id, full_name, email"),
    todo<{ clave: string; nombre: string; descripcion: string | null; es_super: boolean; es_sistema: boolean; activo: boolean }>(
      db,
      "roles",
      "clave, nombre, descripcion, es_super, es_sistema, activo"
    ),
    todo<{ rol: string; permiso: string }>(db, "rol_permisos", "rol, permiso"),
    todo<{ user_id: string; rol: string }>(db, "usuario_roles", "user_id, rol"),
    todo<{ user_id: string; permiso: string; concedido: boolean }>(db, "usuario_permisos", "user_id, permiso, concedido"),
    todo<{ clave: string; etiqueta: string }>(db, "permisos", "clave, etiqueta, obsoleto").then((f) =>
      (f as { clave: string; etiqueta: string; obsoleto?: boolean }[]).filter((p) => p.obsoleto)
    ),
    db.from("permisos_discrepancias").select("perdidos, ganados").gte("dia", desde),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const bloqueados = new Set((auth.data?.users ?? []).filter((u) => estaBloqueado(u.banned_until)).map((u) => u.id));
  const usadas = new Map<string, number>();
  for (const x of [...rp.map((r) => r.permiso), ...up.map((u) => u.permiso)]) usadas.set(x, (usadas.get(x) ?? 0) + 1);

  return {
    usuarios: perfiles
      .map((p) => ({
        id: p.id,
        nombre: p.full_name || p.email || p.id,
        email: p.email ?? "",
        activo: !bloqueados.has(p.id),
        roles: ur.filter((x) => x.user_id === p.id).map((x) => x.rol),
        concedidos: up.filter((x) => x.user_id === p.id && x.concedido).map((x) => x.permiso),
        quitados: up.filter((x) => x.user_id === p.id && !x.concedido).map((x) => x.permiso),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    roles: roles
      .map((r) => ({
        clave: r.clave,
        nombre: r.nombre,
        descripcion: r.descripcion,
        super: r.es_super,
        sistema: r.es_sistema,
        activo: r.activo,
        permisos: rp.filter((x) => x.rol === r.clave).map((x) => x.permiso),
      }))
      .sort((a, b) => Number(b.super) - Number(a.super) || a.nombre.localeCompare(b.nombre)),
    obsoletos: obsoletos.map((o) => ({ clave: o.clave, etiqueta: o.etiqueta, enUso: usadas.get(o.clave) ?? 0 })),
    discrepancias: {
      conPerdidos: (disc.data ?? []).filter((d) => (d.perdidos as string[]).length).length,
      conGanados: (disc.data ?? []).filter((d) => (d.ganados as string[]).length).length,
    },
  };
}
