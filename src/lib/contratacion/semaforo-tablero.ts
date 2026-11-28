/**
 * El semáforo de cada tarjeta del tablero (27-nov-2026): en cada etapa, los
 * puntos de lo que esa etapa necesita, para ver de un vistazo dónde está cada
 * persona y qué le falta. Verde: hecho · ámbar: hay que actuar (revisar, una
 * respuesta que no llega) · rojo: no pasa · gris: todavía no. PURO.
 */

export type ColorPunto = "verde" | "ambar" | "rojo" | "gris";

export interface PuntoTablero {
  etiqueta: string;
  color: ColorPunto;
  detalle: string;
  /** Necesita una revisión manual (la tarjeta se destaca con borde rojo). */
  revisar?: boolean;
}

type EstadoFuente = "limpio" | "hallazgo" | "error" | "pendiente" | "sin_consultar";

export interface DatosTarjeta {
  estado: string;
  preseleccion?: Partial<Record<"edad" | "residencia" | "licencia" | "simit", { color?: string; motivo?: string }>> | null;
  autorizacion?: string | null;
  /** Croma no respondió el SIMIT o el RUNT (la última consulta falló). */
  simitSinRespuesta?: boolean;
  runtSinRespuesta?: boolean;
  /** Antecedentes evaluados con las reglas (fuente, estado y lo que dicen las reglas). */
  antecedentes?: { fuentes: { fuente: string; estado: EstadoFuente; accion?: string; motivo?: string }[]; veredicto: string | null; decision: string | null } | null;
  citaPrueba?: { estado: string; fecha: string } | null;
  prueba?: string | null;
  clases?: { total: number; listo: boolean } | null;
  ordenF1?: boolean;
  banco?: string | null;
  rutasRespondidas?: boolean;
  examenF1?: string | null;
  examenF2?: string | null;
  reconocimiento?: string | null;
  aprobacion?: boolean;
}

const NOMBRE_FUENTE: Record<string, string> = { policia: "Policía", procuraduria: "Procuraduría", contraloria: "Contraloría", rnmc: "RNMC" };
const p = (etiqueta: string, color: ColorPunto, detalle: string, revisar = false): PuntoTablero => ({ etiqueta, color, detalle, ...(revisar ? { revisar: true } : {}) });

function puntoPreseleccion(etiqueta: string, r: { color?: string; motivo?: string } | undefined): PuntoTablero {
  const color: ColorPunto = r?.color === "verde" ? "verde" : r?.color === "rojo" ? "rojo" : "gris";
  return p(etiqueta, color, r?.motivo || (color === "gris" ? "Pendiente" : ""));
}

function antecedentesResumen(a: DatosTarjeta["antecedentes"]): PuntoTablero {
  if (!a) return p("Antecedentes", "gris", "Sin consultar");
  if (a.decision === "aprobado") return p("Antecedentes", "verde", "Con el aval de una persona");
  if (a.decision === "rechazado") return p("Antecedentes", "rojo", "Rechazados por una persona");
  if (a.veredicto === "limpio" || a.veredicto === "tolerable") return p("Antecedentes", "verde", a.veredicto === "limpio" ? "Limpios" : "Con hallazgos que se toleran");
  if (a.veredicto === "revision") return p("Antecedentes", "ambar", "Por revisar: falta el aval", true);
  if (a.veredicto === "descarta") return p("Antecedentes", "rojo", "Las reglas proponen cerrar");
  return p("Antecedentes", "gris", "Falta alguna fuente");
}

function examen(etiqueta: string, r: string | null | undefined): PuntoTablero {
  return r === "apto" ? p(etiqueta, "verde", "Apto") : r === "no_apto" ? p(etiqueta, "rojo", "No apto: decidir si sigue", true) : r === "aplazado" ? p(etiqueta, "ambar", "Aplazado", true) : p(etiqueta, "gris", "Sin resultado");
}

function reconocimiento(r: string | null | undefined): PuntoTablero {
  return r === "finalizado"
    ? p("Reconocimiento", "verde", "Terminado")
    : r === "en_curso"
      ? p("Reconocimiento", "ambar", "En curso")
      : r === "por_verificar"
        ? p("Reconocimiento", "ambar", "Dice que conoce las rutas: verificar", true)
        : p("Reconocimiento", "gris", "Por citar");
}

