/**
 * Parámetros de la Política Plan Padrino, por versión (puro, cliente y servidor).
 *
 * Cada fila de `padrino_politicas` guarda en `parametros` (jsonb) lo que antes
 * estaba fijo en el código: esquemas y montos por beneficiario, ventanas,
 * listas (faltas graves, áreas y cargos excluidos, categorías de licencia,
 * causas de retiro) y, por requisito, si está activo, si bloquea y en qué
 * momento se verifica. Las reglas viven en `reglas.ts` y leen esto: cambiar
 * un monto, un plazo o una lista no requiere programar; agregar un requisito
 * que mire un dato nuevo, sí.
 *
 * `PARAMETROS_V2` reproduce exactamente lo que hacía el código antes de la
 * parametrización (lo vigilan las pruebas); `PARAMETROS_V3` es la política
 * actualizada del 2026-11-03 y entra como borrador. La migración
 * 20261103…_plan_padrino_v3 escribe estos mismos valores.
 */
import { z } from "zod";

// ── Esquema ─────────────────────────────────────────────────────────────────

export const LETRAS_ESQUEMA = ["A", "B", "C"] as const;
export type LetraEsquema = (typeof LETRAS_ESQUEMA)[number];
export type Beneficiario = "padrino" | "referido";
export type Momento = "registro" | "contratacion";

const monto = z.number().int().min(0);
const meses = z.number().int().min(0).max(120);
const textos = z.array(z.string().trim().min(1));

const hitoSchema = z.object({
  numero: z.number().int().min(1),
  meses: z.number().int().min(1).max(36),
  descripcion: z.string().trim().min(1),
  pagos: z.object({ padrino: monto, referido: monto }),
  requiere_desempeno: z.boolean().default(false),
});

const esquemaSchema = z
  .object({
    nombre: z.string().trim().min(1),
    condicion: z.string().default(""),
    aplica_a: z.enum(["nuevo_con_experiencia", "nuevo_sin_experiencia", "reintegro"]),
    requiere_certificado: z.boolean().default(false),
    hitos: z.array(hitoSchema).min(1),
  })
  .refine((e) => new Set(e.hitos.map((h) => h.numero)).size === e.hitos.length, {
    message: "Los números de hito de un esquema no se pueden repetir.",
  });

const requisitoSchema = z.object({
  activo: z.boolean(),
  /** Un «no cumple» bloquea la aprobación (salvo excepción documentada). */
  bloquea: z.boolean().default(true),
  /** `contratacion`: se verifica al contratar y no cuenta al decidir la elegibilidad. */
  momento: z.enum(["registro", "contratacion"]).default("registro"),
});

export const parametrosSchema = z.object({
  esquemas: z
    .object({ A: esquemaSchema.optional(), B: esquemaSchema.optional(), C: esquemaSchema.optional() })
    .refine((e) => Boolean(e.A || e.B || e.C), { message: "La política necesita al menos un esquema." }),
  padrino: z.object({
    /**
     * `lista_blanca` (v2): de los empleados, solo los autorizados en
     * padrino_empleados_autorizados. `excluidos` (v3): cualquier empleado,
     * salvo las áreas y cargos excluidos; la tabla pasa a ser la lista de
     * excepciones a la exclusión (el instructor de conducción).
     */
    modo_empleados: z.enum(["lista_blanca", "excluidos"]),
    antiguedad_minima_meses: meses,
    /** v2 (P3): cualquier descargo o correctivo en esta ventana. */
    ventana_sanciones_meses: meses,
    /** v3 (P5, P6): descargos vigentes y faltas graves en esta ventana. */
    ventana_faltas_graves_meses: meses,
    accidente_grave: z.object({ responsabilidad: textos, niveles: textos }),
    /** Gestivo no registra alcohol ni fraude en recaudo: P6 queda en «revisar» si no hay otra falta. */
    revisar_faltas_sin_fuente: z.boolean(),
    excluidos: z.object({ areas: z.array(z.string()), cargos: z.array(z.string()) }),
    /** La parte del padrino exige que siga con contrato vigente en cada fecha de pago. */
    debe_seguir_activo_para_cobrar: z.boolean(),
    /** Si el padrino se retira, el referido conserva sus pagos. */
    referido_conserva_si_padrino_se_retira: z.boolean(),
  }),
  referido: z.object({
    categorias_licencia: textos,
    ventana_hoja_vida_meses: meses,
    /**
     * R13: días de gracia entre el inicio del proceso de selección y el
     * registro del padrino (0 = el registro tiene que ser el mismo día o antes).
     */
    tolerancia_registro_dias: z.number().int().min(0).max(365).default(0),
    reintegro: z.object({
      /** Apagado (v2): un reintegro se trata como cualquier otro referido. */
      activo: z.boolean(),
      meses_minimos_fuera: meses,
      tipos_causa_permitidos: z.array(z.enum(["voluntario", "empresa", "otro"])),
      causas_que_excluyen: z.array(z.string()),
      nunca_esquema: z.array(z.enum(LETRAS_ESQUEMA)),
    }),
  }),
  requisitos: z.record(z.string(), requisitoSchema),
});

