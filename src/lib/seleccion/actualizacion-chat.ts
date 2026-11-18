/**
 * Qué datos del proceso cambia lo que el aspirante dijo en el chat.
 *
 * Antes solo se llenaban los campos vacíos, y si cambiaba de respuesta (por
 * ejemplo, primero no aceptaba trasladarse y después sí, tras los intentos de
 * convencerlo) el proceso se quedaba con la primera y lo seguía descartando
 * (caso de GH del 17-nov-2026). Ahora vale su última respuesta, salvo en:
 * - los campos que una persona editó a mano en Candidatos (manda lo de GH);
 * - la categoría de la licencia verificada en el RUNT (manda el registro).
 */
export interface DatosProcesoChat {
  edad: number | null;
  ciudad_residencia: string | null;
  dispuesto_traslado: boolean | null;
  licencia_categoria: string | null;
  experiencia_meses: number | null;
}

export type CampoChat = keyof DatosProcesoChat;

export function cambiosDesdeChat(
  actual: DatosProcesoChat & { licencia_verificada_runt?: boolean | null },
  nuevo: DatosProcesoChat,
  editadosAMano: ReadonlySet<string>
): Partial<DatosProcesoChat> {
  const patch: Partial<DatosProcesoChat> = {};
  const campos: CampoChat[] = ["edad", "ciudad_residencia", "dispuesto_traslado", "licencia_categoria", "experiencia_meses"];
  for (const c of campos) {
    const v = nuevo[c];
    if (v == null) continue; // el chat no dijo nada nuevo: no se borra lo que hay
    const antes = actual[c];
    if (antes != null && String(antes).trim().toLowerCase() === String(v).trim().toLowerCase()) continue;
    if (antes != null) {
      if (editadosAMano.has(c)) continue;
      if (c === "licencia_categoria" && actual.licencia_verificada_runt) continue;
    }
    (patch as Record<string, unknown>)[c] = v;
  }
  return patch;
}
