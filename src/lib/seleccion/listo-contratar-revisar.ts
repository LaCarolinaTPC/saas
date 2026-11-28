/**
 * Lo llama quien acaba de cambiar una condición para contratar (un examen, la
 * carpeta, el reconocimiento, la psicotécnica, los antecedentes): pone la etapa
 * «Listo para contratar» de acuerdo con lo que el proceso cumple ahora.
 *
 * Va aparte y con import diferido porque ./listo-contratar-servidor usa las
 * condiciones, y estas usan los mismos módulos que llaman aquí. Nunca lanza:
 * la acción que lo origina ya quedó guardada (y el cron lo repite cada 15 min).
 */
import { ACTOR_SISTEMA, type ActorProceso } from "@/lib/contratacion/servidor";

export async function revisarListoContratar(procesoId: string | null | undefined, actor: ActorProceso = ACTOR_SISTEMA): Promise<void> {
  if (!procesoId) return;
  try {
    const { sincronizarListoContratar } = await import("./listo-contratar-servidor");
    await sincronizarListoContratar(procesoId, actor);
  } catch (e) {
    console.error("[seleccion] listo para contratar:", e);
  }
}