export type ParametrosPolitica = z.output<typeof parametrosSchema>;
export type EsquemaParametros = NonNullable<ParametrosPolitica["esquemas"]["A"]>;
export type HitoParametros = EsquemaParametros["hitos"][number];
export type RequisitoParametros = ParametrosPolitica["requisitos"][string];

// ── Catálogo de requisitos ──────────────────────────────────────────────────

/**
 * Los requisitos que sabe evaluar `reglas.ts`. El código es estable (queda en
 * las validaciones congeladas de cada referido); el título es el de la
 * pantalla. Agregar uno aquí exige programar su regla.
 */
export const CATALOGO_REQUISITOS = [
  { codigo: "P1", sujeto: "padrino", titulo: "Contrato vigente" },
  { codigo: "P2", sujeto: "padrino", titulo: "No participa en la selección ni en la aprobación del ingreso" },
  { codigo: "P3", sujeto: "padrino", titulo: "Sin sanciones ni procesos disciplinarios en la ventana" },
  { codigo: "P4", sujeto: "padrino", titulo: "Antigüedad mínima en la empresa" },
  { codigo: "P5", sujeto: "padrino", titulo: "Sin proceso disciplinario abierto" },
  { codigo: "P6", sujeto: "padrino", titulo: "Sin faltas graves en la ventana" },
  { codigo: "R1", sujeto: "referido", titulo: "Sin procesos disciplinarios o laborales con la compañía" },
  { codigo: "R2", sujeto: "referido", titulo: "Sin hoja de vida en selección en la ventana" },
  { codigo: "R3", sujeto: "referido", titulo: "Sin otro proceso de selección en curso" },
  { codigo: "R4", sujeto: "referido", titulo: "No se retiró antes de cumplir 1 mes en una contratación anterior" },
  { codigo: "R5", sujeto: "referido", titulo: "Sin accidentes de tránsito anteriores" },
  { codigo: "R6", sujeto: "referido", titulo: "Licencia de conducción en la categoría requerida" },
  { codigo: "R7", sujeto: "referido", titulo: "Antecedentes sin anotaciones que impidan contratar" },
  { codigo: "R8", sujeto: "referido", titulo: "Examen médico ocupacional y prueba psicosensométrica" },
  { codigo: "R9", sujeto: "referido", titulo: "Inducción y capacitación PESV" },
  { codigo: "R10", sujeto: "referido", titulo: "Certificados laborales de experiencia (esquema A)" },
  { codigo: "R11", sujeto: "referido", titulo: "Sin bonificación pagada antes por esta cédula" },
  { codigo: "R12", sujeto: "referido", titulo: "Tipo de ingreso y reglas de reintegro" },
  { codigo: "R13", sujeto: "referido", titulo: "Hoja de vida registrada por el padrino antes de iniciar la selección" },
] as const;

export type CodigoRequisito = (typeof CATALOGO_REQUISITOS)[number]["codigo"];

// ── Valores de cada versión ─────────────────────────────────────────────────