/** Los puntos de la tarjeta según su etapa. Vacío en contratado y cierre. */
export function puntosDeTarjeta(d: DatosTarjeta): PuntoTablero[] {
  switch (d.estado) {
    case "pendiente":
      return [
        puntoPreseleccion("Edad", d.preseleccion?.edad),
        puntoPreseleccion("Residencia", d.preseleccion?.residencia),
        // Sin respuesta de Croma (27-nov-2026): ámbar y a revisión, para que alguien lo revise a mano.
        d.runtSinRespuesta && d.preseleccion?.licencia?.color !== "verde" && d.preseleccion?.licencia?.color !== "rojo"
          ? p("Licencia", "ambar", "Croma no respondió el RUNT: verificarla a mano", true)
          : puntoPreseleccion("Licencia", d.preseleccion?.licencia),
        d.simitSinRespuesta && d.preseleccion?.simit?.color !== "verde" && d.preseleccion?.simit?.color !== "rojo"
          ? p("SIMIT", "ambar", "Croma no respondió el SIMIT: revisarlo a mano", true)
          : puntoPreseleccion("SIMIT", d.preseleccion?.simit),
        d.autorizacion === "si" ? p("Autorización", "verde", "Autorizó el tratamiento de datos") : d.autorizacion === "no" ? p("Autorización", "rojo", "No autorizó") : p("Autorización", "gris", "No ha respondido"),
      ];
    case "antecedentes": {
      const fuentes = ["policia", "procuraduria", "contraloria", "rnmc"].map((f) => {
        const x = d.antecedentes?.fuentes.find((y) => y.fuente === f);
        const nombre = NOMBRE_FUENTE[f];
        if (!x || x.estado === "sin_consultar") return p(nombre, "gris", "Sin consultar");
        if (x.estado === "pendiente") return p(nombre, "gris", "En curso");
        if (x.estado === "error") return p(nombre, "ambar", x.motivo || "No respondió: revisar a mano", true);
        if (x.estado === "limpio") return x.accion === "revision" ? p(nombre, "ambar", x.motivo || "A revisión", true) : p(nombre, "verde", "Limpio");
        if (x.accion === "tolera") return p(nombre, "verde", x.motivo || "Hallazgo que se tolera");
        if (x.accion === "descarta") return p(nombre, "rojo", x.motivo || "Las reglas proponen cerrar", true);
        return p(nombre, "ambar", x.motivo || "Hallazgo: lo revisa una persona", true);
      });
      // Con el aval de una persona, los hallazgos ya están decididos: verdes, sin pedir revisión.
      if (d.antecedentes?.decision === "aprobado") {
        return [...fuentes.map((x) => (x.color === "ambar" || x.color === "rojo" ? p(x.etiqueta, "verde", `Con aval: ${x.detalle}`) : x)), p("Aval", "verde", "Aprobado por una persona")];
      }
      const aval = d.antecedentes?.decision === "aprobado" ? [p("Aval", "verde", "Aprobado por una persona")] : d.antecedentes?.veredicto === "revision" ? [p("Aval", "ambar", "Falta que una persona decida", true)] : [];
      return [...fuentes, ...aval];
    }
    case "citado": {
      const c = d.citaPrueba;
      const cita = !c
        ? p("Cita", "gris", "Sin cita")
        : c.estado === "confirmada"
          ? p("Cita", "verde", `Confirmó (${c.fecha})`)
          : c.estado === "pide_otra_fecha"
            ? p("Cita", "ambar", "Pide otra fecha")
            : c.estado === "no_asistio"
              ? p("Cita", "rojo", "No asistió")
              : p("Cita", "gris", `Sin confirmar (${c.fecha})`);
      return [antecedentesResumen(d.antecedentes), cita];
    }
    case "prueba_manejo":
      return [
        p("Llegó", "verde", "Llegó a la prueba"),
        d.prueba === "aprobo" ? p("Prueba", "verde", "Aprobó") : d.prueba === "escuela" ? p("Prueba", "ambar", "Necesita escuela") : d.prueba === "no_continua" ? p("Prueba", "rojo", "No continúa") : p("Prueba", "gris", "Sin resultado"),
      ];
    case "en_escuela":
      return [
        p("Prueba", "ambar", "Necesita escuela"),
        d.clases?.listo ? p("Clases", "verde", `Listo (${d.clases.total} clases)`) : p("Clases", d.clases?.total ? "ambar" : "gris", d.clases?.total ? `${d.clases.total} ${d.clases.total === 1 ? "clase" : "clases"}` : "Sin clases"),
      ];
    case "en_examenes":
      return [
        d.ordenF1 ? p("Orden", "verde", "Orden enviada al laboratorio") : p("Orden", "gris", "Orden sin enviar"),
        d.banco === "si" || d.banco === "no" ? p("Banco", "verde", d.banco === "si" ? "Tiene cuenta" : "No tiene cuenta: carta enviada") : p("Banco", "gris", "No ha respondido"),
        d.rutasRespondidas ? p("Rutas", "verde", "Dijo cuántas rutas conoce") : p("Rutas", "gris", "No ha respondido"),
        examen("Fase 1", d.examenF1),
        reconocimiento(d.reconocimiento),
      ];
    case "en_examenes_fase2":
      return [examen("Fase 1", d.examenF1), examen("Fase 2", d.examenF2), reconocimiento(d.reconocimiento)];
    case "reconocimiento_ruta":
      return [examen("Fase 2", d.examenF2), reconocimiento(d.reconocimiento)];
    case "listo_contratar":
      return [
        antecedentesResumen(d.antecedentes),
        d.examenF1 === "apto" && d.examenF2 === "apto" ? p("Exámenes", "verde", "Aptos") : p("Exámenes", "ambar", "Revisar exámenes"),
        reconocimiento(d.reconocimiento),
        d.aprobacion ? p("Visto bueno", "verde", "Con visto bueno: contratar") : p("Visto bueno", "ambar", "Falta el visto bueno"),
      ];
    default:
      return [];
  }
}

/** Lo siguiente que falta (el primer punto que no está en verde), para escribirlo bajo los puntos. */
export function siguientePendiente(puntos: readonly PuntoTablero[]): PuntoTablero | null {
  return puntos.find((x) => x.color === "rojo") ?? puntos.find((x) => x.color === "ambar") ?? puntos.find((x) => x.color === "gris") ?? null;
}
