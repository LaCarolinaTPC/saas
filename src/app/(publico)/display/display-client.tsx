"use client";

/**
 * Cliente del televisor. Tres estados:
 *
 *   sinClave ──código──▶ mostrandoCodigo ──RRHH lo teclea──▶ vinculado
 *       ▲                                                       │
 *       └──────────────── 401 (revocado) ◀──────────────────────┘
 *
 * La clave se guarda en localStorage para no volver a vincular al reiniciar el
 * TV. Si la revocan, el TV la borra y vuelve a mostrar un código: si fue un
 * error, se vincula de nuevo en segundos. `?clave=` en la URL es una vía de
 * respaldo: se guarda y se quita de la barra de direcciones.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Tv, Volume2, WifiOff } from "lucide-react";
import { Reproductor } from "@/components/pantalla/Reproductor";
import { EVENTO_ACTIVAR_SONIDO } from "@/components/pantalla/LienzoDiapositiva";
import { CLAVE_LOCAL, SONDEO_DISPLAY_MS, type RespuestaDisplay } from "@/lib/pantalla/tipos-display";
import { POLL_TV_MS, codigoLegible } from "@/lib/pantalla/vinculacion-reglas";
import type { Presentacion } from "@/lib/pantalla/modelo";

function leerClave(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_LOCAL);
  } catch {
    return null;
  }
}
function guardarClave(k: string) {
  try {
    window.localStorage.setItem(CLAVE_LOCAL, k);
  } catch {
    /* modo invitado: la clave vive solo en memoria */
  }
}
function borrarClave() {
  try {
    window.localStorage.removeItem(CLAVE_LOCAL);
  } catch {
    /* nada */
  }
}

type Fase = { tipo: "cargando" } | { tipo: "sinClave" } | { tipo: "vinculado"; clave: string };

export function DisplayClient() {
  const [fase, setFase] = useState<Fase>({ tipo: "cargando" });

  useEffect(() => {
    // Respaldo: /display?clave=dsp_… guarda la clave y limpia la URL. Se usa
    // history.replaceState nativo (Next lo sincroniza) para no recargar nada.
    const url = new URL(window.location.href);
    const deUrl = url.searchParams.get("clave");
    let k: string | null;
    if (deUrl && /^dsp_[A-Za-z0-9_-]{32}$/.test(deUrl)) {
      guardarClave(deUrl);
      url.searchParams.delete("clave");
      window.history.replaceState(null, "", url.pathname + url.search);
      k = deUrl;
    } else {
      k = leerClave();
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la clave vive en localStorage: solo se puede leer al montar
    setFase(k ? { tipo: "vinculado", clave: k } : { tipo: "sinClave" });
  }, []);

  // Pantalla siempre encendida mientras la página esté visible.
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    let lock: Sentinel | null = null;
    const pedir = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock;
        if (wl && document.visibilityState === "visible") lock = await wl.request("screen");
      } catch {
        /* no soportado */
      }
    };
    void pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      void lock?.release().catch(() => {});
    };
  }, []);

  const alVincular = useCallback((clave: string) => {
    guardarClave(clave);
    setFase({ tipo: "vinculado", clave });
  }, []);
  const alRevocar = useCallback(() => {
    borrarClave();
    setFase({ tipo: "sinClave" });
  }, []);

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white">
      {fase.tipo === "sinClave" && <PantallaCodigo onVinculado={alVincular} />}
      {fase.tipo === "vinculado" && <PantallaVinculada clave={fase.clave} onRevocada={alRevocar} />}
    </div>
  );
}

// ── Código de vinculación ───────────────────────────────────────────────────

type Codigo = { codigo: string; tokenTv: string; expiraEnSeg: number; recibido: number };

