/**
 * Lo que lee la pantalla nueva de usuarios y roles, de las tablas nuevas.
 * Solo servidor.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { estaBloqueado } from "@/lib/auth-estado";
import {
  LISTO_DIAS,
  listoParaNuevo,
  resumir,
  type EstadoIncidencia,
  type OrigenChequeo,
  type ResumenMetricas,
  type Severidad,
  type TipoIncidencia,
} from "@/lib/permisos/incidencias";

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
  /** null si falta la migración de métricas e incidencias. */
  monitoreo: Monitoreo | null;
}

export interface IncidenciaFila {
  id: number;
  tipo: TipoIncidencia;
  severidad: Severidad;
  userId: string | null;
  email: string | null;
  rolViejo: string | null;
  rolesNuevos: string[];
  clave: string;
  origen: OrigenChequeo;
  ruta: string | null;
  viejo: boolean | null;
  nuevo: boolean | null;
  motor: string | null;
  primeraVez: string;
  ultimaVez: string;
  veces: number;
  estado: EstadoIncidencia;
  nota: string | null;
  revisadoPor: string | null;
  revisadoAt: string | null;
}

export interface Monitoreo {
  dias7: ResumenMetricas;
  dias30: ResumenMetricas;
  /** Tendencia diaria (30 días), del más viejo al más nuevo. */
  porDia: ({ dia: string } & ResumenMetricas)[];
  /** Dónde falla: permisos o rutas con divergencias o denegaciones (30 días). */
  dondeFalla: { clave: string; origen: string; perdidos: number; ganados: number; denegados: number; chequeos: number }[];
  incidencias: IncidenciaFila[];
  abiertas: { total: number; perdidos: number; ganados: number; errores: number };
  listo: { listo: boolean; motivo: string | null };
}

const HACE = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

async function cargarMonitoreo(db: ReturnType<typeof createAdminClient>): Promise<Monitoreo | null> {
  const [porDia, fallas, inc, perdidosListo] = await Promise.all([
    db.from("permisos_metricas_por_dia").select("*").gte("dia", HACE(30)).order("dia"),
    db
      .from("permisos_metricas_dia")
      .select("clave, origen, chequeos, perdidos, ganados, denegados")
      .gte("dia", HACE(30))
      .or("perdidos.gt.0,ganados.gt.0,denegados.gt.0")
      .limit(5000),
    // Lo no ignorado, lo más grave y reciente primero; lo ignorado no se trae.
    db.from("permisos_incidencias").select("*").neq("estado", "ignorada").order("ultima_vez", { ascending: false }).limit(500),
    // Para el criterio de paso: contado aparte, no sobre las 500 de arriba.
    db
      .from("permisos_incidencias")
      .select("id", { count: "exact", head: true })
      .eq("estado", "abierta")
      .gte("ultima_vez", new Date(Date.now() - LISTO_DIAS * 86_400_000).toISOString())
      .or("tipo.eq.divergencia_perdido,and(tipo.eq.sombra_teorica,viejo.is.true)"),
  ]);
  const error = porDia.error ?? fallas.error ?? inc.error ?? perdidosListo.error;
  if (error) {
    console.warn("[usuarios] monitoreo de permisos no disponible:", error.message);
    return null;
  }
  type FilaDia = { dia: string; chequeos: number; comparados: number; coinciden: number; perdidos: number; ganados: number; denegados: number };
  const dias = (porDia.data ?? []) as FilaDia[];
  const agrupadoDia = new Map<string, FilaDia[]>();
  for (const d of dias) agrupadoDia.set(d.dia, [...(agrupadoDia.get(d.dia) ?? []), d]);

  const donde = new Map<string, Monitoreo["dondeFalla"][number]>();
  for (const f of (fallas.data ?? []) as { clave: string; origen: string; chequeos: number; perdidos: number; ganados: number; denegados: number }[]) {
    const k = `${f.origen}|${f.clave}`;
    const x = donde.get(k) ?? { clave: f.clave, origen: f.origen, perdidos: 0, ganados: 0, denegados: 0, chequeos: 0 };
    x.perdidos += Number(f.perdidos);
    x.ganados += Number(f.ganados);
    x.denegados += Number(f.denegados);
    x.chequeos += Number(f.chequeos);
    donde.set(k, x);
  }

  const incidencias: IncidenciaFila[] = ((inc.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    tipo: r.tipo as TipoIncidencia,
    severidad: r.severidad as Severidad,
    userId: (r.user_id as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    rolViejo: (r.rol_viejo as string | null) ?? null,
    rolesNuevos: (r.roles_nuevos as string[] | null) ?? [],
    clave: String(r.clave),
    origen: r.origen as OrigenChequeo,
    ruta: (r.ruta as string | null) ?? null,
    viejo: (r.viejo as boolean | null) ?? null,
    nuevo: (r.nuevo as boolean | null) ?? null,
    motor: (r.motor as string | null) ?? null,
    primeraVez: String(r.primera_vez),
    ultimaVez: String(r.ultima_vez),
    veces: Number(r.veces),
    estado: r.estado as EstadoIncidencia,
    nota: (r.nota as string | null) ?? null,
    revisadoPor: (r.revisado_por as string | null) ?? null,
    revisadoAt: (r.revisado_at as string | null) ?? null,
  }));
  const abiertas = incidencias.filter((i) => i.estado === "abierta");

  return {
    dias7: resumir(dias.filter((d) => d.dia >= HACE(7))),
    dias30: resumir(dias),
    porDia: [...agrupadoDia].map(([dia, filas]) => ({ dia, ...resumir(filas) })),
    dondeFalla: [...donde.values()]
      .sort((a, b) => b.perdidos - a.perdidos || b.ganados - a.ganados || b.denegados - a.denegados)
      .slice(0, 50),
    incidencias,
    abiertas: {
      total: abiertas.length,
      perdidos: abiertas.filter((i) => i.tipo === "divergencia_perdido").length,
      ganados: abiertas.filter((i) => i.tipo === "divergencia_ganado").length,
      errores: abiertas.filter((i) => i.tipo.startsWith("error_") || i.tipo === "sin_perfil" || i.tipo === "sin_tipo").length,
    },
    listo: listoParaNuevo(resumir(dias.filter((d) => d.dia >= HACE(LISTO_DIAS))), perdidosListo.count ?? 0),
  };
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
  const [perfiles, roles, rp, ur, up, obsoletos, disc, auth, monitoreo] = await Promise.all([
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
    cargarMonitoreo(db).catch(() => null),
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
    monitoreo,
  };
}
