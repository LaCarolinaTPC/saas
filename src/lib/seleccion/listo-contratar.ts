/**
 * «Listo para contratar» (25-nov-2026): el correo que avisa a Gestión Humana.
 * PURO (la regla está en ./contratacion; lo de la base, en ./listo-contratar-servidor).
 */
import type { Condicion } from "./contratacion";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** El correo a Gestión Humana cuando un aspirante entra a la etapa. */
export function armarCorreoListo(
  p: { nombre: string; cedula: string; vacante?: string | null },
  condiciones: readonly Condicion[],
  url: string,
  desarrollo = false
): { asunto: string; texto: string; html: string } {
  // El visto bueno es justo lo que falta: no va en la lista de lo cumplido.
  const cumplidas = condiciones.filter((c) => c.id !== "aprobacion");
  const enlace = `${url}/candidatos?estado=listo_contratar&q=${encodeURIComponent(p.cedula)}`;
  const asunto = `${desarrollo ? "[DESARROLLO] " : ""}Listo para contratar: ${p.nombre} (CC ${p.cedula})`;
  const intro = `${p.nombre} (CC ${p.cedula})${p.vacante ? `, ${p.vacante},` : ""} ya cumple todo para contratar y quedó en «Listo para contratar».`;
  const falta = "Falta revisarlo, dar el visto bueno y pasarlo a «Contratado».";
  const texto = [intro, "", ...cumplidas.map((c) => `- ${c.nombre}: ${c.detalle}`), "", falta, enlace, "", "Gestivo · Transportes La Carolina"].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;max-width:560px">
<p>${esc(intro)}</p>
<table style="border-collapse:collapse;width:100%">${cumplidas
    .map((c) => `<tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:#4d7c0f">&#10003;</td><td style="padding:4px 0"><strong>${esc(c.nombre)}</strong><br><span style="color:#64748b;font-size:12px">${esc(c.detalle)}</span></td></tr>`)
    .join("")}</table>
<p>${esc(falta)}</p>
<p><a href="${esc(enlace)}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:8px 14px;border-radius:8px;text-decoration:none">Abrir en Candidatos</a></p>
<p style="font-size:12px;color:#64748b">Gestivo · Transportes La Carolina. Los destinatarios se cambian en Selección › Tiempos y reglas › «Escuela, exámenes y contratación».</p>
</div>`;
  return { asunto, texto, html };
}
