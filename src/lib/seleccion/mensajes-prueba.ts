/**
 * Los mensajes que «saldrían» a un candidato del chat de prueba (27-nov-2026).
 * Con origen «chat_prueba» no sale nada por WhatsApp: el texto se devuelve
 * para mostrarlo en el chat. Cuando una acción encadena varios avisos (la
 * respuesta del banco → la carta → el aviso del reconocimiento…), cada uno se
 * perdía en el camino. Con `recogerMensajesPrueba` la acción del chat de
 * prueba los recoge todos, en orden, sin cambiar las funciones de en medio.
 * Solo servidor.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface MensajePrueba {
  /** Candidato al que va (con varios chats de prueba abiertos, cada mensaje va al suyo). */
  procesoId?: string;
  /** Clave del catálogo de mensajes (para los botones de la plantilla y la etiqueta). */
  clave: string;
  texto: string;
  /** Documentos que acompañan el mensaje (la carta del banco). */
  adjuntos?: string[];
}

const almacen = new AsyncLocalStorage<MensajePrueba[]>();

/** Corre `fn` y devuelve, además de su resultado, los mensajes de prueba que se anotaron. */
export async function recogerMensajesPrueba<T>(fn: () => Promise<T>): Promise<{ resultado: T; mensajes: MensajePrueba[] }> {
  const mensajes: MensajePrueba[] = [];
  const resultado = await almacen.run(mensajes, fn);
  return { resultado, mensajes };
}

/**
 * Anota un mensaje para el chat de prueba. Dentro de `recogerMensajesPrueba` lo
 * devuelve la acción; fuera (27-nov-2026: el webhook real, cuando el laboratorio
 * responde por WhatsApp por un candidato de prueba, o el cron) queda como evento
 * del proceso y el chat de prueba lo recoge solo (pendientesChatPrueba).
 */
export function anotarMensajePrueba(m: MensajePrueba): void {
  if (!m.texto.trim() && !m.adjuntos?.length) return;
  const lista = almacen.getStore();
  if (lista) return void lista.push(m);
  if (!m.procesoId) return;
  void (async () => {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      await createAdminClient()
        .from("procesos_contratacion_eventos")
        .insert({ proceso_id: m.procesoId, tipo: "dato", detalle: { mensaje_prueba: { clave: m.clave, texto: m.texto, adjuntos: m.adjuntos ?? [] } }, actor: "sistema", usuario_email: "Gestivo (chat de prueba)" });
    } catch (e) {
      console.error("[seleccion] mensaje para el chat de prueba:", e);
    }
  })();
}

/** Pega documentos al último mensaje anotado (o los anota solos). */
export function anotarAdjuntosPrueba(nombres: string[]): void {
  const lista = almacen.getStore();
  if (!lista || !nombres.length) return;
  const ultimo = lista[lista.length - 1];
  if (ultimo) ultimo.adjuntos = [...(ultimo.adjuntos ?? []), ...nombres];
  else lista.push({ clave: "documentos", texto: "", adjuntos: nombres });
}
