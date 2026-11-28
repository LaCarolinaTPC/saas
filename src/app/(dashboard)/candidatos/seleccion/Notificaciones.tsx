"use client";

/**
 * Selección › Notificaciones (27-nov-2026): a qué correos va cada aviso. Las
 * revisiones manuales (antecedentes, exámenes por decidir, respuestas del
 * laboratorio, documentos que no cuadran, chats que requieren una persona)
 * también salen en Candidatos › «Novedades del día».
 */
import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, Mail, Save } from "lucide-react";
import { AvisoLinea, campo, type Aviso } from "./comunes";
import { guardarNotificacion, leerNotificaciones, probarNotificacion, type FilaNotificacion, type PantallaNotificaciones } from "./notificaciones-actions";

const ORIGEN: Record<FilaNotificacion["efectivos"]["origen"], string> = {
  propia: "",
  defecto: "con los correos por defecto",
  reporte: "con los correos del reporte diario (no hay lista propia ni por defecto)",
  ninguna: "",
};

function Tarjeta({ f, puedeEditar, onGuardado }: { f: FilaNotificacion; puedeEditar: boolean; onGuardado: () => void }) {
  const [activo, setActivo] = useState(f.activo);
  const [para, setPara] = useState(f.para.join(", "));
  const [copia, setCopia] = useState(f.copia.join(", "));
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState<"guardar" | "probar" | null>(null);
  const cambiado = activo !== f.activo || para !== f.para.join(", ") || copia !== f.copia.join(", ");

  const guardar = async () => {
    setOcupado("guardar");
    setAviso(null);
    const r = await guardarNotificacion(f.tipo, { activo, para, copia }).catch((e: Error) => ({ ok: false, error: e.message }));
    setOcupado(null);
    setAviso(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error ?? "No se pudo guardar." });
    if (r.ok) onGuardado();
  };
  const probar = async () => {
    setOcupado("probar");
    setAviso(null);
    const r = await probarNotificacion(f.tipo).catch((e: Error) => ({ ok: false, texto: e.message }));
    setOcupado(null);
    setAviso(r);
  };

  const llega = f.efectivos.para.length
    ? `Hoy llega a ${f.efectivos.para.join(", ")}${f.efectivos.copia.length ? ` (copia: ${f.efectivos.copia.join(", ")})` : ""}${ORIGEN[f.efectivos.origen] ? ` · ${ORIGEN[f.efectivos.origen]}` : ""}.`
    : f.usaDefecto
      ? "Hoy no le llega a nadie: escriba los correos aquí o los correos por defecto."
      : "Vacío: no se envía.";

  return (
    <li className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-text-primary">{f.nombre}</h4>
          <p className="text-xs text-text-tertiary">{f.cuando}</p>
        </div>
        {f.tieneInterruptor && (
          <label className="flex shrink-0 items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} disabled={!puedeEditar} className="h-4 w-4 accent-[#4F46E5]" />
            Avisar
          </label>
        )}
      </div>
      <div className={`mt-3 grid gap-2 ${f.tieneCopia ? "sm:grid-cols-2" : ""}`}>
        <label className="block text-xs font-medium text-text-secondary">
          Enviar a
          <input value={para} onChange={(e) => setPara(e.target.value)} disabled={!puedeEditar} placeholder={f.usaDefecto ? "Vacío: los correos por defecto" : "correo@empresa.com, otro@empresa.com"} className={`${campo} mt-1`} />
        </label>
        {f.tieneCopia && (
          <label className="block text-xs font-medium text-text-secondary">
            Con copia a
            <input value={copia} onChange={(e) => setCopia(e.target.value)} disabled={!puedeEditar} placeholder="Opcional" className={`${campo} mt-1`} />
          </label>
        )}
      </div>
      <p className={`mt-2 text-[11px] ${f.efectivos.para.length && (activo || !f.tieneInterruptor) ? "text-text-tertiary" : "text-amber-700"}`}>
        {f.tieneInterruptor && !activo ? "Apagado: no se envía (sigue saliendo en las novedades del día). " : ""}
        {llega}
      </p>
      {f.sinAjuste && <p className="mt-1 text-[11px] text-red-700">Falta aplicar la migración 20261127235511: todavía no se puede guardar.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {puedeEditar && (
          <button type="button" onClick={guardar} disabled={!cambiado || !!ocupado} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            {ocupado === "guardar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
          </button>
        )}
        {puedeEditar && (
          <button type="button" onClick={probar} disabled={!!ocupado || cambiado} title={cambiado ? "Guarde primero" : "Envía un correo de prueba a quien lo recibe hoy"} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-40">
            {ocupado === "probar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Enviar prueba
          </button>
        )}
        <AvisoLinea aviso={aviso} />
      </div>
    </li>
  );
}

function PorDefecto({ d, puedeEditar, onGuardado }: { d: PantallaNotificaciones["defecto"]; puedeEditar: boolean; onGuardado: () => void }) {
  const [para, setPara] = useState(d.para.join(", "));
  const [copia, setCopia] = useState(d.copia.join(", "));
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const cambiado = para !== d.para.join(", ") || copia !== d.copia.join(", ");
  const guardar = async () => {
    setOcupado(true);
    const r = await guardarNotificacion("defecto", { para, copia }).catch((e: Error) => ({ ok: false, error: e.message }));
    setOcupado(false);
    setAviso(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error ?? "No se pudo guardar." });
    if (r.ok) onGuardado();
  };
  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <h3 className="text-sm font-semibold text-text-primary">Correos por defecto</h3>
      <p className="text-xs text-text-tertiary">Reciben los avisos que no tengan su propia lista. Si esto también está vacío, van a los del reporte diario.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium text-text-secondary">
          Enviar a
          <input value={para} onChange={(e) => setPara(e.target.value)} disabled={!puedeEditar} placeholder="gestion.humana@empresa.com" className={`${campo} mt-1`} />
        </label>
        <label className="block text-xs font-medium text-text-secondary">
          Con copia a
          <input value={copia} onChange={(e) => setCopia(e.target.value)} disabled={!puedeEditar} placeholder="Opcional" className={`${campo} mt-1`} />
        </label>
      </div>
      {d.sinAjuste && <p className="mt-1 text-[11px] text-red-700">Falta aplicar la migración 20261127235511: todavía no se puede guardar.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {puedeEditar && (
          <button type="button" onClick={guardar} disabled={!cambiado || ocupado} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
          </button>
        )}
        <AvisoLinea aviso={aviso} />
      </div>
    </section>
  );
}

export default function Notificaciones() {
  const [datos, setDatos] = useState<PantallaNotificaciones | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const cargar = useCallback(() => {
    leerNotificaciones()
      .then((d) => {
        setDatos(d);
        setVersion((v) => v + 1);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  if (error) return <p className="mt-4 text-sm text-red-700">{error}</p>;
  if (!datos) return <p className="mt-4 flex items-center gap-2 text-sm text-text-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>;
  const grupo = (g: FilaNotificacion["grupo"]) => datos.tipos.filter((t) => t.grupo === g);
  return (
    <div className="mt-4 space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-border bg-white p-4 text-sm text-text-secondary">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Cuando algo necesita una revisión manual, Gestivo avisa por correo para que alguien lo haga, y lo muestra en Candidatos › <b>Novedades del día</b>. Aquí se elige a quién le llega cada aviso. Un mismo aviso no se repite.
        </p>
      </div>
      <PorDefecto key={`defecto-${version}`} d={datos.defecto} puedeEditar={datos.puedeEditar} onGuardado={cargar} />
      <section>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Revisiones manuales</h3>
        <ul className="grid gap-3 lg:grid-cols-2">
          {grupo("revision").map((f) => (
            <Tarjeta key={`${f.tipo}-${version}`} f={f} puedeEditar={datos.puedeEditar} onGuardado={cargar} />
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Otros avisos y reportes</h3>
        <ul className="grid gap-3 lg:grid-cols-2">
          {grupo("aviso").map((f) => (
            <Tarjeta key={`${f.tipo}-${version}`} f={f} puedeEditar={datos.puedeEditar} onGuardado={cargar} />
          ))}
        </ul>
      </section>
    </div>
  );
}
