"use client";

import { useCallback, useState } from "react";

// Secciones plegables que recuerdan cómo las dejó cada persona.
//
// Portado del sistema Da-o_Busetas: en las páginas con varias tablas largas,
// tener que volver a cerrar el resumen y el historial en cada visita es una
// molestia diaria. El estado vive en localStorage, por navegador.
//
// localStorage lanza excepción en modo incógnito y con el almacenamiento
// bloqueado, así que toda lectura y escritura va protegida: sin memoria la
// página funciona igual, solo no recuerda.

type Estado = Record<string, boolean>;

function leer(clave: string): Estado {
  try {
    const crudo = window.localStorage.getItem(`colapsables.${clave}`);
    return crudo ? (JSON.parse(crudo) as Estado) : {};
  } catch {
    return {};
  }
}

function guardar(clave: string, estado: Estado) {
  try {
    window.localStorage.setItem(`colapsables.${clave}`, JSON.stringify(estado));
  } catch {
    /* sin memoria: la sesión funciona igual */
  }
}

/**
 * `porDefecto` marca qué secciones arrancan abiertas la primera vez.
 * Lo que la persona haya dejado guardado tiene prioridad sobre ese valor.
 */
export function useColapsables(clave: string, porDefecto: Estado) {
  // Inicialización perezosa: localStorage no existe durante el render del
  // servidor, así que el primer render usa los valores por defecto y el estado
  // guardado se lee ya en el navegador.
  const [estado, setEstado] = useState<Estado>(() => {
    if (typeof window === "undefined") return porDefecto;
    return { ...porDefecto, ...leer(clave) };
  });

  const alternar = useCallback((nombre: string) => {
    setEstado((previo) => {
      const siguiente = { ...previo, [nombre]: !previo[nombre] };
      guardar(clave, siguiente);
      return siguiente;
    });
  }, [clave]);

  const abrir = useCallback((nombre: string) => {
    setEstado((previo) => {
      if (previo[nombre]) return previo;
      const siguiente = { ...previo, [nombre]: true };
      guardar(clave, siguiente);
      return siguiente;
    });
  }, [clave]);

  const estaAbierta = useCallback((nombre: string) => estado[nombre] !== false, [estado]);

  return { estaAbierta, alternar, abrir };
}
