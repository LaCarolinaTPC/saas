import { entornoActual } from "@/lib/entorno";
import { PrefijoTitulo } from "./prefijo-titulo";

/**
 * Aviso visual de entorno: línea de color arriba, etiqueta flotante abajo y
 * prefijo en el título de la pestaña. No se muestra en un despliegue de
 * producción (ver src/lib/entorno.ts).
 *
 * Todo es `fixed` y `pointer-events-none`: no empuja el layout (el panel usa
 * h-screen) ni tapa clics. No sale al imprimir.
 */
export function IndicadorEntorno() {
  const entorno = entornoActual();
  if (!entorno) return null;

  const desarrollo = entorno.tipo === "desarrollo";
  const color = desarrollo ? "bg-amber-400 text-amber-950" : "bg-red-600 text-white";

  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1 print:hidden ${
          desarrollo ? "bg-amber-400" : "bg-red-600"
        }`}
      />
      <div
        role="status"
        className={`pointer-events-none fixed bottom-3 left-1/2 z-[9999] -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap shadow-lg print:hidden ${color}`}
      >
        {entorno.etiqueta}
        {entorno.baseDatos && (
          <span className="ml-2 font-normal opacity-80">base: {entorno.baseDatos}</span>
        )}
      </div>
      <PrefijoTitulo prefijo={entorno.prefijoTitulo} />
    </>
  );
}
