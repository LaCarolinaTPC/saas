import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTIFICACIONES, TIPOS_NOTIFICACION, armarCorreoNotificacion, correosDe, destinatariosDeAjustes } from "./notificaciones";

const ajustes = (v: Record<string, unknown>) => (clave: string) => v[clave];

test("notificaciones: su lista; si no, los correos por defecto; si no, los del reporte diario", () => {
  const propia = destinatariosDeAjustes("examenes", ajustes({ notif_examenes_correos: ["salud@x.co"], notif_examenes_copia: "jefe@x.co", notif_defecto_correos: ["gh@x.co"] }));
  assert.deepEqual([propia.para, propia.copia, propia.origen], [["salud@x.co"], ["jefe@x.co"], "propia"]);
  const defecto = destinatariosDeAjustes("examenes", ajustes({ notif_defecto_correos: ["gh@x.co"], notif_defecto_copia: ["soporte@x.co"], reporte_diario_correos: ["rep@x.co"] }));
  assert.deepEqual([defecto.para, defecto.copia, defecto.origen], [["gh@x.co"], ["soporte@x.co"], "defecto"]);
  const reporte = destinatariosDeAjustes("documentos", ajustes({ reporte_diario_correos: ["rep@x.co"] }));
  assert.deepEqual([reporte.para, reporte.origen], [["rep@x.co"], "reporte"]);
  assert.equal(destinatariosDeAjustes("chats", ajustes({})).origen, "ninguna");
});

test("notificaciones: el reporte diario y los servicios no usan los correos por defecto (vacío = no se envía)", () => {
  assert.equal(destinatariosDeAjustes("reporte_diario", ajustes({ notif_defecto_correos: ["gh@x.co"] })).para.length, 0);
  assert.equal(destinatariosDeAjustes("servicios", ajustes({ notif_defecto_correos: ["gh@x.co"] })).para.length, 0);
});

test("notificaciones: el interruptor apaga (los servicios no tienen: siempre encendidos)", () => {
  assert.equal(destinatariosDeAjustes("laboratorio", ajustes({ notif_laboratorio_activo: false, notif_laboratorio_correos: ["a@x.co"] })).activo, false);
  assert.equal(destinatariosDeAjustes("laboratorio", ajustes({ notif_laboratorio_correos: ["a@x.co"] })).activo, true);
  assert.equal(destinatariosDeAjustes("servicios", ajustes({ alerta_servicios_correos: ["a@x.co"] })).activo, true);
});

test("notificaciones: correos limpios (minúsculas, sin repetidos ni inválidos)", () => {
  assert.deepEqual(correosDe("A@X.co, a@x.co; malo, b@y.co"), ["a@x.co", "b@y.co"]);
});

test("notificaciones: cada tipo tiene nombre, cuándo y ajuste de correos; el correo dice prueba y lista los chats", () => {
  for (const t of TIPOS_NOTIFICACION) assert.ok(NOTIFICACIONES[t].nombre && NOTIFICACIONES[t].cuando && NOTIFICACIONES[t].correos, t);
  const c = armarCorreoNotificacion({ tipo: "chats", titulo: "2 chats requieren una persona", prueba: true, items: [{ titulo: "Ana", enlace: "https://g/comunicaciones?c=1" }, { titulo: "Luis" }] });
  assert.match(c.asunto, /^\[Prueba\] Chats que requieren una persona: 2 chats/);
  assert.match(c.texto, /· Ana\n  https:\/\/g\/comunicaciones\?c=1/);
  assert.match(c.html, /<a href="https:\/\/g\/comunicaciones\?c=1">Ana<\/a>/);
});
