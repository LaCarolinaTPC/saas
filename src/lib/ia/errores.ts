/**
 * Errores de los proveedores de IA en español. Anthropic, OpenAI y OpenRouter
 * responden en inglés («Insufficient credits…»); lo que ve Gestión Humana en
 * el chat de prueba, en «Probar» y en el registro de ejecuciones del agente
 * debe decir qué pasó y qué hacer.
 */
export type ProveedorError = "anthropic" | "openai" | "openrouter";

const NOMBRE: Record<ProveedorError, string> = { anthropic: "Anthropic", openai: "OpenAI", openrouter: "OpenRouter" };

const RECARGA: Record<ProveedorError, string> = {
  anthropic: "console.anthropic.com → Billing",
  openai: "platform.openai.com → Billing",
  openrouter: "openrouter.ai → Credits",
};

export interface FallaProveedor {
  proveedor: ProveedorError;
  /** Código HTTP; sin él es una falla de red o de tiempo. */
  status?: number;
  /** Mensaje original del proveedor (en inglés). */
  mensaje?: string;
  /** Código de error del proveedor, p. ej. "insufficient_quota" de OpenAI. */
  codigo?: string;
  modelo?: string;
  /** La solicitud superó el tiempo de espera. */
  tiempoAgotado?: boolean;
  /** No hubo conexión con el proveedor. */
  sinConexion?: boolean;
}

/** Mensaje en español con lo que pasó y, si se puede, qué hacer. */
export function errorProveedorLegible(f: FallaProveedor): string {
  const n = NOMBRE[f.proveedor];
  const original = f.mensaje ?? "";
  const modelo = f.modelo ? ` «${f.modelo}»` : "";
  const http = f.status ? ` (HTTP ${f.status})` : "";

  if (f.tiempoAgotado) return `${n} tardó demasiado en responder. Intenta de nuevo en unos segundos.`;
  if (f.sinConexion) return `No se pudo conectar con ${n}. Revisa la conexión a internet o intenta en unos minutos.`;

  // Sin saldo: OpenRouter usa 402; Anthropic, 400 con «credit balance is too
  // low»; OpenAI, 429 con el código insufficient_quota.
  if (/key limit|limit exceeded for this key/i.test(original)) {
    return `La API key de ${n} llegó a su límite de gasto. Súbelo en openrouter.ai → Keys o usa otra key${http}.`;
  }
  if (f.status === 402 || f.codigo === "insufficient_quota" || /insufficient (credits|quota|balance)|credit balance/i.test(original)) {
    return `${n} no tiene saldo. Hay que recargar créditos en ${RECARGA[f.proveedor]}${http}.`;
  }

  switch (f.status) {
    case 400:
      if (/context|too long|maximum.*tokens|prompt is too long/i.test(original)) {
        return `La conversación es demasiado larga para el modelo. Baja la «Memoria de la conversación» del agente${http}.`;
      }
      if (/model/i.test(original)) return `${n} no acepta el modelo${modelo}. Revisa el nombre en la configuración del agente${http}.`;
      return `${n} rechazó la solicitud por datos no válidos${http}.`;
    case 401:
      return `La API key de ${n} no es válida o fue revocada. Revísala en Configuración → Proveedores de IA${http}.`;
    case 403:
      if (/moderat|flagged/i.test(original)) return `${n} bloqueó el mensaje con su filtro de contenido${http}.`;
      return `La API key de ${n} no tiene permiso para usar el modelo${modelo}${http}.`;
    case 404:
      return `${n} no encontró el modelo${modelo} o no hay quien lo sirva. Revisa el nombre en la configuración del agente${http}.`;
    case 408:
      return `${n} tardó demasiado en responder. Intenta de nuevo en unos segundos${http}.`;
    case 413:
      return `La conversación es demasiado larga para el modelo. Baja la «Memoria de la conversación» del agente${http}.`;
    case 429:
      return `${n} está recibiendo demasiadas solicitudes. Intenta de nuevo en un minuto${http}.`;
    case 500:
    case 502:
    case 503:
    case 504:
    case 529:
      return `${n} o el modelo${modelo} no está disponible en este momento. Intenta de nuevo en unos minutos${http}.`;
  }
  return original ? `${n} respondió con un error${http}: ${original}` : `${n} respondió con un error${http}.`;
}

/** Errores de red o de tiempo de fetch (AbortSignal.timeout, «fetch failed»). */
export function fallaDeRed(e: unknown): Pick<FallaProveedor, "tiempoAgotado" | "sinConexion"> | null {
  if (!(e instanceof Error)) return null;
  if (e.name === "TimeoutError" || e.name === "AbortError") return { tiempoAgotado: true };
  if (e instanceof TypeError && /fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN/i.test(`${e.message} ${String(e.cause ?? "")}`)) {
    return { sinConexion: true };
  }
  return null;
}
