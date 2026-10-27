"use client";

/** Panel derecho del editor: propiedades de la diapositiva o del elemento seleccionado. */

import { useEffect, useRef, useState } from "react";
import {
  Check,
  CopyCheck,
  ExternalLink,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Copy,
  Italic,
  Play,
  Trash2,
} from "lucide-react";
import { CLAVES_FUENTE, FUENTES, fontFamilyDe, type FuenteClave } from "@/lib/pantalla/fuentes-catalogo";
import {
  CAMPOS_ESTILO_WIDGET,
  SEG_POR_ELEMENTO,
  carruselDe,
  coloresDelTema,
  type EstiloWidget,
  ANIMACIONES,
  EFECTOS,
  VELOCIDADES,
  type Efecto,
  type Velocidad,
  DURACION,
  DESTINOS_QR,
  esDestinoQr,
  MAX_MARCO,
  TAMANO_TEXTO,
  TRANSICIONES,
  WIDGETS,
  duracionEfectiva,
  videosDe,
  type Animacion,
  type Diapositiva,
  type Elemento,
  type Fondo,
  type Transicion,
  type Widget,
} from "@/lib/pantalla/modelo";
import { formatoDuracion } from "@/lib/pantalla/medios-reglas";
import { SelectorColor } from "./SelectorColor";
import { RejillaEmojis, RejillaFormas, RejillaIconos } from "./SelectoresGraficos";
import { FONDOS_ICONO, type FondoIcono } from "@/lib/pantalla/iconos";
import { NOMBRE_PROVEEDOR, enlacePublico } from "@/lib/pantalla/enlaces-video";

export type PropositoMedio = "elemento-imagen" | "elemento-video" | "fondo" | "cambiar-imagen" | "cambiar-video";

const claseCampo = "w-full rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#4F46E5]";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#F1F5F9] px-4 py-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{titulo}</h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{etiqueta}</span>
      {children}
    </label>
  );
}

function Numero({
  valor,
  onCambio,
  min,
  max,
  paso = 1,
  sufijo,
}: {
  valor: number;
  onCambio: (n: number) => void;
  min: number;
  max: number;
  paso?: number;
  sufijo?: string;
}) {
  // Se escribe libre y solo se aplica lo que ya está dentro del rango. Antes se
  // ajustaba al rango en cada tecla: con mínimo 3, escribir «1» para llegar a
  // 15 lo convertía en 3 al instante. Al salir del campo se ajusta al rango.
  const mostrado = Number.isFinite(valor) ? Math.round(valor * 100) / 100 : 0;
  const [texto, setTexto] = useState(String(mostrado));
  const [visto, setVisto] = useState(mostrado);
  if (visto !== mostrado) {
    // Cambió desde fuera (deshacer, arrastre, otro elemento): se muestra el
    // nuevo valor, salvo que sea lo mismo que ya se está escribiendo («1.» = 1).
    setVisto(mostrado);
    if (Number(texto) !== mostrado) setTexto(String(mostrado));
  }
  const aplicar = () => {
    const n = Number(texto);
    const final = texto.trim() === "" || !Number.isFinite(n) ? mostrado : Math.min(max, Math.max(min, n));
    setTexto(String(Math.round(final * 100) / 100));
    if (final !== valor) onCambio(final);
  };
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        className={claseCampo}
        value={texto}
        min={min}
        max={max}
        step={paso}
        onChange={(e) => {
          const t = e.target.value;
          setTexto(t);
          const n = Number(t);
          if (t.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onCambio(n);
        }}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") aplicar();
        }}
      />
      {sufijo && <span className="text-xs text-gray-400">{sufijo}</span>}
    </div>
  );
}

function Rango({ valor, onCambio, min, max, paso }: { valor: number; onCambio: (n: number) => void; min: number; max: number; paso: number }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        className="w-full accent-[#4F46E5]"
        value={valor}
        min={min}
        max={max}
        step={paso}
        onChange={(e) => onCambio(Number(e.target.value))}
      />
      <span className="w-10 text-right text-xs tabular-nums text-gray-500">{Math.round(valor * 100)}%</span>
    </div>
  );
}

function Interruptor({ valor, onCambio, etiqueta, ayuda }: { valor: boolean; onCambio: (v: boolean) => void; etiqueta: string; ayuda?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
      <input type="checkbox" className="mt-0.5 accent-[#4F46E5]" checked={valor} onChange={(e) => onCambio(e.target.checked)} />
      <span>
        {etiqueta}
        {ayuda && <span className="block text-xs text-gray-400">{ayuda}</span>}
      </span>
    </label>
  );
}

