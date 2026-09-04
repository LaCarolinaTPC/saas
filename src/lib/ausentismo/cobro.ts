// Informe de cobro de incapacidades al pagador (EPS o ARL), generado en el
// navegador con las mismas filas que se ven en la matriz. Agrupa por pagador,
// suma días de incapacidad y días a cargo del pagador, y sale en PDF, Excel o
// CSV. La regla de "días a cargo" está en matriz-reglas (diasACargoPagador).

import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type CeldaPdf, type ColumnaPdf } from "@/lib/exportar/pdf-tabla";
import type { FormatoExport } from "@/lib/exportar/formatos";
import type { MatrizFila } from "./matriz";
import {
  COBRO_EPS_DIAS_MIN, DIAS_EMPLEADOR_EPS, ORIGENES_ARL, SEGMENTOS_COBRO,
  diasACargoPagador, diasMinimosCobro, fechaAAMMDD, type SegmentoCobro,
} from "./matriz-reglas";

const MODULO = "Recursos Humanos · Ausentismo";

export interface FiltrosCobroUI {
  desde: string;
  hasta: string;
  cobro: string;
  diasMin: string;
  eps: string;
  origen: string;
  estado: string;
  q: string;
}

export interface GrupoPagador {
  pagador: string;
  esArl: boolean;
  filas: MatrizFila[];
  incapacidades: number;
  dias: number;
  diasACargo: number;
}

export interface ResumenCobro {
  grupos: GrupoPagador[];
  incapacidades: number;
  dias: number;
  diasACargo: number;
  pendientes: number;
}

/** Agrupa por pagador (ARL o EPS) con totales; los grupos van de más a menos días a cargo. */
export function resumirCobro(filas: MatrizFila[]): ResumenCobro {
  const porPagador = new Map<string, GrupoPagador>();
  let dias = 0;
  let diasACargo = 0;
  let pendientes = 0;
  for (const f of filas) {
    const esArl = ORIGENES_ARL.has(f.origen ?? "");
    const pagador = (esArl ? f.arl ?? f.eps : f.eps) ?? "Sin pagador";
    let g = porPagador.get(pagador);
    if (!g) porPagador.set(pagador, (g = { pagador, esArl, filas: [], incapacidades: 0, dias: 0, diasACargo: 0 }));
    const d = f.dias_it_pagados ?? 0;
    const c = diasACargoPagador(f);
    g.filas.push(f);
    g.incapacidades += 1;
    g.dias += d;
    g.diasACargo += c;
    dias += d;
    diasACargo += c;
    if (f.estado_registro === "pendiente") pendientes += 1;
  }
  const grupos = [...porPagador.values()].sort(
    (a, b) => b.diasACargo - a.diasACargo || a.pagador.localeCompare(b.pagador, "es")
  );
  return { grupos, incapacidades: filas.length, dias, diasACargo, pendientes };
}

function segmentoLabel(cobro: string): string {
  return SEGMENTOS_COBRO.find((s) => s.key === cobro)?.label ?? "Todos los pagadores";
}

/** Líneas de contexto del informe: criterio de cobro y filtros aplicados. */
export function contextoCobro(f: FiltrosCobroUI): string[] {
  const seg = (f.cobro || null) as SegmentoCobro | null;
  const minimo = diasMinimosCobro(seg, f.diasMin ? Number(f.diasMin) : null);
  const lineas = [
    `Incapacidades iniciadas entre ${f.desde} y ${f.hasta}`,
    `Segmento: ${segmentoLabel(f.cobro)}${minimo != null ? ` · ${minimo} día${minimo === 1 ? "" : "s"} o más` : ""}`,
  ];
  const extra = [
    f.eps ? `pagador ${f.eps}` : "",
    f.origen ? `origen ${f.origen}` : "",
    f.estado ? `registro ${f.estado}` : "",
    f.q ? `"${f.q}"` : "",
  ].filter(Boolean);
  if (extra.length) lineas.push(`Filtros: ${extra.join(" · ")}`);
  return lineas;
}

function sufijo(texto: string): string {
  const limpio = texto
    .normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  return limpio ? `_${limpio}` : "";
}

