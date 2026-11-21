"use client";

/**
 * Resultado de leer la foto de la cédula con el modelo del asistente en el chat
 * de prueba: los datos leídos, qué no pudo leer, y la comparación con lo que el
 * aspirante dijo en el chat. Con «Guardar en Candidatos» la foto va a la ficha,
 * salvo que no sirva (ilegible o reemplazada), como en WhatsApp.
 */
import { Loader2 } from "lucide-react";
import { compararConChat } from "@/lib/seleccion/lectura-cedula";
import type { ResultadoLecturaPrueba } from "@/lib/seleccion/prueba-actions";

type Estado =
  | { estado: "leyendo" }
  | { estado: "error"; error: string }
  | { estado: "ok"; resultado: Extract<ResultadoLecturaPrueba, { ok: true }> };

export function LecturaCedulaPanel({
  lectura,
  chat,
  descarte,
}: {
  lectura: Estado;
  chat: { cedula: string | null; fecha_expedicion: string | null; fecha_nacimiento: string | null };
  /** Si la foto (o una anterior) no se guarda por no servir. */
  descarte?: string | null;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-3 text-xs">
      <h3 className="text-sm font-semibold text-text-primary">Lectura de la foto (modelo del asistente)</h3>
      {lectura.estado === "leyendo" && (
        <p className="flex items-center gap-1.5 text-text-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo la foto…
        </p>
      )}
      {lectura.estado === "error" && <p className="text-red-700">{lectura.error}</p>}
      {lectura.estado === "ok" && descarte && <p className="font-medium text-amber-700">Espacio: {descarte}.</p>}
      {lectura.estado === "ok" &&
        (() => {
          const { lectura: l, modelo, tokensEntrada, tokensSalida, ms, crudo } = lectura.resultado;
          const filas: [string, string | null][] = [
            ["Tipo", l.tipoCedula === "amarilla" ? "Cédula amarilla" : l.tipoCedula === "digital" ? "Cédula digital" : null],
            ["Lado", l.lado],
            ["Número", l.numero],
            ["Apellidos", l.apellidos],
            ["Nombres", l.nombres],
            ["Fecha de nacimiento", l.fechaNacimiento],
            ["Lugar de nacimiento", l.lugarNacimiento],
            ["Sexo", l.sexo],
            ["RH", l.rh],
            ["Fecha de expedición", l.fechaExpedicion],
            ["Lugar de expedición", l.lugarExpedicion],
          ];
          return (
            <>
              <p className="text-text-tertiary">
                {modelo} · {(ms / 1000).toFixed(1)} s · {tokensEntrada ?? "?"} tokens de entrada, {tokensSalida ?? "?"} de salida
              </p>
              {!l.esCedula ? (
                <p className="font-medium text-amber-700">El modelo dice que la foto no es una cédula de ciudadanía.</p>
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                  {filas.map(([k, v]) => (
                    <div key={k} className="flex gap-1.5">
                      <dt className="text-text-tertiary">{k}:</dt>
                      <dd className={v ? "text-text-secondary" : "text-text-muted"}>{v ?? "no se leyó"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {l.problemas && <p className="text-amber-700">Problemas: {l.problemas}</p>}
              {l.esCedula && (
                <div>
                  <p className="mb-0.5 font-medium text-text-secondary">Comparación con lo que dijo en el chat</p>
                  <ul className="space-y-0.5">
                    {compararConChat(l, chat).map((c) => (
                      <li key={c.dato} className={c.coincide === false ? "font-medium text-red-700" : c.coincide ? "text-emerald-700" : "text-text-tertiary"}>
                        {c.coincide === false ? "✘" : c.coincide ? "✔" : "·"} {c.dato}: foto {c.enFoto ?? "—"} · chat {c.enChat ?? "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-primary">Ver la respuesta en bruto del modelo</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{crudo}</pre>
              </details>
            </>
          );
        })()}
    </div>
  );
}
