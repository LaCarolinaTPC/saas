"use client";

import { createContext, useContext, useMemo } from "react";
import { usePathname } from "next/navigation";
import { PERMISO_POR_CLAVE } from "@/lib/permisos/catalogo";
import { destinoDeRuta, puede as puedeMotor, type PermisosEfectivos } from "@/lib/permisos/motor";

/**
 * Los permisos del usuario en el navegador, para mostrar u ocultar botones
 * (Nuevo, Editar, Eliminar…). Los llena el layout del panel con lo mismo que
 * decide el servidor.
 *
 * Ocultar es comodidad: la barrera es la acción de servidor, que exige el
 * mismo permiso.
 */
const VACIO: PermisosEfectivos = { super: false, permisos: new Set() };
// null = fuera del panel (vistas de impresión, páginas públicas): sin permisos.
const Ctx = createContext<PermisosEfectivos | null>(null);

export function PermisosProvider({
  permisos,
  superUsuario,
  children,
}: {
  permisos: string[];
  superUsuario: boolean;
  children: React.ReactNode;
}) {
  const valor = useMemo(() => ({ super: superUsuario, permisos: new Set(permisos) }), [permisos, superUsuario]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** `const puede = usePermisos(); puede("ausentismo.editar")`. */
export function usePermisos(): (clave: string) => boolean {
  const ef = useContext(Ctx) ?? VACIO;
  return (clave: string) => puedeMotor(ef, clave);
}

/** Muestra su contenido solo si el usuario tiene el permiso. */
export function SiPuede({ permiso, children, si = null }: { permiso: string; children: React.ReactNode; si?: React.ReactNode }) {
  const puede = usePermisos();
  return <>{puede(permiso) ? children : si}</>;
}

/**
 * ¿Puede descargar (PDF, Excel, CSV) lo que ve en esta pantalla? Se decide por
 * el módulo de la ruta actual: `<modulo>.exportar`. En un módulo sin esa
 * acción, o fuera del panel, no se oculta.
 */
export function usePuedeExportar(): boolean {
  const dentroDelPanel = useContext(Ctx) !== null;
  const puede = usePermisos();
  const ruta = usePathname();
  const modulo = destinoDeRuta(ruta ?? "")?.modulo;
  const clave = modulo ? `${modulo}.exportar` : null;
  // Fuera del panel decide el servidor (no hay permisos cargados aquí).
  return !dentroDelPanel || !clave || !PERMISO_POR_CLAVE.has(clave) || puede(clave);
}

/** Muestra los botones de descarga solo si puede exportar en el módulo de esta pantalla. */
export function SiExporta({ children }: { children: React.ReactNode }) {
  return <>{usePuedeExportar() ? children : null}</>;
}
