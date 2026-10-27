/**
 * Medidas para evitar cada tipo de accidente, según la hipótesis del IPAT
 * (códigos de accidente_catalogos, tipo «factor»). Las usa el carrusel de
 * «Accidentes de ayer» del TV: en cada accidente, una medida concreta para que
 * no se repita. Puro: se prueba con node --test.
 *
 * Los textos van para los conductores, en tono de recordatorio y sin culpar.
 * Si un código no tiene medida propia se usa la de su categoría.
 */

export interface Hipotesis {
  codigo: string;
  /** Texto del catálogo («Adelantar cerrando»). */
  texto: string;
  /** conductor | vehiculo | via | peaton | pasajero | ciclista */
  categoria: string | null;
}

const MEDIDA_CODIGO: Record<string, string> = {
  // Conductor
  "101": "Nunca adelante en curvas ni en pendientes: si no ve la vía libre, no adelante.",
  "102": "Adelante solo por la izquierda y con espacio suficiente; nunca por la derecha.",
  "103": "Al adelantar, vuelva a su carril solo cuando vea por el espejo al vehículo adelantado completo.",
  "104": "No invada el carril contrario para adelantar: espere un tramo recto y despejado.",
  "105": "Donde la línea es continua no se adelanta. Respete la demarcación.",
  "106": "Mantenga su carril; cámbiese solo si es necesario, con direccional y mirando los espejos.",
  "109": "Si no se siente bien de salud, avise antes de salir: no conduzca en esas condiciones.",
  "110": "Respete los descansos: si siente cansancio, avise y deténgase en un lugar seguro.",
  "111": "No deje objetos en la vía; si tiene que detenerse, señalice.",
  "112": "Respete todas las señales y normas de tránsito, aunque la vía parezca despejada.",
  "113": "Siga siempre las indicaciones del agente de tránsito.",
  "114": "Cero alcohol y sustancias: conducir exige estar en plenas condiciones.",
  "115": "Cero alcohol y sustancias: conducir exige estar en plenas condiciones.",
  "116": "Respete los límites. Llegar un minuto antes no vale un accidente.",
  "118": "Haga el preoperacional completo y reporte cualquier falla antes de salir.",
  "119": "Anticípese y frene con suavidad: con distancia suficiente no hace falta frenar en seco.",
  "120": "No lleve sobrecupo ni pasajeros junto al puesto del conductor.",
  "121": "Deje espacio con el vehículo de adelante: al menos tres segundos.",
  "122": "Gire despacio, con direccional, y revise espejos y punto ciego antes de girar.",
  "123": "En intersecciones y giros, reduzca, mire a ambos lados y ceda el paso a quien tiene prelación.",
  "124": "Cambie a luces bajas al cruzarse con otros vehículos.",
  "125": "Estacione solo en sitios permitidos, orillado y señalizado.",
  "126": "Reduzca la velocidad donde pueda haber animales en la vía.",
  "127": "Nunca transite en contravía, ni siquiera por un tramo corto.",
  "128": "Recoja y deje pasajeros solo en paraderos, orillado y con el bus detenido.",
  "129": "No arranque con pasajeros en los estribos o por fuera del bus.",
  "130": "Encienda las luces desde el atardecer y siempre que llueva.",
  "131": "Ajuste la velocidad a la vía y mantenga el bus dentro de su carril.",
  "132": "Ceda el paso a quien tiene prelación: reduzca y mire antes de entrar a la vía.",
  "133": "Calcule bien los giros y las paradas: el bus nunca debe subirse al andén.",
  "134": "Retroceda solo si es necesario, despacio y con alguien que le indique.",
  "138": "Con lluvia, baje la velocidad y aumente la distancia: el bus tarda más en frenar.",
  "139": "Maniobre con calma y sin afán; si una maniobra le genera dudas, pida apoyo o capacitación.",
  "141": "Estacione solo en sitios permitidos, orillado y señalizado.",
  "142": "Con amarillo prepárese para detenerse; con rojo, siempre se detiene.",
  "143": "Antes de arrancar, mire espejos y puertas, y verifique que los pasajeros estén sostenidos.",
  "145": "Antes de arrancar, mire espejos y puertas, y verifique que los pasajeros estén sostenidos.",
  "146": "No haga giros en U donde no están permitidos.",
  "152": "Recoja y deje pasajeros solo en paraderos, orillado y con el bus detenido.",
  "153": "Ajuste y revise los espejos antes de salir.",
  "154": "Arranque solo con las puertas cerradas.",
  // Vehículo
  "201": "Revise las llantas (presión y desgaste) en el preoperacional y reporte cualquier daño.",
  "202": "Si siente los frenos distintos, deténgase en un lugar seguro y repórtelo: no siga la ruta.",
  "203": "Si siente la dirección distinta, deténgase en un lugar seguro y repórtelo.",
  "212": "Reporte de inmediato cualquier falla en las puertas y no ruede con ellas abiertas.",
  "213": "Ajuste y revise los espejos antes de salir; reporte si falta o está dañado alguno.",
  // Vía
  "303": "Con piso liso o mojado, baje la velocidad y aumente la distancia.",
  "304": "Con piso liso o mojado, baje la velocidad y aumente la distancia.",
  "305": "Esté atento a obstáculos y huecos: reduzca la velocidad en vías en mal estado.",
  "306": "Esté atento a obstáculos y huecos: reduzca la velocidad en vías en mal estado.",
  // Peatón
  "402": "Cuidado con peatones que salen por delante de otros vehículos detenidos: reduzca al pasarlos.",
  "409": "Atención a los peatones que cruzan sin mirar: reduzca en cruces y paraderos.",
  // Pasajero
  "501": "No arranque con pasajeros en los estribos o por fuera del bus.",
  "502": "Abra las puertas solo con el bus detenido y arranque cuando todos hayan subido o bajado.",
};

