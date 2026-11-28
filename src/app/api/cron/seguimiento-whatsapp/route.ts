import { NextRequest, NextResponse } from "next/server";
import { ejecutarSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { ejecutarReactivacion } from "@/lib/seleccion/reactivacion-ejecutar";
import { ejecutarAgenda } from "@/lib/seleccion/agenda-ejecutar";
import { sincronizarPlantillas } from "@/lib/seleccion/plantillas";
import {
  consultarRuntFaltantes,
  lanzarAntecedentesPendientes,
  resolverAntecedentesPendientes,
  resolverPoliciaPendientes,
  resolverRnmcPendientes,
  resolverRuntPendientes,
  relanzarSimitFallidos,
  resolverSimitPendientes,
} from "@/lib/verificacion/servidor";
import { cerrarNoPreseleccionados } from "@/lib/seleccion/servidor";
import { avisarResultadoRevision } from "@/lib/comunicaciones/agente/responder";
import { ejecutarDocumentosPendientes } from "@/lib/seleccion/documentos-ejecutar";
import { ejecutarCorreosPsico } from "@/lib/seleccion/correo-psico-servidor";
import { ejecutarRecordatoriosCertificado } from "@/lib/seleccion/certificado-banco-servidor";
import { alertarServicios } from "@/lib/alerta-servicios";
import { avisosReconocimientoPendientes } from "@/lib/seleccion/respuestas-examenes-servidor";
import { topeAlcanzado } from "@/lib/seleccion/consumos-servidor";
import { leerDocumentosPendientesCron, pedirReenvioIlegibles } from "@/lib/seleccion/lectura/ejecutar";
import { transcribirAudiosPendientesCron } from "@/lib/seleccion/audios";
import { sincronizarListosPendientes } from "@/lib/seleccion/listo-contratar-servidor";
import { enviarOrdenesDelDia } from "@/lib/seleccion/laboratorios-servidor";
import { notificarChatsHumano } from "@/lib/seleccion/notificaciones-servidor";

export const runtime = "nodejs";
// Reintenta verificaciones lentas de Croma (el RNMC puede tardar cerca de un minuto).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Seguimiento a quien no responde en WhatsApp («¿sigues interesado?» y marcar
 * para GH). Es el ÚNICO disparador: lo llama cada 15 minutos el cron de
 * Vercel (`*\/15 * * * *` en vercel.json, ver docs/crons.md). No va en
 * el latido (TV o páginas abiertas) para que no envíe WhatsApp desde cualquier
 * equipo con Gestivo abierto, incluidos los de desarrollo.
 * Se llama con `Authorization: Bearer <CRON_SECRET>`. Cada conversación se
 * reserva antes de enviar, así que dos llamadas a la vez no duplican envíos.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // Falla cerrado: sin CRON_SECRET configurado nadie puede dispararlo.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const r = await ejecutarSeguimiento();
    // Selección de conductores (entrega 1): cada parte por separado, para que
    // un fallo en una no impida las demás ni el seguimiento.
    // Primero el estado de las plantillas, para que la reactivación sepa cuáles ya aprobó Meta.
    const plantillas = await intentar(() => sincronizarPlantillas());
    const [reactivacion, simit, runt, policia, rnmc, antecedentes] = await Promise.all([
      intentar(() => ejecutarReactivacion()),
      intentar(() => resolverSimitPendientes()),
      intentar(() => resolverRuntPendientes()),
      intentar(() => resolverPoliciaPendientes()),
      intentar(() => resolverRnmcPendientes()),
      intentar(() => resolverAntecedentesPendientes()),
    ]);
    // RUNT (y SIMIT) que no cupieron en el turno del webhook tras un RNMC lento.
    // Con el tope mensual del gasto alcanzado no se lanzan consultas automáticas nuevas a Croma (entrega 3, NF1).
    // Las que ya estaban en curso (arriba) sí se terminan: ya se pagaron.
    const sinGasto = await topeAlcanzado();
    const porTope = { omitida: "tope mensual del gasto alcanzado" };
    const runtFaltantes = sinGasto ? porTope : await intentar(() => consultarRuntFaltantes());
    // SIMIT que Croma no completó: se vuelve a lanzar (con freno) hasta que responda o una persona lo revise a mano.
    const simitRelanzado = sinGasto ? porTope : await intentar(() => relanzarSimitFallidos());
    // Verificaciones que se habían demorado y ya respondieron: el asistente le
    // cuenta el resultado al aspirante (se le había dicho que le avisábamos).
    const terminados = new Set([
      ...(rnmc && "terminados" in rnmc ? rnmc.terminados : []),
      // El RUNT que Croma dejó en curso y terminó ahora.
      ...(runt && "terminados" in runt ? runt.terminados : []),
      ...(Array.isArray(runtFaltantes) ? runtFaltantes : []),
    ]);
    for (const procesoId of terminados) await avisarResultadoRevision(procesoId);
    // Después de terminar las pendientes, lanza los antecedentes que faltan (con
    // freno si una fuente sigue caída). Si el RNMC rechaza la fecha, el asistente la pide.
    const lanzados = sinGasto ? porTope : await intentar(() => lanzarAntecedentesPendientes());
    if (lanzados && "fechaRechazada" in lanzados) {
      for (const procesoId of lanzados.fechaRechazada) await avisarResultadoRevision(procesoId);
    }
    // Los que no pasaron la preselección (rojo sin cambios un rato) se cierran con su causa.
    const cierres = await intentar(() => cerrarNoPreseleccionados());
    // Entrega 2: recordatorio de la cita, alerta si no confirma, «No asistió» y recordatorio de escuela.
    const agenda = await intentar(() => ejecutarAgenda());
    // 23-nov-2026: con el envío automático, el correo del día a los laboratorios por correo.
    const ordenes = await intentar(() => enviarOrdenesDelDia());
    // Entrega 3: recordatorio de los documentos que le faltan de la carpeta.
    const documentos = await intentar(() => ejecutarDocumentosPendientes());
    // 24-nov-2026: pedir y recordar el correo para la prueba psicotécnica.
    // 24-nov-2026: el aviso del reconocimiento de ruta a quien no respondió lo del banco en 24 h.
    const reconocimiento = await intentar(() => avisosReconocimientoPendientes());
    const correos = await intentar(() => ejecutarCorreosPsico());
    // 24-nov-2026: recordarle el certificado bancario (cuenta del Banco de Bogotá para los pagos).
    const certificado = await intentar(() => ejecutarRecordatoriosCertificado());
    // 24-nov-2026: correo a Gestión Humana si un servicio externo (Croma, IA, WhatsApp, correo) está fallando.
    const alertas = await intentar(() => alertarServicios());
    // Entrega 4: documentos que no se alcanzaron a leer mientras respondía el asistente.
    const lecturas = sinGasto ? porTope : await intentar(() => leerDocumentosPendientesCron());
    // 25-nov-2026: «Listo para contratar» al día, por si cambió algo que no pasa por una acción (ajustes, reglas).
    const listos = await intentar(() => sincronizarListosPendientes());
    // 27-nov-2026: un correo con los chats que el asistente pasó a una persona (los nuevos desde la última vuelta).
    const chatsHumano = await intentar(() => notificarChatsHumano());
    // R6: a quien mandó un archivo ilegible y el asistente no alcanzó a pedírselo de nuevo.
    const reenvios = await intentar(() => pedirReenvioIlegibles());
    // R4: audios de chats que el asistente no atiende (pausados o tomados por una persona): la bandeja los muestra transcritos.
    const audios = sinGasto ? porTope : await intentar(() => transcribirAudiosPendientesCron());
    return NextResponse.json({ ok: true, ...r, seleccion: { plantillas, reactivacion, simit, simitRelanzado, runt, policia, rnmc, antecedentes, lanzados, cierres, agenda, ordenes, documentos, reconocimiento, correos, certificado, alertas, lecturas, reenvios, audios, listos, chatsHumano } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron seguimiento-whatsapp]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function intentar<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    console.error("[cron seguimiento-whatsapp] selección:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
