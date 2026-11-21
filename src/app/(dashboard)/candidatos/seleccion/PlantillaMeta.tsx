"use client";

/**
 * Cómo se ve un mensaje del catálogo en WhatsApp: dentro de la ventana de 24 h
 * (texto libre) y fuera de ella (la plantilla tal como la tiene Meta, con sus
 * variables, botones, estado y categoría).
 */
import type { ReactNode } from "react";
import { CornerUpLeft, Megaphone, Send, TriangleAlert } from "lucide-react";
import { EJEMPLOS, VARIABLES, aFormatoMeta, saltosDeLinea, variablesDe, type MensajeSeleccion } from "@/lib/seleccion/mensajes";

const ESTADO_META: Record<string, { texto: string; clase: string }> = {
  APPROVED: { texto: "Aprobada", clase: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  PENDING: { texto: "En revisión de Meta", clase: "bg-amber-50 text-amber-700 ring-amber-200" },
  IN_APPEAL: { texto: "En apelación", clase: "bg-amber-50 text-amber-700 ring-amber-200" },
  REJECTED: { texto: "Rechazada", clase: "bg-red-50 text-red-700 ring-red-200" },
  PAUSED: { texto: "Pausada por Meta", clase: "bg-red-50 text-red-700 ring-red-200" },
  DISABLED: { texto: "Deshabilitada", clase: "bg-red-50 text-red-700 ring-red-200" },
  NO_EXISTE: { texto: "No existe en Meta", clase: "bg-red-50 text-red-700 ring-red-200" },
};

export function EstadoPlantilla({ estado }: { estado: string | null }) {
  const e = ESTADO_META[estado ?? ""] ?? { texto: estado ?? "Sin revisar", clase: "bg-slate-50 text-text-secondary ring-slate-200" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${e.clase}`}>{e.texto}</span>;
}

/** Categoría que le dio Meta, con lo que cuesta cada envío (precios aproximados de Colombia). */
export function CategoriaPlantilla({ categoria }: { categoria: string | null }) {
  if (!categoria) return null;
  if (categoria === "MARKETING") {
    return (
      <span
        title="Meta la clasificó como Marketing: cuesta unos USD 0,015 por envío y Meta puede limitar su entrega."
        className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200"
      >
        <Megaphone className="h-3 w-3" /> Marketing · ~USD 0,015
      </span>
    );
  }
  return (
    <span
      title="Mensaje sobre un proceso en curso: cuesta unos USD 0,001 por envío."
      className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-text-secondary ring-1 ring-inset ring-slate-200"
    >
      {categoria === "UTILITY" ? "Utilidad" : categoria === "AUTHENTICATION" ? "Autenticación" : categoria} · ~USD 0,001
    </span>
  );
}

/** Variable de una plantilla: se ve con su valor de ejemplo y, al pasar el mouse, cuál es. */
function Variable({ nombre, numero, valores }: { nombre: string | undefined; numero?: number; valores: Record<string, string> }) {
  const valor = nombre ? valores[nombre] || EJEMPLOS[nombre] || nombre : `{{${numero}}}`;
  const ayuda = [numero ? `{{${numero}}}` : null, nombre ? `{${nombre}}` : null, nombre ? VARIABLES[nombre]?.descripcion : null].filter(Boolean).join(" · ");
  return (
    <span title={ayuda} className="rounded bg-emerald-600/15 px-1 text-emerald-900 underline decoration-emerald-600/40 decoration-dotted underline-offset-2">
      {valor}
    </span>
  );
}

/**
 * Texto con el formato de WhatsApp: *negrita*, _cursiva_, saltos de línea y
 * variables ({{1}} de Meta o {nombre} del catálogo) resaltadas.
 */
export function TextoWhatsApp({ texto, variables = [], valores = {} }: { texto: string; variables?: string[]; valores?: Record<string, string> }) {
  const piezas = (t: string, clave: string): ReactNode[] =>
    t.split(/(\{\{\d+\}\}|\{[a-z_]+\})/g).map((p, i) => {
      const meta = p.match(/^\{\{(\d+)\}\}$/);
      if (meta) return <Variable key={`${clave}-${i}`} numero={Number(meta[1])} nombre={variables[Number(meta[1]) - 1]} valores={valores} />;
      const nombrada = p.match(/^\{([a-z_]+)\}$/);
      if (nombrada) return <Variable key={`${clave}-${i}`} nombre={nombrada[1]} valores={valores} />;
      return p;
    });
  const formato = (linea: string, n: number): ReactNode[] =>
    linea.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((p, i) => {
      const clave = `${n}-${i}`;
      if (/^\*[^*]+\*$/.test(p)) return <strong key={clave}>{piezas(p.slice(1, -1), clave)}</strong>;
      if (/^_[^_]+_$/.test(p)) return <em key={clave}>{piezas(p.slice(1, -1), clave)}</em>;
      return <span key={clave}>{piezas(p, clave)}</span>;
    });
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  return (
    <>
      {lineas.map((l, n) => (
        <span key={n} className="block min-h-[1.25em]">
          {formato(l, n)}
        </span>
      ))}
    </>
  );
}

/** Burbuja de mensaje enviado, como en WhatsApp, con los botones de respuesta rápida debajo. */
export function BurbujaWhatsApp({ children, botones = [], etiqueta }: { children: ReactNode; botones?: string[]; etiqueta?: ReactNode }) {
  return (
    <div className="max-w-full">
      <div className="relative rounded-xl rounded-tr-sm bg-[#D9FDD3] px-3 py-2 text-[13px] leading-snug text-gray-900 shadow-sm">
        {etiqueta && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{etiqueta}</div>}
        <div className="break-words">{children}</div>
        <div className="mt-1 text-right text-[10px] text-gray-500">8:00 a. m. ✓✓</div>
      </div>
      {botones.length > 0 && (
        <div className="mt-1 grid gap-1">
          {botones.map((b) => (
            <div key={b} className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-1.5 text-[13px] font-medium text-sky-600 shadow-sm">
              <CornerUpLeft className="h-3.5 w-3.5" /> {b}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fondo de chat de WhatsApp para las vistas previas. */
export function FondoChat({ titulo, detalle, children }: { titulo: string; detalle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div>
        <p className="text-xs font-medium text-text-secondary">{titulo}</p>
        {detalle && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">{detalle}</div>}
      </div>
      <div className="flex flex-1 flex-col items-end gap-2 rounded-xl bg-[#EFEAE2] p-3">{children}</div>
    </div>
  );
}

/**
 * La plantilla de Meta de un mensaje: la aprobada (como la tiene Meta) y, si
 * hay, la versión nueva en revisión. Con el botón para enviar una versión
 * nueva cuando el texto ya no coincide con la aprobada.
 */
export function PlantillaMeta({
  m,
  valores,
  puedeEnviar,
  enviando,
  onEnviar,
}: {
  m: MensajeSeleccion;
  valores: Record<string, string>;
  puedeEnviar: boolean;
  enviando: boolean;
  onEnviar: () => void;
}) {
  if (!m.plantilla_nombre) return null;
  const aprobada = m.plantilla_estado === "APPROVED" && m.plantilla_texto_aprobado;
  // ¿El texto guardado difiere de la plantilla aprobada? Entonces hay que enviar una versión nueva.
  const difiere = !!aprobada && aFormatoMeta(m.texto, m.plantilla_variables) !== saltosDeLinea(m.plantilla_texto_aprobado ?? "");
  const propuestaVariables = m.plantilla_propuesta_variables ?? (m.plantilla_propuesta_texto ? variablesDe(m.plantilla_propuesta_texto) : []);

  return (
    <FondoChat
      titulo="Fuera de la ventana de 24 horas: plantilla de Meta"
      detalle={
        <>
          <code className="font-mono">{m.plantilla_nombre}</code>
          <EstadoPlantilla estado={m.plantilla_estado} />
          {aprobada && <CategoriaPlantilla categoria={m.plantilla_categoria} />}
        </>
      }
    >
      {aprobada ? (
        <BurbujaWhatsApp botones={m.plantilla_botones ?? []}>
          <TextoWhatsApp texto={m.plantilla_texto_aprobado!} variables={m.plantilla_variables} valores={valores} />
        </BurbujaWhatsApp>
      ) : (
        <BurbujaWhatsApp botones={m.plantilla_botones ?? []} etiqueta="Así se envió a Meta">
          <TextoWhatsApp texto={m.texto} valores={valores} />
        </BurbujaWhatsApp>
      )}

      {m.plantilla_propuesta_nombre && m.plantilla_propuesta_texto && (
        <div className="w-full space-y-1 border-t border-black/10 pt-2">
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
            Versión nueva <code className="font-mono">{m.plantilla_propuesta_nombre}</code> <EstadoPlantilla estado={m.plantilla_propuesta_estado} />
            <span>· mientras tanto sale la de arriba</span>
          </p>
          <div className="flex justify-end">
            <BurbujaWhatsApp botones={m.plantilla_botones ?? []}>
              <TextoWhatsApp texto={aFormatoMeta(m.plantilla_propuesta_texto, propuestaVariables)} variables={propuestaVariables} valores={valores} />
            </BurbujaWhatsApp>
          </div>
        </div>
      )}

      {m.plantilla_categoria === "MARKETING" && aprobada && (
        <p className="flex w-full items-start gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-[11px] text-violet-800">
          <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Meta la clasificó como Marketing: cuesta más y puede limitar su entrega. Para volver a Utilidad, quite el contenido promocional (por
          ejemplo, los beneficios) y envíe una versión nueva.
        </p>
      )}
      {difiere && !m.plantilla_propuesta_nombre && (
        <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-[11px] text-amber-800">
          <span className="flex items-start gap-1.5">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> El texto guardado es distinto de la plantilla aprobada.
          </span>
          {puedeEnviar && (
            <button
              type="button"
              disabled={enviando}
              onClick={onEnviar}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-3 w-3" /> Enviar versión nueva a Meta
            </button>
          )}
        </div>
      )}
    </FondoChat>
  );
}
