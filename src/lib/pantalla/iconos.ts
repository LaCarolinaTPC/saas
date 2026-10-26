/**
 * Íconos vectoriales para las diapositivas (PURO: solo claves y nombres).
 *
 * A diferencia de los emoticonos, son trazos de un solo color: se pintan del
 * color que se elija, se ven nítidos a cualquier tamaño y dan un aspecto de
 * señalética. El dibujo sale de lucide-react (ya instalado); la tabla clave →
 * componente vive en `components/pantalla/iconos-lucide.tsx`, para que este
 * archivo no dependa de React y se pueda probar.
 */

export type GrupoIcono = "publico" | "rutas" | "vehiculos" | "seguridad" | "taller" | "avisos";

export const GRUPOS_ICONO: { clave: GrupoIcono; nombre: string }[] = [
  { clave: "publico", nombre: "Transporte público" },
  { clave: "rutas", nombre: "Rutas y paradas" },
  { clave: "vehiculos", nombre: "Vehículos" },
  { clave: "seguridad", nombre: "Seguridad vial" },
  { clave: "taller", nombre: "Taller y energía" },
  { clave: "avisos", nombre: "Avisos" },
];

/** clave → [nombre visible, grupo, palabras para buscar]. */
export const ICONOS = {
  // Transporte público
  bus_frente: ["Bus de frente", "publico", "buseta autobus"],
  bus: ["Bus", "publico", "buseta autobus"],
  tren: ["Tren", "publico", "ferrocarril"],
  metro: ["Metro", "publico", "subterraneo tunel"],
  tranvia: ["Tranvía", "publico", "tren ligero"],
  cable: ["Cable aéreo", "publico", "metrocable teleferico"],
  taxi: ["Taxi", "publico", "carro"],
  tiquete: ["Tiquete", "publico", "pasaje boleto"],
  tiquete_ok: ["Tiquete validado", "publico", "pasaje boleto"],
  tarjeta: ["Tarjeta", "publico", "pago recarga"],
  billetera: ["Billetera", "publico", "pago dinero"],
  monedas: ["Monedas", "publico", "pago efectivo pasaje"],
  pasajeros: ["Pasajeros", "publico", "personas usuarios"],
  accesible: ["Accesible", "publico", "discapacidad silla de ruedas"],
  bebe: ["Bebé", "publico", "niño prioridad"],
  silla: ["Silla", "publico", "asiento puesto"],
  puerta: ["Puerta", "publico", "entrada salida"],
  equipaje: ["Equipaje", "publico", "maleta"],
  morral: ["Morral", "publico", "maleta"],
  wifi: ["Wifi", "publico", "internet"],
  // Rutas y paradas
  ruta: ["Ruta", "rutas", "recorrido camino"],
  mapa: ["Mapa", "rutas", "plano"],
  ubicacion: ["Ubicación", "rutas", "punto lugar"],
  parada: ["Parada", "rutas", "paradero punto"],
  navegacion: ["Navegación", "rutas", "direccion gps"],
  senal: ["Señal", "rutas", "direccion poste"],
  senal_grande: ["Señal grande", "rutas", "direccion"],
  hito: ["Hito", "rutas", "kilometro"],
  recorrido: ["Recorrido", "rutas", "paradas puntos"],
  ida_vuelta: ["Ida y vuelta", "rutas", "regreso"],
  circular: ["Ruta circular", "rutas", "repetir vuelta"],
  hora: ["Hora", "rutas", "reloj tiempo"],
  horario: ["Horario", "rutas", "calendario frecuencia"],
  cronometro: ["Cronómetro", "rutas", "tiempo puntualidad"],
  espera: ["Espera", "rutas", "reloj de arena demora"],
  terminal: ["Terminal", "rutas", "edificio estacion"],
  tienda: ["Tienda", "rutas", "local comercio"],
  hospital: ["Hospital", "rutas", "clinica salud"],
  colegio: ["Colegio", "rutas", "escuela"],
  institucion: ["Institución", "rutas", "edificio publico"],
  // Vehículos
  carro: ["Carro", "vehiculos", "automovil"],
  carro_frente: ["Carro de frente", "vehiculos", "automovil"],
  camion: ["Camión", "vehiculos", "carga"],
  ambulancia: ["Ambulancia", "vehiculos", "emergencia"],
  moto: ["Moto", "vehiculos", "motocicleta"],
  bicicleta: ["Bicicleta", "vehiculos", "cicla"],
  avion: ["Avión", "vehiculos", "aeropuerto"],
  barco: ["Barco", "vehiculos", "ferry"],
  tractor: ["Tractor", "vehiculos", "maquinaria"],
  montacargas: ["Montacargas", "vehiculos", "maquinaria"],
  // Seguridad vial
  cono: ["Cono", "seguridad", "obra precaucion"],
  obra: ["Obra", "seguridad", "construccion desvio"],
  alerta: ["Alerta", "seguridad", "precaucion peligro"],
  alerta_octagono: ["Alerta grave", "seguridad", "peligro"],
  pare: ["Pare", "seguridad", "detenerse stop"],
  prohibido: ["Prohibido", "seguridad", "no permitido"],
  sirena: ["Sirena", "seguridad", "emergencia"],
  escudo: ["Protección", "seguridad", "seguro proteger"],
  casco: ["Casco", "seguridad", "dotacion epp"],
  velocimetro: ["Velocímetro", "seguridad", "velocidad limite"],
  huellas: ["Peatones", "seguridad", "caminar paso"],
  peaton: ["Peatón", "seguridad", "persona caminando"],
  sin_celular: ["Sin celular", "seguridad", "telefono prohibido"],
  sin_cigarrillo: ["No fumar", "seguridad", "cigarrillo prohibido"],
  atencion: ["Atención", "seguridad", "ojo mirar"],
  fatiga: ["Fatiga", "seguridad", "sueño cansancio descanso noche"],
  reja: ["Reja", "seguridad", "barrera"],
  lluvia: ["Lluvia", "seguridad", "clima mojado"],
  paraguas: ["Paraguas", "seguridad", "lluvia clima"],
  // Taller y energía
  combustible: ["Combustible", "taller", "gasolina acpm tanqueo"],
  parqueadero: ["Parqueadero", "taller", "parqueo estacionamiento"],
  llave: ["Llave", "taller", "mantenimiento herramienta"],
  engranaje: ["Engranaje", "taller", "mecanica ajuste"],
  carga: ["Carga eléctrica", "taller", "bateria electrico"],
  electrico: ["Eléctrico", "taller", "energia rayo"],
  ecologico: ["Ecológico", "taller", "hoja ambiente"],
  camara: ["Cámara", "taller", "video vigilancia"],
  agua: ["Agua", "taller", "lavado gotas"],
  // Avisos
  diadema: ["Atención al usuario", "avisos", "servicio soporte"],
  telefono: ["Teléfono", "avisos", "llamada contacto"],
  campana: ["Campana", "avisos", "aviso recordatorio"],
  megafono: ["Megáfono", "avisos", "anuncio comunicado"],
  info: ["Información", "avisos", "dato"],
  ayuda: ["Ayuda", "avisos", "pregunta duda"],
  correcto: ["Correcto", "avisos", "bien ok visto"],
  incorrecto: ["Incorrecto", "avisos", "mal error"],
  pulgar: ["Bien hecho", "avisos", "like aprobado"],
  premio: ["Premio", "avisos", "reconocimiento"],
  trofeo: ["Trofeo", "avisos", "ganador"],
  estrella: ["Estrella", "avisos", "destacado"],
  corazon: ["Corazón", "avisos", "salud gracias"],
  mano: ["Mano", "avisos", "alto saludo"],
} as const satisfies Record<string, readonly [string, GrupoIcono, string]>;

export type ClaveIcono = keyof typeof ICONOS;
export const CLAVES_ICONO = Object.keys(ICONOS) as ClaveIcono[];

export function esIcono(v: unknown): v is ClaveIcono {
  return typeof v === "string" && v in ICONOS;
}

export const nombreIcono = (k: ClaveIcono) => ICONOS[k][0];
export const grupoIcono = (k: ClaveIcono) => ICONOS[k][1];

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Íconos que coinciden con lo que se escribe (nombre o palabras clave, sin tildes). */
export function buscarIconos(texto: string): ClaveIcono[] {
  const q = normalizar(texto.trim());
  if (!q) return CLAVES_ICONO;
  return CLAVES_ICONO.filter((k) => normalizar(`${ICONOS[k][0]} ${ICONOS[k][2]} ${k}`).includes(q));
}

export const FONDOS_ICONO = { ninguno: "Sin fondo", circulo: "Círculo", cuadrado: "Cuadrado" } as const;
export type FondoIcono = keyof typeof FONDOS_ICONO;
