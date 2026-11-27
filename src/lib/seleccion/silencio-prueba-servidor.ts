/**
 * Los pasos de la reactivación (silencio del aspirante) en palabras, para el
 * chat de prueba: lo que saldría, cómo y cuándo. Lo usan «Simular silencio»
 * y el simulador del cron (27-nov-2026). Solo servidor.
 */
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { leerAjustes, leerMensajes, valoresFijos } from "./servidor";
import { primerNombre, renderizarConLineas, parametrosPlantilla } from "./mensajes";
import { tiemposDesdeAjustes } from "./reactivacion";
import { simularSilencio } from "./simulacion";

export interface PasoSilencio {
  horas: number;
  accion: "aviso1" | "aviso2" | "llamar" | "incomunicado";
  /** Cómo saldría: texto libre, plantilla de Meta, borrador para revisar, o no sale. */
  como: "texto" | "plantilla" | "borrador" | "no_sale" | "marca";
  plantilla: string | null;
  estadoPlantilla: string | null;
  texto: string | null;
  nota: string;
}

export async function pasosDeSilencio(p: {
  horas: number;
  ahora?: string | null;
  hojaVida: boolean;
  buscaTrabajo: boolean;
  nombre: string | null;
}): Promise<{ ok: true; pasos: PasoSilencio[]; horario: string } | { ok: false; error: string }> {
  const horas = Math.min(Math.max(Number(p.horas) || 0, 1), 24 * 14);
  const ahora = p.ahora ? new Date(p.ahora) : new Date();
  const [ajustes, mensajes, seguimiento] = await Promise.all([leerAjustes(), leerMensajes(), leerConfigSeguimiento()]);
  if (!mensajes.length) return { ok: false, error: "Falta aplicar la migración del catálogo de selección." };
  const tiempos = tiemposDesdeAjustes(ajustes, seguimiento.config);
  const { pasos } = simularSilencio({
    horas,
    ahora: Number.isNaN(ahora.getTime()) ? new Date() : ahora,
    tiempos,
    hojaVida: !!p.hojaVida,
    buscaTrabajo: p.buscaTrabajo,
    procesoEstado: null,
  });
  const valores = { ...valoresFijos(ajustes), nombre: primerNombre(p.nombre ?? undefined) };
  const salida: PasoSilencio[] = pasos.map((x) => {
    if (x.accion === "llamar") {
      return { ...x, como: "marca", plantilla: null, estadoPlantilla: null, texto: null, nota: "El chat queda marcado «Llamar» en la bandeja para que Gestión Humana lo llame." };
    }
    if (x.accion === "incomunicado") {
      return { ...x, como: "marca", plantilla: null, estadoPlantilla: null, texto: null, nota: "El proceso se cierra con la causa «Incomunicado» (queda en el historial)." };
    }
    const m = mensajes.find((y) => y.clave === (x.accion === "aviso1" ? "reactivacion_1" : "reactivacion_2"))!;
    const texto = renderizarConLineas(m.texto, valores);
    // A las 24 h o más sin que el aspirante escriba, la ventana de WhatsApp ya está cerrada.
    const ventanaAbierta = x.horas < 23.75;
    if (m.modo === "revisar") {
      return { ...x, como: "borrador", plantilla: m.plantilla_nombre, estadoPlantilla: m.plantilla_estado, texto, nota: "Queda sugerido en el chat de la bandeja para que una persona lo revise y lo envíe." };
    }
    if (ventanaAbierta) return { ...x, como: "texto", plantilla: null, estadoPlantilla: null, texto, nota: "Sale como mensaje normal (la ventana de 24 h sigue abierta)." };
    const aprobada = m.plantilla_estado === "APPROVED";
    const params = parametrosPlantilla(m.plantilla_variables, valores);
    if (!aprobada) {
      return { ...x, como: "no_sale", plantilla: m.plantilla_nombre, estadoPlantilla: m.plantilla_estado, texto, nota: "No sale: la ventana está cerrada y Meta todavía no aprueba la plantilla. Se reintenta cada 15 minutos." };
    }
    if (!params) {
      return { ...x, como: "no_sale", plantilla: m.plantilla_nombre, estadoPlantilla: m.plantilla_estado, texto, nota: "No sale: falta el nombre del aspirante para la plantilla." };
    }
    return { ...x, como: "plantilla", plantilla: m.plantilla_nombre, estadoPlantilla: m.plantilla_estado, texto, nota: "Sale como plantilla aprobada de Meta." };
  });
  return { ok: true, pasos: salida, horario: `${seguimiento.config.horaDesde} a ${seguimiento.config.horaHasta}` };
}
