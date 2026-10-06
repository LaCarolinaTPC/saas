// ============================================================================
// Formato de investigación de accidentes — tipos y catálogos compartidos
// (cliente + servidor). Los catálogos que cambian por ciudad o entidad
// (ciudades, códigos de tránsito, tipos de vehículo, aseguradoras) viven en la
// tabla `accidente_catalogos`; aquí solo quedan los que fija el formato.
// ============================================================================

import type { Lesionados } from "./policy";

export type TipoCatalogo = "ciudad" | "factor" | "tipo_vehiculo" | "aseguradora";

/** Factores de la Política de Correctivos que un código de tránsito puede activar. */
export type FactorPolitica =
  | "exceso_velocidad"
  | "no_guardar_distancia"
  | "fatiga_comprobada"
  | "uso_celular";

export type CatalogoItem = {
  id: string;
  tipo: TipoCatalogo;
  codigo: string;
  label: string;
  categoria: string | null;
  factor_politica: FactorPolitica | null;
  orden: number;
  activo: boolean;
};

export type Catalogos = Record<TipoCatalogo, CatalogoItem[]>;

export const TIPOS_CATALOGO: { value: TipoCatalogo; label: string; ayuda: string }[] = [
  { value: "ciudad", label: "Ciudades", ayuda: "Ciudades donde opera el servicio; son las opciones de «Ciudad donde ocurrió»." },
  { value: "factor", label: "Códigos de tránsito", ayuda: "Factores e hipótesis del accidente (formato IPAT)." },
  { value: "tipo_vehiculo", label: "Tipos de vehículo", ayuda: "Opciones de tipo de vehículo del tercero." },
  { value: "aseguradora", label: "Aseguradoras", ayuda: "Aseguradoras con abogado que atiende los accidentes." },
];

/** Grupos de los códigos de tránsito, en el orden del formato. */
export const CATEGORIAS_FACTOR: { value: string; label: string }[] = [
  { value: "conductor", label: "Del conductor en general" },
  { value: "vehiculo", label: "Del vehículo" },
  { value: "via", label: "De la vía" },
  { value: "peaton", label: "Del peatón" },
  { value: "pasajero", label: "Del pasajero o acompañante" },
  { value: "ciclista", label: "Del ciclista o motociclista" },
];

export const FACTORES_POLITICA: { value: FactorPolitica; label: string }[] = [
  { value: "exceso_velocidad", label: "Exceso de velocidad" },
  { value: "no_guardar_distancia", label: "No guardar distancia" },
  { value: "fatiga_comprobada", label: "Fatiga comprobada" },
  { value: "uso_celular", label: "Uso de celular" },
];

export type ClaseAccidente = "simple" | "lesionado" | "muerto";

export const CLASE_ACCIDENTE: Record<ClaseAccidente, string> = {
  simple: "Simple",
  lesionado: "Con lesionado",
  muerto: "Con muerto",
};

/** La clase del formato se deriva de los lesionados que ya pide el reporte. */
export function claseDesdeLesionados(l: Lesionados | null | undefined): ClaseAccidente | null {
  if (!l) return null;
  if (l === "ninguno") return "simple";
  if (l === "fatal") return "muerto";
  return "lesionado";
}

export const CLASE_VEHICULO: { value: string; label: string }[] = [
  { value: "particular", label: "Particular" },
  { value: "publico", label: "Público" },
  { value: "oficial", label: "Oficial" },
];

export const CONDICION_VICTIMA: { value: string; label: string }[] = [
  { value: "usuario", label: "Usuario (pasajero)" },
  { value: "peaton", label: "Peatón" },
  { value: "en_vehiculo", label: "En otro vehículo" },
];

export function labelDe(lista: { value: string; label: string }[], v: string | null | undefined) {
  return lista.find((x) => x.value === v)?.label ?? null;
}

// ── Estado del formulario (compartido entre el reporte y la edición) ────────

export type Tercero = {
  placa: string;
  descripcion: string;
  clase_vehiculo: string;
  tipo_vehiculo: string;
  color: string;
  modelo: string;
  conductor_nombre: string;
  conductor_cedula: string;
  conductor_celular: string;
  conductor_direccion: string;
  propietario_nombre: string;
  propietario_telefono: string;
  propietario_direccion: string;
  aseguradora: string;
  afiliado_a: string;
};

export const terceroVacio = (): Tercero => ({
  placa: "", descripcion: "", clase_vehiculo: "", tipo_vehiculo: "", color: "", modelo: "",
  conductor_nombre: "", conductor_cedula: "", conductor_celular: "", conductor_direccion: "",
  propietario_nombre: "", propietario_telefono: "", propietario_direccion: "",
  aseguradora: "", afiliado_a: "",
});

export type Victima = {
  nombre: string;
  cedula: string;
  direccion: string;
  municipio: string;
  telefono: string;
  condicion: string;
  fallecido: boolean;
};

export const victimaVacia = (): Victima => ({
  nombre: "", cedula: "", direccion: "", municipio: "", telefono: "", condicion: "", fallecido: false,
});

/** Sí / No / sin responder. */
export type SiNo = boolean | null;

export type VehiculoPropio = {
  codigo: string;
  placa: string;
  ruta: string;
  empresa: SiNo;
  afiliado: SiNo;
  inmovilizacion: SiNo;
  transaccion: SiNo;
  tiene_fotos: SiNo;
  tiene_ipat: SiNo;
  ipat_numero: string;
  huella_frenado: string;
  huella_arrastre: string;
  velocidad: string;
};