const MEDIDA_CATEGORIA: Record<string, string> = {
  conductor: "Manejo defensivo: guarde la distancia, revise los espejos y anticipe las maniobras de los demás.",
  vehiculo: "Haga el preoperacional completo y reporte cualquier falla antes de salir.",
  via: "Adapte la velocidad al estado de la vía y a la señalización.",
  peaton: "Atención a los peatones: baje la velocidad en cruces, paraderos y zonas escolares.",
  pasajero: "Arranque y frene con suavidad: espere a que los pasajeros suban, bajen y se sostengan.",
  ciclista: "Al pasar ciclistas y motos, deje al menos un metro y medio de espacio.",
};

export const MEDIDA_GENERAL = MEDIDA_CATEGORIA.conductor;

/** Orden en que se elige la hipótesis: primero lo que depende de nuestro conductor y nuestro bus. */
const PRIORIDAD = ["conductor", "vehiculo", "via", "pasajero", "peaton", "ciclista"];
const prioridad = (h: Hipotesis) => {
  const i = PRIORIDAD.indexOf(h.categoria ?? "");
  return i < 0 ? PRIORIDAD.length : i;
};

/** La medida de una hipótesis: la propia del código o la de su categoría (null si no hay ninguna). */
export function medidaDeHipotesis(h: Hipotesis): string | null {
  return MEDIDA_CODIGO[h.codigo] ?? (h.categoria ? MEDIDA_CATEGORIA[h.categoria] ?? null : null);
}

/**
 * Medida para evitar un accidente: la de la hipótesis más relevante (primero
 * las del conductor, luego vehículo, vía, pasajero, peatón y ciclista; a igual
 * categoría, la que tiene medida propia). Sin hipótesis, la general.
 */
export function medidaPreventiva(hipotesis: readonly Hipotesis[]): string {
  const ordenadas = [...hipotesis].sort((a, b) => prioridad(a) - prioridad(b) || Number(!MEDIDA_CODIGO[a.codigo]) - Number(!MEDIDA_CODIGO[b.codigo]));
  for (const h of ordenadas) {
    const m = medidaDeHipotesis(h);
    if (m) return m;
  }
  return MEDIDA_GENERAL;
}
