"use client";

import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const botonCls =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC]";

export function copiar(texto: string, aviso: string) {
  navigator.clipboard.writeText(texto).then(() => toast.success(aviso), () => toast.error("No se pudo copiar; selecciónelo y cópielo a mano"));
}

/**
 * Mensaje para enviarle al afiliado. Con clave (recién creada o restablecida)
 * lleva usuario y clave provisional; sin ella, solo el enlace y el correo.
 */
export function mensajeAfiliado(p: { url: string; nombre?: string | null; email?: string | null; clave?: string | null }): string {
  const saludo = p.nombre ? `Buen día, ${p.nombre}.` : "Buen día.";
  const lineas = [
    saludo,
    "",
    "La Carolina le da acceso al Portal de afiliados, donde puede consultar la liquidación de sus vehículos, la fecha de pago y descargar su reporte.",
    "",
    `Ingrese en: ${p.url}`,
  ];
  if (p.email) lineas.push(`Usuario: ${p.email}`);
  if (p.clave) lineas.push(`Clave provisional: ${p.clave}`, "", "Al entrar, el sistema le pedirá cambiarla por una propia.");
  else if (p.email) lineas.push("Contraseña: la que usted escogió. Si la olvidó, comuníquese con Tesorería.");
  return lineas.join("\n");
}

/** Enlace del portal con acciones para compartirlo (copiar, mensaje, WhatsApp). */
export function EnlacePortal({ url, nombre, email, clave, compacto }: {
  url: string;
  nombre?: string | null;
  email?: string | null;
  clave?: string | null;
  compacto?: boolean;
}) {
  const mensaje = mensajeAfiliado({ url, nombre, email, clave });
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compacto ? "" : "rounded-lg border border-[#C7D2FE] bg-[#EEF2FF]/50 p-3"}`}>
      {!compacto && <span className="text-xs font-medium text-gray-600">Enlace del portal:</span>}
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 break-all font-mono text-sm font-semibold text-[#4338CA] hover:underline">
        {url} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
      <button type="button" className={botonCls} onClick={() => copiar(url, "Enlace copiado")}>
        <Copy className="h-3.5 w-3.5" /> Copiar enlace
      </button>
      {!compacto && (
        <>
          <button type="button" className={botonCls} onClick={() => copiar(mensaje, "Mensaje copiado")}
            title="Texto listo para pegar en un correo o chat">
            <Copy className="h-3.5 w-3.5" /> Copiar mensaje{clave ? " con la clave" : ""}
          </button>
          <a className={`${botonCls} text-[#047857]`} target="_blank" rel="noopener noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} title="Abre WhatsApp para escoger el contacto del afiliado">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </>
      )}
    </div>
  );
}
