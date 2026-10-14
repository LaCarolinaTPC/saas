"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Confirmación de una acción delicada. Reemplaza los window.confirm que tenía
 * la pantalla: el texto del navegador no se puede formatear ni traducir, y en
 * algunos navegadores se puede silenciar, de modo que la acción se ejecutaba
 * sin que nadie confirmara nada.
 *
 * Controlado a propósito (el llamador tiene el estado): así el botón que lo
 * abre sigue siendo el de la fila, con su propio `disabled` y su `pending`.
 */
export function ConfirmarAccion({
  abierto,
  onAbrir,
  titulo,
  descripcion,
  textoConfirmar,
  destructivo = false,
  onConfirmar,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  titulo: string;
  descripcion: React.ReactNode;
  textoConfirmar: string;
  destructivo?: boolean;
  onConfirmar: () => void;
}) {
  return (
    <AlertDialog open={abierto} onOpenChange={onAbrir}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={destructivo ? "destructive" : "default"}
            onClick={() => {
              onAbrir(false);
              onConfirmar();
            }}
          >
            {textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