export const vehiculoPropioVacio = (): VehiculoPropio => ({
  codigo: "", placa: "", ruta: "",
  empresa: null, afiliado: null, inmovilizacion: null, transaccion: null,
  tiene_fotos: null, tiene_ipat: null,
  ipat_numero: "", huella_frenado: "", huella_arrastre: "", velocidad: "",
});

export type Agente = { nombre: string; placa: string; celular: string };

/** Datos del formato que se envían al guardar (reporte nuevo o edición). */
export type FormatoPayload = {
  vehiculo_propio: VehiculoPropio;
  factores_codigos: string[];
  uso_celular: boolean;
  terceros: Tercero[];
  victimas: Victima[];
  agente: Agente;
};

/**
 * Banderas de la Política de Correctivos a partir de los códigos marcados.
 * El catálogo dice qué código activa cada factor; uso de celular no tiene
 * código de tránsito y llega como casilla aparte.
 */
export function flagsDesdeCodigos(
  codigos: string[],
  factores: Pick<CatalogoItem, "codigo" | "factor_politica">[],
  usoCelular: boolean
) {
  const activos = new Set(
    factores.filter((f) => f.factor_politica && codigos.includes(f.codigo)).map((f) => f.factor_politica)
  );
  return {
    exceso_velocidad: activos.has("exceso_velocidad"),
    uso_celular: usoCelular || activos.has("uso_celular"),
    no_guardar_distancia: activos.has("no_guardar_distancia"),
    fatiga_comprobada: activos.has("fatiga_comprobada"),
  };
}

type Fila = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const b = (v: unknown): SiNo => (v === true || v === false ? v : null);

/**
 * Estado del formulario a partir de un reporte guardado. Adapta los reportes
 * anteriores al formato: el vehículo marcado como propio pasa a ser el
 * vehículo de la empresa, el peatón pasa a la lista de víctimas y los
 * factores fijos se traducen a sus códigos de tránsito.
 */
export function formatoDesdeRegistro(
  a: Fila,
  vehiculos: Fila[],
  victimas: Fila[],
  factores: Pick<CatalogoItem, "codigo" | "factor_politica">[]
): FormatoPayload {
  const propio = vehiculos.find((v) => v.es_propio);
  let codigos = Array.isArray(a.factores_codigos) ? (a.factores_codigos as string[]) : [];
  if (codigos.length === 0) {
    const legado: [unknown, FactorPolitica][] = [
      [a.fact_exceso_velocidad, "exceso_velocidad"],
      [a.fact_no_distancia, "no_guardar_distancia"],
      [a.fact_fatiga, "fatiga_comprobada"],
    ];
    codigos = legado.flatMap(([on, fp]) =>
      on ? factores.filter((f) => f.factor_politica === fp).slice(0, 1).map((f) => f.codigo) : []
    );
  }

  const listaVictimas: Victima[] = victimas.map((v) => ({
    nombre: s(v.nombre), cedula: s(v.cedula), direccion: s(v.direccion), municipio: s(v.municipio),
    telefono: s(v.telefono), condicion: s(v.condicion), fallecido: Boolean(v.fallecido),
  }));
  if (listaVictimas.length === 0 && a.tiene_peaton && a.peaton_nombre) {
    listaVictimas.push({
      ...victimaVacia(),
      nombre: s(a.peaton_nombre), cedula: s(a.peaton_cedula), telefono: s(a.peaton_telefono),
      direccion: s(a.peaton_direccion), condicion: "peaton",
    });
  }

  return {
    vehiculo_propio: {
      codigo: s(a.vehiculo_codigo),
      placa: s(a.vehiculo_placa) || s(propio?.placa),
      ruta: s(a.vehiculo_ruta),
      empresa: b(a.vehiculo_empresa),
      afiliado: b(a.vehiculo_afiliado),
      inmovilizacion: b(a.inmovilizacion),
      transaccion: b(a.transaccion),
      tiene_fotos: b(a.tiene_fotos),
      tiene_ipat: b(a.tiene_ipat),
      ipat_numero: s(a.ipat_numero),
      huella_frenado: s(a.huella_frenado),
      huella_arrastre: s(a.huella_arrastre),
      velocidad: s(a.velocidad_kmh),
    },
    factores_codigos: codigos,
    uso_celular: Boolean(a.fact_uso_celular),
    terceros: vehiculos
      .filter((v) => !v.es_propio)
      .map((v) => ({
        placa: s(v.placa), descripcion: s(v.descripcion), clase_vehiculo: s(v.clase_vehiculo),
        tipo_vehiculo: s(v.tipo_vehiculo), color: s(v.color), modelo: s(v.modelo),
        conductor_nombre: s(v.conductor_nombre), conductor_cedula: s(v.conductor_cedula),
        conductor_celular: s(v.conductor_celular), conductor_direccion: s(v.conductor_direccion),
        propietario_nombre: s(v.propietario_nombre), propietario_telefono: s(v.propietario_telefono),
        propietario_direccion: s(v.propietario_direccion), aseguradora: s(v.aseguradora), afiliado_a: s(v.afiliado_a),
      })),
    victimas: listaVictimas,
    agente: { nombre: s(a.agente_nombre), placa: s(a.agente_placa), celular: s(a.agente_celular) },
  };
}
