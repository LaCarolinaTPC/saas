#!/usr/bin/env node
// Verifica que los nombres de las migraciones no puedan colisionar.
//
// El 2026-09-01 hubo tres colisiones en una sola jornada (050, 056 y 063/064):
// dos personas trabajando en paralelo tomaban el siguiente número libre de su
// copia local y quien empujaba después tenía que renumerar. Por eso las
// migraciones nuevas se crean con "npm run migracion:nueva", que les pone una
// marca de tiempo.
//
// Se ejecuta con "npm run migracion:verificar", en el hook de pre-commit y en
// CI. No necesita dependencias.

import { readdirSync } from "node:fs";

const DIRECTORIO = "supabase/migrations";

// Numeración secuencial existente cuando se adoptó esta convención.
const SECUENCIAL_AL_ADOPTAR = 76;

// Mientras esté en false, una migración secuencial nueva solo genera un aviso.
// Póngalo en true cuando todo el equipo esté usando "npm run migracion:nueva";
// a partir de ahí el hook y CI las rechazan.
const SECUENCIAL_NUEVA_ES_ERROR = false;

// Duplicado anterior a esta regla: 044_api_request_logs.sql y
// 044_modulo_liquidacion_conductor.sql. No se renombran porque las dos ya
// están aplicadas en producción.
const DUPLICADOS_ACEPTADOS = new Set(["044"]);

const SECUENCIAL = /^(\d{3})_[a-z0-9_]+\.sql$/;
const MARCA_TIEMPO = /^(\d{14})_[a-z0-9_]+\.sql$/;

const errores = [];
const avisos = [];
const porPrefijo = new Map();

let archivos;
try {
  archivos = readdirSync(DIRECTORIO).filter((f) => f.endsWith(".sql")).sort();
} catch {
  console.error(`No se encontró ${DIRECTORIO}. Ejecute el script desde la raíz del repositorio.`);
  process.exit(1);
}

for (const archivo of archivos) {
  const secuencial = SECUENCIAL.exec(archivo);
  const marcaTiempo = MARCA_TIEMPO.exec(archivo);

  // Un nombre que no sigue ninguna de las dos formas rompe el orden de
  // ejecución, así que siempre es un error.
  if (!secuencial && !marcaTiempo) {
    errores.push(
      `${archivo}\n    El nombre debe ser <prefijo>_descripcion.sql, en minúsculas y con guiones bajos.\n    Créela con: npm run migracion:nueva -- "descripcion del cambio"`
    );
    continue;
  }

  if (secuencial && Number(secuencial[1]) > SECUENCIAL_AL_ADOPTAR) {
    const mensaje =
      `${archivo}\n    Es una migración secuencial nueva. La numeración a mano provoca colisiones cuando varias personas trabajan en paralelo.\n    Créela con: npm run migracion:nueva -- "descripcion del cambio"`;
    if (SECUENCIAL_NUEVA_ES_ERROR) errores.push(mensaje);
    else avisos.push(mensaje);
  }

  const prefijo = (secuencial ?? marcaTiempo)[1];
  if (!porPrefijo.has(prefijo)) porPrefijo.set(prefijo, []);
  porPrefijo.get(prefijo).push(archivo);
}

// Dos archivos con el mismo prefijo no tienen orden de ejecución definido.
// Esto sí es siempre un error: es el daño concreto que causan las colisiones.
for (const [prefijo, lista] of porPrefijo) {
  const permitidas = DUPLICADOS_ACEPTADOS.has(prefijo) ? 2 : 1;
  if (lista.length > permitidas) {
    errores.push(
      `Prefijo ${prefijo} repetido en ${lista.length} archivos: ${lista.join(", ")}\n    Dos migraciones con el mismo prefijo no tienen un orden de ejecución definido. Renombre la más reciente con una marca de tiempo.`
    );
  }
}

for (const aviso of avisos) console.log(`aviso  ${aviso}\n`);

if (errores.length > 0) {
  console.error(`Migraciones con problemas de nombre (${errores.length}):\n`);
  for (const error of errores) console.error(`  - ${error}\n`);
  console.error("Consulte docs/migraciones.md para el detalle de la convención.");
  process.exit(1);
}

const resumen = `Migraciones verificadas: ${archivos.length} archivos, sin prefijos repetidos.`;
console.log(avisos.length > 0 ? `${resumen} ${avisos.length} con numeración secuencial nueva.` : resumen);
