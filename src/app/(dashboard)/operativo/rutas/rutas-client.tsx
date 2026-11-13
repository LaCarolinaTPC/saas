"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check, Download, Eye, EyeOff, FileUp, Loader2, MapPinned, Radio, Search, Trash2, TriangleAlert, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KML_ACCEPT, extensionKml, textoKml } from "@/lib/operativo/rutas-kml-archivo";
import { KML_MAX_BYTES, procesarKml, type RutaProcesada } from "@/lib/operativo/rutas-kml-reglas";
import type { GeometriaKml, RutaCatalogo, VersionKml } from "@/lib/operativo/rutas-kml";
import {
  activarVersionKml, cambiarToleranciaKml, eliminarVersionKml, geometriaVersionKml, urlDescargaKml,
} from "./actions";
import type { CapaRuta } from "./mapa-rutas";
import { EnVivo } from "./en-vivo";

const MapaRutas = dynamic(() => import("./mapa-rutas"), {
  ssr: false,
  loading: () => <div className="h-[560px] w-full animate-pulse rounded-xl bg-[#E2E8F0]" />,
});

const PALETA = [
  "#4F46E5", "#DC2626", "#059669", "#D97706", "#0891B2", "#7C3AED", "#DB2777", "#65A30D",
  "#2563EB", "#EA580C", "#0D9488", "#9333EA", "#CA8A04", "#BE123C", "#16A34A", "#475569",
];
const GRIS = "#94A3B8";

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-800 outline-none focus:border-[#4F46E5]";
const btnCls =
  "inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50";
const btnPrimario =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

type Filtro = "todas" | "con" | "sin";

export function RutasClient({ rutas, geometrias, error, puedeEditar, vistaInicial }: {
  rutas: RutaCatalogo[];
  geometrias: GeometriaKml[];
  error: string | null;
  puedeEditar: boolean;
  vistaInicial: "trazados" | "vivo";
}) {
  const [modo, setModo] = useState(vistaInicial);
  // La vista queda en la URL para poder compartir el enlace «en vivo».
  const cambiarModo = (m: "trazados" | "vivo") => {
    setModo(m);
    const url = new URL(window.location.href);
    if (m === "vivo") url.searchParams.set("vista", "vivo");
    else url.searchParams.delete("vista");
    window.history.replaceState(null, "", url);
  };
  const geomPorRuta = useMemo(() => new Map(geometrias.map((g) => [g.ruta, g])), [geometrias]);
  const colorPorRuta = useMemo(() => {
    const m = new Map<string, string>();
    rutas.filter((r) => r.vigente).forEach((r, i) => m.set(r.ruta, PALETA[i % PALETA.length]));
    return m;
  }, [rutas]);

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [versionVista, setVersionVista] = useState<GeometriaKml | null>(null);
  const [cargarPara, setCargarPara] = useState<string | null | undefined>(undefined);

  const conKml = rutas.filter((r) => r.vigente).length;
  const visiblesLista = rutas.filter((r) => {
    if (filtro === "con" && !r.vigente) return false;
    if (filtro === "sin" && r.vigente) return false;
    const q = busqueda.trim().toLowerCase();
    return !q || r.ruta.toLowerCase().includes(q) || String(r.id_ruta ?? "").includes(q);
  });
  const rutaSel = rutas.find((r) => r.ruta === seleccionada) ?? null;

  const capas: CapaRuta[] = useMemo(() => {
    const out: CapaRuta[] = [];
    for (const g of geometrias) {
      if (ocultas.has(g.ruta)) continue;
      if (seleccionada != null && g.ruta !== seleccionada) continue;
      out.push({
        id: `v${g.id}`,
        nombre: `${g.ruta} · v${g.version}`,
        color: colorPorRuta.get(g.ruta) ?? PALETA[0],
        linea: g.linea,
        paradas: g.paradas,
        destacada: g.ruta === seleccionada,
      });
    }
    if (versionVista && versionVista.linea.length > 1 && geomPorRuta.get(versionVista.ruta)?.id !== versionVista.id) {
      out.push({
        id: `h${versionVista.id}`,
        nombre: `${versionVista.ruta} · v${versionVista.version} (historial)`,
        color: GRIS,
        linea: versionVista.linea,
        paradas: versionVista.paradas,
        punteada: true,
      });
    }
    return out;
  }, [geometrias, ocultas, seleccionada, colorPorRuta, versionVista, geomPorRuta]);

  const fitKey = `${seleccionada ?? "todas"}|${versionVista?.id ?? ""}|${geometrias.length}`;

  const alternar = (id: string) =>
    setOcultas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const seleccionar = (id: string | null) => {
    setSeleccionada((actual) => (actual === id ? null : id));
    setVersionVista(null);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No se pudieron leer las rutas: {error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
          {([["trazados", "Trazados"], ["vivo", "En vivo"]] as const).map(([k, t]) => (
            <button
              key={k}
              type="button"
              onClick={() => cambiarModo(k)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${modo === k ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}
            >
              {k === "vivo" ? <Radio className="h-4 w-4" /> : <MapPinned className="h-4 w-4" />} {t}
            </button>
          ))}
        </div>
      </div>

      {modo === "vivo" ? (
        <EnVivo geometrias={geometrias} colorPorRuta={colorPorRuta} />
      ) : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          <b className="text-gray-900">{rutas.length}</b> rutas usadas en GEMA (45 días) ·{" "}
          <b className="text-gray-900">{conKml}</b> con KML · <b className="text-gray-900">{rutas.length - conKml}</b> sin KML
        </p>
        {puedeEditar && (
          <button type="button" className={btnPrimario} onClick={() => setCargarPara(seleccionada)}>
            <FileUp className="h-4 w-4" /> Cargar KML
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* ── Lista de rutas ── */}
        <aside className="flex max-h-[560px] flex-col rounded-xl border border-[#E2E8F0] bg-white">
          <div className="space-y-2 border-b border-[#E2E8F0] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2 h-4 w-4 text-gray-400" />
              <input
                className={`${inputCls} pl-8`}
                placeholder="Buscar ruta o código"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="flex gap-1 text-xs">
              {(["todas", "con", "sin"] as Filtro[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltro(f)}
                  className={`rounded-full px-2.5 py-1 font-medium ${filtro === f ? "bg-[#4F46E5] text-white" : "bg-[#F1F5F9] text-gray-600"}`}
                >
                  {f === "todas" ? "Todas" : f === "con" ? "Con KML" : "Sin KML"}
                </button>
              ))}
            </div>
          </div>
          <ul className="flex-1 divide-y divide-[#F1F5F9] overflow-y-auto">
            {visiblesLista.map((r) => {
              const color = colorPorRuta.get(r.ruta);
              const activa = r.ruta === seleccionada;
              return (
                <li
                  key={r.ruta}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${activa ? "bg-[#EEF2FF]" : "hover:bg-[#F8FAFC]"}`}
                  onClick={() => seleccionar(r.ruta)}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color ?? "#E2E8F0" }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-gray-900">{r.ruta}</div>
                    <div className="text-xs text-gray-500">
                      {r.id_ruta != null ? `Cód. ${r.id_ruta}` : "Sin código"}
                      {r.vigente
                        ? ` · v${r.vigente.version} · ${nf.format(r.vigente.longitud_km)} km · ±${r.vigente.tolerancia_m} m`
                        : " · sin KML"}
                      {!r.ultima_fecha && " · sin uso en 45 días"}
                    </div>
                  </div>
                  {r.vigente && (
                    <button
                      type="button"
                      title={ocultas.has(r.ruta) ? "Mostrar en el mapa" : "Ocultar del mapa"}
                      className="rounded p-1 text-gray-500 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        alternar(r.ruta);
                      }}
                    >
                      {ocultas.has(r.ruta) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </li>
              );
            })}
            {!visiblesLista.length && <li className="p-4 text-center text-sm text-gray-500">Ninguna ruta coincide.</li>}
          </ul>
        </aside>

        {/* ── Mapa ── */}
        <section className="space-y-2">
          <MapaRutas capas={capas} fitKey={fitKey} />
          <p className="text-xs text-gray-500">
            {seleccionada != null ? "Mostrando solo la ruta seleccionada (clic de nuevo para ver todas). " : ""}
            El punto grande marca el inicio y las flechas el sentido del recorrido.
          </p>
        </section>
      </div>

      {rutaSel && (
        <DetalleRuta
          ruta={rutaSel}
          color={colorPorRuta.get(rutaSel.ruta) ?? GRIS}
          puedeEditar={puedeEditar}
          versionVista={versionVista}
          onVerVersion={setVersionVista}
          onCargar={() => setCargarPara(rutaSel.ruta)}
          onCerrar={() => seleccionar(null)}
        />
      )}

      </>
      )}

      {cargarPara !== undefined && (
        <CargarKmlDialog
          rutas={rutas}
          idRutaInicial={cargarPara}
          geomPorRuta={geomPorRuta}
          onCerrar={() => setCargarPara(undefined)}
          onGuardado={(idRuta) => {
            setCargarPara(undefined);
            setSeleccionada(idRuta);
            setVersionVista(null);
          }}
        />
      )}
    </div>
  );
}

// ── Detalle e historial ──────────────────────────────────────────────────────

function DetalleRuta({ ruta, color, puedeEditar, versionVista, onVerVersion, onCargar, onCerrar }: {
  ruta: RutaCatalogo;
  color: string;
  puedeEditar: boolean;
  versionVista: GeometriaKml | null;
  onVerVersion: (g: GeometriaKml | null) => void;
  onCargar: () => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [tolerancia, setTolerancia] = useState(String(ruta.vigente?.tolerancia_m ?? ""));
  const v = ruta.vigente;

  const accion = (id: number, fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
    setOcupado(id);
    startTransition(async () => {
      const r = await fn();
      setOcupado(null);
      if (!r.success) {
        toast.error(r.error ?? "No se pudo completar la acción.");
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  };

  const descargar = async (id: number) => {
    setOcupado(id);
    const r = await urlDescargaKml(id);
    setOcupado(null);
    if (!r.success || !r.data) {
      toast.error(r.success ? "No se pudo descargar." : r.error);
      return;
    }
    window.open(r.data.url, "_blank", "noopener");
  };

  const ver = async (version: VersionKml) => {
    if (versionVista?.id === version.id) return onVerVersion(null);
    setOcupado(version.id);
    const r = await geometriaVersionKml(version.id);
    setOcupado(null);
    if (!r.success || !r.data) return toast.error(r.success ? "No se pudo leer la versión." : r.error);
    onVerVersion(r.data);
  };

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] p-4">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: color }} />
          <h2 className="font-semibold text-gray-900">{ruta.ruta}</h2>
          {ruta.id_ruta != null && <span className="text-sm text-gray-500">Cód. {ruta.id_ruta}</span>}
        </div>
        <div className="flex gap-2">
          {puedeEditar && (
            <button type="button" className={btnCls} onClick={onCargar}>
              <FileUp className="h-3.5 w-3.5" /> {v ? "Cargar nueva versión" : "Cargar KML"}
            </button>
          )}
          <button type="button" className={btnCls} onClick={onCerrar}>
            <X className="h-3.5 w-3.5" /> Cerrar
          </button>
        </div>
      </header>

      {v ? (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Dato titulo="Versión vigente" valor={`v${v.version}`} sub={fechaHora(v.created_at)} />
          <Dato titulo="Longitud (ida y vuelta)" valor={`${nf.format(v.longitud_km)} km`} sub={`${v.num_puntos} puntos`} />
          <Dato titulo="Paradas" valor={String(v.num_paradas)} sub={v.circular ? "Recorrido cerrado" : "No cierra en el inicio"} />
          <Dato titulo="Cargado por" valor={v.created_by_email ?? "—"} sub={v.archivo_nombre} />
          <div>
            <div className="text-xs text-gray-500">Tolerancia «en ruta»</div>
            {puedeEditar ? (
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  min={5}
                  max={1000}
                  className={`${inputCls} w-24`}
                  value={tolerancia}
                  onChange={(e) => setTolerancia(e.target.value)}
                />
                <span className="text-sm text-gray-500">m</span>
                <button
                  type="button"
                  className={btnCls}
                  disabled={pendiente || Number(tolerancia) === v.tolerancia_m}
                  onClick={() =>
                    accion(-1, () => cambiarToleranciaKml(ruta.ruta, Number(tolerancia)), "Tolerancia actualizada")
                  }
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-lg font-semibold text-gray-900">±{v.tolerancia_m} m</div>
            )}
          </div>
          {v.observaciones && <p className="text-sm text-gray-600 sm:col-span-2 lg:col-span-5">{v.observaciones}</p>}
        </div>
      ) : (
        <p className="p-4 text-sm text-gray-500">
          Esta ruta todavía no tiene KML{ruta.versiones.length ? " vigente" : ""}.
        </p>
      )}

      {ruta.versiones.length > 0 && (
        <div className="overflow-x-auto border-t border-[#E2E8F0]">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2">Versión</th>
                <th className="px-4 py-2">Cargada</th>
                <th className="px-4 py-2">Archivo</th>
                <th className="px-4 py-2 text-right">Km</th>
                <th className="px-4 py-2 text-right">Paradas</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {ruta.versiones.map((ver_) => (
                <tr key={ver_.id}>
                  <td className="px-4 py-2 font-medium">v{ver_.version}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {fechaHora(ver_.created_at)}
                    <div className="text-xs text-gray-400">{ver_.created_by_email}</div>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2 text-gray-600" title={ver_.observaciones ?? undefined}>
                    {ver_.archivo_nombre}
                  </td>
                  <td className="px-4 py-2 text-right">{nf.format(ver_.longitud_km)}</td>
                  <td className="px-4 py-2 text-right">{ver_.num_paradas}</td>
                  <td className="px-4 py-2">
                    {ver_.vigente ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Vigente</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Anterior</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {ocupado === ver_.id && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                      {!ver_.vigente && (
                        <button type="button" className={btnCls} onClick={() => ver(ver_)} disabled={ocupado != null}>
                          <MapPinned className="h-3.5 w-3.5" /> {versionVista?.id === ver_.id ? "Quitar del mapa" : "Comparar"}
                        </button>
                      )}
                      <button type="button" className={btnCls} onClick={() => descargar(ver_.id)} disabled={ocupado != null}>
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {puedeEditar && !ver_.vigente && (
                        <button
                          type="button"
                          className={btnCls}
                          disabled={pendiente}
                          onClick={() => accion(ver_.id, () => activarVersionKml(ver_.id), `v${ver_.version} quedó vigente`)}
                        >
                          <Check className="h-3.5 w-3.5" /> Activar
                        </button>
                      )}
                      {puedeEditar && (
                        <button
                          type="button"
                          className={`${btnCls} text-red-600`}
                          disabled={pendiente}
                          onClick={() => {
                            const aviso = ver_.vigente
                              ? `v${ver_.version} es la vigente: la ruta quedará SIN KML hasta que active otra versión. ¿Eliminarla?`
                              : `¿Eliminar la v${ver_.version} y su archivo?`;
                            if (confirm(aviso)) accion(ver_.id, () => eliminarVersionKml(ver_.id), "Versión eliminada");
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Dato({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-500">{titulo}</div>
      <div className="truncate text-lg font-semibold text-gray-900">{valor}</div>
      {sub && <div className="truncate text-xs text-gray-500" title={sub}>{sub}</div>}
    </div>
  );
}

// ── Carga con vista previa ───────────────────────────────────────────────────

function CargarKmlDialog({ rutas, idRutaInicial, geomPorRuta, onCerrar, onGuardado }: {
  rutas: RutaCatalogo[];
  idRutaInicial: string | null;
  geomPorRuta: Map<string, GeometriaKml>;
  onCerrar: () => void;
  onGuardado: (ruta: string) => void;
}) {
  const router = useRouter();
  const [idRuta, setIdRuta] = useState<string | null>(idRutaInicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<RutaProcesada | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);

  const actual = idRuta != null ? geomPorRuta.get(idRuta) ?? null : null;

  const elegirArchivo = async (f: File | null) => {
    setArchivo(f);
    setVista(null);
    setErrorArchivo(null);
    if (!f) return;
    if (!extensionKml(f.name)) return setErrorArchivo("Solo se aceptan archivos .kml o .kmz.");
    if (f.size > KML_MAX_BYTES) return setErrorArchivo(`El archivo supera los ${KML_MAX_BYTES / 1024 / 1024} MB.`);
    setLeyendo(true);
    try {
      const r = procesarKml(await textoKml(await f.arrayBuffer()));
      if (r.ok) setVista(r.ruta);
      else setErrorArchivo(r.error);
    } catch (e) {
      setErrorArchivo(`No se pudo abrir el archivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLeyendo(false);
    }
  };

  const capas: CapaRuta[] = [];
  if (actual) {
    capas.push({ id: "actual", nombre: `Vigente v${actual.version}`, color: GRIS, linea: actual.linea, paradas: [], punteada: true });
  }
  if (vista) {
    capas.push({ id: "nueva", nombre: archivo?.name ?? "Nuevo KML", color: "#4F46E5", linea: vista.linea, paradas: vista.paradas, destacada: true });
  }

  const guardar = async () => {
    if (idRuta == null || !archivo || !vista) return;
    setEnviando(true);
    try {
      const form = new FormData();
      form.set("ruta", idRuta);
      form.set("archivo", archivo);
      if (observaciones.trim()) form.set("observaciones", observaciones.trim());
      const r = await fetch("/api/operativo/rutas-kml", { method: "POST", body: form });
      const json = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; version?: VersionKml };
      if (!r.ok || !json.ok) {
        toast.error(json.error ?? `No se pudo guardar el KML (${r.status})`);
        return;
      }
      toast.success(`KML guardado como v${json.version?.version ?? ""} y vigente`);
      onGuardado(idRuta);
      router.refresh();
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Cargar KML de ruta</DialogTitle>
          <DialogDescription>
            Exporte la ruta desde Google My Maps (⋮ → Exportar a KML/KMZ). Un archivo = una ruta, con el recorrido de ida y
            vuelta en una sola línea. Los puntos del mapa se guardan como paradas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Ruta</span>
              <select
                className={inputCls}
                value={idRuta ?? ""}
                onChange={(e) => setIdRuta(e.target.value || null)}
              >
                <option value="">Seleccione…</option>
                {rutas.map((r) => (
                  <option key={r.ruta} value={r.ruta}>
                    {r.ruta}{r.id_ruta != null ? ` (cód. ${r.id_ruta})` : ""}{r.vigente ? ` · tiene v${r.vigente.version}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Archivo KML o KMZ (máx. {KML_MAX_BYTES / 1024 / 1024} MB)</span>
              <input
                type="file"
                accept={KML_ACCEPT}
                className="block w-full text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-[#EEF2FF] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#4F46E5]"
                onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Observaciones (opcional)</span>
              <textarea
                className={`${inputCls} h-20 py-1.5`}
                maxLength={500}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej.: cambio de recorrido por obra en la Cra 46"
              />
            </label>

            {leyendo && (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el archivo…
              </p>
            )}
            {errorArchivo && (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {errorArchivo}
              </div>
            )}
            {vista && (
              <div className="space-y-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm">
                {vista.nombreDocumento && <div className="font-medium text-gray-900">{vista.nombreDocumento}</div>}
                <div className="grid grid-cols-2 gap-1 text-gray-700">
                  <span>Longitud</span><b>{nf.format(vista.longitudKm)} km</b>
                  <span>Puntos</span><b>{vista.numPuntos}</b>
                  <span>Paradas</span><b>{vista.paradas.length}</b>
                  <span>Cierra en el inicio</span><b>{vista.circular ? "Sí" : "No"}</b>
                  {actual && (
                    <>
                      <span>Vigente hoy</span>
                      <b>v{actual.version}</b>
                    </>
                  )}
                </div>
                {vista.advertencias.map((a) => (
                  <div key={a} className="flex gap-1.5 text-xs text-amber-700">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <MapaRutas capas={capas} fitKey={`${idRuta}|${archivo?.name ?? ""}|${vista?.numPuntos ?? 0}`} className="h-[440px]" />
            <p className="text-xs text-gray-500">
              Azul: el archivo nuevo. {actual ? "Gris punteado: la versión vigente, para comparar." : ""}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className={btnCls} onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className={btnPrimario} onClick={guardar} disabled={enviando || !vista || idRuta == null}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar y dejar vigente
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