const apagado = { activo: false, bloquea: true, momento: "registro" } as const;
const duro = { activo: true, bloquea: true, momento: "registro" } as const;
const blando = { activo: true, bloquea: false, momento: "registro" } as const;
const alContratar = { activo: true, bloquea: false, momento: "contratacion" } as const;

/** v2 (vigente desde el 2026-10-01): exactamente lo que hacía el código antes. */
export const PARAMETROS_V2: ParametrosPolitica = {
  esquemas: {
    A: {
      nombre: "Con experiencia",
      condicion: "Experiencia certificada en transporte público urbano de Barranquilla",
      aplica_a: "nuevo_con_experiencia",
      requiere_certificado: true,
      hitos: [
        { numero: 1, meses: 1, descripcion: "Mes 1 de permanencia", pagos: { padrino: 150000, referido: 0 }, requiere_desempeno: false },
        { numero: 2, meses: 2, descripcion: "Mes 2 de permanencia", pagos: { padrino: 200000, referido: 0 }, requiere_desempeno: false },
        { numero: 3, meses: 3, descripcion: "Mes 3 de permanencia", pagos: { padrino: 350000, referido: 0 }, requiere_desempeno: false },
      ],
    },
    B: {
      nombre: "Sin experiencia",
      condicion: "Sin experiencia en transporte urbano, o experiencia en otras ciudades",
      aplica_a: "nuevo_sin_experiencia",
      requiere_certificado: false,
      hitos: [
        { numero: 1, meses: 1, descripcion: "Cumplido mes 1", pagos: { padrino: 100000, referido: 0 }, requiere_desempeno: false },
        { numero: 2, meses: 3, descripcion: "3 meses de permanencia continua y desempeño satisfactorio", pagos: { padrino: 100000, referido: 0 }, requiere_desempeno: true },
      ],
    },
  },
  padrino: {
    modo_empleados: "lista_blanca",
    antiguedad_minima_meses: 0,
    ventana_sanciones_meses: 6,
    ventana_faltas_graves_meses: 6,
    accidente_grave: { responsabilidad: ["directo"], niveles: ["III", "IV"] },
    revisar_faltas_sin_fuente: false,
    excluidos: { areas: [], cargos: [] },
    debe_seguir_activo_para_cobrar: true,
    referido_conserva_si_padrino_se_retira: true,
  },
  referido: {
    categorias_licencia: ["C2", "C3"],
    ventana_hoja_vida_meses: 12,
    tolerancia_registro_dias: 0,
    reintegro: { activo: false, meses_minimos_fuera: 0, tipos_causa_permitidos: ["voluntario", "empresa", "otro"], causas_que_excluyen: [], nunca_esquema: [] },
  },
  requisitos: {
    P1: duro, P2: duro, P3: duro, P4: apagado, P5: apagado, P6: apagado,
    R1: duro, R2: duro, R3: duro, R4: duro, R5: duro,
    R6: apagado, R7: apagado, R8: apagado, R9: apagado, R10: apagado, R11: apagado, R12: apagado, R13: apagado,
  },
};