function BotonIcono({ activo, onClick, titulo, children }: { activo?: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      className={`rounded-md border p-1.5 ${activo ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]" : "border-[#E2E8F0] text-gray-600 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}

// ── Diapositiva ─────────────────────────────────────────────────────────────

function PropsDiapositiva({
  d,
  onCambio,
  onElegirMedio,
  onFondoATodas,
  totalDiapositivas,
}: {
  d: Diapositiva;
  onCambio: (parcial: Partial<Diapositiva>, grupo?: string) => void;
  onElegirMedio: (p: PropositoMedio) => void;
  onFondoATodas: () => void;
  totalDiapositivas: number;
}) {
  const [aplicado, setAplicado] = useState(false);
  const hayVideo = videosDe(d).length > 0;
  const dur = duracionEfectiva({ ...d, avance: "video" });
  const carrusel = carruselDe(d);
  const fondo = d.fondo;
  const cambiarFondo = (f: Fondo, grupo?: string) => onCambio({ fondo: f }, grupo);
  return (
    <>
      <Seccion titulo="Diapositiva">
        <Campo etiqueta="Nombre (solo para usted)">
          <input
            className={claseCampo}
            value={d.nombre}
            maxLength={60}
            placeholder="Ej: Accidentes del mes"
            onChange={(e) => onCambio({ nombre: e.target.value }, "nombre-diapositiva")}
          />
        </Campo>
        <Campo etiqueta="Cuánto dura">
          {carrusel && d.avance !== "video" ? (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              La decide el carrusel de accidentes: el resumen de ayer, el del mes y, por cada accidente de ayer, su ficha y sus fotos aprobadas (si tiene),{" "}
              {carrusel.widget.segPorElemento} s cada elemento. Sin accidentes dura {carrusel.widget.segPorElemento} s. Los segundos se
              cambian en el widget.
            </p>
          ) : null}
          <div className={`space-y-2 ${carrusel && d.avance !== "video" ? "hidden" : ""}`}>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" className="accent-[#4F46E5]" checked={d.avance === "tiempo"} onChange={() => onCambio({ avance: "tiempo" })} />
              Por tiempo
            </label>
            {d.avance === "tiempo" && (
              <Numero
                valor={d.duracionSeg}
                min={DURACION.min}
                max={DURACION.max}
                sufijo="segundos"
                onCambio={(n) => onCambio({ duracionSeg: Math.round(n) }, "duracion")}
              />
            )}
            <label className={`flex items-center gap-2 text-sm ${hayVideo ? "text-gray-700" : "text-gray-300"}`}>
              <input
                type="radio"
                className="accent-[#4F46E5]"
                disabled={!hayVideo}
                checked={d.avance === "video"}
                onChange={() => onCambio({ avance: "video" })}
              />
              Al terminar el video {hayVideo && dur.porVideo ? `(≈ ${formatoDuracion(dur.seg)})` : ""}
            </label>
            {!hayVideo && <p className="text-xs text-gray-400">Agregue un video para usar esta opción.</p>}
          </div>
        </Campo>
        <Campo etiqueta="Transición de entrada">
          <select className={claseCampo} value={d.transicion} onChange={(e) => onCambio({ transicion: e.target.value as Transicion })}>
            {Object.entries(TRANSICIONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
      </Seccion>
      <Seccion titulo="Fondo">
        <div className="grid w-full grid-cols-3 rounded-lg border border-[#E2E8F0] p-0.5 text-xs">
          {(
            [
              ["color", "Color"],
              ["degradado", "Degradado"],
              ["imagen", "Imagen"],
            ] as const
          ).map(([t, et]) => (
            <button
              key={t}
              onClick={() => {
                if (t === fondo.tipo) return;
                if (t === "color") cambiarFondo({ tipo: "color", color: fondo.tipo === "degradado" ? fondo.desde : "#0f172a" });
                if (t === "degradado")
                  cambiarFondo({ tipo: "degradado", desde: fondo.tipo === "color" ? fondo.color : "#0f172a", hasta: "#2a78d6", angulo: 135 });
                if (t === "imagen") onElegirMedio("fondo");
              }}
              className={`min-w-0 truncate rounded-md px-1 py-1 ${fondo.tipo === t ? "bg-[#EEF2FF] font-medium text-[#4F46E5]" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {et}
            </button>
          ))}
        </div>
        {fondo.tipo === "color" && <SelectorColor valor={fondo.color} onCambio={(c) => cambiarFondo({ ...fondo, color: c }, "fondo-color")} />}
        {fondo.tipo === "degradado" && (
          <>
            <SelectorColor etiqueta="Desde" valor={fondo.desde} onCambio={(c) => cambiarFondo({ ...fondo, desde: c }, "fondo-desde")} />
            <SelectorColor etiqueta="Hasta" valor={fondo.hasta} onCambio={(c) => cambiarFondo({ ...fondo, hasta: c }, "fondo-hasta")} />
            <Campo etiqueta="Ángulo">
              <Numero valor={fondo.angulo} min={0} max={359} sufijo="°" onCambio={(n) => cambiarFondo({ ...fondo, angulo: n }, "fondo-angulo")} />
            </Campo>
          </>
        )}
        {fondo.tipo === "imagen" && (
          <>
            <button onClick={() => onElegirMedio("fondo")} className="w-full rounded-md border border-[#E2E8F0] py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              Cambiar imagen
            </button>
            <Campo etiqueta="Ajuste">
              <select
                className={claseCampo}
                value={fondo.ajuste}
                onChange={(e) => cambiarFondo({ ...fondo, ajuste: e.target.value as "cubrir" | "contener" })}
              >
                <option value="cubrir">Cubrir toda la pantalla</option>
                <option value="contener">Mostrar la imagen completa</option>
              </select>
            </Campo>
            <Campo etiqueta="Oscurecer (para que el texto se lea)">
              <Rango valor={fondo.oscurecer} min={0} max={0.9} paso={0.05} onCambio={(n) => cambiarFondo({ ...fondo, oscurecer: n }, "fondo-oscurecer")} />
            </Campo>
          </>
        )}
        {totalDiapositivas > 1 && (
          <button
            type="button"
            onClick={() => {
              onFondoATodas();
              setAplicado(true);
              window.setTimeout(() => setAplicado(false), 2500);
            }}
            // Puede partirse en dos líneas: con zoom, barra de desplazamiento o
            // fuentes más anchas del sistema, una sola línea no siempre cabe.
            className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[#E2E8F0] px-3 py-1.5 text-center text-sm leading-snug text-gray-700 hover:bg-gray-50"
            title="Copia este fondo a todas las diapositivas (se puede deshacer con Ctrl+Z)"
          >
            {aplicado ? (
              <>
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                <span className="min-w-0 break-words">Aplicado a las {totalDiapositivas} diapositivas</span>
              </>
            ) : (
              <>
                <CopyCheck className="h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">Aplicar este fondo a todas las diapositivas</span>
              </>
            )}
          </button>
        )}
      </Seccion>
    </>
  );
}

