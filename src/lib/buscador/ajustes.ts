/**
 * Excepciones del índice de pantallas. Casi nada debe venir aquí: una página
 * nueva entra sola con su `titulo`. Una prueba avisa si una ruta de esta lista
 * deja de existir.
 */

/** Páginas que solo redirigen: no son un destino. */
export const EXCLUIR: readonly string[] = [
  "/financiera",
  "/contratacion",
  "/tesoreria/revision-cartulina/solicitudes-camaras",
  // La IA, el canal y los indicadores del WhatsApp pasaron a Candidatos (21-nov-2026).
  "/candidatos/ia",
  "/comunicaciones/agente",
  "/comunicaciones/configuracion",
  "/comunicaciones/indicadores",
];

export interface AjustePantalla {
  titulo?: string;
  /** Sinónimos: lo que alguien escribiría buscando esta pantalla. */
  palabras?: string[];
  /** La página pide más que el permiso de su ruta: basta tener uno de estos. */
  exige?: string[];
}

export const AJUSTES: Readonly<Record<string, AjustePantalla>> = {
  "/candidatos/seleccion": {
    titulo: "Selección de conductores",
    palabras: ["ia", "agente", "asistente", "inteligencia artificial", "prompt", "mensajes", "laboratorios", "tiempos y reglas", "canal", "whatsapp", "webhook", "meta"],
  },
  "/candidatos/indicadores/whatsapp": {
    titulo: "Indicadores de atención del WhatsApp",
    palabras: ["kpi", "estadísticas", "whatsapp", "métricas", "tiempo de respuesta"],
  },
  "/configuracion/usuarios": { palabras: ["roles", "permisos"] },
  "/pantalla": { palabras: ["tv", "televisor", "display"] },
  "/incapacidades/alta-manual": { exige: ["incapacidades.editar"] },
  "/vacantes/nueva": { exige: ["vacantes.crear"] },
  // Los mismos permisos que acepta `rolRecobros` (src/lib/tesoreria/recobros-acceso.ts).
  "/tesoreria/recobros": {
    exige: [
      "tesoreria.cartulina.ver",
      "tesoreria.caja.ver",
      "tesoreria.recobros_incobrable.ver",
      "tesoreria.recobros_subgerencia.ver",
      "tesoreria.recobros_operativo.ver",
      "tesoreria.recobros_correcciones.ver",
    ],
  },
};

/** Opciones del menú lateral escritas a mano, fuera de `NAV_TREE`; las ve cualquier usuario con sesión. */
export const EXTRAS: readonly { href: string; titulo: string; grupo: string; palabras?: string[] }[] = [
  { href: "/cambiar-contrasena", titulo: "Cambiar mi contraseña", grupo: "Mi cuenta", palabras: ["clave", "password"] },
];
