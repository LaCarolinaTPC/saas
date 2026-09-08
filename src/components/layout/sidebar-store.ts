/**
 * Preferencias del menú lateral, guardadas en el navegador del usuario.
 *
 * Mismo patrón que el panel de contacto de Comunicaciones: un store externo
 * que se lee con useSyncExternalStore para que el servidor y la hidratación
 * coincidan (valores por defecto) y el cliente adopte lo guardado justo
 * después, sin parpadeo ni error de hidratación. Sincroniza entre pestañas
 * del mismo navegador a través del evento `storage`.
 *
 * Toda lectura y escritura de localStorage va en try/catch: en incógnito o
 * con el almacenamiento bloqueado el menú funciona igual, solo que no recuerda.
 */

export type ModoSidebar = "expandido" | "iconos";

export type EstadoSidebar = {
  /** Ancho del menú: con texto, o solo iconos con tooltip. */
  modo: ModoSidebar;
  /**
   * Grupos del menú que el usuario dejó abiertos, por su `key`.
   * `true` abierto, `false` cerrado a propósito, ausente = sin preferencia
   * (se abre solo si la página actual pertenece al grupo).
   */
  gruposAbiertos: Record<string, boolean>;
};

const CLAVE = "sidebar.preferencias";

export const ESTADO_SIDEBAR_INICIAL: EstadoSidebar = {
  modo: "expandido",
  gruposAbiertos: {},
};

const oyentes = new Set<() => void>();

// useSyncExternalStore exige que `get` devuelva la misma referencia mientras
// el valor no cambie; por eso se cachea el último JSON leído y su parseo.
let ultimoCrudo: string | null = null;
let ultimoEstado: EstadoSidebar = ESTADO_SIDEBAR_INICIAL;

function esModo(v: unknown): v is ModoSidebar {
  return v === "expandido" || v === "iconos";
}

function normalizar(crudo: string | null): EstadoSidebar {
  if (!crudo) return ESTADO_SIDEBAR_INICIAL;
  try {
    const p = JSON.parse(crudo) as Partial<EstadoSidebar> | null;
    const grupos: Record<string, boolean> = {};
    if (p && typeof p.gruposAbiertos === "object" && p.gruposAbiertos) {
      for (const [k, v] of Object.entries(p.gruposAbiertos)) {
        if (typeof v === "boolean") grupos[k] = v;
      }
    }
    return {
      modo: p && esModo(p.modo) ? p.modo : ESTADO_SIDEBAR_INICIAL.modo,
      gruposAbiertos: grupos,
    };
  } catch {
    return ESTADO_SIDEBAR_INICIAL;
  }
}

// Respaldo en memoria para cuando localStorage no está disponible: el menú
// recuerda dentro de la pestaña aunque no sobreviva a la recarga.
let memoria: string | null = null;

function leerCrudo(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return memoria;
  }
}

export const sidebarStore = {
  subscribe(cb: () => void) {
    oyentes.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      oyentes.delete(cb);
      window.removeEventListener("storage", cb);
    };
  },
  get(): EstadoSidebar {
    const crudo = leerCrudo();
    if (crudo !== ultimoCrudo) {
      ultimoCrudo = crudo;
      ultimoEstado = normalizar(crudo);
    }
    return ultimoEstado;
  },
  getServer(): EstadoSidebar {
    return ESTADO_SIDEBAR_INICIAL;
  },
  set(parcial: Partial<EstadoSidebar>) {
    const siguiente: EstadoSidebar = { ...sidebarStore.get(), ...parcial };
    const crudo = JSON.stringify(siguiente);
    memoria = crudo;
    try {
      localStorage.setItem(CLAVE, crudo);
    } catch {
      /* sin localStorage: queda solo en memoria */
    }
    oyentes.forEach((cb) => cb());
  },
};
