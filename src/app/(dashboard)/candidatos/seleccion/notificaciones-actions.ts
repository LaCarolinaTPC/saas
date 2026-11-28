"use server";

/**
 * Selección › Notificaciones (27-nov-2026): a qué correos va cada aviso de
 * revisión manual, con copia, interruptor y una prueba de envío; y las
 * novedades del día para Candidatos. Cambiarlo exige el permiso de la
 * configuración de Selección (como Tiempos y reglas).
 */
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { leerAjustes, valorAjuste } from "@/lib/seleccion/servidor";
import { AJUSTE_DEFECTO_COPIA, AJUSTE_DEFECTO_CORREOS, NOTIFICACIONES, TIPOS_NOTIFICACION, armarCorreoNotificacion, correosDe, destinatariosDeAjustes, type TipoNotificacion } from "@/lib/seleccion/notificaciones";
import { novedadesDelDia, type NovedadDelDia } from "@/lib/seleccion/notificaciones-servidor";
import { enviarCorreo } from "@/lib/correo/enviar";
import { guardarAjuste } from "./actions";

export interface FilaNotificacion {
  tipo: TipoNotificacion;
  nombre: string;
  cuando: string;
  grupo: "revision" | "aviso";
  tieneInterruptor: boolean;
  tieneCopia: boolean;
  usaDefecto: boolean;
  activo: boolean;
  para: string[];
  copia: string[];
  /** A quién llega de verdad hoy (con la lista por defecto o la del reporte si no tiene propia). */
  efectivos: { para: string[]; copia: string[]; origen: "propia" | "defecto" | "reporte" | "ninguna" };
  /** Falta la migración 20261127235511: no se puede guardar. */
  sinAjuste: boolean;
}

export interface PantallaNotificaciones {
  puedeEditar: boolean;
  defecto: { para: string[]; copia: string[]; sinAjuste: boolean };
  tipos: FilaNotificacion[];
}

export async function leerNotificaciones(): Promise<PantallaNotificaciones> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("Sin permisos para ver la selección.");
  const a = await leerAjustes().catch(() => []);
  const existe = (clave: string | null) => !clave || a.some((x) => x.clave === clave);
  const valor = (clave: string) => valorAjuste<unknown>(a, clave, undefined);
  return {
    puedeEditar: puedeEditarEn(perms, "candidatos.seleccion_config"),
    defecto: { para: correosDe(valor(AJUSTE_DEFECTO_CORREOS)), copia: correosDe(valor(AJUSTE_DEFECTO_COPIA)), sinAjuste: !existe(AJUSTE_DEFECTO_CORREOS) },
    tipos: TIPOS_NOTIFICACION.map((tipo) => {
      const d = NOTIFICACIONES[tipo];
      const efectivos = destinatariosDeAjustes(tipo, valor);
      return {
        tipo,
        nombre: d.nombre,
        cuando: d.cuando,
        grupo: d.grupo,
        tieneInterruptor: !!d.activo,
        tieneCopia: !!d.copia,
        usaDefecto: d.usaDefecto,
        activo: efectivos.activo,
        para: correosDe(valor(d.correos)),
        copia: d.copia ? correosDe(valor(d.copia)) : [],
        efectivos: { para: efectivos.para, copia: efectivos.copia, origen: efectivos.origen },
        sinAjuste: !existe(d.correos) || !existe(d.activo) || !existe(d.copia),
      };
    }),
  };
}

const lista = (s: string) => correosDe(String(s ?? ""));

/** Guarda la configuración de un aviso (o la lista por defecto con `tipo = "defecto"`). */
export async function guardarNotificacion(tipo: TipoNotificacion | "defecto", d: { activo?: boolean; para: string; copia: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    // Quién recibe cada aviso es configuración de Selección: hace falta poder editarla.
    const perms = await getCurrentPermissions();
    if (!puedeEditarEn(perms, "candidatos.seleccion_config")) return { ok: false, error: "No tienes permiso para cambiar las notificaciones." };
    const malos = [d.para, d.copia].flatMap((s) => String(s ?? "").split(/[,;\s]+/).filter(Boolean)).filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    if (malos.length) return { ok: false, error: `Revise ${malos.length === 1 ? "este correo" : "estos correos"}: ${malos.join(", ")}` };
    const cambios: [string, unknown][] =
      tipo === "defecto"
        ? [
            [AJUSTE_DEFECTO_CORREOS, lista(d.para)],
            [AJUSTE_DEFECTO_COPIA, lista(d.copia)],
          ]
        : [
            ...(NOTIFICACIONES[tipo].activo && typeof d.activo === "boolean" ? ([[NOTIFICACIONES[tipo].activo!, d.activo]] as [string, unknown][]) : []),
            [NOTIFICACIONES[tipo].correos, lista(d.para)],
            ...(NOTIFICACIONES[tipo].copia ? ([[NOTIFICACIONES[tipo].copia!, lista(d.copia)]] as [string, unknown][]) : []),
          ];
    for (const [clave, valor] of cambios) {
      const r = await guardarAjuste(clave, valor);
      if (!r.ok) return { ok: false, error: r.error === "El ajuste no existe." ? "Falta aplicar la migración 20261127235511 (notificaciones)." : r.error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Manda un correo de prueba de ese aviso a quien lo recibe hoy (no queda en las novedades). */
export async function probarNotificacion(tipo: TipoNotificacion): Promise<{ ok: boolean; texto: string }> {
  try {
    const perms = await getCurrentPermissions();
    if (!puedeEditarEn(perms, "candidatos.seleccion_config")) return { ok: false, texto: "No tienes permiso para enviar la prueba." };
    const a = await leerAjustes().catch(() => []);
    const d = destinatariosDeAjustes(tipo, (clave) => valorAjuste<unknown>(a, clave, undefined));
    if (!d.para.length) return { ok: false, texto: "No hay a quién enviarlo: escriba los correos (o los correos por defecto)." };
    const correo = armarCorreoNotificacion({
      tipo,
      titulo: "correo de prueba",
      detalle: `Así llega el aviso «${NOTIFICACIONES[tipo].nombre}». Lo envió ${perms.userEmail ?? "un usuario"} desde Selección › Notificaciones para comprobar que llega.`,
      prueba: true,
      desarrollo: process.env.GESTIVO_ENTORNO === "desarrollo",
    });
    const { conEnvioRealDePrueba } = await import("@/lib/entorno-pruebas");
    const r = await conEnvioRealDePrueba(() => enviarCorreo({ para: d.para, copia: d.copia, ...correo }));
    return r.ok ? { ok: true, texto: `Enviado a ${[...d.para, ...d.copia.map((c) => `copia ${c}`)].join(", ")}.` } : { ok: false, texto: `No salió: ${r.error}` };
  } catch (e) {
    return { ok: false, texto: e instanceof Error ? e.message : "No se pudo enviar." };
  }
}

/** Novedades del día para Candidatos (revisiones manuales que surgieron y si ya se hicieron). */
export async function novedadesHoy(fecha?: string): Promise<{ novedades: NovedadDelDia[] | null }> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("Sin permisos para ver candidatos.");
  return { novedades: await novedadesDelDia(fecha) };
}
