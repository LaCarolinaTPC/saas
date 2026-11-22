import { test } from "node:test";
import assert from "node:assert/strict";
import {
  archivoOrden, armarCorreoOrden, atiende, cedulaConPuntos, diaSemana, elegirLaboratorio, faltantesLaboratorio, parsearCorreos, primeraFechaAtendida, saludoDelDia,
  type AspiranteOrden, type Laboratorio,
} from "./laboratorios";

const aspirante = (p: Partial<AspiranteOrden>): AspiranteOrden => ({
  procesoId: "p", citaId: "c", nombre: "ROYMAN ANTONIO GOMEZ LASSO", cedula: "1047224415", cargo: "CONDUCTOR - COBRADOR",
  fase: 1, fecha: "lunes 23 de noviembre", hora: "6:30 a. m.", prueba: false, ...p,
});

test("laboratorios: correos escritos a mano, sin repetir y en minúscula", () => {
  assert.deepEqual(parsearCorreos("Recepcion@biobacips.com; comercial2@biobacips.com,\nrecepcion@biobacips.com"), ["recepcion@biobacips.com", "comercial2@biobacips.com"]);
  assert.deepEqual(parsearCorreos("  "), []);
});

test("laboratorios: qué le falta según el canal", () => {
  assert.deepEqual(faltantesLaboratorio({ nombre: "Biobac", canal: "correo", whatsapp: null, correos: ["recepcion@biobacips.com"], correos_copia: [] }), []);
  assert.match(faltantesLaboratorio({ nombre: "Biobac", canal: "correo", whatsapp: null, correos: [], correos_copia: [] }).join(), /correo de destino/);
  assert.match(faltantesLaboratorio({ nombre: "Biobac", canal: "correo", whatsapp: null, correos: ["malo"], correos_copia: [] }).join(), /revise: malo/);
  assert.match(faltantesLaboratorio({ nombre: "Rescate", canal: "whatsapp", whatsapp: "", correos: [], correos_copia: [] }).join(), /WhatsApp/);
  assert.deepEqual(faltantesLaboratorio({ nombre: "Rescate", canal: "whatsapp", whatsapp: "573001234567", correos: [], correos_copia: [] }), []);
});

test("laboratorios: el correo de la orden como lo escribe Salud Ocupacional, con la lista de aspirantes", () => {
  const tarde = new Date("2026-11-19T21:02:00Z"); // 4:02 p. m. en Bogotá
  const c = armarCorreoOrden(
    { nombre: "BIOBAC SST - IPS", correos: ["recepcion@biobacips.com", "comercial2@biobacips.com"], correos_copia: ["directora@lacarolina.com.co"], asunto: "ORDEN CONDUCTOR EXAMENES MEDICOS DE INGRESOS" },
    [aspirante({}), aspirante({ nombre: "Nixon Alexander Leal Garcia", cedula: "13175742", citaId: "c2" })],
    tarde
  );
  assert.deepEqual(c.para, ["recepcion@biobacips.com", "comercial2@biobacips.com"]);
  assert.deepEqual(c.copia, ["directora@lacarolina.com.co"]);
  assert.equal(c.asunto, "ORDEN CONDUCTOR EXAMENES MEDICOS DE INGRESOS");
  assert.match(c.texto, /^Buenas tardes señores Biobac,/);
  assert.match(c.texto, /Me permito enviar adjunto órdenes de exámenes médicos de los siguientes aspirantes al cargo conductor \(fase 1\):/);
  assert.match(c.texto, /• ROYMAN ANTONIO GOMEZ LASSO {2}CC\. 1047224415\n• NIXON ALEXANDER LEAL GARCIA {2}CC\. 13175742/);
  assert.match(c.texto, /Se presentan el lunes 23 de noviembre a las 6:30 a\. m\., por orden de llegada\./);
  assert.match(c.texto, /Quedo atenta a los resultados\./);
  assert.match(c.html, /<li>NIXON ALEXANDER LEAL GARCIA {2}CC\. 13175742<\/li>/);
});

test("laboratorios: saludo según la hora, cédula con puntos y nombre del archivo", () => {
  assert.equal(saludoDelDia(new Date("2026-11-19T13:00:00Z")), "Buenos días");
  assert.equal(saludoDelDia(new Date("2026-11-20T01:00:00Z")), "Buenas noches");
  assert.equal(cedulaConPuntos("13175742"), "13.175.742");
  assert.equal(archivoOrden({ nombre: "Nixon Leal", cedula: "13175742" }), "ORDEN CONDUCTOR NIXON LEAL 13175742.docx");
});

// ── Reparto entre laboratorios y días de atención (21-nov-2026) ─────────────

