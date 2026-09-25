"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { cambiarClave, iniciarSesion } from "./actions";

const inputCls =
  "h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const botonCls =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#4F46E5] text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60";

function Campo({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[#334155]">{label}</label>
      <input id={id} name={id} required className={inputCls} {...rest} />
    </div>
  );
}

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, null);
  return (
    <form action={accion} className="space-y-4">
      <Campo id="email" label="Correo electrónico" type="email" autoComplete="username" placeholder="su@correo.com" />
      <Campo id="clave" label="Contraseña" type="password" autoComplete="current-password" />
      {estado?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{estado.error}</p>}
      <button type="submit" disabled={enviando} className={botonCls}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Ingresar
      </button>
      <p className="text-center text-xs text-[#64748B]">
        ¿Olvidó su contraseña? Comuníquese con Tesorería para que le asignen una provisional.
      </p>
    </form>
  );
}

export function FormularioCambioClave({ obligatorio }: { obligatorio: boolean }) {
  const [estado, accion, enviando] = useActionState(cambiarClave, null);
  return (
    <form action={accion} className="space-y-4">
      {obligatorio && (
        <p className="rounded-lg bg-[#EEF2FF] p-3 text-sm text-[#3730A3]">
          Su contraseña es provisional. Escoja una propia para continuar.
        </p>
      )}
      <Campo id="actual" label={obligatorio ? "Contraseña provisional" : "Contraseña actual"} type="password" autoComplete="current-password" />
      <Campo id="nueva" label="Contraseña nueva" type="password" autoComplete="new-password" minLength={8} />
      <Campo id="confirmar" label="Confirme la contraseña nueva" type="password" autoComplete="new-password" minLength={8} />
      <p className="text-xs text-[#64748B]">Mínimo 8 caracteres, con letras y al menos un número.</p>
      {estado?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{estado.error}</p>}
      <button type="submit" disabled={enviando} className={botonCls}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar contraseña
      </button>
    </form>
  );
}
