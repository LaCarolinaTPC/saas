/**
 * Croquis del accidente — reglas puras (sin React ni servidor).
 *
 * Reproduce la página 2 del formato GO-R-16, «Reporte gráfico (IPAT)»: una
 * cuadrícula con rosa de los vientos. El dibujo se guarda como datos
 * (`accidentes.croquis_json`) para reabrirlo y corregirlo; la imagen PNG se
 * genera en el navegador a partir de estos mismos datos.
 *
 * Coordenadas: lienzo de ANCHO × ALTO unidades, PX_POR_METRO unidades por
 * metro (40 m × 30 m), así las figuras tienen su tamaño real y el croquis
 * queda a escala aunque se dibuje con el dedo.
 */

export const ANCHO = 800;
export const ALTO = 600;
export const PX_POR_METRO = 20;
/** Lado de la cuadrícula: 1 m, como los cuadros del formato en papel. */
export const CUADRO = PX_POR_METRO;
export const MAX_ELEMENTOS = 120;
const MAX_TEXTO = 40;

// ── Plantillas de vía ───────────────────────────────────────────────────────

export const PLANTILLAS = {
  vacia: "Cuadrícula vacía",
  recta2: "Vía recta · 2 carriles",
  recta4: "Vía recta · 4 carriles con separador",
  cruce: "Cruce en +",
  t: "Cruce en T",
  glorieta: "Glorieta",
  curva: "Curva",
} as const;
export type Plantilla = keyof typeof PLANTILLAS;

/** Ancho de carril estándar en Colombia (3,5 m). */
export const CARRIL = 3.5 * PX_POR_METRO;

// ── Figuras ─────────────────────────────────────────────────────────────────

/** Medidas reales aproximadas (largo × ancho, en metros). */
export const FIGURAS = {
  bus: { label: "Bus / buseta", largo: 9, ancho: 2.5 },
  carro: { label: "Carro", largo: 4.5, ancho: 1.8 },
  camion: { label: "Camión", largo: 8, ancho: 2.5 },
  moto: { label: "Moto", largo: 2, ancho: 0.8 },
  bicicleta: { label: "Bicicleta", largo: 1.8, ancho: 0.6 },
  peaton: { label: "Peatón", largo: 0.6, ancho: 0.6 },
} as const;
export type Figura = keyof typeof FIGURAS;

export const SENALES = {
  pare: "Pare",
  semaforo: "Semáforo",
  cebra: "Paso de cebra",
} as const;
export type Senal = keyof typeof SENALES;

/** Líneas que se trazan a mano para dibujar la calle cuando ninguna plantilla sirve. */
export const TRAZOS = {
  borde: "Borde de vía",
  carril: "Línea de carril",
  lapiz: "Lápiz (trazo libre)",
} as const;
export type EstiloTrazo = keyof typeof TRAZOS;
/** Máximo de puntos de un trazo (el lápiz se simplifica por debajo de esto). */
export const MAX_PUNTOS = 200;

/** Tipo de vehículo del catálogo (paso 6, terceros) → figura del croquis. */
export function figuraDesdeTipo(tipo: string | null | undefined): Figura {
  switch ((tipo ?? "").toLowerCase()) {
    case "bus":
    case "buseta":
      return "bus";
    case "camion":
    case "mula":
    case "furgon":
      return "camion";
    case "moto":
    case "motocarro":
      return "moto";
    case "bicicleta":
      return "bicicleta";
    default:
      // automóvil, camioneta, campero, vans, ambulancia, tracción animal o vacío
      return "carro";
  }
}

// ── Modelo del dibujo ───────────────────────────────────────────────────────

type Base = { id: string };
export type Elemento =
  | (Base & {
      tipo: "vehiculo";
      figura: Figura;
      /** V1 es el vehículo de la empresa; V2… los terceros; P1… los peatones. */
      etiqueta: string;
      x: number;
      y: number;
      rot: number;
      /** «previa» = antes del choque (línea punteada); «final» = posición final. */
      posicion: "final" | "previa";
    })
  | (Base & { tipo: "flecha"; x1: number; y1: number; x2: number; y2: number })
  | (Base & { tipo: "impacto"; x: number; y: number })
  | (Base & { tipo: "texto"; x: number; y: number; rot: number; texto: string })
  | (Base & { tipo: "senal"; senal: Senal; x: number; y: number; rot: number })
  /** Polilínea: [x1, y1, x2, y2, …]. Las rectas tienen 2 puntos; el lápiz, varios. */
  | (Base & { tipo: "trazo"; estilo: EstiloTrazo; puntos: number[] });

