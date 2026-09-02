import {
  parseSheet,
  excelDateToISO,
  mesEntregaToPeriodo,
  toStr,
  toNum,
  normalizeCedula,
  findCol,
} from "./excel-utils";
import type { ProcessResult } from "./types";

export function processConductores(
  data: ArrayBuffer | Uint8Array,
  estado: "ACTIVO" | "RETIRADO" | "SUSPENDIDO"
): ProcessResult {
  const rows = parseSheet(data, "Worksheet", 5);
  const records: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const cedula = normalizeCedula(
      row["Identificacion"] ?? row["Identificación"]
    );
    if (!cedula || cedula === "0") {
      errors.push("Fila sin cedula valida");
      continue;
    }
    if (seen.has(cedula)) continue;
    seen.add(cedula);

    records.push({
      cedula,
      nombre: toStr(row["Nombre"]) || "SIN NOMBRE",
      codigo: toStr(row["Codigo"] ?? row["Código"]),
      correo: toStr(row["Correo"]),
      direccion: toStr(row["Direccion"] ?? row["Dirección"]),
      celular: toStr(row["Celular"]),
      telefono: toStr(row["Telefono"] ?? row["Teléfono"]),
      tipo_conductor: toStr(row["Tipo Conductor"]),
      licencia: toStr(row["Licencia"]),
      venc_licencia: excelDateToISO(row["Venc. Licencia"]),
      venc_contrato: excelDateToISO(row["Venc. Contrato"]),
      fecha_ingreso: excelDateToISO(row["Fecha Ingreso"]),
      fecha_retiro: excelDateToISO(row["Fecha Retiro"]),
      experiencia: toStr(row["Experiencia"]),
      fecha_nacimiento: excelDateToISO(row["Fecha Nacimiento"]),
      observacion: toStr(row["Observacion"] ?? row["Observación"]),
      eps: toStr(row["EPS"]),
      arl: toStr(row["ARL"]),
      pension: toStr(row["Pension"] ?? row["Pensión"]),
      compensacion: toStr(row["Compensacion"] ?? row["Compensación"]),
      tipo_sangre: toStr(row["Tipo Sangre"]),
      nivel_educativo: toStr(row["Nivel Educativo"]),
      num_hijos: row["Num Hijos"] != null ? Number(row["Num Hijos"]) : null,
      estado_civil: toStr(row["Estado Civil"]),
      reubicado: toStr(row["Reubicado"]),
      estado,
    });
  }

  return { records, errors };
}

