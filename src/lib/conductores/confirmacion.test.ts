import { test } from "node:test";
import assert from "node:assert/strict";
import {
  altaSinConfirmarVencida,
  confirmadoPorGema,
  cuentaComoConductor,
  DIAS_GRACIA_CONFIRMACION,
  soloInformativo,
  type FichaConductor,
} from "./confirmacion";

const HOY = "2026-10-19";

/** Un `created_at` de hace N días. */
function haceDias(n: number): string {
  const t = Date.UTC(2026, 9, 19) - n * 86_400_000;
  return new Date(t).toISOString();
}

function ficha(extra: Partial<FichaConductor> = {}): FichaConductor {
  return { codigo: "4273", created_at: haceDias(400), ...extra };
}

test("sin el flag, el código es la señal", () => {
  assert.equal(confirmadoPorGema(ficha()), true);
  assert.equal(confirmadoPorGema(ficha({ codigo: null })), false);
  assert.equal(confirmadoPorGema(ficha({ codigo: "" })), false);
  assert.equal(confirmadoPorGema(ficha({ codigo: "   " })), false);
});

test("el flag solo_informativo manda sobre el código", () => {
  // Es la autoridad: lo mantiene el sync de GEMA.
  assert.equal(confirmadoPorGema(ficha({ solo_informativo: true })), false);
  assert.equal(confirmadoPorGema(ficha({ codigo: null, solo_informativo: false })), true);
});

test("el flag ausente o nulo cae al código, no se asume nada", () => {
  // Pasa mientras la migración no esté aplicada, o si alguien no lo selecciona.
  assert.equal(confirmadoPorGema(ficha({ solo_informativo: undefined })), true);
  assert.equal(confirmadoPorGema(ficha({ solo_informativo: null })), true);
  assert.equal(confirmadoPorGema(ficha({ codigo: null, solo_informativo: null })), false);
});

test("soloInformativo es lo contrario, con el nombre que usa la gente", () => {
  assert.equal(soloInformativo(ficha()), false);
  assert.equal(soloInformativo(ficha({ solo_informativo: true })), true);
  assert.equal(soloInformativo(ficha({ codigo: null })), true);
});

test("una ficha marcada no se salva por ser vieja ni por ser nueva", () => {
  // El flag no tiene gracia: si GEMA no la tiene, no se usa. Punto.
  assert.equal(confirmadoPorGema(ficha({ solo_informativo: true, created_at: haceDias(0) })), false);
  assert.equal(confirmadoPorGema(ficha({ solo_informativo: true, created_at: haceDias(900) })), false);
});

test("una ficha confirmada nunca está vencida, por vieja que sea", () => {
  assert.equal(altaSinConfirmarVencida(ficha({ created_at: haceDias(2000) }), HOY), false);
});

test("sin código y vieja: es una cédula mal digitada", () => {
  // Los 19 fantasmas reales tenían 66 días o más.
  assert.equal(altaSinConfirmarVencida(ficha({ codigo: null, created_at: haceDias(66) }), HOY), true);
  assert.equal(altaSinConfirmarVencida(ficha({ codigo: null, created_at: haceDias(93) }), HOY), true);
});

test("sin código pero reciente: GEMA todavía tiene plazo", () => {
  // Un conductor real aparece con código en 3 a 10 días.
  for (const d of [0, 3, 10, DIAS_GRACIA_CONFIRMACION]) {
    assert.equal(
      altaSinConfirmarVencida(ficha({ codigo: null, created_at: haceDias(d) }), HOY),
      false,
      `${d} días`
    );
  }
  // Justo pasado el plazo, ya cuenta.
  assert.equal(
    altaSinConfirmarVencida(ficha({ codigo: null, created_at: haceDias(DIAS_GRACIA_CONFIRMACION + 1) }), HOY),
    true
  );
});

test("la gracia deja margen entre los dos casos medidos", () => {
  // 10 días es lo más lento que tardó GEMA; 66 el fantasma más nuevo.
  assert.ok(DIAS_GRACIA_CONFIRMACION > 10, "tiene que cubrir al conductor real más lento");
  assert.ok(DIAS_GRACIA_CONFIRMACION < 66, "tiene que cazar al fantasma más nuevo");
});

test("sin created_at no se castiga la ficha", () => {
  assert.equal(altaSinConfirmarVencida(ficha({ codigo: null, created_at: null }), HOY), false);
});

test("un created_at ilegible no la castiga tampoco", () => {
  assert.equal(altaSinConfirmarVencida(ficha({ codigo: null, created_at: "no es fecha" }), HOY), false);
});

test("cuentaComoConductor es lo contrario de estar vencida", () => {
  assert.equal(cuentaComoConductor(ficha(), HOY), true);
  assert.equal(cuentaComoConductor(ficha({ codigo: null, created_at: haceDias(5) }), HOY), true);
  assert.equal(cuentaComoConductor(ficha({ codigo: null, created_at: haceDias(93) }), HOY), false);
});

test("se mide contra la fecha que se mira, no contra hoy", () => {
  // La misma ficha, vista en dos fechas distintas: en agosto todavía tenía plazo.
  const f = ficha({ codigo: null, created_at: "2026-07-17T17:09:01.452053+00:00" });
  assert.equal(altaSinConfirmarVencida(f, "2026-08-01"), false);
  assert.equal(altaSinConfirmarVencida(f, "2026-10-19"), true);
});
