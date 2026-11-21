/**
 * Interpretación legible de lo que devuelve Croma por fuente, para la ficha
 * de Candidatos: al lado de la respuesta en bruto, lo que significa cada dato.
 * Función pura (también la usa el cliente).
 */

export interface DatoInterpretado {
  etiqueta: string;
  valor: string;
  /** Resalta en rojo lo que es un hallazgo o un incumplimiento. */
  alerta?: boolean;
}

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const siNo = (v: unknown): string => (v === true ? "Sí" : v === false ? "No" : "Sin dato");
const pesos = (v: unknown) => (typeof v === "number" ? `$${Math.round(v).toLocaleString("es-CO")}` : "Sin dato");

export function interpretarConsulta(fuente: string, resultado: unknown): DatoInterpretado[] {
  const r = o(resultado);
  if (!r) return [];
  const d: DatoInterpretado[] = [];
  const add = (etiqueta: string, valor: string | null, alerta = false) => valor != null && d.push({ etiqueta, valor, alerta });

  switch (fuente) {
    case "policia":
      add("Nombre en el certificado", txt(r.full_name));
      add("¿Asuntos pendientes con autoridades judiciales?", siNo(r.has_records), r.has_records === true);
      add("Veredicto", txt(r.status));
      add("Consultado por la fuente", txt(r.checked_at));
      break;
    case "procuraduria":
      add("¿Registrado en el SIRI?", siNo(r.found));
      add("Nombre", txt(r.full_name));
      add("¿Antecedentes disciplinarios?", r.found === false ? "No (no registrado)" : siNo(r.has_records), r.has_records === true);
      add("Veredicto", txt(r.status));
      break;
    case "contraloria": {
      add("¿Responsable fiscal?", siNo(r.is_fiscal_responsible), r.is_fiscal_responsible === true);
      add("Veredicto", txt(r.status));
      add("Código de verificación", txt(r.verification_code));
      const procesos = lista(r.records);
      add("Procesos reportados", String(procesos.length), procesos.length > 0);
      for (const p of procesos.slice(0, 5).map(o)) {
        if (!p) continue;
        add(
          `Fallo ${txt(p.ruling_number) ?? ""}`.trim(),
          [txt(p.ruling_date), txt(p.affected_entity), typeof p.amount === "number" ? pesos(p.amount) : null].filter(Boolean).join(" · "),
          true
        );
      }
      break;
    }
    case "rnmc": {
      add("¿La fecha de expedición coincide con la cédula?", siNo(r.found !== false), r.found === false);
      add("Nombre en el registro civil", txt(r.full_name));
      add("¿Medidas correctivas pendientes?", siNo(r.has_pending_measures), r.has_pending_measures === true);
      const medidas = lista(r.pending_measures);
      if (medidas.length) add("Medidas pendientes", String(medidas.length), true);
      for (const m of medidas.slice(0, 5).map(o)) {
        if (!m) continue;
        add("Medida", Object.values(m).map(txt).filter(Boolean).join(" · ") || "Sin detalle", true);
      }
      add("Veredicto", txt(r.status) ?? txt(r.message));
      add("Número de validación", txt(r.validation_number));
      break;
    }
    case "runt": {
      add("¿Aparece en el RUNT?", siNo(r.found !== false));
      const p = o(r.person);
      add("Nombre en el RUNT", txt(p?.full_name));
      add("Apellido con que se abrió", txt(r.first_surname));
      add("Estado del conductor", txt(p?.driver_status));
      const licencias = lista(r.licenses).map(o).filter(Boolean) as Obj[];
      add("Licencias", String(licencias.length), licencias.length === 0 && r.found !== false);
      for (const l of licencias.slice(0, 5)) {
        const cats = lista(l.categories)
          .map(o)
          .filter(Boolean)
          .map((c) => `${txt((c as Obj).category) ?? "?"}${txt((c as Obj).expiry_date) ? ` vence ${txt((c as Obj).expiry_date)!.slice(0, 10)}` : ""}`)
          .join(", ");
        add(`Licencia ${txt(l.license_number) ?? ""}`.trim(), [txt(l.status), cats, txt(l.restrictions)].filter(Boolean).join(" · "));
      }
      break;
    }
    case "simit": {
      const s = o(r.summary);
      add("¿Tiene cuenta en el SIMIT?", siNo(r.found !== false));
      add("Total adeudado", pesos(s?.total), typeof s?.total === "number" && s.total > 0);
      add("Multas", txt(s?.total_fines) ?? String(lista(r.fines).length));
      break;
    }
  }
  return d;
}