export type Croquis = {
  version: 1;
  plantilla: Plantilla;
  /** Giro de la vía (grados) para alinearla con la calle real. */
  rotVia: number;
  /** Hacia dónde apunta el norte (grados, 0 = arriba), como la rosa del formato. */
  norte: number;
  elementos: Elemento[];
};

export const croquisVacio = (plantilla: Plantilla = "vacia"): Croquis => ({
  version: 1,
  plantilla,
  rotVia: 0,
  norte: 0,
  elementos: [],
});

// ── Vehículos del reporte ───────────────────────────────────────────────────

export type VehiculoCroquis = { etiqueta: string; figura: Figura; descripcion: string };

/**
 * Vehículos que el croquis ofrece para arrastrar, numerados como en el
 * reporte: V1 el de la empresa, V2… los terceros en el orden del paso 6.
 */
export function vehiculosDelReporte(
  propio: { codigo?: string | null; placa?: string | null },
  terceros: { placa?: string | null; tipo_vehiculo?: string | null }[],
): VehiculoCroquis[] {
  const bus = [propio.codigo?.trim() && `Bus ${propio.codigo.trim()}`, propio.placa?.trim()]
    .filter(Boolean)
    .join(" · ");
  return [
    { etiqueta: "V1", figura: "bus", descripcion: bus || "Vehículo de la empresa" },
    ...terceros.map((t, i) => {
      const figura = figuraDesdeTipo(t.tipo_vehiculo);
      return {
        etiqueta: `V${i + 2}`,
        figura,
        descripcion: [FIGURAS[figura].label, t.placa?.trim().toUpperCase()].filter(Boolean).join(" "),
      };
    }),
  ];
}

/** Siguiente etiqueta libre para una figura agregada a mano (V5, P2…). */
export function siguienteEtiqueta(elementos: Elemento[], figura: Figura): string {
  const prefijo = figura === "peaton" ? "P" : "V";
  const usados = new Set(
    elementos.flatMap((e) => (e.tipo === "vehiculo" ? [e.etiqueta] : [])),
  );
  let n = 1;
  while (usados.has(`${prefijo}${n}`)) n++;
  return `${prefijo}${n}`;
}

/**
 * Leyenda bajo el croquis: una línea por etiqueta presente, con la
 * descripción del reporte si la hay. Orden V1, V2…, luego P1…
 */
export function leyenda(croquis: Croquis, vehiculos: VehiculoCroquis[]): string[] {
  const porEtiqueta = new Map(vehiculos.map((v) => [v.etiqueta, v.descripcion]));
  const etiquetas = new Map<string, Figura>();
  for (const e of croquis.elementos) {
    if (e.tipo === "vehiculo" && !etiquetas.has(e.etiqueta)) etiquetas.set(e.etiqueta, e.figura);
  }
  const orden = (s: string) => (s.startsWith("P") ? 1000 : 0) + (parseInt(s.slice(1), 10) || 0);
  return [...etiquetas.entries()]
    .sort(([a], [b]) => orden(a) - orden(b))
    .map(([et, fig]) => `${et} = ${porEtiqueta.get(et) ?? FIGURAS[fig].label}`);
}

// ── Trazos ──────────────────────────────────────────────────────────────────

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Largo total de un trazo, en unidades del lienzo. */
export function largoTrazo(puntos: number[]): number {
  let l = 0;
  for (let i = 2; i + 1 < puntos.length; i += 2) l += dist(puntos[i - 2], puntos[i - 1], puntos[i], puntos[i + 1]);
  return l;
}

/**
 * Simplifica un trazo a mano alzada: descarta puntos a menos de `minimo` del
 * último conservado y, si aún son demasiados, toma uno de cada n. Siempre
 * conserva el primero y el último.
 */
export function simplificarTrazo(puntos: number[], minimo = 6, max = MAX_PUNTOS): number[] {
  const n = Math.floor(puntos.length / 2);
  if (n <= 2) return puntos.slice(0, n * 2);
  const out = [puntos[0], puntos[1]];
  for (let i = 1; i < n - 1; i++) {
    const x = puntos[2 * i], y = puntos[2 * i + 1];
    if (dist(x, y, out[out.length - 2], out[out.length - 1]) >= minimo) out.push(x, y);
  }
  out.push(puntos[2 * n - 2], puntos[2 * n - 1]);
  const m = out.length / 2;
  if (m <= max) return out;
  const paso = Math.ceil((m - 2) / (max - 2));
  const red = [out[0], out[1]];
  for (let i = paso; i < m - 1; i += paso) red.push(out[2 * i], out[2 * i + 1]);
  red.push(out[2 * m - 2], out[2 * m - 1]);
  return red;
}

/**
 * Ajuste de un punto de recta: al extremo de otro trazo si está a menos de
 * `radio` (para que las líneas de la calle queden unidas); si no, a la
 * cuadrícula de medio metro.
 */
