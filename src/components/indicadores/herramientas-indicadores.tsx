"use client";

/**
 * Barra de herramientas de los Indicadores (27-nov-2026): buscar, ir a una
 * sección, plegar o desplegar, y descargar lo que se ve en Excel, CSV o PDF.
 *
 * Trabaja sobre lo que ya pintó la página (sin pedir datos otra vez): cada
 * <section> con un <h2> dentro del contenedor `#contenedorId` es una sección;
 * sus cifras llevan `data-cifra`/`data-valor`/`data-nota`, sus tablas se leen
 * tal cual y los gráficos traen una tabla oculta (`data-exportar`). Como los
 * grupos llegan por partes (<Suspense>), se vuelve a leer cuando cambia el DOM.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, FileSpreadsheet, FileText, Loader2, Search, Table2, X } from "lucide-react";
import { toast } from "sonner";
import { usePuedeExportar } from "@/components/permisos/permisos-provider";
import type { CeldaCsv } from "@/lib/exportar/csv";

interface SeccionDom {
  id: string;
  titulo: string;
  el: HTMLElement;
}
interface TablaExport {
  titulo: string;
  cabecera: string[];
  filas: (string | number)[][];
}
interface SeccionExport {
  titulo: string;
  cifras: { etiqueta: string; valor: string; nota: string }[];
  tablas: TablaExport[];
}

const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "seccion";
const visible = (el: Element) => (el as HTMLElement).style.display !== "none" && !(el as HTMLElement).closest("[data-oculta-busqueda]");

/** Texto de una celda: los nodos hijos separados por espacio («21» + «45 %» → «21 45 %»). */
function textoCelda(el: Element): string {
  const partes: string[] = [];
  el.childNodes.forEach((n) => {
    const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) partes.push(t);
  });
  return partes.join(" ");
}
/** «1.234» o «-12,5» → número; lo demás queda como texto. */
function valorCelda(t: string): string | number {
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t) || /^-?\d+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  return t;
}

/** Cabecera de una tabla con filas y columnas combinadas, en una sola fila de títulos. */
function cabeceraDe(tabla: HTMLTableElement): string[] {
  const filas = Array.from(tabla.tHead?.rows ?? []);
  if (!filas.length) return [];
  const grilla: string[][] = filas.map(() => []);
  filas.forEach((tr, i) => {
    let col = 0;
    for (const th of Array.from(tr.cells)) {
      while (grilla[i][col] !== undefined) col++;
      const texto = textoCelda(th);
      for (let r = 0; r < (th.rowSpan || 1); r++) for (let c = 0; c < (th.colSpan || 1); c++) if (grilla[i + r]) grilla[i + r][col + c] = r === 0 ? texto : "\u0000";
      col += th.colSpan || 1;
    }
  });
  const ancho = Math.max(...grilla.map((g) => g.length));
  return Array.from({ length: ancho }, (_, c) =>
    grilla
      .map((g) => g[c])
      .filter((t): t is string => !!t && t !== "\u0000")
      .filter((t, i, a) => a.indexOf(t) === i)
      .join(" · ")
  );
}

function leerSeccion(s: SeccionDom): SeccionExport {
  const cifras = Array.from(s.el.querySelectorAll<HTMLElement>("[data-cifra]"))
    .filter(visible)
    .map((c) => ({ etiqueta: c.dataset.cifra ?? "", valor: c.dataset.valor || "—", nota: c.dataset.nota ?? "" }));
  const tablas: TablaExport[] = [];
  s.el.querySelectorAll<HTMLTableElement>("table").forEach((t, i) => {
    if (t.closest("[data-oculta-busqueda]")) return;
    // El título de la tabla: el subtítulo (h3) más cercano antes de ella, o el de la sección.
    let titulo = s.titulo;
    const h3s = Array.from(s.el.querySelectorAll("h3"));
    for (const h of h3s) if (h.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) titulo = `${s.titulo} · ${textoCelda(h)}`;
    const cuerpo = Array.from(t.tBodies).flatMap((b) => Array.from(b.rows)).filter((tr) => tr.style.display !== "none");
    const filas = cuerpo.map((tr) => Array.from(tr.cells).map((td) => valorCelda(textoCelda(td))));
    if (filas.length) tablas.push({ titulo: tablas.some((x) => x.titulo === titulo) ? `${titulo} (${i + 1})` : titulo, cabecera: cabeceraDe(t), filas });
  });
  return { titulo: s.titulo, cifras, tablas };
}

