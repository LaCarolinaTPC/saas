/**
 * Lo que es FIJO del origen MGX: empresas, módulos y tablas. PURO.
 *
 * MGX organiza su base ETL (`etl_00027`) en un esquema por empresa y módulo:
 * `emp{N}{co|no|in|rh}`. El PDF de MGX nombra las VISTAS, pero el usuario ETL
 * también ve las tablas base, y son las que se copian: todas tienen `ide`
 * (único, creciente en el tiempo), que es lo que permite traer solo lo nuevo.
 * Las vistas se recrean en Gestivo sobre la copia (ver `esquema.ts`).
 *
 * Inspeccionado el 2026-10-21 (ver docs/mgx-sincronizacion.md):
 *   · emp0 (La Carolina) tiene los cuatro módulos;
 *   · emp2, emp3, emp8 y emp11 tienen contable, nómina y empleados;
 *   · emp10 y emp12 solo contable, y hoy vacío.
 */

export const EMPRESAS = ["emp0", "emp2", "emp3", "emp8", "emp10", "emp11", "emp12"] as const;
export type Empresa = (typeof EMPRESAS)[number];

export const MODULOS = ["co", "no", "in", "rh"] as const;
export type Modulo = (typeof MODULOS)[number];

export const NOMBRE_EMPRESA: Record<Empresa, string> = {
  emp0: "MET. TRANSP. LA CAROLINA SAS",
  emp2: "ANAYA GIRALDO S.A.S.",
  emp3: "NORMA SOFIA GIRALDO DE ANAYA",
  emp8: "SISTEMA METROPOLITANO DE RECAUDO S.A.S.",
  emp10: "WILFRED SMITH ANAYA ORTEGA",
  emp11: "SISTEMAS PRACTICOS SAS",
  emp12: "COMERCIALIZADORA Y DISTRIBUIDORA EL TAMARAL S.A.S.",
};

export const NOMBRE_MODULO: Record<Modulo, string> = {
  co: "Contable",
  no: "Nómina",
  in: "Inventarios",
  rh: "Empleados",
};

/**
 * Las tablas base de cada módulo, en orden de dependencia: primero los
 * maestros, después la cabeza y al final el cuerpo (que se re-trae por los
 * documentos cuya cabeza cambió).
 */
export const TABLAS: Record<Modulo, readonly string[]> = {
  co: ["pri_cos", "pri_cta", "pri_ter", "cabeza", "cuerpo"],
  no: [
    "obs_liq", "pri_car", "pri_con", "pri_ctr", "pri_dpt", "pri_epr", "pri_est", "pri_gpa", "pri_per",
    "cabeza", "cuerpo",
  ],
  in: [
    "det_lpr", "mgx_csc", "pri_bod", "pri_col", "pri_gru", "pri_lin", "pri_lis", "pri_mov", "pri_ref",
    "pri_sgr", "pri_tal", "pri_und", "cabeza", "cuerpo",
  ],
  rh: ["pri_epl"],
};

export const MODULOS_POR_EMPRESA: Record<Empresa, readonly Modulo[]> = {
  emp0: ["co", "no", "in", "rh"],
  emp2: ["co", "no", "rh"],
  emp3: ["co", "no", "rh"],
  emp8: ["co", "no", "rh"],
  emp10: ["co"],
  emp11: ["co", "no", "rh"],
  emp12: ["co"],
};

/**
 * Tablas con columna de edición que NO sirve de marca. Medido el 2026-10-21:
 *   · `no.cuerpo.fhe` no se actualiza desde 2016;
 *   · `rh.pri_epl.fhe` es el centinela `1001-01-01` en todas las filas.
 * Las dos son chicas o se re-traen por su cabeza, así que no hace falta.
 */
export const EDICION_NO_FIABLE: ReadonlySet<string> = new Set(["no.cuerpo", "rh.pri_epl"]);

export interface Par {
  empresa: Empresa;
  modulo: Modulo;
  tabla: string;
}

/** `mgx_co_cuerpo`: la tabla espejo en Gestivo. */
export function nombreEspejo(modulo: Modulo, tabla: string): string {
  return `mgx_${modulo}_${tabla}`;
}

/** `emp0co`: el esquema de origen en MGX. */
export function esquemaOrigen(empresa: Empresa, modulo: Modulo): string {
  return `${empresa}${modulo}`;
}

/** `emp0co.cuerpo`, para la bitácora y la pantalla. */
export function etiquetaPar(p: Par): string {
  return `${esquemaOrigen(p.empresa, p.modulo)}.${p.tabla}`;
}

export function esEmpresa(v: unknown): v is Empresa {
  return typeof v === "string" && (EMPRESAS as readonly string[]).includes(v);
}

export function esModulo(v: unknown): v is Modulo {
  return typeof v === "string" && (MODULOS as readonly string[]).includes(v);
}

/** El par existe en MGX: la empresa tiene ese módulo y el módulo esa tabla. */
export function parValido(p: { empresa?: unknown; modulo?: unknown; tabla?: unknown }): p is Par {
  return (
    esEmpresa(p.empresa) &&
    esModulo(p.modulo) &&
    MODULOS_POR_EMPRESA[p.empresa].includes(p.modulo) &&
    typeof p.tabla === "string" &&
    TABLAS[p.modulo].includes(p.tabla)
  );
}

/**
 * Los pares de un alcance («todas», una empresa, un módulo, una tabla), en
 * orden de trabajo: empresa por empresa, módulo co → no → in → rh, y dentro
 * del módulo maestros → cabeza → cuerpo.
 */
export function expandirAlcance(a: { empresa?: Empresa; modulo?: Modulo; tabla?: string } = {}): Par[] {
  const salida: Par[] = [];
  for (const empresa of EMPRESAS) {
    if (a.empresa && a.empresa !== empresa) continue;
    for (const modulo of MODULOS) {
      if (!MODULOS_POR_EMPRESA[empresa].includes(modulo)) continue;
      if (a.modulo && a.modulo !== modulo) continue;
      for (const tabla of TABLAS[modulo]) {
        if (a.tabla && a.tabla !== tabla) continue;
        salida.push({ empresa, modulo, tabla });
      }
    }
  }
  return salida;
}