const NOTAS = [
  `Días a cargo del pagador: la ARL reconoce todos los días (AT/EL). En origen común la EPS reconoce desde el día ${DIAS_EMPLEADOR_EPS + 1} de una incapacidad inicial (los ${DIAS_EMPLEADOR_EPS} primeros los asume el empleador) y la prórroga completa.`,
  `El segmento "Cobro EPS" toma las incapacidades de más de 3 días (${COBRO_EPS_DIAS_MIN} o más); el umbral se puede cambiar con "Días mínimos".`,
  "Los registros pendientes de diagnóstico se incluyen marcados: complétalos antes de radicar el cobro.",
];

export async function exportarInformeCobro({ formato, filtros, filas }: {
  formato: FormatoExport;
  filtros: FiltrosCobroUI;
  filas: MatrizFila[];
}) {
  const resumen = resumirCobro(filas);
  const archivo =
    `ausentismo_cobro_${filtros.cobro || "todos"}_${filtros.desde}_${filtros.hasta}` +
    (filtros.diasMin ? `_min${filtros.diasMin}` : "") + sufijo(filtros.eps) + sufijo(filtros.q);
  const titulo = `Informe de cobro de incapacidades · ${segmentoLabel(filtros.cobro)}`;
  const contexto = contextoCobro(filtros);
  const tipo = (f: MatrizFila) => (f.indicador_prorroga === "PRORROGA" ? "Prórroga" : "Inicial");
  const estado = (f: MatrizFila) => (f.estado_registro === "pendiente" ? "Pendiente" : "Cerrado");
  const pagadorDe = (f: MatrizFila) => (ORIGENES_ARL.has(f.origen ?? "") ? f.arl ?? f.eps : f.eps) ?? "Sin pagador";

  const cabecera = [
    "Pagador", "Empleado", "Cédula", "Cargo", "Tipo conductor", "Consecutivo", "Tipo", "Origen",
    "Inicio", "Fin", "Días", "Días a cargo pagador", "CIE10", "Diagnóstico", "GRD", "IPS",
    "Profesional", "SOAT", "Registro",
  ];
  const filaDatos = (f: MatrizFila): CeldaCsv[] => [
    pagadorDe(f), f.nombre ?? "", f.cedula, f.cargo ?? "", f.tipo_conductor ?? "",
    f.consecutivo_incapacidad ?? "", tipo(f), f.origen ?? "",
    f.fecha_inicio ?? "", f.fecha_fin ?? "", f.dias_it_pagados ?? 0, diasACargoPagador(f),
    f.cie10 ?? "", f.diagnostico ?? "", f.grd ?? "", f.ips ?? "", f.profesional_responsable ?? "",
    f.soat ?? "NO", estado(f),
  ];
  const cabeceraResumen = ["Pagador", "Incapacidades", "Días de incapacidad", "Días a cargo del pagador"];
  const filasResumen: CeldaCsv[][] = resumen.grupos.map((g) => [g.pagador, g.incapacidades, g.dias, g.diasACargo]);
  const totalResumen: CeldaCsv[] = ["TOTAL", resumen.incapacidades, resumen.dias, resumen.diasACargo];

  if (formato === "csv") return descargarCsv(`${archivo}.csv`, [cabecera, ...filas.map(filaDatos)]);

  if (formato === "xlsx") {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const hojaResumen = XLSX.utils.aoa_to_sheet([
      [titulo], ...contexto.map((c) => [c]), [], cabeceraResumen, ...filasResumen, totalResumen, [], ...NOTAS.map((n) => [n]),
    ]);
    hojaResumen["!cols"] = [44, 16, 20, 24].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");
    const anchos = [30, 34, 14, 16, 14, 14, 10, 8, 12, 12, 7, 12, 8, 40, 30, 30, 30, 6, 11].map((w) => ({ wch: w }));
    const hojaDetalle = XLSX.utils.aoa_to_sheet([[titulo], cabecera, ...filas.map(filaDatos)]);
    hojaDetalle["!cols"] = anchos;
    XLSX.utils.book_append_sheet(libro, hojaDetalle, "Detalle");
    // Una hoja por pagador: es lo que se radica ante cada entidad.
    const usados = new Set<string>();
    for (const g of resumen.grupos) {
      let nombre = g.pagador.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Pagador";
      let n = 2;
      while (usados.has(nombre)) nombre = `${nombre.slice(0, 25)} ${n++}`;
      usados.add(nombre);
      const hoja = XLSX.utils.aoa_to_sheet([
        [`${g.pagador} · ${g.incapacidades} incapacidad${g.incapacidades === 1 ? "" : "es"} · ${g.dias} días · ${g.diasACargo} a cargo del pagador`],
        cabecera,
        ...g.filas.map(filaDatos),
      ]);
      hoja["!cols"] = anchos;
      XLSX.utils.book_append_sheet(libro, hoja, nombre);
    }
    XLSX.writeFile(libro, `${archivo}.xlsx`);
    return;
  }

  const columnas: ColumnaPdf[] = [
    { titulo: "Empleado", ancho: 52 },
    { titulo: "Cédula", ancho: 20 },
    { titulo: "Consec.", ancho: 18 },
    { titulo: "Tipo", ancho: 16 },
    { titulo: "Orig.", ancho: 11, alinear: "center" },
    { titulo: "Inicio", ancho: 17, alinear: "center" },
    { titulo: "Fin", ancho: 17, alinear: "center" },
    { titulo: "Días", ancho: 11, alinear: "right" },
    { titulo: "A cargo", ancho: 14, alinear: "right" },
    { titulo: "CIE10 · Diagnóstico" },
    { titulo: "IPS", ancho: 42 },
    { titulo: "Registro", ancho: 18, alinear: "center" },
  ];
  const filaPdf = (f: MatrizFila): CeldaPdf[] => [
    f.nombre ?? f.cedula, f.cedula, f.consecutivo_incapacidad ?? "s/n", tipo(f), f.origen ?? "",
    fechaAAMMDD(f.fecha_inicio), fechaAAMMDD(f.fecha_fin), f.dias_it_pagados ?? 0,
    { texto: String(diasACargoPagador(f)), negrita: true },
    f.cie10 ? `${f.cie10} · ${f.diagnostico ?? ""}` : "Sin diagnóstico",
    f.ips ?? "",
    f.estado_registro === "pendiente"
      ? { texto: "Pendiente", fondo: "#FEF3C7", color: "#92400E", negrita: true }
      : "Cerrado",
  ];
  const secciones = resumen.grupos.map((g) => ({
    titulo: `${g.pagador} · ${g.incapacidades} incapacidad${g.incapacidades === 1 ? "" : "es"} · ${g.dias} días · ${g.diasACargo} a cargo del pagador`,
    color: g.esArl ? "#B45309" : "#4F46E5",
    filas: g.filas.map(filaPdf),
  }));

  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo,
    contexto,
    resumen: [
      `${resumen.grupos.length} pagador${resumen.grupos.length === 1 ? "" : "es"}`,
      `${resumen.incapacidades} incapacidad${resumen.incapacidades === 1 ? "" : "es"}`,
      `${resumen.dias} días de incapacidad`,
      `${resumen.diasACargo} días a cargo del pagador`,
      ...(resumen.pendientes ? [`${resumen.pendientes} pendiente${resumen.pendientes === 1 ? "" : "s"} de diagnóstico`] : []),
    ],
    columnas,
    filas: [],
    secciones,
    anexos: [
      {
        titulo: "Resumen por pagador",
        columnas: [
          { titulo: "Pagador" },
          { titulo: "Incapacidades", ancho: 30, alinear: "right" },
          { titulo: "Días de incapacidad", ancho: 40, alinear: "right" },
          { titulo: "Días a cargo del pagador", ancho: 46, alinear: "right" },
        ],
        filas: [
          ...resumen.grupos.map((g): CeldaPdf[] => [g.pagador, g.incapacidades, g.dias, g.diasACargo]),
          [
            { texto: "TOTAL", negrita: true },
            { texto: String(resumen.incapacidades), negrita: true },
            { texto: String(resumen.dias), negrita: true },
            { texto: String(resumen.diasACargo), negrita: true },
          ],
        ],
      },
    ],
    notas: NOTAS,
    orientacion: "landscape",
    vacio: "Sin incapacidades para cobrar con estos filtros.",
  });
}
