/**
 * ¿Gestivo puede validar solo un documento de la carpeta? (27-nov-2026, pedido
 * de GH: «que solo tengan que validar lo que sea necesario»). Solo cuando la IA
 * lo leyó y coincide con los datos del aspirante; lo que tenga dudas queda para
 * una persona. PURO.
 *
 *  - Hoja de vida: la cédula leída es la del proceso, o el nombre coincide; sin
 *    contradicciones claras con lo que sabemos del aspirante.
 *  - Cédula: el número leído es el del proceso.
 *  - Licencia: el nombre coincide y la licencia ya está verificada (RUNT o a mano).
 *  - Certificado bancario: del Banco de Bogotá, la cuenta no figura cancelada y
 *    el titular es el aspirante (cédula o nombre).
 *  - La carta laboral tiene su propia regla (cartaParaValidarSola).
 *  - Las referencias y lo demás: siempre una persona.
 */
import { nombresCoinciden } from "@/lib/verificacion/nombres";
import type { CampoLeido, ClaseDocumento } from "./esquema";
import { contradiccionesDocumento, type DatosAspirante, type LecturaPrevia } from "./contradicciones";

export type DecisionValidacion = { ok: true; motivo: string } | { ok: false; motivo: string };

const valor = (campos: readonly CampoLeido[], k: string) => campos.find((c) => c.campo === k);
const texto = (campos: readonly CampoLeido[], k: string) => {
  const v = valor(campos, k)?.valor;
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
/** El nombre leído con confianza (no «baja») coincide con el del aspirante. */
function nombreCoincide(campos: readonly CampoLeido[], claves: string[], nombreAspirante: string | null | undefined): boolean {
  if (!nombreAspirante?.trim() || /por confirmar/i.test(nombreAspirante)) return false;
  return claves.some((k) => {
    const c = valor(campos, k);
    const t = texto(campos, k);
    return !!t && c?.confianza !== "baja" && nombresCoinciden(t, nombreAspirante);
  });
}

export function documentoParaValidarSolo(
  clase: ClaseDocumento,
  campos: readonly CampoLeido[],
  aspirante: DatosAspirante & { licenciaVerificada?: boolean },
  previas: readonly LecturaPrevia[],
  hoy: string
): DecisionValidacion {
  if (!campos.length) return { ok: false, motivo: "no se leyó ningún dato" };
  const claras = contradiccionesDocumento(clase, campos, aspirante, previas, hoy).filter((c) => c.nivel === "clara");
  if (claras.length) return { ok: false, motivo: claras.map((c) => c.texto).join(" · ") };
  const cedulaCoincide = texto(campos, "cedula_coincide");
  switch (clase) {
    case "hoja_vida":
      if (cedulaCoincide === "sí") return { ok: true, motivo: "la cédula de la hoja de vida es la del aspirante" };
      if (cedulaCoincide === "no") return { ok: false, motivo: "la cédula de la hoja de vida no es la del aspirante" };
      return nombreCoincide(campos, ["nombre"], aspirante.nombre) ? { ok: true, motivo: "el nombre de la hoja de vida es el del aspirante" } : { ok: false, motivo: "no se pudo confirmar que la hoja de vida sea del aspirante" };
    case "cedula":
      return cedulaCoincide === "sí" ? { ok: true, motivo: "el número de la cédula es el del proceso" } : { ok: false, motivo: "no se pudo confirmar el número de la cédula" };
    case "licencia":
      if (!aspirante.licenciaVerificada) return { ok: false, motivo: "la licencia todavía no está verificada (RUNT o a mano)" };
      return nombreCoincide(campos, ["nombre"], aspirante.nombre) ? { ok: true, motivo: "la licencia es del aspirante y está verificada" } : { ok: false, motivo: "no se pudo confirmar que la licencia sea del aspirante" };
    case "certificado_bancario": {
      if (texto(campos, "banco_bogota") !== "sí") return { ok: false, motivo: "no se confirmó que sea del Banco de Bogotá" };
      if (texto(campos, "cuenta_vigente") === "no") return { ok: false, motivo: "la cuenta no figura vigente" };
      if (cedulaCoincide === "no") return { ok: false, motivo: "el titular tiene otra cédula" };
      return cedulaCoincide === "sí" || nombreCoincide(campos, ["titular"], aspirante.nombre)
        ? { ok: true, motivo: "certificado del Banco de Bogotá a nombre del aspirante" }
        : { ok: false, motivo: "no se pudo confirmar que el titular sea el aspirante" };
    }
    default:
      return { ok: false, motivo: "este documento lo valida una persona" };
  }
}
