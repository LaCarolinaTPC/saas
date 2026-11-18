/**
 * Vínculo del aspirante con la empresa (pedido de GH del 18-nov-2026): antes
 * de seguir con la selección se revisa si la cédula ya está en Gestivo como
 * conductor (tabla `conductores`, que alimenta GEMA).
 * - Activo: ya trabaja con nosotros; se le dice y el proceso se cierra con
 *   CAUSA_YA_TRABAJA, sin consultar Croma.
 * - Retirado: el proceso sigue, queda marcado como reingreso y va a la lista
 *   «Reingresos por revisar» para que lo revise una persona (después habrá
 *   criterios automáticos según la causa de retiro). Nunca queda «Listo para
 *   citar» solo.
 * Parte pura, usable en cliente.
 */
import { causaLabel } from "@/lib/conductores/retiro";

export type TipoVinculo = "activo" | "retirado";

export interface VinculoEmpresa {
  tipo: TipoVinculo;
  cedula: string;
  nombre: string | null;
  codigo: string | null;
  fechaIngreso: string | null;
  fechaRetiro: string | null;
  /** Clave de la causa de retiro (conductores_retiro), si GH la registró. */
  causaRetiro: string | null;
  notaRetiro: string | null;
}

/** Cédula solo con dígitos (5 a 11), o null. */
export function cedulaNormalizada(valor: string | null | undefined): string | null {
  const d = String(valor ?? "").replace(/\D/g, "");
  return d.length >= 5 && d.length <= 11 ? d : null;
}

/**
 * Números que parecen cédula en lo que escribió el aspirante («1.007.892.713»,
 * «72 009 959»). Se descartan los celulares (10 dígitos que empiezan por 3).
 */
export function cedulasMencionadas(textos: string[]): string[] {
  const vistas = new Set<string>();
  for (const t of textos) {
    for (const m of t.matchAll(/\d[\d.\s]{3,14}\d/g)) {
      const d = m[0].replace(/\D/g, "");
      if (d.length < 6 || d.length > 10) continue;
      if (d.length === 10 && d.startsWith("3")) continue;
      vistas.add(d);
    }
  }
  return [...vistas];
}

/** Cómo se muestra en la ficha de Candidatos. */
export function resumenVinculo(v: VinculoEmpresa): string {
  if (v.tipo === "activo") {
    return `Ya es conductor activo de la empresa${v.codigo ? ` (código ${v.codigo})` : ""}${v.fechaIngreso ? `, desde el ${v.fechaIngreso}` : ""}.`;
  }
  const partes = [`Trabajó en la empresa como conductor${v.codigo ? ` (código ${v.codigo})` : ""}`];
  if (v.fechaIngreso || v.fechaRetiro) partes.push(`del ${v.fechaIngreso ?? "?"} al ${v.fechaRetiro ?? "?"}`);
  partes.push(`causa de retiro: ${v.causaRetiro ? causaLabel(v.causaRetiro) : "sin registrar"}`);
  if (v.notaRetiro) partes.push(`nota: ${v.notaRetiro}`);
  return partes.join("; ") + ".";
}