export function HerramientasIndicadores({ titulo, contexto, contenedorId = "indicadores-contenido" }: { titulo: string; contexto?: string; contenedorId?: string }) {
  const [secciones, setSecciones] = useState<SeccionDom[]>([]);
  const [busqueda, setBusqueda] = useState("");
  // Segmentador (reunión del 27-nov-2026): ver solo una sección, o todas.
  const [vista, setVista] = useState("");
  const [encontradas, setEncontradas] = useState<number | null>(null);
  const [generando, setGenerando] = useState<"xlsx" | "csv" | "pdf" | null>(null);
  const puedeExportar = usePuedeExportar();
  // Si hubo un filtro: al borrarlo hay que mostrar todo otra vez (sin filtro previo no se toca el HTML).
  const filtrado = useRef(false);

  // Las secciones de la página (llegan por partes con <Suspense>).
  const leer = useCallback(() => {
    const cont = document.getElementById(contenedorId);
    if (!cont) return;
    // Solo se lee: tocar atributos de lo que React aún está hidratando (llega por partes) da error de hidratación.
    const lista: SeccionDom[] = [];
    cont.querySelectorAll<HTMLElement>("section").forEach((el, i) => {
      const h2 = el.querySelector("h2");
      if (!h2 || el.parentElement?.closest("section")) return;
      const t = (h2.textContent ?? "").trim();
      lista.push({ id: `${i}-${slug(t)}`, titulo: t, el });
    });
    setSecciones((prev) => (prev.length === lista.length && prev.every((p, i) => p.el === lista[i].el) ? prev : lista));
  }, [contenedorId]);

  useEffect(() => {
    leer();
    const cont = document.getElementById(contenedorId);
    if (!cont) return;
    const obs = new MutationObserver(() => leer());
    obs.observe(cont, { childList: true, subtree: true });
    // Plegar o desplegar con un clic en el título de la sección.
    const alClic = (e: MouseEvent) => {
      const h2 = (e.target as HTMLElement).closest<HTMLElement>("section h2");
      if (!h2 || (e.target as HTMLElement).closest("a,button,select,input,label")) return;
      const sec = h2.closest("section");
      if (sec) plegar(sec, sec.dataset.plegada !== "1");
    };
    cont.addEventListener("click", alClic);
    return () => {
      obs.disconnect();
      cont.removeEventListener("click", alClic);
    };
  }, [contenedorId, leer]);

  function plegar(sec: HTMLElement, si: boolean) {
    sec.dataset.plegada = si ? "1" : "";
    const h2 = sec.querySelector("h2");
    // Todo lo que no lleva el título se oculta; el bloque del título queda.
    Array.from(sec.children).forEach((hijo) => {
      if (h2 && (hijo === h2 || hijo.contains(h2))) return;
      (hijo as HTMLElement).style.display = si ? "none" : "";
    });
    if (h2) h2.style.opacity = si ? "0.75" : "";
  }

  function aplicarBusqueda(q: string, idVista: string) {
    const cont = document.getElementById(contenedorId);
    if (!cont) return;
    const t = norm(q.trim());
    const elegida = idVista ? secciones.find((x) => x.id === idVista)?.el ?? null : null;
    if (!t && !elegida && !filtrado.current) return;
    filtrado.current = !!t || !!elegida;
    let n = 0;
    cont.querySelectorAll<HTMLElement>("section").forEach((sec) => {
      if (!sec.querySelector("h2") || sec.parentElement?.closest("section")) return;
      const filas = Array.from(sec.querySelectorAll<HTMLElement>("tbody tr, li, [data-cifra]")).filter((f) => !f.closest("table.sr-only"));
      // Con una sección elegida, las demás no se ven.
      if (elegida && sec !== elegida) {
        sec.style.display = "none";
        sec.setAttribute("data-oculta-busqueda", "1");
        return;
      }
      if (!t) {
        if (sec.dataset.plegada === "1") plegar(sec, false);
        sec.style.display = "";
        sec.removeAttribute("data-oculta-busqueda");
        filas.forEach((f) => (f.style.display = ""));
        return;
      }
      const enTitulo = norm(sec.querySelector("h2")?.textContent).includes(t);
      const coinciden = filas.filter((f) => norm(f.textContent).includes(t));
      const enTexto = norm(sec.textContent).includes(t);
      const muestra = enTitulo || coinciden.length > 0 || enTexto;
      sec.style.display = muestra ? "" : "none";
      if (muestra) sec.removeAttribute("data-oculta-busqueda");
      else sec.setAttribute("data-oculta-busqueda", "1");
      // Con filas que coinciden (y sin coincidir el título), solo esas filas.
      const soloCoincidentes = !enTitulo && coinciden.length > 0;
      filas.forEach((f) => (f.style.display = soloCoincidentes && !coinciden.includes(f) ? "none" : ""));
      if (muestra) {
        n++;
        if (sec.dataset.plegada === "1") plegar(sec, false);
      }
    });
    setEncontradas(t ? n : null);
  }

  useEffect(() => {
    const id = setTimeout(() => aplicarBusqueda(busqueda, vista), 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, vista]);

  // Elegir una sección: se ve solo esa, arriba; «Todas» vuelve a la página completa.
  const verSeccion = (id: string) => {
    setVista(id);
    const sec = secciones.find((x) => x.id === id)?.el ?? document.getElementById(contenedorId);
    setTimeout(() => sec?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
  };

  const datos = () => secciones.filter((s) => s.el.style.display !== "none").map(leerSeccion);
  const nombreArchivo = () => `indicadores_${slug(titulo)}_${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}`;
  const lineaFiltro = () => [contexto, busqueda.trim() ? `Búsqueda: «${busqueda.trim()}»` : null].filter(Boolean).join(" · ");

  async function exportar(formato: "xlsx" | "csv" | "pdf") {
    const d = datos();
    if (!d.some((s) => s.cifras.length || s.tablas.length)) {
      toast.error("No hay cifras ni tablas para descargar con lo que se ve.");
      return;
    }
    setGenerando(formato);
    try {
      if (formato === "csv") {
        const { descargarCsv } = await import("@/lib/exportar/csv");
        const filas: CeldaCsv[][] = [[titulo], [lineaFiltro()], []];
        for (const s of d) {
          if (s.cifras.length) {
            filas.push([s.titulo], ["Indicador", "Valor", "Nota"], ...s.cifras.map((c) => [c.etiqueta, c.valor, c.nota]), []);
          }
          for (const t of s.tablas) filas.push([t.titulo], t.cabecera, ...t.filas, []);
        }
        descargarCsv(`${nombreArchivo()}.csv`, filas);
      } else if (formato === "xlsx") {
        const XLSX = await import("xlsx");
        const libro = XLSX.utils.book_new();
        const resumen: (string | number)[][] = [[titulo], [lineaFiltro()], [`Generado: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`], []];
        for (const s of d) if (s.cifras.length) resumen.push([s.titulo], ["Indicador", "Valor", "Nota"], ...s.cifras.map((c) => [c.etiqueta, c.valor, c.nota]), []);
        const hojaResumen = XLSX.utils.aoa_to_sheet(resumen);
        hojaResumen["!cols"] = [{ wch: 42 }, { wch: 18 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");
        const usados = new Set(["Resumen"]);
        for (const s of d)
          for (const t of s.tablas) {
            let nombre = t.titulo.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Tabla";
            for (let k = 2; usados.has(nombre); k++) nombre = `${nombre.slice(0, 27)} (${k})`;
            usados.add(nombre);
            const hoja = XLSX.utils.aoa_to_sheet([[t.titulo], [], t.cabecera, ...t.filas]);
            hoja["!cols"] = t.cabecera.map((c, i) => ({ wch: Math.min(48, Math.max(10, c.length + 2, ...t.filas.map((f) => String(f[i] ?? "").length + 2))) }));
            XLSX.utils.book_append_sheet(libro, hoja, nombre);
          }
        XLSX.writeFile(libro, `${nombreArchivo()}.xlsx`);
      } else {
        const { descargarPdfTabla } = await import("@/lib/exportar/pdf-tabla");
        await descargarPdfTabla({
          archivo: nombreArchivo(),
          modulo: "Candidatos · Indicadores",
          titulo,
          contexto: [lineaFiltro()].filter(Boolean),
          columnas: [{ titulo: "Indicador", ancho: 70 }, { titulo: "Valor", ancho: 35, alinear: "right" }, { titulo: "Nota" }],
          filas: [],
          secciones: d.filter((s) => s.cifras.length).map((s) => ({ titulo: s.titulo, filas: s.cifras.map((c) => [c.etiqueta, c.valor, c.nota]) })),
          anexos: d.flatMap((s) =>
            s.tablas.map((t) => ({
              titulo: t.titulo,
              columnas: t.cabecera.map((c, i) => ({ titulo: c || " ", ...(i > 0 ? { alinear: "right" as const } : {}) })),
              filas: t.filas.map((f) => f.map((v) => (typeof v === "number" ? v.toLocaleString("es-CO") : v))),
            }))
          ),
          orientacion: "landscape",
          vacio: "Sin cifras en este periodo.",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el archivo.");
    } finally {
      setGenerando(null);
    }
  }

  const boton = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50";
  return (
    <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border bg-[#F8FAFC]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {/* Los títulos de sección se pliegan con un clic: el cursor lo dice (sin tocar el HTML de la página). */}
      <style>{`#${contenedorId} section { scroll-margin-top: 64px; } #${contenedorId} section h2 { cursor: pointer; user-select: none; } #${contenedorId} section h2:hover { text-decoration: underline; text-decoration-color: #cbd5e1; text-underline-offset: 3px; }`}</style>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en los indicadores (sección, causa, laboratorio…)"
            className="h-8 w-full rounded-lg border border-border bg-white pl-8 pr-7 text-xs outline-none focus:border-primary"
            aria-label="Buscar en los indicadores"
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-tertiary hover:text-text-primary" aria-label="Borrar la búsqueda">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {vista && (
          <button type="button" className={boton} onClick={() => verSeccion("")} title="Volver a ver todas las secciones">
            <X className="h-3.5 w-3.5" /> Ver todas
          </button>
        )}
        {encontradas != null && <span className="text-xs text-text-tertiary">{encontradas === 0 ? "Nada coincide" : `${encontradas} ${encontradas === 1 ? "sección" : "secciones"}`}</span>}
        <select
          value={vista}
          onChange={(e) => verSeccion(e.target.value)}
          className={`h-8 max-w-[240px] rounded-lg border px-2 text-xs outline-none focus:border-primary ${vista ? "border-primary bg-primary/5 font-medium text-primary" : "border-border bg-white text-text-secondary"}`}
          aria-label="Ver una sola sección"
          disabled={!secciones.length}
        >
          <option value="">Ver: todas las secciones ({secciones.length})</option>
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.titulo}
            </option>
          ))}
        </select>
        <button type="button" className={boton} onClick={() => secciones.forEach((s) => plegar(s.el, true))} title="Plegar todas las secciones">
          <ChevronsDownUp className="h-3.5 w-3.5" /> Plegar
        </button>
        <button type="button" className={boton} onClick={() => secciones.forEach((s) => plegar(s.el, false))} title="Desplegar todas las secciones">
          <ChevronsUpDown className="h-3.5 w-3.5" /> Desplegar
        </button>
        {puedeExportar && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden text-xs text-text-tertiary md:inline">Descargar lo que se ve:</span>
            <button type="button" className={boton} disabled={!!generando} onClick={() => exportar("xlsx")} title="Excel: una hoja de resumen y una por tabla">
              {generando === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-[#059669]" />} Excel
            </button>
            <button type="button" className={boton} disabled={!!generando} onClick={() => exportar("csv")} title="CSV con las cifras y las tablas">
              {generando === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Table2 className="h-3.5 w-3.5" />} CSV
            </button>
            <button type="button" className={boton} disabled={!!generando} onClick={() => exportar("pdf")} title="PDF con el logo, las cifras y las tablas">
              {generando === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-[#DC2626]" />} PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
