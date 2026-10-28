/**
 * Anota incidencias y chequeos de permisos (src/lib/permisos/incidencias.ts)
 * y los vuelca a la base en una sola llamada (`registrar_permisos_eventos`)
 * después de responder. Nunca lanza ni hace esperar a nadie: si la base falla,
 * lo de ese volcado se pierde con un aviso en el log.
 *
 * El búfer es del proceso, no de la petición: cada fila lleva su usuario, así
 * que da igual quién lo vacíe. Fuera de una petición (scripts, pruebas) no hay
 * `after` y lo anotado espera al siguiente volcado; el búfer tiene tope.
 */
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/operativo/constants";
import { type ContrasteDeUsuario, type Motor } from "./fuente";
import type { PermisosEfectivos } from "./motor";
import { agruparIncidencias, agruparMetricas, evaluar, type Chequeo, type Incidencia, type OrigenChequeo } from "./incidencias";

const TOPE = 5000;

let incidencias: Incidencia[] = [];
let chequeos: Chequeo[] = [];
let descartados = 0;
let programado = false;
let ultimaConciliacion = 0;

export function anotarIncidencia(i: Incidencia): void {
  if (incidencias.length >= TOPE) descartados += 1;
  else incidencias.push(i);
  programar();
}

export function contarChequeo(c: Omit<Chequeo, "dia">): void {
  if (chequeos.length >= TOPE) descartados += 1;
  else chequeos.push({ ...c, dia: hoyBogota() });
  programar();
}

export interface ContextoChequeo {
  userId: string;
  email: string | null;
  motor: Motor;
  /** Lo que decide. */
  efectivos: PermisosEfectivos;
  contraste: ContrasteDeUsuario | null;
  rolViejo: string | null;
  rolesNuevos: string[];
}

/**
 * Evalúa un chequeo, lo cuenta y anota la divergencia (y, en un guardián, la
 * denegación). Devuelve lo que decide el motor activo, siempre.
 */
export function chequear(
  ctx: ContextoChequeo,
  clave: string,
  con: (ef: PermisosEfectivos) => boolean,
  opciones: { guardia?: boolean; origen?: OrigenChequeo; ruta?: string } = {}
): boolean {
  const r = evaluar(ctx.efectivos, ctx.contraste, clave, con);
  try {
    const origen = opciones.origen ?? "server";
    const guardia = !!opciones.guardia;
    contarChequeo({ motor: ctx.motor, origen, clave, viejo: r.viejo, nuevo: r.nuevo, decide: r.decide, esGuardia: guardia });
    const base = {
      userId: ctx.userId,
      email: ctx.email,
      clave,
      origen,
      ruta: opciones.ruta ?? null,
      viejo: r.viejo,
      nuevo: r.nuevo,
      motor: ctx.motor,
      rolViejo: ctx.rolViejo,
      rolesNuevos: ctx.rolesNuevos,
    };
    if (r.divergencia) anotarIncidencia({ ...base, tipo: r.divergencia === "perdido" ? "divergencia_perdido" : "divergencia_ganado" });
    if (guardia && !r.decide) anotarIncidencia({ ...base, tipo: "denegado" });
  } catch {
    // Anotar nunca puede cambiar la respuesta.
  }
  return r.decide;
}

function programar(): void {
  if (programado) return;
  try {
    after(volcarPermisos);
    programado = true;
  } catch {
    // Fuera de una petición, o en el proxy (que vuelca con waitUntil).
  }
}

/** Vacía el búfer a la base. Para el proxy: `event.waitUntil(volcarPermisos())`. */
export async function volcarPermisos(): Promise<void> {
  programado = false;
  if (!incidencias.length && !chequeos.length) return;
  let inc = incidencias;
  let chq = chequeos;
  incidencias = [];
  chequeos = [];
  // En sombra las tablas nuevas se reconstruyen desde el viejo con retraso: si
  // alguien acaba de cambiar un permiso en la pantalla vieja, lo nuevo va
  // detrás. Si al reconstruir había algo pendiente, las divergencias de este
  // volcado son de ese desfase y no se anotan (igual que en sombra.ts). Como
  // mucho una vez por minuto: una divergencia real no debe releer todo cada vez.
  if (Date.now() - ultimaConciliacion > 60_000 && inc.some((i) => i.motor === "sombra" && i.tipo.startsWith("divergencia_"))) {
    ultimaConciliacion = Date.now();
    try {
      const { reconstruirDesdeViejo } = await import("./bd");
      if (await reconstruirDesdeViejo()) {
        inc = inc.filter((i) => !i.tipo.startsWith("divergencia_"));
        chq = chq.map((c) => (c.motor === "sombra" && c.viejo !== c.nuevo ? { ...c, viejo: null, nuevo: null } : c));
      }
    } catch (e) {
      console.error("[permisos] registro: reconstruir:", e instanceof Error ? e.message : e);
    }
  }
  const lote = { incidencias: agruparIncidencias(inc), metricas: agruparMetricas(chq) };
  if (descartados) {
    console.warn(`[permisos] registro: ${descartados} evento(s) descartados por tope del búfer`);
    descartados = 0;
  }
  try {
    const { error } = await createAdminClient().rpc("registrar_permisos_eventos", { eventos: lote });
    if (error) console.error("[permisos] registro:", error.message);
  } catch (e) {
    console.error("[permisos] registro:", e instanceof Error ? e.message : e);
  }
}