export function ajustarPunto(
  x: number,
  y: number,
  elementos: Elemento[],
  ignorar: string | null,
  radio = 14,
): { x: number; y: number } {
  let mejor: { x: number; y: number; d: number } | null = null;
  for (const e of elementos) {
    if (e.tipo !== "trazo" || e.id === ignorar) continue;
    const k = e.puntos.length;
    for (const [px, py] of [[e.puntos[0], e.puntos[1]], [e.puntos[k - 2], e.puntos[k - 1]]]) {
      const d = dist(x, y, px, py);
      if (d <= radio && (!mejor || d < mejor.d)) mejor = { x: px, y: py, d };
    }
  }
  if (mejor) return { x: mejor.x, y: mejor.y };
  const medio = PX_POR_METRO / 2;
  return { x: Math.round(x / medio) * medio, y: Math.round(y / medio) * medio };
}

export const tieneDibujo = (c: Croquis | null) => Boolean(c && (c.elementos.length > 0 || c.plantilla !== "vacia"));

// ── Validación de lo que llega del celular ──────────────────────────────────

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;
const grados = (v: unknown) => {
  const n = num(v, -100000, 100000);
  return n == null ? 0 : ((n % 360) + 360) % 360;
};
const enLienzo = (v: unknown, lado: number) => num(v, -lado, 2 * lado);
const texto = (v: unknown) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, MAX_TEXTO) : "");
const id = (v: unknown, i: number) =>
  typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : `e${i}`;

function elemento(v: unknown, i: number): Elemento | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const x = enLienzo(o.x, ANCHO);
  const y = enLienzo(o.y, ALTO);
  switch (o.tipo) {
    case "vehiculo": {
      if (x == null || y == null || typeof o.figura !== "string" || !(o.figura in FIGURAS)) return null;
      const etiqueta = typeof o.etiqueta === "string" && /^[VP]\d{1,2}$/.test(o.etiqueta) ? o.etiqueta : null;
      if (!etiqueta) return null;
      return {
        id: id(o.id, i), tipo: "vehiculo", figura: o.figura as Figura, etiqueta, x, y,
        rot: grados(o.rot), posicion: o.posicion === "previa" ? "previa" : "final",
      };
    }
    case "flecha": {
      const x1 = enLienzo(o.x1, ANCHO), y1 = enLienzo(o.y1, ALTO);
      const x2 = enLienzo(o.x2, ANCHO), y2 = enLienzo(o.y2, ALTO);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
      return { id: id(o.id, i), tipo: "flecha", x1, y1, x2, y2 };
    }
    case "impacto":
      return x == null || y == null ? null : { id: id(o.id, i), tipo: "impacto", x, y };
    case "texto": {
      const t = texto(o.texto);
      return x == null || y == null || !t ? null : { id: id(o.id, i), tipo: "texto", x, y, rot: grados(o.rot), texto: t };
    }
    case "senal":
      if (x == null || y == null || typeof o.senal !== "string" || !(o.senal in SENALES)) return null;
      return { id: id(o.id, i), tipo: "senal", senal: o.senal as Senal, x, y, rot: grados(o.rot) };
    case "trazo": {
      if (typeof o.estilo !== "string" || !(o.estilo in TRAZOS) || !Array.isArray(o.puntos)) return null;
      const crudos = o.puntos as unknown[];
      if (crudos.length < 4 || crudos.length % 2 !== 0 || crudos.length > 2 * MAX_PUNTOS) return null;
      const puntos = crudos.map((v, k) => enLienzo(v, k % 2 === 0 ? ANCHO : ALTO));
      if (puntos.some((v) => v == null)) return null;
      return { id: id(o.id, i), tipo: "trazo", estilo: o.estilo as EstiloTrazo, puntos: puntos as number[] };
    }
    default:
      return null;
  }
}

/** Croquis saneado, o null si no es un croquis. Descarta elementos inválidos. */
export function validarCroquis(v: unknown): Croquis | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1 || typeof o.plantilla !== "string" || !(o.plantilla in PLANTILLAS)) return null;
  const elementos = Array.isArray(o.elementos)
    ? o.elementos.slice(0, MAX_ELEMENTOS).map(elemento).filter((e): e is Elemento => e !== null)
    : [];
  return { version: 1, plantilla: o.plantilla as Plantilla, rotVia: grados(o.rotVia), norte: grados(o.norte), elementos };
}

/** Ruta que deja la carga del croquis en el bucket privado `accidentes`. */
export function rutaDeCroquis(v: unknown): string | null {
  return typeof v === "string" && /^croquis\/[0-9a-f-]{36}\.png$/i.test(v) ? v : null;
}
