/**
 * La llamada a la IA de «Documentos» para leer el certificado que se adjunta en
 * «Lo revisé a mano» (26-nov-2026). Solo servidor. Respeta el tope mensual de
 * gasto y registra el costo como una lectura. No guarda nada: devuelve lo leído
 * para que la persona lo revise en el formulario y guarde.
 */
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { leerImagen } from "@/lib/comunicaciones/agente/proveedores";
import { registrarConsumo, topeAlcanzado } from "@/lib/seleccion/consumos-servidor";
import { SISTEMA_CERTIFICADO, instruccionCertificado, interpretarCertificado, type FuenteCertificado, type LecturaCertificado } from "./lectura-certificado";

const MAX_BASE64 = 950_000; // ~700 KB, el mismo tope del formulario

export async function leerCertificado(d: {
  fuente: FuenteCertificado;
  base64: string;
  nombre?: string | null;
  cedulaProceso: string | null;
  nombreProceso?: string | null;
  procesoId: string;
  hoy: string;
}): Promise<{ ok: true; lectura: LecturaCertificado } | { ok: false; error: string }> {
  if (!d.base64.startsWith("JVBERi0")) return { ok: false, error: "El archivo no es un PDF." };
  if (d.base64.length > MAX_BASE64) return { ok: false, error: "El PDF pesa más de 700 KB." };
  if (await topeAlcanzado()) return { ok: false, error: "Se alcanzó el tope mensual de gasto de la IA: llene la revisión a mano." };
  const { config, claves } = await getAgenteConClaves();
  try {
    const r = await leerImagen(config, claves, SISTEMA_CERTIFICADO, instruccionCertificado(d.fuente), {
      tipo: "application/pdf",
      base64: d.base64,
      nombre: d.nombre || `certificado-${d.fuente}.pdf`,
    });
    await registrarConsumo({
      concepto: "lectura",
      proveedor: config.proveedor,
      modelo: r.modeloUsado,
      tokensEntrada: r.tokensEntrada,
      tokensSalida: r.tokensSalida,
      costoUsd: r.costoUsd ?? undefined,
      procesoId: d.procesoId,
    });
    const lectura = interpretarCertificado(r.texto, d.fuente, d.cedulaProceso, d.hoy, d.nombreProceso ?? null);
    if (!lectura) return { ok: false, error: "La IA no devolvió una lectura que se pueda usar: llene la revisión a mano." };
    return { ok: true, lectura };
  } catch (e) {
    return { ok: false, error: `No se pudo leer con la IA (${e instanceof Error ? e.message : "error"}): llene la revisión a mano.` };
  }
}
