/**
 * Descargas de la pantalla de Marcaciones: CSV y PDF de **lo que se ve**, con
 * la segmentación ya aplicada.
 *
 * Recibe un `ResumenDia` que ya pasó por `aplicar()` (ver `filtros.ts`), así
 * que aquí no se filtra nada: si el archivo trajera filas distintas a la
 * pantalla, el informe dejaría de servir como prueba de lo que se revisó.
 *
 * El reparto es el mismo del resto del sistema (ver `lib/ausentismo/exportar`):
 * el **CSV lleva un dato por columna** para que sirva como datos —tablas
 * dinámicas, cruces—, y el **PDF agrupa como la pantalla**, con una sección por
 * bucket, porque una carta horizontal no aguanta veinte columnas legibles.
 *
 * Y lleva siempre las mismas advertencias que la pantalla: que la presencia
 * sale del despacho de GEMA y que la huella hoy es informativa. Un PDF que se
 * imprime y circula sin esa letra se lee como un reporte de asistencia, que es
 * justo lo que este dato todavía **no** es.
 */
import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla, type CeldaPdf, type ColumnaPdf } from "@/lib/exportar/pdf-tabla";
import type { FormatoExport } from "@/lib/exportar/formatos";
import type { FilaMarco, FilaNovedad, FilaPendiente, FilaTrabajo, ResumenDia } from "./dia";
import {
  LLEGADA_LABEL,
  ORIGEN_LABEL,
  describirFiltro,
  huellaPorCedula,
  type FiltroMarcaciones,
} from "./filtros";
import { fechaCorta, fechaLarga, hora, horaCorta } from "./formato";

export type { FormatoExport };

const MODULO = "Recursos Humanos · Marcaciones";

/** Lo de alrededor del día que el informe necesita nombrar. */
export interface ContextoMarcaciones {
  fecha: string;
  /** Total de esperados del día, SIN filtrar: el denominador del "N de M". */
  totalEsperados: number;
  /** Ventana del «último día que rodó». */
  diasVentana: number;
  ultimoRodado: Record<string, { fecha: string; dias: number }>;
  /** Cédulas con el registro que dejó Gestivo y nadie ha clasificado. */
  porClasificar: Record<string, unknown>;
  despacho: { actualizadoAt: string | null; edadMin: number | null; error?: string | null };
  agente: { ultimoEnvioAt: string | null; atrasoMin: number | null; ultimoError: string | null };
}

/** Nombre de archivo seguro: minúsculas, sin tildes ni espacios. */
function sufijo(partes: string[]): string {
  if (partes.length === 0) return "";
  const limpio = partes
    .join("_")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return limpio ? `_${limpio}` : "";
}

function conductor(f: { nombre: string | null; codigo: string | null }): string {
  const n = f.nombre || "(sin nombre)";
  return f.codigo ? `${f.codigo} · ${n}` : n;
}

function origenTexto(f: { origen: keyof typeof ORIGEN_LABEL; confianza?: number }): string {
  const base = ORIGEN_LABEL[f.origen];
  if (f.origen === "historico" && f.confianza !== undefined) {
    return `${base} (${Math.round(f.confianza * 100)} %)`;
  }
  return base;
}

function ultimoTexto(ctx: ContextoMarcaciones, cedula: string): string {
  const u = ctx.ultimoRodado[cedula];
  if (!u) return `sin rodar en ${ctx.diasVentana} días`;
  return `${u.fecha} (hace ${u.dias} ${u.dias === 1 ? "día" : "días"})`;
}

