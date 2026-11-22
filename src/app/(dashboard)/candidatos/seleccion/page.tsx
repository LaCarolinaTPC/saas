import { redirect } from "next/navigation";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { leerAjustes, leerMensajes, valoresFijos } from "@/lib/seleccion/servidor";
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEstadoClavesIA } from "@/lib/ia/claves";
import { getCanal } from "@/lib/comunicaciones/whatsapp";
import type { CanalActual } from "./PestanaCanal";
import SeleccionClient from "./SeleccionClient";
import { esPestana } from "./pestanas";
import type { Ejecucion } from "./PestanaIa";

export const dynamic = "force-dynamic";
// El chat de prueba (Server Actions de esta página) consulta Croma de verdad y
// el RNMC puede tardar cerca de un minuto: sin esto se corta con el límite por defecto.
export const maxDuration = 300;

/** Lo que necesita la pestaña «IA» (solo administrador): proveedores con clave y las últimas respuestas. */
async function datosIa() {
  const [estados, { data: ejecuciones }] = await Promise.all([
    getEstadoClavesIA(),
    createAdminClient()
      .from("wa_agente_ejecuciones")
      .select("id, created_at, proveedor, modelo_usado, modelo_solicitado, tokens_entrada, tokens_salida, duracion_ms, resultado, error, wa_conversaciones(wa_contactos(telefono, nombre))")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const filas: Ejecucion[] = (ejecuciones ?? []).map((e) => {
    // Embeds de PostgREST: objeto por FK única, tipado como array.
    const conv = (Array.isArray(e.wa_conversaciones) ? e.wa_conversaciones[0] : e.wa_conversaciones) as
      | { wa_contactos: { telefono: string; nombre: string | null } | { telefono: string; nombre: string | null }[] | null }
      | null;
    const contacto = Array.isArray(conv?.wa_contactos) ? conv?.wa_contactos[0] : conv?.wa_contactos;
    return {
      id: e.id,
      fecha: e.created_at,
      contacto: contacto?.nombre ?? (contacto?.telefono ? `+${contacto.telefono}` : "—"),
      modelo: e.modelo_usado ?? e.modelo_solicitado ?? e.proveedor,
      tokensEntrada: e.tokens_entrada,
      tokensSalida: e.tokens_salida,
      duracionMs: e.duracion_ms,
      resultado: e.resultado,
      error: e.error,
    };
  });
  // Proveedores con API key en Configuración → Proveedores de IA: los únicos que se ofrecen.
  const disponibles = Object.fromEntries(estados.map((e) => [e.proveedor, e.configurada])) as Record<"anthropic" | "openai" | "openrouter", boolean>;
  return { disponibles, ejecuciones: filas };
}

/** La pestaña «Canal» (solo administrador): lo guardado, sin el token. */
async function datosCanal(): Promise<CanalActual | null> {
  const canal = await getCanal();
  return canal
    ? {
        phoneNumberId: canal.phoneNumberId,
        wabaId: canal.wabaId,
        verifyToken: canal.verifyToken,
        numeroMostrado: canal.numeroMostrado,
        tieneToken: true,
        tieneAppSecret: !!canal.appSecret,
        origen: canal.origen,
      }
    : null;
}

/**
 * Selección de conductores: mensajes, plantillas, tiempos y reglas, laboratorios,
 * la IA (chat, documentos y voz) y el canal de WhatsApp (los dos solo para el
 * administrador) y el chat de prueba.
 * `?pestana=` abre una pestaña (lo usan los enlaces viejos a la IA).
 */
export default async function SeleccionConfigPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const perms = await getCurrentPermissions();
  const puedeEditar = puedeEditarEn(perms, "candidatos.seleccion_config");
  if (!puedeEditar && !tienePermiso(perms, "candidatos.seleccion_config.ver")) redirect("/candidatos");

  const sp = await searchParams;
  const pedida = Array.isArray(sp.pestana) ? sp.pestana[0] : sp.pestana;
  const pestanaInicial = esPestana(pedida) ? pedida : undefined;

  const [mensajes, ajustes, seguimiento, agente, ia, canal] = await Promise.all([
    leerMensajes(),
    leerAjustes(),
    leerConfigSeguimiento(),
    getAgenteConClaves(),
    perms.isAdmin ? datosIa() : null,
    perms.isAdmin ? datosCanal() : null,
  ]);

  return (
    <SeleccionClient
      mensajes={mensajes}
      ajustes={ajustes}
      valores={valoresFijos(ajustes)}
      puedeEditar={puedeEditar}
      disponible={mensajes.length > 0}
      seguimiento={{
        disponible: seguimiento.disponible,
        config: seguimiento.config,
        esperaAgente: agente.config.esperaSegundos,
      }}
      ia={ia ? { config: agente.config, ...ia } : null}
      canal={perms.isAdmin ? { actual: canal } : null}
      pestanaInicial={pestanaInicial}
    />
  );
}