// ── Elemento ────────────────────────────────────────────────────────────────

/** Destino del QR: uno listo de la app o una dirección https propia, y el texto de arriba. */
function OpcionesQr({ w, onCambio }: { w: Extract<Widget, { tipo: "qr" }>; onCambio: (w: Widget) => void }) {
  const preset = DESTINOS_QR.find((d) => d.ruta === w.destino);
  const [propia, setPropia] = useState(preset ? "" : w.destino);
  const valida = esDestinoQr(propia) && propia.startsWith("https://");
  return (
    <>
      <Campo etiqueta="Al escanearlo abre">
        <select
          className={claseCampo}
          value={preset ? preset.ruta : "otra"}
          onChange={(e) => {
            const d = DESTINOS_QR.find((x) => x.ruta === e.target.value);
            if (d) onCambio({ ...w, destino: d.ruta, texto: d.texto });
            else setPropia("");
          }}
        >
          {DESTINOS_QR.map((d) => (
            <option key={d.ruta} value={d.ruta}>
              {d.nombre}
            </option>
          ))}
          <option value="otra">Otra dirección (https)…</option>
        </select>
      </Campo>
      {(!preset || propia) && (
        <Campo etiqueta="Dirección">
          <input
            className={claseCampo}
            value={propia}
            placeholder="https://…"
            onChange={(e) => {
              setPropia(e.target.value.trim());
              if (esDestinoQr(e.target.value.trim()) && e.target.value.trim().startsWith("https://")) {
                onCambio({ ...w, destino: e.target.value.trim() });
              }
            }}
          />
          {propia && !valida && <span className="mt-1 block text-xs text-red-600">Debe empezar por https:// y no tener espacios.</span>}
        </Campo>
      )}
      <Campo etiqueta="Texto encima del código">
        <input
          className={claseCampo}
          value={w.texto}
          maxLength={80}
          placeholder="Ej: Escanee para reportar un daño"
          onChange={(e) => onCambio({ ...w, texto: e.target.value })}
        />
      </Campo>
      <p className="text-xs text-gray-400">Pruébelo con la cámara del celular en la vista previa antes de publicar.</p>
    </>
  );
}

/** Un color del widget: el elegido o, si no hay, el del tema; «Del tema» lo quita. */
function ColorWidget({
  etiqueta,
  valor,
  porDefecto,
  onCambio,
}: {
  etiqueta: string;
  valor: string | undefined;
  porDefecto: string;
  onCambio: (c: string | undefined) => void;
}) {
  return (
    <div>
      <SelectorColor etiqueta={etiqueta} valor={valor ?? porDefecto} onCambio={(c) => onCambio(c)} />
      {valor && (
        <button type="button" className="mt-1 text-xs text-[#4F46E5] hover:underline" onClick={() => onCambio(undefined)}>
          Volver al color del tema
        </button>
      )}
    </div>
  );
}

function EstiloDeWidget({ w, onCambio }: { w: Widget; onCambio: (w: Widget, grupo?: string) => void }) {
  const tema = coloresDelTema(w.tema);
  const poner = <K extends keyof EstiloWidget>(k: K, v: EstiloWidget[K] | undefined, grupo?: string) => {
    const copia: Record<string, unknown> = { ...w };
    if (v === undefined) delete copia[k];
    else copia[k] = v;
    onCambio(copia as unknown as Widget, grupo);
  };
  const tieneEstilo = CAMPOS_ESTILO_WIDGET.some((k) => w[k] !== undefined);
  const fuente = w.fuente ?? "inter";
  return (
    <>
      <Campo etiqueta="Fuente">
        <select
          className={claseCampo}
          value={fuente}
          onChange={(e) => poner("fuente", e.target.value === "inter" ? undefined : (e.target.value as FuenteClave))}
          style={{ fontFamily: fontFamilyDe(fuente) }}
        >
          {CLAVES_FUENTE.map((f) => (
            <option key={f} value={f} style={{ fontFamily: fontFamilyDe(f) }}>
              {FUENTES[f].nombre}
            </option>
          ))}
        </select>
      </Campo>
      <ColorWidget etiqueta="Color del título" valor={w.colorTitulo} porDefecto={tema.colorTitulo} onCambio={(c) => poner("colorTitulo", c, "w-titulo")} />
      <ColorWidget etiqueta="Color del texto y las cifras" valor={w.colorTexto} porDefecto={tema.colorTexto} onCambio={(c) => poner("colorTexto", c, "w-texto")} />
      <ColorWidget
        etiqueta="Color de acento (viñetas, días, gráficas)"
        valor={w.colorAcento}
        porDefecto={tema.colorAcento}
        onCambio={(c) => poner("colorAcento", c, "w-acento")}
      />
      <ColorWidget
        etiqueta="Color destacado (íconos, «¡hoy!», felicitación)"
        valor={w.colorDestacado}
        porDefecto={tema.colorDestacado}
        onCambio={(c) => poner("colorDestacado", c, "w-destacado")}
      />
      <ColorWidget etiqueta="Color de fondo" valor={w.colorFondo} porDefecto={tema.colorFondo} onCambio={(c) => poner("colorFondo", c, "w-fondo")} />
      <Campo etiqueta="Opacidad del fondo (0 % = transparente)">
        <Rango valor={w.opacidadFondo ?? tema.opacidadFondo} min={0} max={1} paso={0.01} onCambio={(n) => poner("opacidadFondo", n, "w-opacidad")} />
      </Campo>
      {tieneEstilo && (
        <button
          type="button"
          className="w-full rounded-md border border-[#E2E8F0] px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          onClick={() => {
            const copia: Record<string, unknown> = { ...w };
            for (const k of CAMPOS_ESTILO_WIDGET) delete copia[k];
            onCambio(copia as unknown as Widget);
          }}
        >
          Quitar todo el estilo (volver al tema)
        </button>
      )}
    </>
  );
}

