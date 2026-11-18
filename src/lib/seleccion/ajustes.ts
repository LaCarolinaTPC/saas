/**
 * Ajustes de la selección (N5, B1): tiempos, reglas del semáforo y datos fijos,
 * cada uno con su valor sugerido. Validación pura de lo que edita Gestión
 * Humana, para que nada quede sin sentido (por ejemplo, edad mínima mayor que
 * la máxima o una hora mal escrita).
 */

export interface AjusteSeleccion {
  clave: string;
  grupo: "tiempo" | "regla" | "dato";
  nombre: string;
  orden: number;
  valor: unknown;
  valor_sugerido: unknown;
  /** horas | dias | minutos | hora | numero | pesos | lista | texto */
  unidad: string;
  origen: string | null;
  entrega: number;
  actualizado_por: string | null;
  updated_at: string;
}

/** Límites razonables por clave (lo demás se valida por unidad). */
const RANGOS: Record<string, [number, number]> = {
  reactivacion_aviso1_horas: [1, 168],
  reactivacion_aviso2_horas: [1, 336],
  reactivacion_llamar_horas: [1, 336],
  incomunicado_dias: [1, 60],
  tolerancia_inasistencia_minutos: [0, 240],
  reprogramaciones_max: [0, 10],
  documentos_pendientes_dias: [1, 30],
  edad_minima: [16, 70],
  edad_maxima: [18, 80],
  simit_tope: [0, 100_000_000],
  experiencia_meses: [0, 240],
};

const RANGO_UNIDAD: Record<string, [number, number]> = {
  horas: [0, 720],
  dias: [0, 365],
  minutos: [0, 1440],
  numero: [0, 1000],
  pesos: [0, 1_000_000_000],
};

export type ValidacionAjuste = { ok: true; valor: unknown } | { ok: false; error: string };

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida y normaliza el valor nuevo de un ajuste, mirando también los relacionados. */
export function validarAjuste(a: Pick<AjusteSeleccion, "clave" | "unidad" | "nombre">, valor: unknown, todos: Pick<AjusteSeleccion, "clave" | "valor">[] = []): ValidacionAjuste {
  const otro = (clave: string) => todos.find((t) => t.clave === clave)?.valor;
  switch (a.unidad) {
    case "si_no": {
      const t = String(valor ?? "").trim().toLowerCase();
      if (valor === true || ["true", "si", "sí", "1"].includes(t)) return { ok: true, valor: true };
      if (valor === false || ["false", "no", "0"].includes(t)) return { ok: true, valor: false };
      return { ok: false, error: `${a.nombre}: elija sí o no.` };
    }
    case "hora": {
      const v = String(valor ?? "").trim();
      if (!HORA_RE.test(v)) return { ok: false, error: `${a.nombre}: escriba la hora como HH:MM (24 horas), por ejemplo 08:00.` };
      return { ok: true, valor: v };
    }
    case "lista": {
      const lista = (Array.isArray(valor) ? valor : String(valor ?? "").split(/[,\n]/))
        .map((x) => String(x).trim())
        .filter(Boolean);
      if (!lista.length) return { ok: false, error: `${a.nombre}: no puede quedar vacía.` };
      if (a.clave === "licencias") {
        const malas = lista.filter((l) => !/^[ABC][123]$/i.test(l));
        if (malas.length) return { ok: false, error: `Categorías no válidas: ${malas.join(", ")}. Use A1, A2, B1, B2, B3, C1, C2 o C3.` };
        return { ok: true, valor: [...new Set(lista.map((l) => l.toUpperCase()))] };
      }
      return { ok: true, valor: [...new Set(lista)] };
    }
    case "texto": {
      const v = String(valor ?? "").trim();
      if (v.length > 300) return { ok: false, error: `${a.nombre}: máximo 300 caracteres.` };
      if (a.clave === "enlace_politica" && v && !/^https:\/\/\S+$/.test(v)) {
        return { ok: false, error: "El enlace a la política debe empezar por https://" };
      }
      if (a.clave === "empresa_correo_datos" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return { ok: false, error: "Escriba un correo válido, por ejemplo datospersonales@empresa.com" };
      }
      return { ok: true, valor: v };
    }
    default: {
      // En pesos el punto es separador de miles (3.000.000); en lo demás, decimal (1.5 horas).
      const limpio = String(valor ?? "").replace(a.unidad === "pesos" ? /\D/g : /[^\d.]/g, "");
      const n = typeof valor === "number" ? valor : Number(limpio);
      if (!Number.isFinite(n) || String(valor ?? "").trim() === "") return { ok: false, error: `${a.nombre}: escriba un número.` };
      const [min, max] = RANGOS[a.clave] ?? RANGO_UNIDAD[a.unidad] ?? [0, Number.MAX_SAFE_INTEGER];
      if (n < min || n > max) return { ok: false, error: `${a.nombre}: debe estar entre ${min.toLocaleString("es-CO")} y ${max.toLocaleString("es-CO")}.` };
      const v = a.unidad === "pesos" || a.unidad === "numero" || a.unidad === "dias" || a.unidad === "minutos" ? Math.round(n) : n;
      if (a.clave === "edad_minima" && Number(otro("edad_maxima")) && v >= Number(otro("edad_maxima"))) {
        return { ok: false, error: "La edad mínima debe ser menor que la máxima." };
      }
      if (a.clave === "edad_maxima" && Number(otro("edad_minima")) && v <= Number(otro("edad_minima"))) {
        return { ok: false, error: "La edad máxima debe ser mayor que la mínima." };
      }
      return { ok: true, valor: v };
    }
  }
}

/** Texto legible del valor de un ajuste, para la pantalla y el historial. */
export function mostrarValor(unidad: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (unidad) {
    case "si_no":
      return valor === true || valor === "true" ? "Sí" : "No";
    case "horas":
      return `${valor} ${Number(valor) === 1 ? "hora" : "horas"}`;
    case "dias":
      return `${valor} ${Number(valor) === 1 ? "día" : "días"}`;
    case "minutos":
      return `${valor} minutos`;
    case "pesos":
      return `$${Number(valor).toLocaleString("es-CO")}`;
    case "lista":
      return Array.isArray(valor) ? valor.join(", ") : String(valor);
    default:
      return String(valor);
  }
}
