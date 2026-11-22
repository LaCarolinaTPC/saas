"use client";

/**
 * Lista de rutas del reconocimiento de ruta, dentro de Tiempos y reglas ›
 * «Escuela, exámenes y contratación» (21-nov-2026). Cada nombre es una ruta
 * distinta. Se agregan, corrigen y quitan; las obligatorias debe aprenderlas
 * sí o sí. El profesor y la ficha eligen de esta lista.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Download, Pencil, Plus, Route, Star, Trash2, X } from "lucide-react";
import { AvisoLinea, campo, type Aviso } from "./comunes";
import { guardarRuta, pantallaRutas, quitarRuta, traerRutasDeGema, type PantallaRutas } from "./rutas-actions";
import type { RutaReconocimiento } from "@/lib/seleccion/rutas";

const boton = "inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2 py-1 text-xs text-text-secondary hover:bg-slate-50 disabled:opacity-50 cursor-pointer";

function FilaRuta({
  r,
  editable,
  ocupado,
  onGuardar,
  onQuitar,
}: {
  r: RutaReconocimiento;
  editable: boolean;
  ocupado: boolean;
  onGuardar: (d: { id: string; nombre: string; obligatoria: boolean }) => Promise<boolean>;
  onQuitar: (r: RutaReconocimiento) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(r.nombre);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-[#F1F5F9] bg-white px-3 py-2">
      {editando ? (
        <>
          <input
            autoFocus
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNombre(r.nombre);
                setEditando(false);
              }
            }}
            className={`${campo} min-w-0 flex-1 basis-48`}
            aria-label="Nombre de la ruta"
          />
          <button
            type="button"
            disabled={ocupado || !nombre.trim()}
            className={boton}
            onClick={async () => {
              if (await onGuardar({ id: r.id, nombre, obligatoria: r.obligatoria })) setEditando(false);
            }}
          >
            <Check className="h-3.5 w-3.5" /> Guardar
          </button>
          <button
            type="button"
            className={boton}
            onClick={() => {
              setNombre(r.nombre);
              setEditando(false);
            }}
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 basis-48 text-sm text-text-primary">{r.nombre}</span>
          <label className={`inline-flex items-center gap-1.5 text-xs ${r.obligatoria ? "font-medium text-amber-700" : "text-text-tertiary"}`}>
            <input
              type="checkbox"
              checked={r.obligatoria}
              disabled={!editable || ocupado}
              onChange={(e) => onGuardar({ id: r.id, nombre: r.nombre, obligatoria: e.target.checked })}
              className="h-4 w-4 accent-amber-600"
            />
            <Star className={`h-3.5 w-3.5 ${r.obligatoria ? "fill-amber-400 text-amber-500" : ""}`} /> Obligatoria
          </label>
          {editable && (
            <>
              <button type="button" disabled={ocupado} className={boton} onClick={() => setEditando(true)} title="Corregir el nombre">
                <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Editar</span>
              </button>
              <button type="button" disabled={ocupado} className={`${boton} hover:text-red-700`} onClick={() => onQuitar(r)} title="Quitar de la lista">
                <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Quitar</span>
              </button>
            </>
          )}
        </>
      )}
    </li>
  );
}

export default function RutasReconocimiento({ puedeEditar, rutasMinimas }: { puedeEditar: boolean; rutasMinimas: number }) {
  const [datos, setDatos] = useState<PantallaRutas | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [nueva, setNueva] = useState("");
  const [nuevaObligatoria, setNuevaObligatoria] = useState(false);
  const [ocupado, start] = useTransition();

  const recargar = useCallback(() => pantallaRutas().then(setDatos).catch((e: Error) => setAviso({ ok: false, texto: e.message })), []);
  useEffect(() => {
    let vivo = true;
    pantallaRutas()
      .then((d) => vivo && setDatos(d))
      .catch((e: Error) => vivo && setAviso({ ok: false, texto: e.message }));
    return () => {
      vivo = false;
    };
  }, []);

  const editable = puedeEditar && !!datos?.disponible;
  const obligatorias = datos?.rutas.filter((r) => r.obligatoria).length ?? 0;
  const necesarias = Math.max(rutasMinimas, obligatorias);

  const guardar = (d: { id?: string; nombre: string; obligatoria: boolean }) =>
    new Promise<boolean>((resolver) =>
      start(async () => {
        const r = await guardarRuta(d);
        setAviso(r.ok ? { ok: true, texto: d.id ? "Ruta guardada." : `Ruta «${d.nombre.trim()}» agregada.` } : { ok: false, texto: r.error });
        if (r.ok) await recargar();
        resolver(r.ok);
      })
    );

  return (
    <div id="rutas-reconocimiento" className="mt-3 rounded-xl border border-border bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <Route className="h-4 w-4 text-text-tertiary" /> Rutas del reconocimiento
          </p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Debe aprender {necesarias} {necesarias === 1 ? "ruta" : "rutas"}
            {obligatorias ? `, entre ellas ${obligatorias === 1 ? "la obligatoria" : `las ${obligatorias} obligatorias`}` : " cualesquiera de la lista"}
            {obligatorias > rutasMinimas ? ` (hay más obligatorias que las ${rutasMinimas} del ajuste: se exigen todas)` : ""}. Cada nombre cuenta como una ruta distinta. El
            profesor y la ficha eligen de esta lista; al corregir un nombre se corrige también en las salidas ya registradas.
          </p>
        </div>
        {editable && datos.nuevasDeGema.length > 0 && (
          <button
            type="button"
            disabled={ocupado}
            className={boton}
            title={datos.nuevasDeGema.join(", ")}
            onClick={() =>
              start(async () => {
                const r = await traerRutasDeGema();
                setAviso(r.ok ? { ok: true, texto: r.agregadas ? `${r.agregadas} rutas agregadas desde GEMA.` : "No había rutas nuevas en GEMA." } : { ok: false, texto: r.error });
                if (r.ok) await recargar();
              })
            }
          >
            <Download className="h-3.5 w-3.5" /> Traer {datos.nuevasDeGema.length} {datos.nuevasDeGema.length === 1 ? "ruta nueva" : "rutas nuevas"} de GEMA
          </button>
        )}
      </div>

      {datos && !datos.disponible && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Falta aplicar la migración <code>20261121230433_seleccion_rutas_del_reconocimiento.sql</code>: mientras tanto se usan las rutas de GEMA y no se pueden editar.
        </p>
      )}

      {datos === null ? (
        <p className="mt-2 text-xs text-text-tertiary">Cargando…</p>
      ) : datos.rutas.length === 0 ? (
        <p className="mt-2 text-xs text-text-tertiary">No hay rutas en la lista: agrega la primera.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {datos.rutas.map((r) => (
            <FilaRuta
              key={`${r.id}:${r.nombre}:${r.obligatoria}`}
              r={r}
              editable={editable}
              ocupado={ocupado}
              onGuardar={guardar}
              onQuitar={(x) => {
                if (!confirm(`¿Quitar la ruta «${x.nombre}» de la lista? Quien ya la aprendió la sigue teniendo como aprendida.`)) return;
                start(async () => {
                  const r = await quitarRuta(x.id);
                  setAviso(r.ok ? { ok: true, texto: `Ruta «${x.nombre}» quitada.` } : { ok: false, texto: r.error });
                  if (r.ok) await recargar();
                });
              }}
            />
          ))}
        </ul>
      )}

      {editable && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await guardar({ nombre: nueva, obligatoria: nuevaObligatoria })) {
              setNueva("");
              setNuevaObligatoria(false);
            }
          }}
        >
          <input
            value={nueva}
            maxLength={80}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Nombre de la ruta nueva (p. ej. A - 16 MIRAMAR - GAVIOTAS)"
            className={`${campo} min-w-0 flex-1 basis-60`}
            aria-label="Nombre de la ruta nueva"
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <input type="checkbox" checked={nuevaObligatoria} onChange={(e) => setNuevaObligatoria(e.target.checked)} className="h-4 w-4 accent-amber-600" />
            Obligatoria
          </label>
          <button type="submit" disabled={ocupado || !nueva.trim()} className={boton}>
            <Plus className="h-3.5 w-3.5" /> Agregar ruta
          </button>
        </form>
      )}

      <div className="mt-2">
        <AvisoLinea aviso={aviso} />
      </div>
    </div>
  );
}