function PantallaCodigo({ onVinculado }: { onVinculado: (clave: string) => void }) {
  const [codigo, setCodigo] = useState<Codigo | null>(null);
  const [intento, setIntento] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [origen, setOrigen] = useState("");

  useEffect(() => setOrigen(window.location.host), []);

  // Pide un código cuando no hay uno vigente; si falla, reintenta en 15 s.
  useEffect(() => {
    if (codigo) return;
    let vivo = true;
    let reintento: number | undefined;
    (async () => {
      try {
        const r = await fetch("/api/display/vincular/iniciar", { method: "POST", cache: "no-store" });
        if (!vivo) return;
        if (!r.ok) throw new Error(r.status === 429 ? "Demasiados intentos; reintentando…" : "Sin conexión con Gestivo, reintentando…");
        const j = (await r.json()) as Omit<Codigo, "recibido">;
        setAviso(null);
        setCodigo({ ...j, recibido: Date.now() });
      } catch (e) {
        if (!vivo) return;
        setAviso(e instanceof Error ? e.message : "Sin conexión con Gestivo, reintentando…");
        reintento = window.setTimeout(() => setIntento((n) => n + 1), 15_000);
      }
    })();
    return () => {
      vivo = false;
      if (reintento) window.clearTimeout(reintento);
    };
  }, [codigo, intento]);

  // Sondeo del estado mientras se muestra el código.
  useEffect(() => {
    if (!codigo) return;
    let vivo = true;
    const t = window.setInterval(async () => {
      try {
        const r = await fetch("/api/display/vincular/estado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenTv: codigo.tokenTv }),
          cache: "no-store",
        });
        if (!vivo) return;
        if (r.status === 404) {
          setCodigo(null); // venció: se pide otro
          return;
        }
        if (!r.ok) return;
        const j = (await r.json()) as { estado: string; clave?: string };
        if (j.estado === "completada" && j.clave) onVinculado(j.clave);
        setAviso(null);
      } catch {
        if (vivo) setAviso("Sin conexión con Gestivo, reintentando…");
      }
    }, POLL_TV_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [codigo, onVinculado]);

  // Cuenta regresiva (relativa: no depende del reloj del TV).
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const restante = codigo ? Math.max(0, codigo.expiraEnSeg - Math.floor((ahora - codigo.recibido) / 1000)) : 0;
  useEffect(() => {
    if (codigo && restante <= 0) setCodigo(null);
  }, [codigo, restante]);

  const digitos = codigo ? codigoLegible(codigo.codigo).split("") : [];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#111c3a] to-[#1e293b] px-8 text-center">
      <div className="mb-10 flex items-center gap-4 text-[clamp(20px,2.4vw,40px)] font-semibold text-slate-300">
        <Tv className="h-[1.3em] w-[1.3em] text-[#2a78d6]" />
        Pantalla informativa
      </div>
      {codigo ? (
        <>
          <p className="mb-8 text-[clamp(18px,2.2vw,36px)] text-slate-300">Para mostrar la presentación, ingrese este código en</p>
          <div className="mb-10 text-[clamp(20px,2.6vw,44px)] font-semibold">
            Gestivo › Recursos Humanos › Pantalla TV
          </div>
          <div className="flex items-center gap-[1.2vw]" aria-label={`Código ${codigo.codigo}`}>
            {digitos.map((c, i) =>
              c === " " ? (
                <span key={i} className="w-[2vw]" />
              ) : (
                <span
                  key={i}
                  className="flex h-[16vh] min-h-[90px] w-[11vh] min-w-[64px] items-center justify-center rounded-2xl border-2 border-white/20 bg-white/10 text-[clamp(56px,11vh,180px)] font-bold tabular-nums"
                >
                  {c}
                </span>
              )
            )}
          </div>
          <p className="mt-10 text-[clamp(14px,1.6vw,26px)] text-slate-400">
            Vence en {Math.floor(restante / 60)}:{String(restante % 60).padStart(2, "0")} · después aparece otro código
          </p>
        </>
      ) : (
        <p className="text-[clamp(18px,2.2vw,36px)] text-slate-300">Generando código…</p>
      )}
      {aviso && (
        <p className="mt-8 flex items-center gap-2 text-[clamp(14px,1.4vw,22px)] text-amber-300">
          <WifiOff className="h-[1.2em] w-[1.2em]" /> {aviso}
        </p>
      )}
      {origen && <p className="absolute bottom-6 text-[clamp(12px,1.1vw,18px)] text-slate-500">{origen}/display</p>}
    </div>
  );
}

// ── Presentación ────────────────────────────────────────────────────────────

/** Precarga imágenes antes de mostrar una versión nueva, con tope de espera. */
function precargar(medios: Record<string, string>, p: Presentacion | null): Promise<void> {
  if (!p) return Promise.resolve();
  const urls: string[] = [];
  for (const d of p.diapositivas) {
    if (d.fondo.tipo === "imagen") urls.push(medios[`${d.fondo.imagen.bucket}/${d.fondo.imagen.path}`]);
    for (const e of d.elementos) {
      if (e.tipo === "imagen") urls.push(medios[`${e.imagen.bucket}/${e.imagen.path}`]);
      if (e.tipo === "video" && e.poster) urls.push(medios[`${e.poster.bucket}/${e.poster.path}`]);
    }
  }
  const cargas = urls.filter(Boolean).map(
    (u) =>
      new Promise<void>((ok) => {
        const img = new Image();
        img.onload = img.onerror = () => ok();
        img.src = u;
      })
  );
  return Promise.race([Promise.all(cargas).then(() => {}), new Promise<void>((ok) => setTimeout(ok, 15_000))]);
}

