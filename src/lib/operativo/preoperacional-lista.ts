// Lista de chequeo de la revisión preoperacional. Sale del formulario de
// SharePoint que usaba el patio («Revisión Preoperacional»), con sus 34 puntos
// agrupados como allá: motor, exterior, interior, documentos y equipo de
// carretera. Vive en el código, no en la base: cada revisión guarda la
// `VERSION_LISTA` con la que se hizo, y solo se guardan los puntos que
// fallaron, así que cambiar la lista exige subir la versión.
//
// `critico`: si falla, el vehículo queda NO APTO y no sale a prestar el
// servicio. Los demás dejan «Apto con observación».
//
// `conceptos`: nombre en `mantenimiento_conceptos` (migración 20260901201601)
// del reporte de daño que se abre cuando el punto falla. Con más de uno, el
// inspector elige cuál (luces, freno o embrague); el primero es el que se
// propone. Sin conceptos, la falla no va a Mantenimiento (aseo, cinturón,
// equipo, documentos): no es un daño mecánico que el taller repare.

export const VERSION_LISTA = "2026-10";

export type GrupoPreop = "motor" | "exterior" | "interior" | "documentos" | "equipo";

export const GRUPOS_PREOP: { key: GrupoPreop; nombre: string }[] = [
  { key: "motor", nombre: "Motor" },
  { key: "exterior", nombre: "Exterior del bus" },
  { key: "interior", nombre: "Interior del bus" },
  { key: "documentos", nombre: "Documentos" },
  { key: "equipo", nombre: "Equipo de carretera" },
];

export interface PuntoPreop {
  key: string;
  grupo: GrupoPreop;
  nombre: string;
  critico: boolean;
  conceptos: string[];
  /**
   * Tipo de `operativo_documento_tipos` cuya vigencia se revisa sola. El punto
   * en sí es si el documento físico va en el bus.
   */
  documentos?: string[];
}

export const PUNTOS_PREOP: PuntoPreop[] = [
  { key: "aceite", grupo: "motor", nombre: "Nivel de aceite", critico: true, conceptos: ["MOTOR"] },
  { key: "agua", grupo: "motor", nombre: "Nivel de agua", critico: true, conceptos: ["MOTOR"] },
  { key: "freno_liquido", grupo: "motor", nombre: "Sistema de freno y nivel de líquido", critico: true, conceptos: ["FRENOS"] },
  { key: "hidraulico", grupo: "motor", nombre: "Nivel hidráulico", critico: false, conceptos: ["DIRECCION"] },
  { key: "bateria", grupo: "motor", nombre: "Batería (estado de bornes)", critico: false, conceptos: ["ELECTRICO (Otros)"] },

  { key: "vidrios", grupo: "exterior", nombre: "Vidrios panorámicos y ventanillas", critico: false, conceptos: [] },
  { key: "plumillas_estado", grupo: "exterior", nombre: "Estado de las plumillas", critico: false, conceptos: ["ELECTRICO (Otros)"] },
  {
    key: "luces", grupo: "exterior", nombre: "Luces en general", critico: true,
    conceptos: ["LUCES DELANTERAS", "LUCES TRASERAS", "LUCES DIRECCIONALES", "LUCES INTERNAS"],
  },
  { key: "llantas", grupo: "exterior", nombre: "Llantas, tuercas y espárragos", critico: true, conceptos: ["LLANTAS"] },
  { key: "carroceria", grupo: "exterior", nombre: "Carrocería en general y puertas", critico: false, conceptos: [] },
  { key: "tanques_aire", grupo: "exterior", nombre: "Drenar los tanques de aire", critico: false, conceptos: ["FUGA DE AIRE"] },
  { key: "llanta_repuesto", grupo: "exterior", nombre: "Llanta de repuesto", critico: false, conceptos: ["LLANTAS"] },

  { key: "aseo", grupo: "interior", nombre: "Aseo", critico: false, conceptos: [] },
  { key: "silla", grupo: "interior", nombre: "Silla del conductor", critico: false, conceptos: [] },
  { key: "retrovisores", grupo: "interior", nombre: "Retrovisores interior y exteriores", critico: true, conceptos: [] },
  { key: "cinturon", grupo: "interior", nombre: "Cinturón de seguridad", critico: true, conceptos: [] },
  { key: "plumillas_funcion", grupo: "interior", nombre: "Funcionamiento de plumillas", critico: false, conceptos: ["ELECTRICO (Otros)"] },
  { key: "pito", grupo: "interior", nombre: "Pito", critico: false, conceptos: ["ELECTRICO (Otros)"] },
  { key: "puertas", grupo: "interior", nombre: "Apertura y cierre de puertas delantera y trasera", critico: true, conceptos: [] },
  { key: "freno_embrague", grupo: "interior", nombre: "Funcionamiento del freno y embrague", critico: true, conceptos: ["FRENOS", "EMBRAGUE"] },
  { key: "ind_temperatura", grupo: "interior", nombre: "Indicador de temperatura", critico: false, conceptos: ["ELECTRICO (Otros)"] },
  { key: "ind_aceite", grupo: "interior", nombre: "Indicador de aceite", critico: false, conceptos: ["ELECTRICO (Otros)"] },
  { key: "ind_combustible", grupo: "interior", nombre: "Indicador de combustible", critico: false, conceptos: ["ELECTRICO (Otros)"] },
  { key: "ind_aire", grupo: "interior", nombre: "Indicador de presión de aire", critico: true, conceptos: ["FUGA DE AIRE"] },

  // Las vigencias las revisa el sistema (GEMA + documentos cargados en
  // Operativo). SOAT, técnico-mecánica y pólizas se pueden verificar en línea,
  // así que no llevarlos impresos no detiene el bus; las tarjetas sí.
  { key: "doc_tarjeta_operacion", grupo: "documentos", nombre: "Tarjeta de operación", critico: true, conceptos: [], documentos: ["tarjeta_operacion"] },
  { key: "doc_tarjeta_propiedad", grupo: "documentos", nombre: "Tarjeta de propiedad", critico: true, conceptos: [] },
  { key: "doc_soat", grupo: "documentos", nombre: "SOAT", critico: false, conceptos: [], documentos: ["soat"] },
  { key: "doc_polizas", grupo: "documentos", nombre: "Pólizas contractual y extracontractual", critico: false, conceptos: [], documentos: ["poliza_rcc", "poliza_rce"] },
  { key: "doc_tecnomecanica", grupo: "documentos", nombre: "Revisión técnico-mecánica", critico: false, conceptos: [], documentos: ["tecnomecanica"] },

  { key: "extintor", grupo: "equipo", nombre: "Extintor", critico: true, conceptos: [] },
  { key: "botiquin", grupo: "equipo", nombre: "Botiquín de primeros auxilios", critico: false, conceptos: [] },
  { key: "conos", grupo: "equipo", nombre: "Conos", critico: false, conceptos: [] },
  { key: "tacos", grupo: "equipo", nombre: "Tacos para bloquear el vehículo", critico: false, conceptos: [] },
  { key: "martillo", grupo: "equipo", nombre: "Martillo para romper vidrios", critico: false, conceptos: [] },
];

export const PUNTO_POR_KEY: ReadonlyMap<string, PuntoPreop> = new Map(PUNTOS_PREOP.map((p) => [p.key, p]));

/** Texto para el punto en pantalla, Excel y bitácora; la clave si ya no existe en la lista. */
export function nombrePunto(key: string): string {
  return PUNTO_POR_KEY.get(key)?.nombre ?? key;
}