/** v3 (Política Plan Padrino actualizada, 2026-11-03). Entra como borrador. */
export const PARAMETROS_V3: ParametrosPolitica = {
  esquemas: {
    A: {
      nombre: "Con experiencia (nuevo)",
      condicion: "Nunca ha trabajado en la empresa y tiene experiencia certificada en transporte público urbano de Barranquilla",
      aplica_a: "nuevo_con_experiencia",
      requiere_certificado: true,
      hitos: [
        { numero: 1, meses: 1, descripcion: "Cumplido mes 1", pagos: { padrino: 100000, referido: 0 }, requiere_desempeno: false },
        { numero: 2, meses: 2, descripcion: "Cumplido mes 2", pagos: { padrino: 200000, referido: 100000 }, requiere_desempeno: false },
        { numero: 3, meses: 3, descripcion: "Cumplido mes 3", pagos: { padrino: 200000, referido: 100000 }, requiere_desempeno: false },
      ],
    },
    B: {
      nombre: "Sin experiencia",
      condicion: "Sin experiencia en transporte público urbano, o con experiencia solo en otras ciudades",
      aplica_a: "nuevo_sin_experiencia",
      requiere_certificado: false,
      hitos: [
        { numero: 1, meses: 1, descripcion: "Cumplido mes 1", pagos: { padrino: 100000, referido: 0 }, requiere_desempeno: false },
        { numero: 2, meses: 3, descripcion: "Cumplido mes 3", pagos: { padrino: 100000, referido: 0 }, requiere_desempeno: false },
      ],
    },
    C: {
      nombre: "Reintegro",
      condicion: "Extrabajador con 6 meses o más por fuera, retiro voluntario y sin pago previo de padrino",
      aplica_a: "reintegro",
      requiere_certificado: false,
      hitos: [
        { numero: 1, meses: 1, descripcion: "Cumplido mes 1", pagos: { padrino: 100000, referido: 100000 }, requiere_desempeno: false },
        { numero: 2, meses: 3, descripcion: "Cumplido mes 3", pagos: { padrino: 100000, referido: 100000 }, requiere_desempeno: false },
      ],
    },
  },
  padrino: {
    modo_empleados: "excluidos",
    antiguedad_minima_meses: 3,
    ventana_sanciones_meses: 12,
    ventana_faltas_graves_meses: 12,
    accidente_grave: { responsabilidad: ["directo"], niveles: ["III", "IV"] },
    revisar_faltas_sin_fuente: true,
    // Por confirmar con Gestión Humana (D4) antes de publicar. Los nombres son
    // los de `departments.name` y `employees.position` (se comparan sin
    // tildes ni mayúsculas). Selección está dentro de Recursos Humanos; los
    // «jefes que aprueban la contratación» (cargos) los debe listar GH.
    excluidos: { areas: ["RECURSOS HUMANOS", "RRHH"], cargos: [] },
    debe_seguir_activo_para_cobrar: true,
    referido_conserva_si_padrino_se_retira: true,
  },
  referido: {
    categorias_licencia: ["C2", "C3"],
    ventana_hoja_vida_meses: 6,
    tolerancia_registro_dias: 0,
    reintegro: {
      activo: true,
      meses_minimos_fuera: 6,
      tipos_causa_permitidos: ["voluntario"],
      causas_que_excluyen: ["JUSTA_CAUSA"],
      nunca_esquema: ["A"],
    },
  },
  requisitos: {
    P1: duro, P2: duro, P3: apagado, P4: duro, P5: duro, P6: duro,
    R1: duro, R2: duro, R3: duro, R4: apagado, R5: apagado,
    R6: alContratar, R7: alContratar, R8: alContratar, R9: alContratar,
    R10: blando, R11: duro, R12: blando, R13: duro,
  },
};

// ── Lectura ─────────────────────────────────────────────────────────────────

export type ResultadoParametros = { ok: true; parametros: ParametrosPolitica } | { ok: false; error: string };

/** Valida los parámetros (al guardar y al leer). Nunca lanza. */
export function parsearParametros(json: unknown): ResultadoParametros {
  const r = parametrosSchema.safeParse(json);
  if (r.success) return { ok: true, parametros: r.data };
  const i = r.error.issues[0];
  return { ok: false, error: `${i.path.join(".") || "parámetros"}: ${i.message}` };
}

/** Forma de `padrino_politicas.esquemas` (la columna de antes de la parametrización). */
interface EsquemasViejos {
  [letra: string]: { nombre: string; condicion: string; hitos: { numero: number; meses: number; valor: number; descripcion: string; requiere_desempeno?: boolean }[] } | undefined;
}

/**
 * Respaldo para una fila sin `parametros` (p. ej. si el código llega antes de
 * la migración): los montos de `esquemas`, todos al padrino, y el resto como
 * la v2.
 */
export function parametrosDesdeEsquemas(esquemas: unknown): ParametrosPolitica {
  const viejos = (esquemas ?? {}) as EsquemasViejos;
  const convertir = (letra: "A" | "B", base: EsquemaParametros): EsquemaParametros => {
    const e = viejos[letra];
    if (!e?.hitos?.length) return base;
    return {
      ...base,
      nombre: e.nombre ?? base.nombre,
      condicion: e.condicion ?? base.condicion,
      hitos: e.hitos.map((h) => ({
        numero: h.numero,
        meses: h.meses,
        descripcion: h.descripcion,
        pagos: { padrino: Number(h.valor) || 0, referido: 0 },
        requiere_desempeno: Boolean(h.requiere_desempeno),
      })),
    };
  };
  return {
    ...PARAMETROS_V2,
    esquemas: { A: convertir("A", PARAMETROS_V2.esquemas.A!), B: convertir("B", PARAMETROS_V2.esquemas.B!) },
  };
}

