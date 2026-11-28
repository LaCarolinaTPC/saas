"use client";

/**
 * Confirmaciones del sistema (27-nov-2026), en lugar de confirm(), prompt() y
 * alert() del navegador: algunos navegadores los bloquean o el usuario marca
 * «no volver a mostrar» y entonces la acción se hace o se pierde sin preguntar.
 *
 *   if (!(await confirmar("¿Eliminar el documento?"))) return;
 *   const motivo = await pedirTexto("Motivo de la anulación");
 *   void avisar("No se pudo guardar.");
 *
 * <Confirmador /> va una sola vez en el layout raíz; las funciones se pueden
 * llamar desde cualquier componente de cliente, sin hooks.
 */
import { useState, useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface OpcionesDialogo {
  titulo?: string;
  /** Texto del botón de aceptar. */
  aceptar?: string;
  cancelar?: string;
  /** Botón rojo (borrar, cerrar, reversar…). Si no se dice, se deduce del mensaje. */
  peligro?: boolean;
}
type OpcionesTexto = OpcionesDialogo & { inicial?: string; obligatorio?: boolean };

type Pedido = { id: number; mensaje: string } & (
  | { tipo: "confirmar"; opciones: OpcionesDialogo; resolver: (v: boolean) => void }
  | { tipo: "texto"; opciones: OpcionesTexto; resolver: (v: string | null) => void }
  | { tipo: "aviso"; opciones: OpcionesDialogo; resolver: () => void }
);
type PedidoNuevo = Pedido extends infer P ? (P extends Pedido ? Omit<P, "id"> : never) : never;

// La cola vive fuera de React: así cualquier componente puede pedir sin hooks.
let cola: Pedido[] = [];
let siguiente = 1;
const oyentes = new Set<() => void>();
const avisarCambio = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};
const VACIA: Pedido[] = [];
function pedir(p: PedidoNuevo) {
  cola = [...cola, { ...p, id: siguiente++ } as Pedido];
  avisarCambio();
}
function quitar(id: number) {
  cola = cola.filter((p) => p.id !== id);
  avisarCambio();
}

const PELIGRO = /^\s*¿?\s*(eliminar|borrar|reversar|quitar|descartar|anular|cerrar|retirar|restablecer|desactivar|deshacer)/i;

/** ¿Seguir? true si acepta; false si cancela o cierra el diálogo. */
export function confirmar(mensaje: string, opciones: OpcionesDialogo = {}): Promise<boolean> {
  return new Promise((resolver) => pedir({ tipo: "confirmar", mensaje, opciones, resolver }));
}

/** Pide un texto; null si cancela. */
export function pedirTexto(mensaje: string, opciones: OpcionesTexto = {}): Promise<string | null> {
  return new Promise((resolver) => pedir({ tipo: "texto", mensaje, opciones, resolver }));
}

/** Un aviso con un solo botón. */
export function avisar(mensaje: string, opciones: OpcionesDialogo = {}): Promise<void> {
  return new Promise((resolver) => pedir({ tipo: "aviso", mensaje, opciones, resolver }));
}

/** Va una sola vez en el layout raíz: muestra los pedidos de a uno. */
export function Confirmador() {
  const pedidos = useSyncExternalStore(suscribir, () => cola, () => VACIA);
  const actual = pedidos[0];
  // La key reinicia el texto escrito con cada pedido.
  return actual ? <Dialogo key={actual.id} pedido={actual} /> : null;
}

function Dialogo({ pedido }: { pedido: Pedido }) {
  const [texto, setTexto] = useState(pedido.tipo === "texto" ? (pedido.opciones.inicial ?? "") : "");
  const [resuelto, setResuelto] = useState(false);
  const terminar = (acepta: boolean) => {
    if (resuelto) return;
    setResuelto(true);
    if (pedido.tipo === "confirmar") pedido.resolver(acepta);
    else if (pedido.tipo === "texto") pedido.resolver(acepta ? texto : null);
    else pedido.resolver();
    quitar(pedido.id);
  };
  const o = pedido.opciones;
  const peligro = o.peligro ?? (pedido.tipo === "confirmar" && PELIGRO.test(pedido.mensaje));
  const faltaTexto = pedido.tipo === "texto" && !!pedido.opciones.obligatorio && !texto.trim();
  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && terminar(false)}>
      {/* Por encima de cualquier otro modal (la ficha, el diálogo de Croma…): la confirmación es de lo que está abierto. */}
      <AlertDialogContent className="z-[10000] data-[size=default]:sm:max-w-md" overlayClassName="z-[10000] bg-black/30">
        <AlertDialogHeader>
          <AlertDialogTitle>{o.titulo ?? (pedido.tipo === "aviso" ? "Aviso" : pedido.tipo === "texto" ? "Escriba" : "Confirmar")}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line text-left">{pedido.mensaje}</AlertDialogDescription>
        </AlertDialogHeader>
        {pedido.tipo === "texto" && (
          <textarea
            autoFocus
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !faltaTexto) {
                e.preventDefault();
                terminar(true);
              }
            }}
            className="w-full resize-y rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
          />
        )}
        <AlertDialogFooter>
          {pedido.tipo !== "aviso" && <AlertDialogCancel onClick={() => terminar(false)}>{o.cancelar ?? "Cancelar"}</AlertDialogCancel>}
          <Button
            autoFocus={pedido.tipo !== "texto"}
            disabled={faltaTexto}
            className={peligro ? "bg-red-600 text-white hover:bg-red-700" : undefined}
            onClick={() => terminar(true)}
          >
            {o.aceptar ?? (pedido.tipo === "aviso" ? "Entendido" : "Aceptar")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