const lab = (p: Partial<Laboratorio>): Laboratorio => ({
  id: "x", nombre: "X", direccion: null, telefono_contacto: null, canal: "correo", whatsapp: null, correos: [], correos_copia: [], asunto: null,
  plantilla_orden_ruta: null, activo: true, predeterminado: false, orden: 1, dias_atencion: [1, 2, 3, 4, 5, 6], dias_preferidos: [], porcentaje: 0, ...p,
});
const BIOBAC = lab({ id: "b", nombre: "Biobac", predeterminado: true, orden: 1, porcentaje: 70 });
const RESCATE = lab({ id: "r", nombre: "Rescate", orden: 2, dias_preferidos: [6], porcentaje: 30 });
const SABADO = "2026-11-21";
const LUNES = "2026-11-23";
const DOMINGO = "2026-11-22";

test("reparto: días de la semana y si atiende", () => {
  assert.equal(diaSemana(SABADO), 6);
  assert.equal(diaSemana(DOMINGO), 0);
  assert.equal(atiende(BIOBAC, DOMINGO), false);
  assert.equal(atiende({ dias_atencion: undefined }, LUNES), true); // sin la migración: lunes a sábado
});

test("reparto: Rescate los sábados; entre semana el predeterminado", () => {
  assert.equal(elegirLaboratorio([BIOBAC, RESCATE], SABADO, "predeterminado").laboratorio?.id, "r");
  assert.match(elegirLaboratorio([BIOBAC, RESCATE], SABADO, "predeterminado").motivo, /preferido los sábados/);
  assert.equal(elegirLaboratorio([BIOBAC, RESCATE], LUNES, "predeterminado").laboratorio?.id, "b");
});

test("reparto: nunca un laboratorio que no atiende ese día, ni uno inactivo", () => {
  const biobacSinSabado = { ...BIOBAC, dias_atencion: [1, 2, 3, 4, 5] };
  const rescateSinSabado = { ...RESCATE, dias_atencion: [1, 2, 3, 4, 5], dias_preferidos: [] };
  // Rescate no atiende sábados: va Biobac aunque Rescate fuera el preferido de otro día.
  assert.equal(elegirLaboratorio([BIOBAC, rescateSinSabado], SABADO, "predeterminado").laboratorio?.id, "b");
  // El predeterminado no atiende sábado: va el otro.
  assert.equal(elegirLaboratorio([biobacSinSabado, { ...RESCATE, dias_preferidos: [] }], SABADO, "predeterminado").laboratorio?.id, "r");
  // Nadie atiende: ninguno.
  assert.equal(elegirLaboratorio([biobacSinSabado, rescateSinSabado], SABADO, "predeterminado").laboratorio, null);
  assert.equal(elegirLaboratorio([{ ...BIOBAC, activo: false }, { ...RESCATE, dias_preferidos: [] }], LUNES, "predeterminado").laboratorio?.id, "r");
});

test("reparto: por porcentaje, al que más lejos está de su parte", () => {
  const sinPreferido = { ...RESCATE, dias_preferidos: [] };
  // 70/30: sin historia, Biobac; con 7 en Biobac y 1 en Rescate, le toca a Rescate (le faltan 1,7).
  assert.equal(elegirLaboratorio([BIOBAC, sinPreferido], LUNES, "porcentaje").laboratorio?.id, "b");
  assert.equal(elegirLaboratorio([BIOBAC, sinPreferido], LUNES, "porcentaje", { b: 7, r: 1 }).laboratorio?.id, "r");
  assert.equal(elegirLaboratorio([BIOBAC, sinPreferido], LUNES, "porcentaje", { b: 6, r: 3 }).laboratorio?.id, "b");
  // Sin porcentajes: por partes iguales.
  assert.equal(elegirLaboratorio([{ ...BIOBAC, porcentaje: 0 }, { ...sinPreferido, porcentaje: 0 }], LUNES, "porcentaje", { b: 3, r: 2 }).laboratorio?.id, "r");
  // El día preferido manda también sobre el porcentaje.
  assert.equal(elegirLaboratorio([BIOBAC, RESCATE], SABADO, "porcentaje", { b: 0, r: 50 }).laboratorio?.id, "r");
});

test("reparto: si ese día no atiende ninguno, la primera fecha en que alguno atiende", () => {
  const siguiente = (f: string) => {
    const d = new Date(`${f}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const soloSemana = [{ ...BIOBAC, dias_atencion: [1, 2, 3, 4, 5] }];
  assert.equal(primeraFechaAtendida(SABADO, soloSemana, siguiente), LUNES);
  assert.equal(primeraFechaAtendida(SABADO, [BIOBAC, RESCATE], siguiente), SABADO);
  assert.equal(primeraFechaAtendida(LUNES, [{ ...BIOBAC, dias_atencion: [] as number[], activo: true }].map((l) => ({ ...l, dias_atencion: [9] })), siguiente), null);
});