function PantallaVinculada({ clave, onRevocada }: { clave: string; onRevocada: () => void }) {
  const [activa, setActivaEstado] = useState<RespuestaDisplay | null>(null);
  const activaRef = useRef<RespuestaDisplay | null>(null);
  const setActiva = useCallback((v: RespuestaDisplay | null | ((a: RespuestaDisplay | null) => RespuestaDisplay | null)) => {
    const nuevo = typeof v === "function" ? v(activaRef.current) : v;
    activaRef.current = nuevo;
    setActivaEstado(nuevo);
  }, []);
  const pendiente = useRef<RespuestaDisplay | null>(null);
  const [sinRed, setSinRed] = useState(false);
  const [sonidoBloqueado, setSonidoBloqueado] = useState(false);
  const [controles, setControles] = useState(true);
  const versionActiva = useRef<number | null>(null);

  // Sondeo de /api/display.
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await fetch("/api/display", { headers: { "x-display-key": clave }, cache: "no-store" });
        if (!vivo) return;
        if (r.status === 401) {
          onRevocada();
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as RespuestaDisplay;
        setSinRed(false);
        if (versionActiva.current === null || j.presentacion === null || !activaRef.current?.presentacion) {
          // Primera carga, o no hay nada en pantalla: se aplica ya.
          await precargar(j.medios, j.presentacion);
          if (!vivo) return;
          versionActiva.current = j.version;
          setActiva(j);
        } else if (j.version !== versionActiva.current) {
          // Versión nueva: espera al final de la diapositiva en curso.
          await precargar(j.medios, j.presentacion);
          if (vivo) pendiente.current = j;
        } else {
          // Misma versión: solo datos y URLs (la presentación no se toca).
          setActiva((a) => (a ? { ...a, datos: j.datos, medios: { ...a.medios, ...j.medios }, dispositivo: j.dispositivo } : j));
        }
      } catch {
        if (vivo) setSinRed(true);
      }
    };
    void consultar();
    const t = window.setInterval(consultar, SONDEO_DISPLAY_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [clave, onRevocada, setActiva]);

  const alAvanzar = useCallback(() => {
    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;
    versionActiva.current = p.version;
    setActiva(p);
  }, [setActiva]);

  // Cursor y botones visibles solo al mover el mouse.
  useEffect(() => {
    let t: number | undefined;
    const mostrar = () => {
      setControles(true);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => setControles(false), 3000);
    };
    mostrar();
    window.addEventListener("mousemove", mostrar);
    window.addEventListener("touchstart", mostrar);
    return () => {
      window.removeEventListener("mousemove", mostrar);
      window.removeEventListener("touchstart", mostrar);
      if (t) window.clearTimeout(t);
    };
  }, []);

  const pantallaCompleta = () => {
    // El clic también cuenta como gesto: deja sonar los videos con audio.
    window.dispatchEvent(new Event(EVENTO_ACTIVAR_SONIDO));
    setSonidoBloqueado(false);
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    else void document.exitFullscreen?.().catch(() => {});
  };

  const presentacion = activa?.presentacion ?? null;

  return (
    <div className="relative h-full w-full" style={{ cursor: controles ? "default" : "none" }}>
      {!activa ? (
        <div className="flex h-full items-center justify-center text-[clamp(18px,2vw,32px)] text-slate-400">Cargando…</div>
      ) : presentacion ? (
        <Reproductor
          presentacion={presentacion}
          datos={activa.datos}
          medios={activa.medios}
          onAvance={alAvanzar}
          onSonidoBloqueado={() => setSonidoBloqueado(true)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#0f172a] px-8 text-center">
          <Tv className="h-[10vh] w-[10vh] text-[#2a78d6]" />
          <p className="text-[clamp(22px,3vw,52px)] font-semibold">{activa.dispositivo.nombre}</p>
          <p className="text-[clamp(16px,1.8vw,30px)] text-slate-400">
            Vinculada. Todavía no tiene una presentación publicada asignada.
          </p>
        </div>
      )}

      {sinRed && (
        <span
          title="Sin conexión con Gestivo: se muestra lo último recibido"
          className="absolute right-3 bottom-3 h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
        />
      )}

      {sonidoBloqueado && (
        <button
          onClick={() => {
            window.dispatchEvent(new Event(EVENTO_ACTIVAR_SONIDO));
            setSonidoBloqueado(false);
          }}
          className="absolute bottom-6 left-6 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white backdrop-blur"
        >
          <Volume2 className="h-4 w-4" /> Activar sonido
        </button>
      )}

      <div
        className="absolute top-4 right-4 flex gap-2 transition-opacity duration-300"
        style={{ opacity: controles ? 1 : 0, pointerEvents: controles ? "auto" : "none" }}
      >
        <button
          onClick={pantallaCompleta}
          className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-sm text-white backdrop-blur hover:bg-black/80"
        >
          <Maximize className="h-4 w-4" /> Pantalla completa
        </button>
      </div>
    </div>
  );
}
