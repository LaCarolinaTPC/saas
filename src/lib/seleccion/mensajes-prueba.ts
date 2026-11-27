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

/** Anota un mensaje para el chat de prueba (no hace nada fuera de `recogerMensajesPrueba`). */
export function anotarMensajePrueba(m: MensajePrueba): void {
  if (m.texto.trim() || m.adjuntos?.length) almacen.getStore()?.push(m);
}

/** Pega documentos al último mensaje anotado (o los anota solos). */
export function anotarAdjuntosPrueba(nombres: string[]): void {
  const lista = almacen.getStore();
  if (!lista || !nombres.length) return;
  const ultimo = lista[lista.length - 1];
  if (ultimo) ultimo.adjuntos = [...(ultimo.adjuntos ?? []), ...nombres];
  else lista.push({ clave: "documentos", texto: "", adjuntos: nombres });
}
