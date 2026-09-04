// Exportación del tablero de vencimientos a PDF y CSV, con las mismas filas
// que se ven en pantalla. El PDF va segmentado por nivel, con el color de
// cada uno, igual que Reincidentes en Ausentismo.
import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type CeldaPdf } from "@/lib/exportar/pdf-tabla";
import type { FormatoExport } from "@/lib/exportar/formatos";
import {
  NIVELES_VENCIMIENTO, NIVEL_LABEL, NIVEL_ACCION, NIVEL_COLOR, conteoPorNivel, etiquetaVehiculo, textoDias,
  type Vencimiento,
} from "./constants";

const MODULO = "Operativo · Documentos del vehículo";

export interface FiltrosVencimientosUI {
  tipo: string;
  nivel: string;
  q: string;
}

function sufijo(texto: string): string {
  const limpio = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  return limpio ? `_${limpio}` : "";
}

export async function exportarVencimientos({ formato, hoy, filtros, filas, tiposLabel }: {
  formato: FormatoExport;
  hoy: string;
  filtros: FiltrosVencimientosUI;
  filas: Vencimiento[];
  tiposLabel: Record<string, string>;
}) {
  const archivo =
    `operativo_vencimientos_${hoy}` +
    (filtros.tipo ? sufijo(tiposLabel[filtros.tipo] ?? filtros.tipo) : "") +
    (filtros.nivel ? sufijo(NIVEL_LABEL[filtros.nivel as keyof typeof NIVEL_LABEL] ?? filtros.nivel) : "") +
    sufijo(filtros.q);
  const conteos = conteoPorNivel(filas);

  const cabecera = [
    "Nivel", "Acción", "Código", "Placa", "Ruta", "Conductor", "Documento", "Fecha GEMA", "Fecha documento",
    "Fecha vigente", "Días", "Discrepancia", "Número", "Entidad", "Archivo",
  ];
  const filaCsv = (f: Vencimiento): CeldaCsv[] => [
    NIVEL_LABEL[f.nivel], NIVEL_ACCION[f.nivel], f.codigo, f.placa ?? "", f.ruta ?? "", f.conductor_nombre ?? "",
    f.tipo_nombre, f.fecha_gema ?? "", f.fecha_documento ?? "", f.fecha_vigente ?? "", f.dias ?? "",
    f.discrepancia ? "Sí" : "No", f.numero ?? "", f.entidad ?? "", f.archivo_nombre ?? "",
  ];
  if (formato === "csv") return descargarCsv(`${archivo}.csv`, [cabecera, ...filas.map(filaCsv)]);

  const celdaNivel = (f: Vencimiento): CeldaPdf => ({
    texto: NIVEL_LABEL[f.nivel], fondo: NIVEL_COLOR[f.nivel].fuerte, color: "#FFFFFF", negrita: true,
  });
  const filaPdf = (f: Vencimiento): CeldaPdf[] => [
    celdaNivel(f),
    `${etiquetaVehiculo(f)}${f.ruta ? `\nRuta ${f.ruta}` : ""}`,
    f.conductor_nombre ?? "",
    f.tipo_nombre,
    f.fecha_gema ?? "-",
    f.fecha_documento ?? "-",
    f.fecha_vigente ?? "-",
    textoDias(f.dias),
    f.discrepancia ? "GEMA y documento no coinciden" : "",
    [f.numero, f.entidad].filter(Boolean).join(" · "),
  ];
  const secciones = NIVELES_VENCIMIENTO.map((n) => ({
    titulo: `${NIVEL_LABEL[n]} · ${NIVEL_ACCION[n]} (${conteos[n]})`,
    color: NIVEL_COLOR[n].fuerte,
    filas: filas.filter((f) => f.nivel === n).map(filaPdf),
  }));
  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo: `Vencimientos de documentos al ${hoy}`,
    contexto: [
      `Documento: ${filtros.tipo ? (tiposLabel[filtros.tipo] ?? filtros.tipo) : "todos"}   ·   Nivel: ${filtros.nivel ? NIVEL_LABEL[filtros.nivel as keyof typeof NIVEL_LABEL] : "todos"}` +
      (filtros.q ? `   ·   Vehículo: "${filtros.q}"` : ""),
      "La fecha vigente es la más reciente entre la de GEMA y la del último documento cargado. " +
      "Sin fecha en ninguna de las dos se marca como sin dato, el nivel más grave. Vehículos activos del maestro.",
    ],
    resumen: [
      `Filas: ${filas.length}`,
      ...NIVELES_VENCIMIENTO.map((n) => `${NIVEL_LABEL[n]}: ${conteos[n]}`),
    ],
    columnas: [
      { titulo: "Nivel", ancho: 24 },
      { titulo: "Vehículo", ancho: 34 },
      { titulo: "Conductor", ancho: 44 },
      { titulo: "Documento", ancho: 40 },
      { titulo: "GEMA", ancho: 22 },
      { titulo: "Documento cargado", ancho: 26 },
      { titulo: "Vigente", ancho: 22 },
      { titulo: "Días", ancho: 30 },
      { titulo: "Discrepancia", ancho: 30 },
      { titulo: "Número · entidad" },
    ],
    filas: [],
    secciones,
    orientacion: "landscape",
    vacio: "Sin vencimientos para los filtros elegidos.",
  });
}
