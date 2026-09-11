// Tipos del catálogo semántico del servidor MCP de Gestivo.
//
// El catálogo es la documentación que acompaña a cada dato que el MCP entrega a
// un agente de IA: qué representa una fila, qué significa cada columna, en qué
// unidad está, qué valores puede tomar y con qué se puede confundir. Las
// columnas reales (nombre y tipo) se introspectan en vivo; aquí vive el
// significado, que no se puede deducir del esquema.

export type DominioKey =
  | "rotacion"
  | "ausentismo"
  | "accidentabilidad"
  | "reclutamiento"
  | "rrhh"
  | "tesoreria"
  | "gema"
  | "operativo"
  | "mantenimiento"
  | "riesgo"
  | "campanas"
  | "organizacion";

export type DocColumna = {
  /** Qué significa el valor, en lenguaje de negocio. 1-2 frases. */
  descripcion: string;
  /** Unidad del valor: "COP", "días", "km/h", "%", "viajes"… */
  unidad?: string;
  /**
   * Valores posibles. Con objeto, clave = valor literal y valor = significado.
   * Con arreglo, solo los literales (cuando el significado es obvio).
   */
  valores?: Record<string, string> | string[];
  /** Formato o zona horaria: "YYYY-MM-DD en hora de Colombia", "timestamptz UTC"… */
  formato?: string;
  /** Columna de otro recurso a la que apunta: "conductores_con_grupo.cedula". */
  relacion?: string;
  /** Trampa concreta de esta columna (nulos frecuentes, histórico incompleto…). */
  advertencia?: string;
  /**
   * Dato sensible: contacto (teléfono, correo, dirección), salud (diagnóstico,
   * EPS), datos de familiares, finanzas personales, puntajes de riesgo,
   * antecedentes o archivos. Nombre y cédula NO son sensibles: identifican a la
   * persona y sin ellos el agente no puede cruzar datos ni evitar homónimos.
   */
  sensible?: boolean;
};

export type DocRecurso = {
  /** Nombre real de la tabla o vista; debe existir en EXTERNAL_RESOURCES. */
  nombre: string;
  dominio: DominioKey;
  /** Nombre humano corto: "Cierres diarios por conductor". */
  titulo: string;
  /** Una frase para listados: qué es y para qué sirve. */
  resumen: string;
  /** Qué representa exactamente una fila: "Una fila = un conductor en un día". */
  granularidad: string;
  /** Párrafo breve: qué contiene, cómo se alimenta y qué NO contiene. */
  descripcion: string;
  /** De dónde salen los datos y con qué frecuencia se actualizan. */
  origen: string;
  /** Columna que identifica un registro (la de /recurso/<id>). */
  identificador: string;
  /** Columna temporal principal para acotar por fechas, si existe. */
  columnaFecha?: string;
  /** Tamaño aproximado o ritmo de crecimiento, si importa para consultar. */
  volumen?: string;
  /**
   * Columnas que se devuelven cuando el agente no pide columnas: las 5-12 que
   * responden la mayoría de preguntas. Las demás se piden por nombre. Nunca
   * incluir columnas sensibles aquí.
   */
  columnasPorDefecto: string[];
  /**
   * Filtro que el MCP aplica siempre, salvo que el agente lo desactive de forma
   * explícita (p. ej. excluir registros eliminados lógicamente).
   */
  filtroPorDefecto?: {
    columna: string;
    operador: "is" | "eq" | "neq";
    valor: string | boolean | null;
    motivo: string;
  };
  /** Documentación por columna, con la clave = nombre real de la columna. */
  columnas: Record<string, DocColumna>;
  /** Cómo se cruza con otros recursos. */
  relaciones?: { recurso: string; mediante: string; descripcion: string }[];
  /** Trampas del recurso completo que un agente debe conocer antes de concluir. */
  advertencias?: string[];
  /** Recursos parecidos y en qué se diferencian. */
  noConfundirCon?: { recurso: string; diferencia: string }[];
  /** Preguntas frecuentes y cómo responderlas con este recurso. */
  preguntasTipicas?: { pregunta: string; como: string }[];
};

export type TerminoGlosario = {
  termino: string;
  definicion: string;
  /** Recursos y columnas donde aparece. */
  dondeAparece?: string[];
  sinonimos?: string[];
};
