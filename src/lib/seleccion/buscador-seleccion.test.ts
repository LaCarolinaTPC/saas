import { test } from "node:test";
import assert from "node:assert/strict";
import { anclaAjuste, anclaMensaje, buscarEnSeleccion, indiceSeleccion, normalizar, type PestanaBuscable } from "./buscador-seleccion";
import type { AjusteSeleccion } from "./ajustes";
import type { MensajeSeleccion } from "./mensajes";

const ajuste = (clave: string, nombre: string, unidad = "hora"): AjusteSeleccion => ({ clave, grupo: "tiempo", nombre, orden: 1, valor: "08:00", valor_sugerido: "08:00", unidad, origen: null, entrega: 2, actualizado_por: null, updated_at: "" });
const mensaje = (clave: string, nombre: string, texto: string): MensajeSeleccion =>
  ({ clave, nombre, cuando: "", orden: 1, texto, texto_sugerido: texto, modo: "automatico", variables: [], plantilla_nombre: null, plantilla_variables: [], plantilla_categoria: null, plantilla_estado: null, plantilla_texto_aprobado: null, plantilla_botones: [] }) as unknown as MensajeSeleccion;

const AJUSTES = [
  ajuste("recordatorio_cita_hora", "Recordatorio el día de la cita"),
  ajuste("cita_hora_semana", "Hora de la cita de lunes a viernes"),
  ajuste("simit_tope", "Tope de multas en el SIMIT", "pesos"),
  ajuste("ant_policia_accion", "¿Qué pasa si tiene asuntos pendientes (Policía)?", "opcion"),
  ajuste("ant_rnmc_palabras_revision", "RNMC: palabras", "lista"),
  ajuste("ajuste_sin_seccion", "Un ajuste nuevo que no está en ninguna sección", "numero"),
];
const MENSAJES = [mensaje("bienvenida", "Bienvenida", "¡Hola! Te saluda {asistente}"), mensaje("citacion", "Citación", "Te esperamos el {fecha} a las {hora}")];
const TODAS: PestanaBuscable[] = ["mensajes", "tiempos", "antecedentes", "laboratorios", "ia", "canal", "probar"];

test("buscador de Selección: normaliza sin tildes, mayúsculas ni signos", () => {
  assert.equal(normalizar("¿Citación?  «Sí, VOY»"), "citacion si voy");
});

test("buscador de Selección: el índice lleva cada opción a su pestaña y a su sitio", () => {
  const indice = indiceSeleccion(MENSAJES, AJUSTES, TODAS);
  const de = (titulo: string) => indice.filter((e) => e.titulo === titulo);
  assert.deepEqual(de("Citación").map((e) => [e.pestana, e.ancla]), [["mensajes", anclaMensaje("citacion")]]);
  assert.deepEqual(de("Recordatorio el día de la cita").map((e) => [e.pestana, e.ancla]), [["tiempos", anclaAjuste("recordatorio_cita_hora")]]);
  // Lo de antecedentes va a su pestaña, no a Tiempos y reglas.
  const policia = indice.filter((e) => e.ancla === anclaAjuste("ant_policia_accion"));
  assert.deepEqual(policia.map((e) => e.pestana), ["antecedentes"]);
  // El tope del SIMIT está en las dos pestañas: sale en las dos.
  assert.deepEqual(indice.filter((e) => e.ancla === anclaAjuste("simit_tope")).map((e) => e.pestana).sort(), ["antecedentes", "tiempos"]);
  // Un caso cuyo ajuste todavía no existe (falta la migración) no se ofrece.
  assert.equal(indice.some((e) => e.titulo === "El nombre que devuelve la fuente no es el del aspirante"), false);
  // Los ajustes sin sección también se encuentran («Otros ajustes»).
  assert.equal(indice.some((e) => e.ancla === anclaAjuste("ajuste_sin_seccion")), true);
  // Sin las pestañas del administrador no salen sus opciones.
  const sinAdmin = indiceSeleccion(MENSAJES, AJUSTES, ["mensajes", "tiempos", "antecedentes", "laboratorios", "probar"]);
  assert.equal(sinAdmin.some((e) => e.pestana === "ia" || e.pestana === "canal"), false);
});

test("buscador de Selección: encuentra por comienzo de palabra, con o sin tildes, y ordena por el título", () => {
  const indice = indiceSeleccion(MENSAJES, AJUSTES, TODAS);
  const titulos = (q: string) => buscarEnSeleccion(indice, q).map((e) => e.titulo);
  // «cita» encuentra «Citación» y los ajustes de la cita; el mensaje no se pierde.
  assert.ok(titulos("cita").includes("Citación"));
  assert.ok(titulos("cita").includes("Recordatorio el día de la cita"));
  assert.equal(titulos("citacion")[0], "Citación");
  assert.equal(titulos("CITACIÓN")[0], "Citación");
  // Varias palabras: tienen que estar todas.
  assert.deepEqual(titulos("recordatorio cita"), ["Recordatorio el día de la cita"]);
  assert.equal(titulos("tope simit")[0], "Tope de multas en el SIMIT");
  // Por lo que dice el texto del mensaje o la ayuda, no solo por el nombre.
  assert.ok(titulos("te saluda").includes("Bienvenida"));
  // Por la clave interna.
  assert.equal(titulos("cita_hora_semana")[0], "Hora de la cita, lunes a viernes");
  // Las demás pestañas, por sus palabras.
  assert.ok(titulos("firma").includes("Carta del banco"));
  assert.ok(titulos("prompt").includes("Instrucciones del agente (prompt)"));
  assert.ok(titulos("webhook").includes("Webhook en Meta"));
  assert.ok(titulos("probador").includes("Probar con un ejemplo"));
  // En medio de una palabra no cuenta: «saluda» no sale por «luda».
  assert.deepEqual(titulos("luda"), []);
  // Sin nada útil escrito, o sin coincidencias: vacío.
  assert.deepEqual(titulos(" a "), []);
  assert.deepEqual(titulos("xyzzy"), []);
  // No más del máximo pedido.
  assert.ok(buscarEnSeleccion(indice, "de", 5).length <= 5);
});