export function processCierres(
  data: ArrayBuffer | Uint8Array,
  fileName: string
): ProcessResult {
  const rows = parseSheet(data, undefined, 6);
  const records: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const rawCod = toStr(row["COD CONDUCTOR"]);
    if (!rawCod) continue;
    const codConductor = rawCod.replace(/^0+/, "") || rawCod;

    const fecha = excelDateToISO(row["FECHA"]);
    if (!fecha) continue;

    const ruta = toStr(row["RUTA"]);
    const dedupKey = `${codConductor}|${fecha}|${ruta}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    records.push({
      cod_conductor: codConductor,
      conductor_nombre: toStr(row["CONDUCTOR"]),
      fecha,
      tipo_cierre: toStr(row["TIPO CIERRE"]),
      ruta,
      grupo_liquidacion: toStr(row["GRUPO LIQUIDACION"]),
      vehiculo: toStr(row["VEHICULO"]),
      viajes: toNum(row["VIAJES"]),
      timbradas: toNum(row["TIMBRADAS"]),
      diff_tim: toNum(row["DIFF TIM."]),
      prom_tim: toNum(row["PROM TIM."]),
      pct_indiv: toNum(row["% INDIV"]),
      pct_grupo: toNum(row["% GRUPO"]),
      pct_total: toNum(row["% TOTAL"]),
      tim_grupo: toNum(row["TIM GRUPO"]),
      viajes_grupo: toNum(row["VIAJES GRUPO"]),
      prom_grupo: toNum(row["PROM GRUPO"]),
      source_file: fileName,
    });
  }

  return { records, errors };
}

export function processViajesPerdidos(
  data: ArrayBuffer | Uint8Array,
  fileName: string
): ProcessResult {
  const rows = parseSheet(data, undefined, 5);
  const records: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const periodos = new Set<string>();

  for (const row of rows) {
    const cedula = normalizeCedula(row["Ced. Conductor"]);
    if (!cedula || cedula === "0") {
      errors.push("Fila sin cedula");
      continue;
    }

    const fecha = excelDateToISO(row["Fecha"]);
    if (!fecha) {
      errors.push("Fila sin fecha");
      continue;
    }

    const day = parseInt(fecha.split("-")[2], 10);
    const periodo = fecha.slice(0, 7);
    periodos.add(periodo);

    records.push({
      cedula_conductor: cedula,
      tipologia: toStr(row["Tipologia"]),
      novedad: toStr(row["Novedad"]),
      detalle_novedad: toStr(row["Detalle Novedad"]),
      fecha,
      despacho: toStr(row["Despacho"]),
      tipo_propietario: toStr(row["Tipo Propietario"]),
      vehiculo: toStr(row["Vehiculo"]),
      placa: toStr(row["Placa"]),
      conductor_nombre: toStr(row["Conductor"]),
      turno: toStr(row["Turno"]),
      viaje: toStr(row["Viaje"]),
      ruta: toStr(row["Ruta"]),
      planillero: toStr(row["Planillero"]),
      periodo,
      quincena: day <= 15 ? 1 : 2,
      source_file: fileName,
    });
  }

  return { records, errors, periodos: Array.from(periodos) };
}

const MESES_MATRIZ = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];
const DIAS_MATRIZ = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];

/** Códigos de origen que el Excel trae con la nomenclatura vieja. */
const ORIGEN_HOMOLOGADO: Record<string, string> = { EC: "EG" };

/** Texto sin espacios sobrantes; misma regla que `ausentismo_limpio` en la base. */
function limpio(val: unknown): string | null {
  const s = toStr(val);
  return s ? s.replace(/\s+/g, " ") : null;
}

function mayus(val: unknown): string | null {
  return limpio(val)?.toUpperCase() ?? null;
}

/** Días calendario entre dos fechas ISO, ambos extremos incluidos. */
function diasEntre(inicio: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * MATRIZ DE AUSENTISMO (hoja "BASE DE AUSENTISMO"). Una fila por incapacidad.
 *
 * La carga ya no reemplaza la tabla: hace upsert por (cédula, fecha inicio,
 * consecutivo), así que aquí se garantiza que esa llave no venga repetida en
 * el archivo y se normaliza igual que la migración 20260902220946: EC → EG,
 * espacios dobles fuera, CIE10 en mayúsculas, mes y día derivados de la fecha
 * (el Excel traía "LUE"), y días perdidos calculados cuando la columna falta.
 * El Excel llama a la columna "DIAS PERDIDOS"; el lector anterior buscaba
 * "DIAS DE IT PAGADOS" y por eso la columna llegaba vacía.
 */
export function processAusentismo(
  data: ArrayBuffer | Uint8Array,
  fileName: string
): ProcessResult {
  const rows = parseSheet(data, "BASE DE AUSENTISMO", 2);
  const records: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const llaves = new Set<string>();

  for (const row of rows) {
    const cedula = normalizeCedula(
      findCol(row, "DOCUMENTO DE IDENTIDAD", "DOCUMENTO")
    );
    if (!cedula || cedula === "0") {
      errors.push("Fila sin cedula");
      continue;
    }

    const fechaInicio = excelDateToISO(findCol(row, "FECHA INICIO"));
    const fechaFin = excelDateToISO(findCol(row, "FECHA FIN"));
    if (!fechaInicio) {
      errors.push(`Cedula ${cedula}: fila sin fecha de inicio, se omite`);
      continue;
    }
    if (fechaFin && fechaFin < fechaInicio) {
      errors.push(`Cedula ${cedula} ${fechaInicio}: la fecha fin es anterior al inicio, se omite`);
      continue;
    }

    const consecutivo = limpio(findCol(row, "CONSECUTIVO"));
    const llave = `${cedula}|${fechaInicio}|${consecutivo ?? ""}`;
    if (llaves.has(llave)) {
      errors.push(`Cedula ${cedula} ${fechaInicio}: incapacidad repetida en el archivo, se conserva la primera`);
      continue;
    }
    llaves.add(llave);

    const diasRaw = findCol(row, "DIAS PERDIDOS", "DE IT PAGADOS", "DIAS DE IT");
    const diasExcel = diasRaw != null && diasRaw !== "" ? Number(diasRaw) : NaN;
    const dias = Number.isFinite(diasExcel)
      ? diasExcel
      : fechaFin
        ? diasEntre(fechaInicio, fechaFin)
        : null;

    const edadRaw = findCol(row, "EDAD");
    const origenRaw = mayus(findCol(row, "ORIGEN"));
    const eps = limpio(findCol(row, "EPS"));
    const cie10 = mayus(findCol(row, "CIE10"));
    const inicio = new Date(`${fechaInicio}T00:00:00Z`);

    records.push({
      cedula,
      consecutivo_incapacidad: consecutivo,
      nombre: limpio(findCol(row, "NOMBRE")),
      genero: toStr(findCol(row, "GENERO")),
      edad: edadRaw != null ? Number(edadRaw) : null,
      antiguedad: toStr(findCol(row, "ANTIG")),
      vinculacion: toStr(findCol(row, "VINCULACI")),
      centro_trabajo: toStr(findCol(row, "CENTRO DE TRABAJO")),
      departamento: toStr(findCol(row, "DEPARTAMENTO")),
      area: toStr(findCol(row, "AREA")),
      cargo: mayus(findCol(row, "CARGO")),
      indicador_prorroga: mayus(findCol(row, "INDICADOR PRORROGA")),
      dias_it_pagados: dias,
      origen: origenRaw ? ORIGEN_HOMOLOGADO[origenRaw] ?? origenRaw : null,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      // Derivados de la fecha: lo que venga escrito en el Excel se ignora.
      mes_inicio: MESES_MATRIZ[inicio.getUTCMonth()],
      dia_ocurrencia: DIAS_MATRIZ[inicio.getUTCDay()],
      cie10,
      diagnostico: limpio(findCol(row, "DX")),
      soat: mayus(findCol(row, "SOAT")),
      grd: limpio(findCol(row, "GRUPO RELACIONADOS")),
      eps,
      // La ARL venía mezclada en la columna EPS; se copia a su campo sin
      // quitarla de EPS, que es lo que expone el API externo.
      arl: eps && /^ARL\b/i.test(eps) ? eps : null,
      ips: limpio(findCol(row, "IPS")),
      profesional_responsable: limpio(findCol(row, "PROFESIONAL")),
      tipo_conductor: mayus(findCol(row, "TIPO DE CONDUCTOR")),
      estado: mayus(findCol(row, "ESTADO")),
      // Lo que ya trae diagnóstico llega cerrado; lo demás queda pendiente de
      // cierre en el formulario de la matriz.
      estado_registro: cie10 ? "cerrado" : "pendiente",
      origen_registro: "excel",
      source_file: fileName,
    });
  }

  return { records, errors };
}

export function processReingresos(data: ArrayBuffer | Uint8Array): ProcessResult {
  const rows = parseSheet(data, undefined, 1);
  const records: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const cedula = normalizeCedula(
      findCol(row, "CEDULA", "CC", "IDENTIFICACION", "IDENTIFICACIÓN")
    );
    if (!cedula || cedula === "0") {
      errors.push("Fila sin cedula valida");
      continue;
    }
    if (seen.has(cedula)) continue;
    seen.add(cedula);

    const fechaReingreso = excelDateToISO(
      findCol(row, "REINGRESO", "FECHA REINGRESO", "FECHA_REINGRESO")
    );
    if (!fechaReingreso) {
      errors.push(`Cedula ${cedula}: fecha de reingreso invalida o vacia`);
      continue;
    }

    records.push({ cedula, fecha_reingreso: fechaReingreso });
  }

  return { records, errors };
}

export function processIncentivos(
  data: ArrayBuffer | Uint8Array,
  fileName: string
): ProcessResult {
  const rows = parseSheet(data, undefined, 1);
  const records: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const cedula = normalizeCedula(
      findCol(row, "CEDULA", "CC", "IDENTIFICACION", "IDENTIFICACIÓN")
    );
    if (!cedula || cedula === "0") {
      errors.push("Fila sin cedula valida");
      continue;
    }

    const mesRaw = findCol(row, "MES DE ENTREGA", "MES ENTREGA", "MES");
    const periodo = mesEntregaToPeriodo(mesRaw);

    // Si mesRaw es un serial numérico de Excel, derivar el texto legible desde el periodo
    let mesDisplay: string | null;
    if (typeof mesRaw === "number" && periodo) {
      const NOMBRES = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
      const [y, m] = periodo.split("-");
      mesDisplay = `${NOMBRES[parseInt(m, 10) - 1]} ${y}`;
    } else {
      mesDisplay = toStr(mesRaw);
    }

    records.push({
      cedula,
      nombre: toStr(findCol(row, "NOMBRE DEL CONDUCTOR", "NOMBRE")),
      mes_entrega: mesDisplay,
      periodo,
      valor: toNum(findCol(row, "VALOR")),
      concepto: toStr(findCol(row, "CONCEPTO")),
      source_file: fileName,
    });
  }

  return { records, errors };
}

export function processFamilia(data: ArrayBuffer | Uint8Array): ProcessResult {
  const rows = parseSheet(data, "Hijos_Conyugue", 1);
  const records: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const cedula = normalizeCedula(row["cedula empleado"]);
    if (!cedula || cedula === "0") {
      errors.push("Fila sin cedula");
      continue;
    }

    records.push({
      cedula_empleado: cedula,
      nombre_familiar: toStr(
        row["Nombres_personasa cargo"] ?? row["Nombres_personas a cargo"]
      ),
      parentesco: toStr(row["Parentesco"]),
      edad: row["edad"] != null ? Number(row["edad"]) : null,
    });
  }

  return { records, errors };
}