function OpcionesWidget({ w, onCambio }: { w: Widget; onCambio: (w: Widget, grupo?: string) => void }) {
  return (
    <>
      <p className="text-xs text-gray-500">{WIDGETS[w.tipo].descripcion}</p>
      <Campo etiqueta="Tema">
        <select className={claseCampo} value={w.tema} onChange={(e) => onCambio({ ...w, tema: e.target.value as "claro" | "oscuro" })}>
          <option value="oscuro">Oscuro</option>
          <option value="claro">Claro</option>
        </select>
      </Campo>
      {w.tipo === "acc_serie" && (
        <Campo etiqueta="Meses">
          <select className={claseCampo} value={w.meses} onChange={(e) => onCambio({ ...w, meses: Number(e.target.value) === 6 ? 6 : 12 })}>
            <option value={6}>Últimos 6</option>
            <option value={12}>Últimos 12</option>
          </select>
        </Campo>
      )}
      {w.tipo === "qr" && <OpcionesQr w={w} onCambio={onCambio} />}
      {(w.tipo === "cumple_mes" || w.tipo === "cumple_hoy" || w.tipo === "aniv_hoy" || w.tipo === "aniv_mes" || w.tipo === "bienvenida") && (
        <Campo etiqueta={w.tipo === "cumple_hoy" || w.tipo === "aniv_hoy" ? "Máximo de próximos al lado" : "Máximo de personas"}>
          <Numero valor={w.maxFilas} min={1} max={30} onCambio={(n) => onCambio({ ...w, maxFilas: Math.round(n) })} />
        </Campo>
      )}
      {w.tipo === "acc_ayer" && (
        <Campo etiqueta="Segundos de cada elemento del carrusel">
          <Numero
            valor={w.segPorElemento}
            min={SEG_POR_ELEMENTO.min}
            max={SEG_POR_ELEMENTO.max}
            sufijo="s"
            onCambio={(n) => onCambio({ ...w, segPorElemento: Math.round(n) }, "seg-por-elemento")}
          />
          <span className="mt-1 block text-xs text-gray-400">
            El resumen y cada accidente se muestran este tiempo; la diapositiva dura la suma.
          </span>
        </Campo>
      )}
      {w.tipo === "reloj" && (
        <Campo etiqueta="Mostrar">
          <select className={claseCampo} value={w.formato} onChange={(e) => onCambio({ ...w, formato: e.target.value === "hora" ? "hora" : "fecha_hora" })}>
            <option value="fecha_hora">Hora y fecha</option>
            <option value="hora">Solo la hora</option>
          </select>
        </Campo>
      )}
      <p className="text-xs text-gray-400">En el editor se ven datos de ejemplo; la vista previa y el TV usan los reales.</p>
    </>
  );
}