function viajeTexto(v: { hora: string; bus: string | null; turno: number | null; viaje: number | null; ruta: string | null; viajes: number } | null): string {
  if (!v) return "";
  const partes = [horaCorta(v.hora)];
  if (v.bus) partes.push(`bus ${v.bus}`);
  if (v.turno !== null) partes.push(`turno ${v.turno}`);
  if (v.viaje !== null) partes.push(`viaje ${v.viaje}`);
  if (v.ruta) partes.push(v.ruta);
  partes.push(`${v.viajes} viaje${v.viajes === 1 ? "" : "s"}`);
  return partes.join(" · ");
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const CABECERA_CSV = [
  "Fecha", "Sección", "Código", "Conductor", "Cédula", "Bus esperado", "Se esperaba por",
  "Confianza", "Huella", "Primera huella", "Última huella", "Marcaciones", "Llegó por", "Pines",
  "Primer viaje", "Bus que rodó", "Turno", "Viaje", "Ruta", "Viajes del día",
  "Último día que rodó", "Días sin rodar", "Estado",
];

function filasCsv(r: ResumenDia, ctx: ContextoMarcaciones): CeldaCsv[][] {
  const marcas = huellaPorCedula(r);
  const filas: CeldaCsv[][] = [CABECERA_CSV];

  const comunes = (
    seccion: string,
    f: { cedula: string; nombre: string | null; codigo: string | null; bus: string | null; origen: keyof typeof ORIGEN_LABEL; confianza?: number; marco: boolean },
    estado: string
  ): CeldaCsv[] => {
    const m = marcas.get(f.cedula);
    const u = ctx.ultimoRodado[f.cedula];
    return [
      ctx.fecha, seccion, f.codigo ?? "", f.nombre ?? "", f.cedula, f.bus ?? "",
      ORIGEN_LABEL[f.origen],
      f.origen === "historico" && f.confianza !== undefined ? Math.round(f.confianza * 100) : "",
      f.marco ? "Sí" : "No",
      m ? hora(m.primera) : "", m ? hora(m.ultima) : "", m ? m.cantidad : "",
      m ? LLEGADA_LABEL[m.llegada] : "", m ? m.pines.join(" / ") : "",
      "", "", "", "", "", "",
      u ? u.fecha : "", u ? u.dias : "", estado,
    ];
  };

  const conViaje = (base: CeldaCsv[], v: FilaTrabajo["primerViaje"] | null): CeldaCsv[] => {
    if (!v) return base;
    const out = [...base];
    out[14] = horaCorta(v.hora);
    out[15] = v.bus ?? "";
    out[16] = v.turno ?? "";
    out[17] = v.viaje ?? "";
    out[18] = v.ruta ?? "";
    out[19] = v.viajes;
    return out;
  };

  const estadoPendiente = (f: FilaPendiente) =>
    ctx.porClasificar[f.cedula]
      ? "Lo registró Gestivo · por clasificar"
      : f.marco
        ? "Vino y no lo despacharon"
        : "Sin rastro del día";

  for (const f of r.sinDespacho) filas.push(comunes("Sin despacho", f, estadoPendiente(f)));
  for (const f of r.porSalir) filas.push(comunes("Turno sin empezar", f, "Viajes asignados que aún no salen"));
  for (const f of r.trabajaron) {
    filas.push(conViaje(comunes("Trabajaron", f, "Salió a rodar"), f.primerViaje));
  }
  for (const f of r.conNovedad) {
    const estado = f.trabajo ? "CONTRADICCIÓN: novedad registrada y además rodó" : "Novedad registrada";
    filas.push(conViaje(comunes("Con novedad", f, estado), f.primerViaje));
  }
  for (const f of r.marcaron) {
    const u = ctx.ultimoRodado[f.cedula];
    filas.push([
      ctx.fecha, "Marcaron", f.codigo ?? "", f.nombre ?? "", f.cedula, "", "", "",
      "Sí", hora(f.primera), hora(f.ultima), f.cantidad, LLEGADA_LABEL[f.llegada],
      f.pines.join(" / "), "", "", "", "", "", "",
      u ? u.fecha : "", u ? u.dias : "",
      f.esperado ? "Informativo" : "Marcó sin estar entre los esperados",
    ]);
  }
  return filas;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

/**
 * Un solo juego de columnas para todas las secciones: es lo que admite
 * `descargarPdfTabla` y además hace el informe comparable de un bloque a otro.
 * Las que no aplican a una sección van vacías (p. ej. «Primer viaje» en los
 * que no rodaron).
 */
const COLUMNAS_PDF: ColumnaPdf[] = [
  { titulo: "Conductor", ancho: 46 },
  { titulo: "Bus", ancho: 14 },
  { titulo: "Se esperaba por", ancho: 24 },
  { titulo: "Huella", ancho: 13, alinear: "center" },
  { titulo: "Primera", ancho: 15, alinear: "right" },
  { titulo: "Llegó por", ancho: 22 },
  { titulo: "Primer viaje / detalle" },
  { titulo: "Último día que rodó", ancho: 30 },
  { titulo: "Estado", ancho: 38 },
];

function filaPdf(
  f: { cedula: string; nombre: string | null; codigo: string | null; bus: string | null; origen: keyof typeof ORIGEN_LABEL; confianza?: number; marco: boolean },
  marcas: Map<string, FilaMarco>,
  ctx: ContextoMarcaciones,
  detalle: string,
  estado: CeldaPdf
): CeldaPdf[] {
  const m = marcas.get(f.cedula);
  return [
    `${conductor(f)}\nCC ${f.cedula}`,
    f.bus ?? "",
    origenTexto(f),
    f.marco ? "Sí" : "No",
    m ? hora(m.primera) : "",
    m ? LLEGADA_LABEL[m.llegada] : "",
    detalle,
    ultimoTexto(ctx, f.cedula),
    estado,
  ];
}

function seccionesPdf(r: ResumenDia, ctx: ContextoMarcaciones) {
  const marcas = huellaPorCedula(r);
  const vino = r.sinDespacho.filter((f) => f.marco);
  const sinRastro = r.sinDespacho.filter((f) => !f.marco);

  const pendiente = (f: FilaPendiente): CeldaPdf[] =>
    filaPdf(
      f,
      marcas,
      ctx,
      "",
      ctx.porClasificar[f.cedula]
        ? { texto: "Lo registró Gestivo · por clasificar", fondo: "#EEF2FF", color: "#4338CA" }
        : ""
    );

  const trabajo = (f: FilaTrabajo): CeldaPdf[] =>
    filaPdf(f, marcas, ctx, viajeTexto(f.primerViaje), "Salió a rodar");

  const conNovedad = (f: FilaNovedad): CeldaPdf[] =>
    filaPdf(
      f,
      marcas,
      ctx,
      viajeTexto(f.primerViaje),
      f.trabajo
        ? { texto: "Novedad registrada y además rodó", fondo: "#FEF3C7", color: "#B45309", negrita: true }
        : "Novedad registrada"
    );

  const marcoFila = (f: FilaMarco): CeldaPdf[] => [
    `${conductor(f)}\nCC ${f.cedula}`,
    "",
    "",
    "Sí",
    hora(f.primera),
    LLEGADA_LABEL[f.llegada],
    `última ${hora(f.ultima)} · ${f.cantidad} marcación${f.cantidad === 1 ? "" : "es"} · pin ${f.pines.join(", ")}`,
    ultimoTexto(ctx, f.cedula),
    f.esperado ? "" : "Marcó sin estar entre los esperados",
  ];

  return [
    {
      titulo: `Vinieron y no los despacharon (${vino.length}) — pasaron la huella: no es una ausencia`,
      color: "#B45309",
      filas: vino.map(pendiente),
    },
    {
      titulo: `Sin rastro del día (${sinRastro.length}) — ni viaje ni huella; puede ser un descanso`,
      color: "#DC2626",
      filas: sinRastro.map(pendiente),
    },
    {
      titulo: `Turno sin empezar (${r.porSalir.length}) — tienen viajes del día que aún no salen`,
      color: "#4F46E5",
      filas: r.porSalir.map(pendiente),
    },
    {
      titulo: `Trabajaron (${r.trabajaron.length})`,
      color: "#059669",
      filas: r.trabajaron.map(trabajo),
    },
    {
      titulo: `Con novedad registrada (${r.conNovedad.length})`,
      color: "#4F46E5",
      filas: r.conNovedad.map(conNovedad),
    },
    {
      titulo: `Marcaron (${r.marcaron.length}) — informativo`,
      filas: r.marcaron.map(marcoFila),
    },
  ];
}

function contextoPdf(ctx: ContextoMarcaciones, filtro: FiltroMarcaciones, visibles: number): string[] {
  const lineas: string[] = [];
  const filtros = describirFiltro(filtro);
  lineas.push(
    filtros.length > 0
      ? `Segmentación aplicada — ${filtros.join("   ·   ")}`
      : "Sin segmentación: el día completo."
  );
  lineas.push(
    `${visibles} de ${ctx.totalEsperados} conductores esperados del día quedan en este informe.`
  );
  lineas.push(
    "Despacho de GEMA: " +
      (ctx.despacho.actualizadoAt
        ? `traído el ${fechaCorta(ctx.despacho.actualizadoAt)} a las ${hora(ctx.despacho.actualizadoAt)}` +
          (ctx.despacho.edadMin !== null ? ` (hace ${ctx.despacho.edadMin} min)` : "")
        : "nunca se ha traído") +
      (ctx.despacho.error ? ` — ERROR: ${ctx.despacho.error}` : "") +
      ".   Agente del biométrico: " +
      (ctx.agente.ultimoEnvioAt
        ? `último envío el ${fechaCorta(ctx.agente.ultimoEnvioAt)} a las ${hora(ctx.agente.ultimoEnvioAt)}` +
          (ctx.agente.atrasoMin !== null ? ` (hace ${ctx.agente.atrasoMin} min)` : "")
        : "nunca ha reportado") +
      (ctx.agente.ultimoError ? ` — ERROR: ${ctx.agente.ultimoError}` : "") +
      "."
  );
  return lineas;
}

// ── Punto de entrada ─────────────────────────────────────────────────────────

export async function exportarMarcaciones({
  formato,
  resumen,
  filtro,
  ctx,
}: {
  formato: FormatoExport;
  /** Ya filtrado con `aplicar()`: es exactamente lo que está en pantalla. */
  resumen: ResumenDia;
  filtro: FiltroMarcaciones;
  ctx: ContextoMarcaciones;
}): Promise<void> {
  const marca = describirFiltro(filtro);
  const archivo = `marcaciones_${ctx.fecha}${sufijo(marca.length > 0 ? ["filtrado"] : [])}${sufijo(
    filtro.texto.trim() ? [filtro.texto] : []
  )}`;

  if (formato === "csv") {
    descargarCsv(`${archivo}.csv`, filasCsv(resumen, ctx));
    return;
  }

  const visibles = new Set<string>();
  for (const f of [...resumen.sinDespacho, ...resumen.porSalir, ...resumen.trabajaron, ...resumen.conNovedad]) {
    visibles.add(f.cedula);
  }
  const sinHuella = resumen.trabajaron.filter((f) => !f.marco).length;
  const contradicciones = resumen.conNovedad.filter((f) => f.trabajo);
  const porClasificar = resumen.sinDespacho.filter((f) => ctx.porClasificar[f.cedula]);

  await descargarPdfTabla({
    archivo,
    modulo: MODULO,
    titulo: `Marcaciones del ${fechaLarga(ctx.fecha)}`,
    contexto: contextoPdf(ctx, filtro, visibles.size),
    resumen: [
      `Sin despacho: ${resumen.sinDespacho.length}`,
      `Turno sin empezar: ${resumen.porSalir.length}`,
      `Trabajaron: ${resumen.trabajaron.length}`,
      `Con novedad: ${resumen.conNovedad.length}`,
      `Marcaron: ${resumen.marcaron.length}`,
    ],
    columnas: COLUMNAS_PDF,
    filas: [],
    secciones: seccionesPdf(resumen, ctx),
    orientacion: "landscape",
    vacio: "Ninguna fila con esta segmentación.",
    anexos:
      contradicciones.length > 0
        ? [
            {
              titulo: `Por resolver: novedad registrada y aun así rodaron (${contradicciones.length})`,
              columnas: [
                { titulo: "Conductor", ancho: 60 },
                { titulo: "Cédula", ancho: 28 },
                { titulo: "Salió" },
              ],
              filas: contradicciones.map((f) => [
                conductor(f),
                f.cedula,
                viajeTexto(f.primerViaje),
              ]),
            },
          ]
        : undefined,
    notas: [
      "La presencia sale del despacho de GEMA, no de la huella: si la cédula aparece en el despacho con un viaje que salió a rodar, la persona vino.",
      `La huella es informativa: hoy solo cerca de la mitad de los conductores despachados pasa por el biométrico. En este informe, ${sinHuella} de los ${resumen.trabajaron.length} que rodaron no la pasaron, y eso NO es una ausencia.`,
      "«Sin despacho» no es una falta: Gestivo no tiene calendario de turnos, así que la lista incluye descansos. Nada se convierte en ausencia solo; lo que Gestivo deja escrito entra como «pendiente por clasificar», que no cuenta como falta.",
      ...(porClasificar.length > 0
        ? [`${porClasificar.length} de los «sin despacho» ya tienen el registro que dejó Gestivo y siguen pendientes de clasificar en Ausentismo.`]
        : []),
      ...(marca.length > 0
        ? ["Este informe está segmentado: no es el día completo. La segmentación aplicada va en el encabezado."]
        : []),
    ],
  });
}