/** Los parámetros de una fila: los suyos si son válidos; si no, los derivados de `esquemas`. */
export function parametrosDeFila(fila: { parametros?: unknown; esquemas?: unknown }): ParametrosPolitica {
  if (fila.parametros) {
    const r = parsearParametros(fila.parametros);
    if (r.ok) return r.parametros;
    console.error("[padrino] parámetros de política inválidos, se usan los esquemas:", r.error);
  }
  return parametrosDesdeEsquemas(fila.esquemas);
}

/** Configuración de un requisito; uno que la versión no mencione queda apagado. */
export function requisito(p: ParametrosPolitica, codigo: string): RequisitoParametros {
  return p.requisitos[codigo] ?? { activo: false, bloquea: true, momento: "registro" };
}

/** Totales de un esquema por beneficiario. */
export function totalesEsquema(e: EsquemaParametros | undefined) {
  const padrino = (e?.hitos ?? []).reduce((s, h) => s + h.pagos.padrino, 0);
  const referido = (e?.hitos ?? []).reduce((s, h) => s + h.pagos.referido, 0);
  return { padrino, referido, total: padrino + referido };
}

// ── Publicación ─────────────────────────────────────────────────────────────

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** El día anterior a una fecha AAAA-MM-DD. */
function diaAnterior(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface VersionPublicada {
  id: string;
  version: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
}

export type ResultadoPublicacion =
  | { ok: true; cerrar: { id: string; version: string; hasta: string }[] }
  | { ok: false; error: string };

/**
 * Valida la publicación de un borrador y dice qué versión hay que cerrar.
 *
 * Reglas: la fecha de vigencia es hoy o futura (publicar hacia atrás no
 * cambiaría a los ya contratados y confundiría); no puede cruzarse con otra
 * versión publicada (una que empiece ese día o después, o una ya cerrada que
 * llegue hasta esa fecha); la abierta (sin `vigente_hasta`) se cierra el día
 * anterior. Quién aprobó y el soporte son obligatorios, y los parámetros del
 * borrador tienen que ser válidos.
 */
export function validarPublicacion(e: {
  parametros: unknown;
  publicadas: VersionPublicada[];
  vigenteDesde: string;
  hoy: string;
  aprobadaPor: string;
  soporte: string;
}): ResultadoPublicacion {
  if (!FECHA_RE.test(e.vigenteDesde) || Number.isNaN(Date.parse(`${e.vigenteDesde}T00:00:00Z`))) {
    return { ok: false, error: "Indique la fecha desde la que rige la versión." };
  }
  if (e.vigenteDesde < e.hoy) return { ok: false, error: "La fecha de vigencia no puede ser anterior a hoy." };
  if (!e.aprobadaPor.trim()) return { ok: false, error: "Indique quién aprobó la versión (p. ej. Gerencia General)." };
  if (e.aprobadaPor.trim().length > 200) return { ok: false, error: "«Aprobada por» no puede pasar de 200 caracteres." };
  if (!e.soporte.trim()) return { ok: false, error: "Describa el soporte de la aprobación (documento firmado, fecha, acta)." };
  if (e.soporte.trim().length > 1000) return { ok: false, error: "El soporte no puede pasar de 1000 caracteres." };
  const p = parsearParametros(e.parametros);
  if (!p.ok) return { ok: false, error: `Los parámetros del borrador no son válidos: ${p.error}` };

  const cerrar: { id: string; version: string; hasta: string }[] = [];
  for (const v of e.publicadas) {
    if (!v.vigente_desde) continue;
    if (v.vigente_desde >= e.vigenteDesde) {
      return { ok: false, error: `La versión ${v.version} rige desde el ${v.vigente_desde}: la nueva tiene que empezar después.` };
    }
    if (v.vigente_hasta === null) cerrar.push({ id: v.id, version: v.version, hasta: diaAnterior(e.vigenteDesde) });
    else if (v.vigente_hasta >= e.vigenteDesde) {
      return { ok: false, error: `La versión ${v.version} ya está cerrada hasta el ${v.vigente_hasta}, que se cruza con la fecha elegida.` };
    }
  }
  return { ok: true, cerrar };
}

// ── Borradores: nombre, columna vieja y diferencias ─────────────────────────

/** El nombre de la versión siguiente: v2, v3 → v4. */
export function siguienteVersion(versiones: string[]): string {
  const n = Math.max(0, ...versiones.map((v) => Number(/^v(\d+)$/i.exec(v.trim())?.[1] ?? 0)));
  return `v${n + 1}`;
}

/**
 * La columna vieja `esquemas` (solo para lo que todavía la lea): cada hito con
 * el total que paga (padrino + referido). Manda `parametros`.
 */
export function esquemasLegadoDe(p: ParametrosPolitica) {
  const out: Record<string, { nombre: string; condicion: string; hitos: { numero: number; meses: number; valor: number; descripcion: string; requiere_desempeno?: boolean }[] }> = {};
  for (const l of LETRAS_ESQUEMA) {
    const e = p.esquemas[l];
    if (!e) continue;
    out[l] = {
      nombre: e.nombre,
      condicion: e.condicion,
      hitos: e.hitos.map((h) => ({ numero: h.numero, meses: h.meses, valor: h.pagos.padrino + h.pagos.referido, descripcion: h.descripcion, ...(h.requiere_desempeno ? { requiere_desempeno: true } : {}) })),
    };
  }
  return out;
}

const pesos = (n: number) => `$${n.toLocaleString("es-CO")}`;
const lista = (xs: readonly string[]) => (xs.length ? xs.join(", ") : "ninguna");
const sino = (b: boolean) => (b ? "sí" : "no");

/**
 * Qué cambia de una versión a otra, en frases para mostrar (no exhaustivo
 * en el detalle, pero sí en los campos: un cambio en cualquier parámetro
 * aparece). Sirve para revisar un borrador antes de publicarlo.
 */
export function diferencias(antes: ParametrosPolitica, despues: ParametrosPolitica): string[] {
  const out: string[] = [];
  const cambio = (titulo: string, a: string, d: string) => {
    if (a !== d) out.push(`${titulo}: ${a} → ${d}`);
  };

  for (const l of LETRAS_ESQUEMA) {
    const a = antes.esquemas[l];
    const d = despues.esquemas[l];
    if (!a && d) {
      out.push(`Esquema ${l} nuevo (${d.nombre}): ${pesos(totalesEsquema(d).total)} — ${d.hitos.map((h) => `mes ${h.meses}: padrino ${pesos(h.pagos.padrino)}${h.pagos.referido ? ` + referido ${pesos(h.pagos.referido)}` : ""}`).join(" · ")}`);
      continue;
    }
    if (a && !d) {
      out.push(`Esquema ${l} eliminado (${a.nombre})`);
      continue;
    }
    if (!a || !d) continue;
    cambio(`Esquema ${l}, nombre`, a.nombre, d.nombre);
    cambio(`Esquema ${l}, condición`, a.condicion, d.condicion);
    const ta = totalesEsquema(a);
    const td = totalesEsquema(d);
    cambio(`Esquema ${l}, total`, `${pesos(ta.total)} (padrino ${pesos(ta.padrino)}, referido ${pesos(ta.referido)})`, `${pesos(td.total)} (padrino ${pesos(td.padrino)}, referido ${pesos(td.referido)})`);
    const numeros = [...new Set([...a.hitos, ...d.hitos].map((h) => h.numero))].sort((x, y) => x - y);
    for (const n of numeros) {
      const ha = a.hitos.find((h) => h.numero === n);
      const hd = d.hitos.find((h) => h.numero === n);
      const txt = (h: HitoParametros | undefined) =>
        h ? `mes ${h.meses}, padrino ${pesos(h.pagos.padrino)}, referido ${pesos(h.pagos.referido)}${h.requiere_desempeno ? ", exige desempeño" : ""}` : "no existe";
      cambio(`Esquema ${l}, hito ${n}`, txt(ha), txt(hd));
    }
  }

  const pa = antes.padrino;
  const pd = despues.padrino;
  const modo = (m: string) => (m === "lista_blanca" ? "solo empleados autorizados" : "cualquier empleado salvo excluidos");
  cambio("Padrino, empleados", modo(pa.modo_empleados), modo(pd.modo_empleados));
  cambio("Padrino, antigüedad mínima", `${pa.antiguedad_minima_meses} meses`, `${pd.antiguedad_minima_meses} meses`);
  cambio("Padrino, ventana de sanciones", `${pa.ventana_sanciones_meses} meses`, `${pd.ventana_sanciones_meses} meses`);
  cambio("Padrino, ventana de faltas graves", `${pa.ventana_faltas_graves_meses} meses`, `${pd.ventana_faltas_graves_meses} meses`);
  cambio("Padrino, accidente grave (responsabilidad)", lista(pa.accidente_grave.responsabilidad), lista(pd.accidente_grave.responsabilidad));
  cambio("Padrino, accidente grave (niveles)", lista(pa.accidente_grave.niveles), lista(pd.accidente_grave.niveles));
  cambio("Padrino, revisar alcohol y fraude", sino(pa.revisar_faltas_sin_fuente), sino(pd.revisar_faltas_sin_fuente));
  cambio("Padrino, áreas excluidas", lista(pa.excluidos.areas), lista(pd.excluidos.areas));
  cambio("Padrino, cargos excluidos", lista(pa.excluidos.cargos), lista(pd.excluidos.cargos));
  cambio("Padrino, debe seguir activo para cobrar", sino(pa.debe_seguir_activo_para_cobrar), sino(pd.debe_seguir_activo_para_cobrar));
  cambio("Referido conserva sus pagos si el padrino se retira", sino(pa.referido_conserva_si_padrino_se_retira), sino(pd.referido_conserva_si_padrino_se_retira));

  const ra = antes.referido;
  const rd = despues.referido;
  cambio("Referido, categorías de licencia", lista(ra.categorias_licencia), lista(rd.categorias_licencia));
  cambio("Referido, ventana de hoja de vida", `${ra.ventana_hoja_vida_meses} meses`, `${rd.ventana_hoja_vida_meses} meses`);
  cambio("Referido, días de gracia para registrar después de iniciar la selección", `${ra.tolerancia_registro_dias}`, `${rd.tolerancia_registro_dias}`);
  cambio("Reintegros con reglas propias", sino(ra.reintegro.activo), sino(rd.reintegro.activo));
  cambio("Reintegro, meses mínimos fuera", `${ra.reintegro.meses_minimos_fuera}`, `${rd.reintegro.meses_minimos_fuera}`);
  cambio("Reintegro, tipos de retiro permitidos", lista(ra.reintegro.tipos_causa_permitidos), lista(rd.reintegro.tipos_causa_permitidos));
  cambio("Reintegro, causas que excluyen", lista(ra.reintegro.causas_que_excluyen), lista(rd.reintegro.causas_que_excluyen));
  cambio("Reintegro, nunca por el esquema", lista(ra.reintegro.nunca_esquema), lista(rd.reintegro.nunca_esquema));

  for (const { codigo, titulo } of CATALOGO_REQUISITOS) {
    const a = requisito(antes, codigo);
    const d = requisito(despues, codigo);
    const txt = (r: RequisitoParametros) => (r.activo ? `activo, ${r.bloquea ? "bloquea" : "no bloquea"}${r.momento === "contratacion" ? ", al contratar" : ""}` : "apagado");
    cambio(`${codigo} ${titulo}`, txt(a), txt(d));
  }
  return out;
}

/** El mayor total entre los esquemas de la versión (lo muestra el TV). */
export function maximoPolitica(p: ParametrosPolitica): number {
  return Math.max(0, ...LETRAS_ESQUEMA.map((l) => totalesEsquema(p.esquemas[l]).total));
}
