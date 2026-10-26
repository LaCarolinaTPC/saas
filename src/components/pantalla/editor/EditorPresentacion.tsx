"use client";

/**
 * Editor de una presentación de la pantalla informativa, tipo PowerPoint:
 * miniaturas a la izquierda, lienzo al centro, propiedades a la derecha.
 *
 * - El estado vive en `useHistorial` (Ctrl+Z / Ctrl+Y, 50 pasos).
 * - Se autoguarda el BORRADOR 4 s después del último cambio (o con Ctrl+S).
 *   Si otra persona guardó entretanto, no se pisa: se avisa del conflicto.
 * - «Publicar» copia el borrador a lo que ven los televisores.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BusFront,
  Check,
  ChevronDown,
  Circle,
  CloudOff,
  Eye,
  Film,
  ImageIcon,
  Loader2,
  Radio,
  Redo2,
  Send,
  Shapes,
  Smile,
  Type,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { guardarBorrador, leerBorrador, publicar, retirarPublicacion } from "@/lib/pantalla/actions";
import type { MedioBiblioteca } from "@/lib/pantalla/consultas";
import type { DatosWidgets } from "@/lib/pantalla/datos-reglas";
import { dentroDelLienzo } from "@/lib/pantalla/editor-reglas";
import {
  MAX_BYTES,
  MAX_DIAPOSITIVAS,
  MAX_ELEMENTOS,
  WIDGETS,
  crearEmoji,
  crearForma,
  crearIcono,
  crearImagen,
  crearTexto,
  crearVideo,
  crearVideoWeb,
  crearWidget,
  diapositivaVacia,
  duplicarDiapositiva,
  duplicarElemento,
  moverCapa,
  reordenar,
  tamanoJson,
  usaMedio,
  type Diapositiva,
  type Elemento,
  type ElementoVideo,
  type ElementoVideoWeb,
  type Presentacion,
  type TipoWidget,
} from "@/lib/pantalla/modelo";
import { useHistorial } from "./useHistorial";
import { LienzoEditor } from "./LienzoEditor";
import { PanelDiapositivas } from "./PanelDiapositivas";
import { PanelPropiedades, type PropositoMedio } from "./PanelPropiedades";
import { SelectorMedio, type MedioElegido } from "./SelectorMedio";
import { RejillaEmojis, RejillaFormas, RejillaIconos } from "./SelectoresGraficos";
import { claseFuentes } from "@/lib/pantalla/fuentes";

type EstadoGuardado = "guardado" | "pendiente" | "guardando" | "error" | "conflicto";

function Menu({ etiqueta, icono, children }: { etiqueta: string; icono: React.ReactNode; children: (cerrar: () => void) => React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    window.addEventListener("mousedown", fuera);
    return () => window.removeEventListener("mousedown", fuera);
  }, [abierto]);
  return (
    <div ref={ref} className="relative">
      <BotonBarra onClick={() => setAbierto((a) => !a)} titulo={etiqueta}>
        {icono}
        <span className="hidden lg:inline">{etiqueta}</span>
        <ChevronDown className="h-3 w-3" />
      </BotonBarra>
      {abierto && (
        <div className="absolute top-full left-0 z-40 mt-1 min-w-[240px] rounded-lg border border-[#E2E8F0] bg-white p-1 shadow-lg">
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}

function BotonBarra({
  onClick,
  titulo,
  disabled,
  children,
}: {
  onClick: () => void;
  titulo: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ItemMenu({ onClick, children, descripcion }: { onClick: () => void; children: React.ReactNode; descripcion?: string }) {
  return (
    <button onClick={onClick} className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
      <span className="flex items-center gap-2">{children}</span>
      {descripcion && <span className="mt-0.5 text-xs text-gray-400">{descripcion}</span>}
    </button>
  );
}

export function EditorPresentacion({
  id,
  nombre,
  inicial,
  updatedAt,
  version,
  publicadaAt,
  cambiosSinPublicar: cambiosIniciales,
  medios: mediosIniciales,
  biblioteca: bibliotecaInicial,
  datos,
}: {
  id: string;
  nombre: string;
  inicial: Presentacion;
  updatedAt: string;
  version: number;
  publicadaAt: string | null;
  cambiosSinPublicar: boolean;
  medios: Record<string, string>;
  biblioteca: MedioBiblioteca[];
  datos: DatosWidgets;
}) {
  const hist = useHistorial<Presentacion>(inicial.diapositivas.length ? inicial : { version: 1, diapositivas: [diapositivaVacia()] });
  const p = hist.valor;
  const [actual, setActual] = useState(0);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [medios, setMedios] = useState(mediosIniciales);
  const [biblioteca, setBiblioteca] = useState(bibliotecaInicial);
  const [selector, setSelector] = useState<PropositoMedio | null>(null);
  const [focoTexto, setFocoTexto] = useState(0);
  const [estado, setEstado] = useState<EstadoGuardado>("guardado");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [publicado, setPublicado] = useState({ version, publicadaAt, cambios: cambiosIniciales });
  const [publicando, setPublicando] = useState(false);
  // «Probar animación»: el elemento la reproduce en el lienzo unos segundos.
  const [probar, setProbar] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!probar) return;
    const t = window.setTimeout(() => setProbar(null), 5000);
    return () => window.clearTimeout(t);
  }, [probar]);

  const indice = Math.min(actual, p.diapositivas.length - 1);
  const d = p.diapositivas[indice];
  const el = d?.elementos.find((e) => e.id === seleccion) ?? null;
  const pesado = useMemo(() => tamanoJson(p) > MAX_BYTES, [p]);

  // ── Guardado ──────────────────────────────────────────────────────────────
  const updatedAtRef = useRef(updatedAt);
  const guardadoRef = useRef<Presentacion>(hist.valor);
  const enCurso = useRef<Promise<boolean> | null>(null);
  const pRef = useRef(p);
  useEffect(() => {
    pRef.current = p;
  }, [p]);

  const guardar = useCallback(async (): Promise<boolean> => {
    if (enCurso.current) await enCurso.current;
    const aGuardar = pRef.current;
    if (aGuardar === guardadoRef.current) return true;
    if (tamanoJson(aGuardar) > MAX_BYTES) {
      setEstado("error");
      setMensaje("La presentación es demasiado grande para guardarla. Quite elementos o diapositivas.");
      return false;
    }
    setEstado("guardando");
    const tarea = (async () => {
      const r = await guardarBorrador(id, aGuardar, updatedAtRef.current);
      if (r.ok) {
        updatedAtRef.current = r.updatedAt;
        guardadoRef.current = aGuardar;
        setPublicado((x) => ({ ...x, cambios: true }));
        setEstado(pRef.current === aGuardar ? "guardado" : "pendiente");
        setMensaje(null);
        return true;
      }
      setEstado("conflicto" in r && r.conflicto ? "conflicto" : "error");
      setMensaje(r.error);
      return false;
    })();
    enCurso.current = tarea;
    try {
      return await tarea;
    } finally {
      enCurso.current = null;
    }
  }, [id]);

  useEffect(() => {
    if (p === guardadoRef.current) return;
    if (estado === "conflicto") return;
    setEstado((e) => (e === "guardando" ? e : "pendiente"));
    const t = window.setTimeout(() => void guardar(), 4000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  useEffect(() => {
    const salir = (e: BeforeUnloadEvent) => {
      if (pRef.current !== guardadoRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", salir);
    return () => window.removeEventListener("beforeunload", salir);
  }, []);

  const recargar = async () => {
    const r = await leerBorrador(id);
    if (!r.ok) return void toast.error(r.error);
    updatedAtRef.current = r.updatedAt;
    guardadoRef.current = r.borrador;
    hist.reiniciar(r.borrador.diapositivas.length ? r.borrador : { version: 1, diapositivas: [diapositivaVacia()] });
    setActual(0);
    setSeleccion(null);
    setEstado("guardado");
    setMensaje(null);
  };

  // ── Cambios ───────────────────────────────────────────────────────────────
  const cambiarDiapositiva = useCallback(
    (fn: (d: Diapositiva) => Diapositiva, grupo?: string) =>
      hist.set((pp) => ({ ...pp, diapositivas: pp.diapositivas.map((x, i) => (i === indice ? fn(x) : x)) }), { grupo }),
    [hist, indice]
  );

  const cambiarElemento = useCallback(
    (elId: string, parcial: Partial<Elemento>, grupo?: string) =>
      cambiarDiapositiva((dd) => ({ ...dd, elementos: dd.elementos.map((e) => (e.id === elId ? ({ ...e, ...parcial } as Elemento) : e)) }), grupo),
    [cambiarDiapositiva]
  );

  const agregar = (nuevo: Elemento) => {
    if (d.elementos.length >= MAX_ELEMENTOS) return void toast.error(`Máximo ${MAX_ELEMENTOS} elementos por diapositiva.`);
    cambiarDiapositiva((dd) => ({ ...dd, elementos: [...dd.elementos, nuevo] }));
    setSeleccion(nuevo.id);
  };

  const borrarSeleccion = () => {
    if (!el) return;
    cambiarDiapositiva((dd) => ({ ...dd, elementos: dd.elementos.filter((e) => e.id !== el.id) }));
    setSeleccion(null);
  };

  const duplicarSeleccion = () => {
    if (!el) return;
    agregar(duplicarElemento(el));
  };

  // ── Medios ────────────────────────────────────────────────────────────────
  /**
   * «Cambiar video»: el nuevo (de archivo o de enlace) toma el lugar del
   * anterior conservando posición, tamaño, animaciones, marco y sonido.
   */
  const reemplazarVideo = (anterior: Elemento, nuevo: ElementoVideo | ElementoVideoWeb) => {
    if (anterior.tipo !== "video" && anterior.tipo !== "video_web") return agregar(nuevo);
    const { x, y, w, h, rot, opacidad, entrada, efecto, radio, marco, colorMarco, silenciado, bucle } = anterior;
    const combinado = { ...nuevo, id: anterior.id, x, y, w, h, rot, opacidad, entrada, efecto, radio, marco, colorMarco, silenciado, bucle } as Elemento;
    cambiarDiapositiva((dd) => ({ ...dd, elementos: dd.elementos.map((e) => (e.id === anterior.id ? combinado : e)) }));
  };

  const alElegirMedio = (m: MedioElegido) => {
    const prop = selector;
    setSelector(null);
    if (!prop) return;
    if (m.origen === "enlace") {
      const v = crearVideoWeb(m);
      if (prop === "cambiar-video" && el) reemplazarVideo(el, v);
      else agregar(v);
      return;
    }
    const urls: Record<string, string> = {};
    if (m.origen === "biblioteca") {
      if (m.medio.url) urls[`pantalla/${m.medio.path}`] = m.medio.url;
      if (m.medio.posterPath && m.medio.posterUrl) urls[`pantalla/${m.medio.posterPath}`] = m.medio.posterUrl;
    } else {
      urls[`accidentes/${m.path}`] = m.url;
    }
    setMedios((x) => ({ ...x, ...urls }));

    const refImagen =
      m.origen === "biblioteca" ? { bucket: "pantalla" as const, path: m.medio.path } : { bucket: "accidentes" as const, path: m.path };
    const ancho = m.origen === "biblioteca" ? m.medio.ancho : null;
    const alto = m.origen === "biblioteca" ? m.medio.alto : null;

    if (m.origen === "biblioteca" && m.medio.tipo === "video") {
      const datosVideo = { path: m.medio.path, posterPath: m.medio.posterPath, ancho, alto, duracionSeg: m.medio.duracionSeg };
      if (prop === "cambiar-video" && el) reemplazarVideo(el, crearVideo(datosVideo));
      else agregar(crearVideo(datosVideo));
      return;
    }
    if (prop === "fondo") {
      cambiarDiapositiva((dd) => ({
        ...dd,
        fondo: { tipo: "imagen", imagen: refImagen, ajuste: "cubrir", oscurecer: dd.fondo.tipo === "imagen" ? dd.fondo.oscurecer : 0.3 },
      }));
      return;
    }
    if (prop === "cambiar-imagen" && el?.tipo === "imagen") {
      cambiarElemento(el.id, { imagen: refImagen } as Partial<Elemento>);
      return;
    }
    agregar(crearImagen(refImagen, ancho, alto));
  };

  // ── Diapositivas ──────────────────────────────────────────────────────────
  const agregarDiapositiva = () => {
    if (p.diapositivas.length >= MAX_DIAPOSITIVAS) return;
    const nueva = diapositivaVacia();
    // La nueva hereda el fondo de la actual: lo habitual es mantener el estilo.
    nueva.fondo = d ? d.fondo : nueva.fondo;
    hist.set((pp) => ({ ...pp, diapositivas: [...pp.diapositivas.slice(0, indice + 1), nueva, ...pp.diapositivas.slice(indice + 1)] }));
    setActual(indice + 1);
    setSeleccion(null);
  };

  // ── Teclado ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const escribiendo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void guardar();
        return;
      }
      if (escribiendo) return;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        hist.deshacer();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        hist.rehacer();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicarSeleccion();
      } else if ((e.key === "Delete" || e.key === "Backspace") && el) {
        e.preventDefault();
        borrarSeleccion();
      } else if (e.key === "Escape") {
        setSeleccion(null);
      } else if (el && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const paso = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -paso : e.key === "ArrowRight" ? paso : 0;
        const dy = e.key === "ArrowUp" ? -paso : e.key === "ArrowDown" ? paso : 0;
        const caja = dentroDelLienzo({ x: el.x + dx, y: el.y + dy, w: el.w, h: el.h });
        cambiarElemento(el.id, { x: caja.x, y: caja.y }, `flechas-${el.id}`);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // ── Publicar ──────────────────────────────────────────────────────────────
  const onPublicar = async () => {
    if (!window.confirm("¿Publicar? Los televisores con esta presentación cambiarán al terminar la diapositiva que estén mostrando.")) return;
    setPublicando(true);
    try {
      const ok = await guardar();
      if (!ok) return;
      const r = await publicar(id);
      if (!r.ok) return void toast.error(r.error);
      setPublicado({ version: r.version, publicadaAt: new Date().toISOString(), cambios: false });
      toast.success(`Publicada la versión ${r.version}. Los TV la mostrarán en menos de un minuto.`);
    } finally {
      setPublicando(false);
    }
  };

  const onRetirar = async () => {
    if (!window.confirm("¿Retirar la publicación? Los televisores con esta presentación quedarán sin nada que mostrar.")) return;
    const r = await retirarPublicacion(id);
    if (!r.ok) return void toast.error(r.error);
    setPublicado({ version: publicado.version + 1, publicadaAt: null, cambios: true });
    toast.success("Publicación retirada.");
  };

  const abrirVistaPrevia = async () => {
    await guardar();
    window.open(`/pantalla/${id}/vista-previa?de=borrador`, "_blank", "noopener");
  };

  if (!d) return null;

  const indicador = {
    guardado: { icono: <Check className="h-3.5 w-3.5 text-green-600" />, texto: "Guardado" },
    pendiente: { icono: <Circle className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />, texto: "Sin guardar" },
    guardando: { icono: <Loader2 className="h-3.5 w-3.5 animate-spin" />, texto: "Guardando…" },
    error: { icono: <CloudOff className="h-3.5 w-3.5 text-red-600" />, texto: "No se guardó" },
    conflicto: { icono: <CloudOff className="h-3.5 w-3.5 text-red-600" />, texto: "Conflicto" },
  }[estado];

  const widgetsPorFamilia: { titulo: string; tipos: TipoWidget[] }[] = [
    { titulo: "Seguridad vial", tipos: ["acc_factor", "acc_dias_sin", "acc_kpis", "acc_serie", "vel_semana"] },
    { titulo: "Operación de hoy", tipos: ["huella_hoy", "marc_hoy"] },
    { titulo: "Ausentismo", tipos: ["aus_kpis", "aus_serie"] },
    { titulo: "Personas", tipos: ["cumple_hoy", "aniv_hoy", "bienvenida", "cumple_mes", "aniv_mes"] },
    { titulo: "Contratación", tipos: ["vacantes"] },
    { titulo: "Otros", tipos: ["qr", "reloj"] },
  ];

  return (
    <div className={`${claseFuentes} flex h-screen min-h-0 flex-col bg-white`}>
      {/* Barra superior */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#E2E8F0] px-3 py-2">
        <Link href="/pantalla" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100" title="Volver">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900">{nombre}</div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            {indicador.icono} {indicador.texto}
            <span className="text-gray-300">·</span>
            {publicado.publicadaAt ? (
              <span className={publicado.cambios ? "text-amber-600" : "text-green-700"}>
                {publicado.cambios ? `Publicada v${publicado.version} · hay cambios sin publicar` : `Publicada v${publicado.version}`}
              </span>
            ) : (
              <span>Sin publicar</span>
            )}
          </div>
        </div>

        <div className="mx-2 h-6 w-px bg-[#E2E8F0]" />

        <div className="flex flex-wrap items-center gap-0.5">
          <BotonBarra onClick={() => agregar(crearTexto())} titulo="Agregar texto">
            <Type className="h-4 w-4" />
            <span className="hidden lg:inline">Texto</span>
          </BotonBarra>
          <BotonBarra onClick={() => setSelector("elemento-imagen")} titulo="Agregar imagen">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden lg:inline">Imagen</span>
          </BotonBarra>
          <BotonBarra onClick={() => setSelector("elemento-video")} titulo="Agregar video">
            <Film className="h-4 w-4" />
            <span className="hidden lg:inline">Video</span>
          </BotonBarra>
          <Menu etiqueta="Forma" icono={<Shapes className="h-4 w-4" />}>
            {(cerrar) => (
              <div className="w-[248px] p-2">
                <RejillaFormas
                  onElegir={(k) => {
                    agregar(crearForma(k));
                    cerrar();
                  }}
                />
              </div>
            )}
          </Menu>
          <Menu etiqueta="Ícono" icono={<BusFront className="h-4 w-4" />}>
            {(cerrar) => (
              <div className="w-[300px] p-2">
                <RejillaIconos
                  onElegir={(k) => {
                    agregar(crearIcono(k));
                    cerrar();
                  }}
                />
              </div>
            )}
          </Menu>
          <Menu etiqueta="Emoticono" icono={<Smile className="h-4 w-4" />}>
            {(cerrar) => (
              <div className="w-[300px] p-2">
                <RejillaEmojis
                  onElegir={(e) => {
                    agregar(crearEmoji(e));
                    cerrar();
                  }}
                />
              </div>
            )}
          </Menu>
          <Menu etiqueta="Dato en vivo" icono={<Radio className="h-4 w-4" />}>
            {(cerrar) => (
              <div className="max-h-[70vh] overflow-y-auto">
                {widgetsPorFamilia.map((f) => (
                  <div key={f.titulo}>
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{f.titulo}</div>
                    {f.tipos.map((t) => (
                      <ItemMenu key={t} onClick={() => (agregar(crearWidget(t)), cerrar())} descripcion={WIDGETS[t].descripcion}>
                        {WIDGETS[t].nombre}
                      </ItemMenu>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Menu>
          <div className="mx-1 h-6 w-px bg-[#E2E8F0]" />
          <BotonBarra onClick={hist.deshacer} disabled={!hist.puedeDeshacer} titulo="Deshacer (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </BotonBarra>
          <BotonBarra onClick={hist.rehacer} disabled={!hist.puedeRehacer} titulo="Rehacer (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
          </BotonBarra>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {publicado.publicadaAt && (
            <button onClick={() => void onRetirar()} className="hidden rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 xl:inline">
              Retirar publicación
            </button>
          )}
          <button
            onClick={() => void abrirVistaPrevia()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Eye className="h-4 w-4" /> Vista previa
          </button>
          <button
            onClick={() => void onPublicar()}
            disabled={publicando || estado === "conflicto" || pesado}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publicar
          </button>
        </div>
      </header>

      {mensaje && (
        <div className="flex items-center justify-between gap-3 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{mensaje}</span>
          {estado === "conflicto" ? (
            <button onClick={() => void recargar()} className="rounded-md bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm">
              Recargar la última versión
            </button>
          ) : (
            <button onClick={() => void guardar()} className="rounded-md bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm">
              Reintentar
            </button>
          )}
        </div>
      )}

      {/* Cuerpo */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-[200px] shrink-0 border-r border-[#E2E8F0] bg-[#F8FAFC]">
          <PanelDiapositivas
            diapositivas={p.diapositivas}
            actual={indice}
            medios={medios}
            datos={datos}
            onElegir={(i) => {
              setActual(i);
              setSeleccion(null);
            }}
            onReordenar={(de, a) => {
              hist.set((pp) => ({ ...pp, diapositivas: reordenar(pp.diapositivas, de, a) }));
              if (de === indice) setActual(a);
              else if (de < indice && a >= indice) setActual(indice - 1);
              else if (de > indice && a <= indice) setActual(indice + 1);
            }}
            onAgregar={agregarDiapositiva}
            onDuplicar={(i) => {
              hist.set((pp) => ({
                ...pp,
                diapositivas: [...pp.diapositivas.slice(0, i + 1), duplicarDiapositiva(pp.diapositivas[i]), ...pp.diapositivas.slice(i + 1)],
              }));
              setActual(i + 1);
              setSeleccion(null);
            }}
            onBorrar={(i) => {
              if (p.diapositivas.length <= 1) return;
              if (!window.confirm(`¿Borrar la diapositiva ${i + 1}?`)) return;
              hist.set((pp) => ({ ...pp, diapositivas: pp.diapositivas.filter((_, j) => j !== i) }));
              setActual(Math.max(0, i <= indice ? indice - 1 : indice));
              setSeleccion(null);
            }}
          />
        </aside>

        <main className="relative min-w-0 flex-1">
          <LienzoEditor
            diapositiva={d}
            datos={datos}
            medios={medios}
            seleccion={seleccion}
            onSeleccionar={setSeleccion}
            onCambiarElemento={cambiarElemento}
            onEditarTexto={(elId) => {
              setSeleccion(elId);
              setFocoTexto((n) => n + 1);
            }}
            probar={probar}
          />
          <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-gray-500">
            Diapositiva {indice + 1} de {p.diapositivas.length} · Mayús: proporción / giros de 15° · Alt: sin guías · flechas para mover
            {pesado && <span className="ml-2 font-medium text-red-600">Presentación demasiado grande</span>}
          </div>
        </main>

        <aside className="w-[300px] shrink-0 border-l border-[#E2E8F0] bg-white">
          <PanelPropiedades
            diapositiva={d}
            elemento={el}
            onCambiarDiapositiva={(parcial, grupo) => cambiarDiapositiva((dd) => ({ ...dd, ...parcial }), grupo)}
            onCambiarElemento={(parcial, grupo) => el && cambiarElemento(el.id, parcial, grupo)}
            onElegirMedio={setSelector}
            onCapa={(h) => el && cambiarDiapositiva((dd) => moverCapa(dd, el.id, h))}
            onBorrar={borrarSeleccion}
            onDuplicar={duplicarSeleccion}
            focoTexto={focoTexto}
            totalDiapositivas={p.diapositivas.length}
            onProbar={() => el && setProbar((x) => ({ id: el.id, n: (x?.n ?? 0) + 1 }))}
            onFondoATodas={() => {
              // Un solo paso de historial: Ctrl+Z lo deshace entero.
              const fondo = d.fondo;
              hist.set((pp) => ({ ...pp, diapositivas: pp.diapositivas.map((x) => ({ ...x, fondo: structuredClone(fondo) })) }));
              toast.success(`Fondo aplicado a las ${p.diapositivas.length} diapositivas. Ctrl+Z para deshacer.`);
            }}
          />
        </aside>
      </div>

      {selector && (
        <SelectorMedio
          tipo={selector === "elemento-video" || selector === "cambiar-video" ? "video" : "imagen"}
          biblioteca={biblioteca}
          onBiblioteca={setBiblioteca}
          onElegir={alElegirMedio}
          onCerrar={() => setSelector(null)}
          enUsoAqui={(m) => usaMedio(p, "pantalla", m.path)}
        />
      )}
    </div>
  );
}