const TITULO_ELEMENTO: Record<Elemento["tipo"], string> = {
  texto: "Texto",
  imagen: "Imagen",
  video: "Video",
  forma: "Forma",
  widget: "Dato en vivo",
  emoji: "Emoticono",
  icono: "Ícono",
  video_web: "Video desde enlace",
};

function PropsElemento({
  el,
  onCambio,
  onElegirMedio,
  onCapa,
  onBorrar,
  onDuplicar,
  focoTexto,
  onProbar,
}: {
  onProbar: () => void;
  el: Elemento;
  onCambio: (parcial: Partial<Elemento>, grupo?: string) => void;
  onElegirMedio: (p: PropositoMedio) => void;
  onCapa: (hacia: 1 | -1 | "frente" | "fondo") => void;
  onBorrar: () => void;
  onDuplicar: () => void;
  focoTexto: number;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focoTexto > 0) {
      area.current?.focus();
      area.current?.select();
    }
  }, [focoTexto]);

  const c = <K extends keyof Elemento>(k: K, grupo?: string) => (v: Elemento[K]) => onCambio({ [k]: v } as Partial<Elemento>, grupo);

  return (
    <>
      <div className="flex items-center justify-between border-b border-[#F1F5F9] px-4 py-3">
        <span className="text-sm font-semibold text-gray-800">
          {el.tipo === "widget" ? WIDGETS[el.widget.tipo].nombre : TITULO_ELEMENTO[el.tipo]}
        </span>
        <div className="flex gap-1">
          <BotonIcono onClick={onDuplicar} titulo="Duplicar (Ctrl+D)">
            <Copy className="h-3.5 w-3.5" />
          </BotonIcono>
          <button onClick={onBorrar} title="Borrar (Supr)" className="rounded-md border border-[#E2E8F0] p-1.5 text-red-600 hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {el.tipo === "texto" && (
        <Seccion titulo="Texto">
          <textarea
            ref={area}
            className={`${claseCampo} min-h-[88px] resize-y`}
            value={el.texto}
            maxLength={500}
            onChange={(e) => onCambio({ texto: e.target.value } as Partial<Elemento>, `texto-${el.id}`)}
          />
          <Campo etiqueta="Fuente">
            <select
              className={claseCampo}
              value={el.fuente}
              onChange={(e) => onCambio({ fuente: e.target.value } as Partial<Elemento>)}
              style={{ fontFamily: fontFamilyDe(el.fuente) }}
            >
              {CLAVES_FUENTE.map((f) => (
                <option key={f} value={f} style={{ fontFamily: fontFamilyDe(f) }}>
                  {FUENTES[f].nombre}
                </option>
              ))}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Tamaño">
              <Numero
                valor={el.tamano}
                min={TAMANO_TEXTO.min}
                max={TAMANO_TEXTO.max}
                sufijo="px"
                onCambio={(n) => onCambio({ tamano: Math.round(n) } as Partial<Elemento>, "tamano")}
              />
            </Campo>
            <Campo etiqueta="Interlineado">
              <Numero valor={el.interlineado} min={0.8} max={2} paso={0.05} onCambio={(n) => onCambio({ interlineado: n } as Partial<Elemento>, "interlineado")} />
            </Campo>
          </div>
          <SelectorColor etiqueta="Color" valor={el.color} onCambio={(v) => onCambio({ color: v } as Partial<Elemento>, "color-texto")} />
          <div className="flex flex-wrap gap-1">
            <BotonIcono activo={el.negrita} onClick={() => onCambio({ negrita: !el.negrita } as Partial<Elemento>)} titulo="Negrita">
              <Bold className="h-4 w-4" />
            </BotonIcono>
            <BotonIcono activo={el.cursiva} onClick={() => onCambio({ cursiva: !el.cursiva } as Partial<Elemento>)} titulo="Cursiva">
              <Italic className="h-4 w-4" />
            </BotonIcono>
            <span className="mx-1 w-px bg-[#E2E8F0]" />
            <BotonIcono activo={el.alineacion === "izquierda"} onClick={() => onCambio({ alineacion: "izquierda" } as Partial<Elemento>)} titulo="Izquierda">
              <AlignLeft className="h-4 w-4" />
            </BotonIcono>
            <BotonIcono activo={el.alineacion === "centro"} onClick={() => onCambio({ alineacion: "centro" } as Partial<Elemento>)} titulo="Centro">
              <AlignCenter className="h-4 w-4" />
            </BotonIcono>
            <BotonIcono activo={el.alineacion === "derecha"} onClick={() => onCambio({ alineacion: "derecha" } as Partial<Elemento>)} titulo="Derecha">
              <AlignRight className="h-4 w-4" />
            </BotonIcono>
          </div>
          <Interruptor valor={el.sombra} onCambio={(v) => onCambio({ sombra: v } as Partial<Elemento>)} etiqueta="Sombra (se lee mejor sobre fotos)" />
        </Seccion>
      )}

      {(el.tipo === "imagen" || el.tipo === "video") && (
        <Seccion titulo={el.tipo === "video" ? "Video" : "Imagen"}>
          <button
            onClick={() => onElegirMedio(el.tipo === "video" ? "cambiar-video" : "cambiar-imagen")}
            className="w-full rounded-md border border-[#E2E8F0] py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cambiar {el.tipo === "video" ? "video" : "imagen"}
          </button>
          <Campo etiqueta="Ajuste">
            <select className={claseCampo} value={el.ajuste} onChange={(e) => onCambio({ ajuste: e.target.value } as Partial<Elemento>)}>
              <option value="cubrir">Llenar el recuadro (recorta)</option>
              <option value="contener">Mostrar completo</option>
            </select>
          </Campo>
          <Campo etiqueta="Esquinas redondeadas">
            <Numero valor={el.radio} min={0} max={540} sufijo="px" onCambio={(n) => onCambio({ radio: Math.round(n) } as Partial<Elemento>, "radio")} />
          </Campo>
          <Campo etiqueta="Marco">
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-full accent-[#4F46E5]"
                min={0}
                max={MAX_MARCO}
                value={el.marco}
                onChange={(e) => onCambio({ marco: Number(e.target.value) } as Partial<Elemento>, "marco")}
                aria-label="Grosor del marco"
              />
              <span className="w-12 text-right text-xs tabular-nums text-gray-500">{el.marco ? `${el.marco} px` : "Sin"}</span>
            </div>
          </Campo>
          {el.marco > 0 && (
            <SelectorColor etiqueta="Color del marco" valor={el.colorMarco} onCambio={(v) => onCambio({ colorMarco: v } as Partial<Elemento>, "color-marco")} />
          )}
          {el.tipo === "video" && (
            <>
              <p className="text-xs text-gray-500">Duración: {formatoDuracion(el.duracionSeg)}</p>
              <Interruptor
                valor={!el.silenciado}
                onCambio={(v) => onCambio({ silenciado: !v } as Partial<Elemento>)}
                etiqueta="Con sonido"
                ayuda="El navegador del TV solo deja sonar el video después de un clic en esa pantalla (por ejemplo «Pantalla completa»)."
              />
              <Interruptor
                valor={el.bucle}
                onCambio={(v) => onCambio({ bucle: v } as Partial<Elemento>)}
                etiqueta="Repetir en bucle"
                ayuda="Si la diapositiva avanza al terminar el video, se reproduce una sola vez."
              />
            </>
          )}
        </Seccion>
      )}

      {el.tipo === "video_web" && (
        <Seccion titulo="Video desde enlace">
          <div className="rounded-md bg-gray-50 p-2 text-xs">
            <div className="font-semibold text-gray-700">{NOMBRE_PROVEEDOR[el.web.proveedor]}</div>
            {el.titulo && <div className="mt-0.5 line-clamp-2 text-gray-600">{el.titulo}</div>}
            <div className="mt-1 flex items-center justify-between gap-2 text-gray-500">
              <span>Duración: {formatoDuracion(el.duracionSeg)}</span>
              <a href={enlacePublico(el.web)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#4F46E5] hover:underline">
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <button
            onClick={() => onElegirMedio("cambiar-video")}
            className="w-full rounded-md border border-[#E2E8F0] py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cambiar video
          </button>
          {el.web.proveedor === "youtube" && (
            <p className="text-xs text-amber-700">YouTube puede mostrar anuncios si el dueño del video lo monetiza.</p>
          )}
          <Interruptor
            valor={!el.silenciado}
            onCambio={(v) => onCambio({ silenciado: !v } as Partial<Elemento>)}
            etiqueta="Con sonido"
            ayuda="El navegador del TV solo deja sonar el video después de un clic en esa pantalla (por ejemplo «Pantalla completa»)."
          />
          <Interruptor
            valor={el.bucle}
            onCambio={(v) => onCambio({ bucle: v } as Partial<Elemento>)}
            etiqueta="Repetir en bucle"
            ayuda="Si la diapositiva avanza al terminar el video, se reproduce una sola vez."
          />
          <Campo etiqueta="Esquinas redondeadas">
            <Numero valor={el.radio} min={0} max={540} sufijo="px" onCambio={(n) => onCambio({ radio: Math.round(n) } as Partial<Elemento>, "radio")} />
          </Campo>
          <Campo etiqueta="Marco">
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-full accent-[#4F46E5]"
                min={0}
                max={MAX_MARCO}
                value={el.marco}
                onChange={(e) => onCambio({ marco: Number(e.target.value) } as Partial<Elemento>, "marco")}
                aria-label="Grosor del marco"
              />
              <span className="w-12 text-right text-xs tabular-nums text-gray-500">{el.marco ? `${el.marco} px` : "Sin"}</span>
            </div>
          </Campo>
          {el.marco > 0 && (
            <SelectorColor etiqueta="Color del marco" valor={el.colorMarco} onCambio={(v) => onCambio({ colorMarco: v } as Partial<Elemento>, "color-marco")} />
          )}
        </Seccion>
      )}

      {el.tipo === "icono" && (
        <Seccion titulo="Ícono">
          <RejillaIconos actual={el.icono} columnas={7} onElegir={(k) => onCambio({ icono: k } as Partial<Elemento>)} />
          <SelectorColor etiqueta="Color del ícono" valor={el.color} onCambio={(v) => onCambio({ color: v } as Partial<Elemento>, "color-icono")} />
          <Campo etiqueta="Grosor del trazo">
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-full accent-[#4F46E5]"
                min={0.75}
                max={3}
                step={0.25}
                value={el.grosor}
                onChange={(e) => onCambio({ grosor: Number(e.target.value) } as Partial<Elemento>, "grosor-icono")}
                aria-label="Grosor del trazo"
              />
              <span className="w-8 text-right text-xs tabular-nums text-gray-500">{el.grosor}</span>
            </div>
          </Campo>
          <Campo etiqueta="Fondo">
            <div className="grid w-full grid-cols-3 rounded-lg border border-[#E2E8F0] p-0.5 text-xs">
              {(Object.entries(FONDOS_ICONO) as [FondoIcono, string][]).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onCambio({ fondo: k } as Partial<Elemento>)}
                  className={`min-w-0 truncate rounded-md px-1 py-1 ${el.fondo === k ? "bg-[#EEF2FF] font-medium text-[#4F46E5]" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </Campo>
          {el.fondo !== "ninguno" && (
            <SelectorColor etiqueta="Color del fondo" valor={el.colorFondo} onCambio={(v) => onCambio({ colorFondo: v } as Partial<Elemento>, "fondo-icono")} />
          )}
          <Interruptor valor={el.sombra} onCambio={(v) => onCambio({ sombra: v } as Partial<Elemento>)} etiqueta="Sombra" />
        </Seccion>
      )}

      {el.tipo === "emoji" && (
        <Seccion titulo="Emoticono">
          <RejillaEmojis actual={el.emoji} columnas={7} onElegir={(e) => onCambio({ emoji: e } as Partial<Elemento>)} />
          <Interruptor valor={el.sombra} onCambio={(v) => onCambio({ sombra: v } as Partial<Elemento>)} etiqueta="Sombra" />
        </Seccion>
      )}

      {el.tipo === "forma" && (
        <Seccion titulo="Forma">
          <RejillaFormas actual={el.forma} onElegir={(k) => onCambio({ forma: k } as Partial<Elemento>)} />
          <SelectorColor etiqueta="Relleno" valor={el.relleno} onCambio={(v) => onCambio({ relleno: v } as Partial<Elemento>, "relleno")} />
          {el.forma !== "linea" && (
            <>
              <Campo etiqueta="Borde">
                <Numero
                  valor={el.grosorBorde}
                  min={0}
                  max={60}
                  sufijo="px"
                  onCambio={(n) => onCambio({ grosorBorde: Math.round(n) } as Partial<Elemento>, "grosor")}
                />
              </Campo>
              {el.grosorBorde > 0 && <SelectorColor etiqueta="Color del borde" valor={el.borde} onCambio={(v) => onCambio({ borde: v } as Partial<Elemento>, "borde")} />}
              {el.forma === "rect" && (
                <Campo etiqueta="Esquinas redondeadas">
                  <Numero valor={el.radio} min={0} max={540} sufijo="px" onCambio={(n) => onCambio({ radio: Math.round(n) } as Partial<Elemento>, "radio")} />
                </Campo>
              )}
            </>
          )}
        </Seccion>
      )}

      {el.tipo === "widget" && (
        <Seccion titulo="Dato en vivo">
          <OpcionesWidget w={el.widget} onCambio={(w) => onCambio({ widget: w } as Partial<Elemento>)} />
        </Seccion>
      )}
      {el.tipo === "widget" && (
        <Seccion titulo="Estilo del dato en vivo">
          <EstiloDeWidget w={el.widget} onCambio={(w, grupo) => onCambio({ widget: w } as Partial<Elemento>, grupo)} />
        </Seccion>
      )}

      <Seccion titulo="Posición y tamaño">
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="X">
            <Numero valor={el.x} min={-1920} max={3840} onCambio={(n) => c("x", "pos")(Math.round(n))} />
          </Campo>
          <Campo etiqueta="Y">
            <Numero valor={el.y} min={-1080} max={2160} onCambio={(n) => c("y", "pos")(Math.round(n))} />
          </Campo>
          <Campo etiqueta="Ancho">
            <Numero valor={el.w} min={4} max={7680} onCambio={(n) => c("w", "tam")(Math.round(n))} />
          </Campo>
          <Campo etiqueta="Alto">
            <Numero valor={el.h} min={2} max={4320} onCambio={(n) => c("h", "tam")(Math.round(n))} />
          </Campo>
          <Campo etiqueta="Rotación">
            <Numero valor={el.rot} min={0} max={359} sufijo="°" onCambio={(n) => c("rot", "rot")(n)} />
          </Campo>
        </div>
        <Campo etiqueta="Opacidad">
          <Rango valor={el.opacidad} min={0} max={1} paso={0.05} onCambio={(n) => c("opacidad", "opacidad")(n)} />
        </Campo>
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-500">Capa</span>
          <div className="flex gap-1">
            <BotonIcono onClick={() => onCapa("frente")} titulo="Al frente">
              <ArrowUpToLine className="h-4 w-4" />
            </BotonIcono>
            <BotonIcono onClick={() => onCapa(1)} titulo="Subir una">
              <ArrowUp className="h-4 w-4" />
            </BotonIcono>
            <BotonIcono onClick={() => onCapa(-1)} titulo="Bajar una">
              <ArrowDown className="h-4 w-4" />
            </BotonIcono>
            <BotonIcono onClick={() => onCapa("fondo")} titulo="Al fondo">
              <ArrowDownToLine className="h-4 w-4" />
            </BotonIcono>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Animación">
        <Campo etiqueta="Al aparecer">
          <select
            className={claseCampo}
            value={el.entrada.animacion}
            onChange={(e) => {
              onCambio({ entrada: { ...el.entrada, animacion: e.target.value as Animacion } });
              onProbar();
            }}
          >
            {Object.entries(ANIMACIONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        {el.entrada.animacion !== "ninguna" && (
          <Campo etiqueta="Esperar antes de aparecer">
            <Numero
              valor={el.entrada.retardoMs / 1000}
              min={0}
              max={10}
              paso={0.1}
              sufijo="s"
              onCambio={(n) => onCambio({ entrada: { ...el.entrada, retardoMs: Math.round(n * 1000) } }, "retardo")}
            />
          </Campo>
        )}
        <Campo etiqueta="Mientras está en pantalla">
          <select
            className={claseCampo}
            value={el.efecto.tipo}
            onChange={(e) => {
              onCambio({ efecto: { ...el.efecto, tipo: e.target.value as Efecto } });
              onProbar();
            }}
          >
            {Object.entries(EFECTOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        {el.efecto.tipo !== "ninguno" && (
          <div className="grid grid-cols-3 rounded-lg border border-[#E2E8F0] p-0.5 text-xs" role="radiogroup" aria-label="Velocidad">
            {(Object.entries(VELOCIDADES) as [Velocidad, string][]).map(([k, v]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={el.efecto.velocidad === k}
                onClick={() => {
                  onCambio({ efecto: { ...el.efecto, velocidad: k } });
                  onProbar();
                }}
                className={`rounded-md px-1 py-1 ${el.efecto.velocidad === k ? "bg-[#EEF2FF] font-medium text-[#4F46E5]" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
        {(el.entrada.animacion !== "ninguna" || el.efecto.tipo !== "ninguno") && (
          <button
            type="button"
            onClick={onProbar}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#E2E8F0] py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Play className="h-3.5 w-3.5" /> Probar animación
          </button>
        )}
      </Seccion>
    </>
  );
}

export function PanelPropiedades(props: {
  diapositiva: Diapositiva;
  elemento: Elemento | null;
  onCambiarDiapositiva: (parcial: Partial<Diapositiva>, grupo?: string) => void;
  onCambiarElemento: (parcial: Partial<Elemento>, grupo?: string) => void;
  onElegirMedio: (p: PropositoMedio) => void;
  onCapa: (hacia: 1 | -1 | "frente" | "fondo") => void;
  onBorrar: () => void;
  onDuplicar: () => void;
  focoTexto: number;
  onFondoATodas: () => void;
  totalDiapositivas: number;
  onProbar: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      {props.elemento ? (
        <PropsElemento
          key={props.elemento.id}
          el={props.elemento}
          onCambio={props.onCambiarElemento}
          onElegirMedio={props.onElegirMedio}
          onCapa={props.onCapa}
          onBorrar={props.onBorrar}
          onDuplicar={props.onDuplicar}
          focoTexto={props.focoTexto}
          onProbar={props.onProbar}
        />
      ) : (
        <PropsDiapositiva
          key={props.diapositiva.id}
          d={props.diapositiva}
          onCambio={props.onCambiarDiapositiva}
          onElegirMedio={props.onElegirMedio}
          onFondoATodas={props.onFondoATodas}
          totalDiapositivas={props.totalDiapositivas}
        />
      )}
    </div>
  );
}
