"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NOMBRE_NOVEDAD, VALOR_UNITARIO_SUGERIDO, claveCorte, type QuincenaGema, type TipoNovedad } from "@/lib/otros-devengados/calculo";
import type { NovedadOtros } from "@/lib/otros-devengados/data";
import { anularNovedad, registrarNovedad } from "@/lib/otros-devengados/novedades-actions";
import { PlantillaNovedad } from "@/components/otros-devengados/plantilla-novedad";
import { CargueGestor } from "@/components/otros-devengados/cargue-gestor";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const TIPOS: TipoNovedad[] = ["perdida_turno", "perdida_viaje", "devolucion_viaje"];
const fmt = (f: string) => {
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f;
};
const nombreCorte = (c: QuincenaGema) => `${c.quincena === 1 ? "1.ª" : "2.ª"} quincena · ${fmt(c.ini)} al ${fmt(c.fin)}`;

type Conductor = { cedula: string; nombre: string; codigo: string | null };

export function DescuentosClient({
  cortes,
  corte,
  novedades,
  conductores,
  puedeEditar,
}: {
  cortes: QuincenaGema[];
  corte: QuincenaGema;
  novedades: NovedadOtros[];
  conductores: Conductor[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [conductor, setConductor] = useState<Conductor | null>(null);
  const [tipo, setTipo] = useState<TipoNovedad>("perdida_turno");
  const [fecha, setFecha] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [unitario, setUnitario] = useState(String(VALOR_UNITARIO_SUGERIDO.perdida_turno));
  const [observacion, setObservacion] = useState("");
  const [anular, setAnular] = useState<NovedadOtros | null>(null);
  const [filtro, setFiltro] = useState("");
  const [pendiente, start] = useTransition();

  const sugeridos = useMemo(() => {
    const q = busca.toLowerCase().trim();
    if (q.length < 2 || conductor) return [];
    return conductores
      .filter((c) => c.nombre.toLowerCase().includes(q) || c.cedula.includes(q) || c.codigo === q)
      .slice(0, 8);
  }, [busca, conductores, conductor]);

  const nCant = Number(cantidad.replace(",", "."));
  const nUnit = Number(unitario.replace(/\D/g, ""));
  const valor = Math.round(nCant * nUnit);
  const valido = !!conductor && nCant > 0 && nUnit > 0 && (!fecha || (fecha >= corte.ini && fecha <= corte.fin));

  const visibles = useMemo(() => {
    const q = filtro.toLowerCase().trim();
    return novedades.filter(
      (n) => !q || (n.conductor_nombre ?? "").toLowerCase().includes(q) || n.cedula_conductor.includes(q) || n.codigo_conductor === q
    );
  }, [novedades, filtro]);
  const activas = novedades.filter((n) => n.estado === "activa");
  const total = (t: TipoNovedad) => activas.filter((n) => n.tipo === t).reduce((s, n) => s + n.valor, 0);

  function cambiarTipo(t: TipoNovedad) {
    setTipo(t);
    setUnitario(String(VALOR_UNITARIO_SUGERIDO[t] ?? ""));
  }

  function guardar() {
    if (!conductor) return;
    start(async () => {
      const r = await registrarNovedad({
        periodo: corte.periodo,
        quincena: corte.quincena,
        cedula: conductor.cedula,
        tipo,
        fecha: fecha || null,
        cantidad: nCant,
        valor,
        observacion: observacion || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${NOMBRE_NOVEDAD[tipo]} registrada a ${conductor.nombre}: ${cop.format(valor)}`);
      setConductor(null);
      setBusca("");
      setFecha("");
      setCantidad("1");
      setObservacion("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground" htmlFor="corte">
          Corte
        </label>
        <select
          id="corte"
          className="h-9 rounded-lg border border-border bg-white px-3 text-sm"
          value={claveCorte(corte)}
          onChange={(e) => router.push(`/operativo/descuentos-conductores?corte=${e.target.value}`)}
        >
          {cortes.map((c) => (
            <option key={claveCorte(c)} value={claveCorte(c)}>
              {nombreCorte(c)}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          Tesorería descuenta estos valores de los otros devengados del corte. La devolución de viaje suma.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TIPOS.map((t) => (
          <div key={t} className="rounded-xl border border-border bg-white px-4 py-3">
            <div className="text-xs text-muted-foreground">{NOMBRE_NOVEDAD[t]}</div>
            <div className="text-lg font-semibold tabular-nums">{cop.format(total(t))}</div>
            <div className="text-xs text-muted-foreground">{activas.filter((n) => n.tipo === t).length} registros</div>
          </div>
        ))}
      </div>

      <CargueGestor
        cargadas={novedades.filter((n) => n.tipo === "perdida_viaje" && n.origen === "gema" && n.estado === "activa")}
        puedeCargar={puedeEditar}
        onCargado={() => router.refresh()}
      />

      <PlantillaNovedad
        tipo="perdida_turno"
        corte={corte}
        cargadas={novedades.filter((n) => n.tipo === "perdida_turno" && n.origen === "excel" && n.estado === "activa")}
        conductores={conductores}
        puedeCargar={puedeEditar}
        onCargado={() => router.refresh()}
        nota="Lo que se registra uno a uno en el formulario no se toca al cargar la plantilla."
      />

      {puedeEditar && (
        <div className="rounded-xl border border-border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Registrar descuento</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative space-y-1 xl:col-span-2">
              <span className="text-xs text-muted-foreground">Conductor</span>
              {conductor ? (
                <div className="flex h-9 items-center justify-between rounded-lg border border-border px-3 text-sm">
                  <span>
                    {conductor.nombre} · {conductor.cedula} {conductor.codigo ? `· ${conductor.codigo}` : ""}
                  </span>
                  <button type="button" className="text-xs text-primary" onClick={() => setConductor(null)}>
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Nombre, cédula o código" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  {sugeridos.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-white shadow">
                      {sugeridos.map((c) => (
                        <li key={c.cedula}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setConductor(c);
                              setBusca("");
                            }}
                          >
                            {c.nombre} <span className="text-xs text-muted-foreground">· {c.cedula} {c.codigo ? `· ${c.codigo}` : ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <select
                className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm"
                value={tipo}
                onChange={(e) => cambiarTipo(e.target.value as TipoNovedad)}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {NOMBRE_NOVEDAD[t]}
                    {t === "devolucion_viaje" ? " (suma)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Fecha (opcional)</span>
              <Input type="date" min={corte.ini} max={corte.fin} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Cantidad</span>
              <Input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Valor por unidad</span>
              <Input inputMode="numeric" value={unitario} onChange={(e) => setUnitario(e.target.value)} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-muted-foreground">Observación (opcional)</span>
              <Textarea rows={1} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end gap-3">
            <span className="text-sm">
              Total: <b className="tabular-nums">{valor > 0 ? cop.format(valor) : "—"}</b>
            </span>
            <Button onClick={guardar} disabled={!valido || pendiente}>
              {pendiente ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <span className="text-sm font-semibold">Registrados en el corte ({activas.length})</span>
          <Input className="h-8 w-64" placeholder="Buscar conductor" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Conductor</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-left">Registró</th>
                <th className="px-3 py-2 text-left">Observación</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((n) => (
                <tr key={n.id} className={`border-t border-slate-100 ${n.estado === "anulada" ? "text-slate-400 line-through" : ""}`}>
                  <td className="px-3 py-2">
                    {n.conductor_nombre}
                    <div className="text-xs text-muted-foreground">
                      {n.cedula_conductor} {n.codigo_conductor ? `· ${n.codigo_conductor}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">{NOMBRE_NOVEDAD[n.tipo]}</td>
                  <td className="px-3 py-2">{n.fecha ? fmt(n.fecha) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n.cantidad ?? "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${n.tipo === "devolucion_viaje" ? "text-emerald-700" : ""}`}>
                    {n.tipo === "devolucion_viaje" ? "+" : "−"}
                    {cop.format(n.valor)}
                  </td>
                  <td className="px-3 py-2 text-xs">{n.registrada_por_email ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{n.estado === "anulada" ? `Anulada: ${n.anulada_motivo ?? ""}` : n.observacion ?? ""}</td>
                  <td className="px-3 py-2 text-right">
                    {puedeEditar && n.estado === "activa" && (
                      <Button size="sm" variant="ghost" onClick={() => setAnular(n)}>
                        <Undo2 className="mr-1 h-4 w-4" /> Anular
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Sin descuentos registrados en este corte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {anular && (
        <DialogoAnularNovedad
          novedad={anular}
          onClose={() => setAnular(null)}
          onHecho={() => {
            setAnular(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

export function DialogoAnularNovedad({
  novedad,
  onClose,
  onHecho,
}: {
  novedad: NovedadOtros;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [pendiente, start] = useTransition();
  function confirmar() {
    start(async () => {
      const r = await anularNovedad({ id: novedad.id, motivo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Novedad anulada.");
      onHecho();
    });
  }
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !pendiente && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular {NOMBRE_NOVEDAD[novedad.tipo].toLowerCase()}</DialogTitle>
          <DialogDescription>
            {novedad.conductor_nombre} · {cop.format(novedad.valor)}
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">Motivo (queda en la auditoría)</span>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pendiente}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={motivo.trim().length < 5 || pendiente}>
            {pendiente ? "Anulando…" : "Anular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
