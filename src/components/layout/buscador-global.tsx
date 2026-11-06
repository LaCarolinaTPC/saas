"use client";

/**
 * Buscador global (Ctrl+K). Las pantallas llegan ya filtradas por permiso desde
 * el layout y se buscan aquí mismo, al instante; los registros se piden a
 * `/api/buscador`, que aplica los permisos en cada petición.
 *
 * Importa solo TIPOS de src/lib/buscador/pantallas: el catálogo completo de
 * pantallas no debe llegar al navegador.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, FileText, LayoutGrid, Loader2 } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { PantallaBuscable } from "@/lib/buscador/pantallas";
import { coincide, normalizar, palabrasDe } from "@/lib/buscador/texto";
import type { RespuestaBuscador } from "@/app/api/buscador/route";
import { EVENTO_ABRIR_BUSCADOR } from "./boton-buscador";

const ESPERA_MS = 250;
const MAX_PANTALLAS = 8;

const VACIA: RespuestaBuscador = { grupos: [], parcial: false };

/** Primero lo que empieza por lo escrito, luego lo que lo contiene en el título. */
function puntaje(p: PantallaBuscable, frase: string, palabras: readonly string[]): number {
  const titulo = normalizar(p.titulo);
  if (titulo.startsWith(frase)) return 0;
  if (coincide(titulo, palabras)) return 1;
  return 2;
}

export function BuscadorGlobal({ pantallas }: { pantallas: PantallaBuscable[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [registros, setRegistros] = useState<RespuestaBuscador>(VACIA);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);

  const cambiarAbierto = useCallback((siguiente: boolean) => {
    setAbierto(siguiente);
    if (!siguiente) {
      setTexto("");
      setRegistros(VACIA);
      setFallo(false);
    }
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((a) => !a);
      }
    };
    const alAbrir = () => setAbierto(true);
    window.addEventListener("keydown", alTeclear);
    window.addEventListener(EVENTO_ABRIR_BUSCADOR, alAbrir);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener(EVENTO_ABRIR_BUSCADOR, alAbrir);
    };
  }, []);

  const palabras = useMemo(() => palabrasDe(texto), [texto]);
  const claveConsulta = palabras.join(" ");

  const pantallasHalladas = useMemo(() => {
    if (palabras.length === 0) return [];
    const frase = normalizar(texto).trim();
    return pantallas
      .filter((p) => coincide(p.texto, palabras))
      .map((p) => ({ p, n: puntaje(p, frase, palabras) }))
      .sort((a, b) => a.n - b.n)
      .slice(0, MAX_PANTALLAS)
      .map((x) => x.p);
  }, [pantallas, palabras, texto]);

  useEffect(() => {
    if (!abierto || !claveConsulta) {
      setRegistros(VACIA);
      setCargando(false);
      setFallo(false);
      return;
    }
    const control = new AbortController();
    setCargando(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch("/api/buscador", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: claveConsulta }),
          signal: control.signal,
        });
        if (!r.ok) throw new Error(String(r.status));
        setRegistros((await r.json()) as RespuestaBuscador);
        setFallo(false);
      } catch {
        if (control.signal.aborted) return;
        setRegistros(VACIA);
        setFallo(true);
      }
      setCargando(false);
    }, ESPERA_MS);
    return () => {
      window.clearTimeout(t);
      control.abort();
    };
  }, [abierto, claveConsulta]);

  const ir = (href: string) => {
    cambiarAbierto(false);
    router.push(href);
  };

  const sinResultados = palabras.length > 0 && !cargando && !fallo && pantallasHalladas.length === 0 && registros.grupos.length === 0;

  return (
    <CommandDialog
      open={abierto}
      onOpenChange={cambiarAbierto}
      title="Buscador global"
      description="Busque pantallas, personas, vehículos y otros registros."
      className="sm:max-w-xl"
    >
      {/* shouldFilter={false}: el filtro de cmdk no ignora tildes y ocultaría
          las coincidencias por cédula o placa, que no están en el texto visible. */}
      <Command shouldFilter={false}>
        <CommandInput value={texto} onValueChange={setTexto} placeholder="Buscar pantallas, personas, vehículos..." />
        <CommandList className="max-h-[60vh]">
          {palabras.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Escriba al menos 2 caracteres.</p>}
          {sinResultados && <CommandEmpty>Sin resultados entre lo que su usuario puede ver.</CommandEmpty>}
          {pantallasHalladas.length > 0 && (
            <CommandGroup heading="Pantallas">
              {pantallasHalladas.map((p) => (
                <CommandItem key={p.href} value={p.href} onSelect={() => ir(p.href)}>
                  <LayoutGrid className="text-muted-foreground" />
                  <span className="truncate">{p.titulo}</span>
                  <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{p.grupo}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {registros.grupos.map((g) => (
            <CommandGroup key={g.clave} heading={g.grupo}>
              {g.resultados.map((r) => (
                <CommandItem key={r.href} value={r.href} onSelect={() => ir(r.href)}>
                  <FileText className="text-muted-foreground" />
                  <span className="truncate">{r.titulo}</span>
                  <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{r.detalle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {cargando && (
            <p className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando registros...
            </p>
          )}
          {(fallo || registros.parcial) && !cargando && (
            <p className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-amber-700">
              <CircleAlert className="h-3.5 w-3.5" />
              {fallo ? "No se pudieron buscar los registros." : "Algunos registros no se pudieron buscar: los resultados pueden estar incompletos."}
            </p>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
