/**
 * Datos calculados de la ficha del conductor (Recursos Humanos › Conductores):
 * edad, antigüedad y el estado de un vencimiento. Puro: `npm run test:conductores`.
 */

const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Años cumplidos a `hoy`. null sin fecha válida. */
export function edad(nacimiento: string | null | undefined, hoy: string): number | null {
  if (!nacimiento || !/^\d{4}-\d{2}-\d{2}/.test(nacimiento)) return null;
  const n = nacimiento.slice(0, 10);
  let anios = +hoy.slice(0, 4) - +n.slice(0, 4);
  if (hoy.slice(5, 10) < n.slice(5, 10)) anios -= 1;
  return anios >= 0 && anios < 120 ? anios : null;
}

/** «3 años y 2 meses», «8 meses», «12 días» desde el ingreso. */
export function antiguedad(ingreso: string | null | undefined, hoy: string): string | null {
  if (!ingreso || !/^\d{4}-\d{2}-\d{2}/.test(ingreso)) return null;
  const i = ingreso.slice(0, 10);
  if (i > hoy) return null;
  let meses = (+hoy.slice(0, 4) - +i.slice(0, 4)) * 12 + (+hoy.slice(5, 7) - +i.slice(5, 7));
  if (+hoy.slice(8, 10) < +i.slice(8, 10)) meses -= 1;
  if (meses < 1) {
    const dias = Math.round((dia(hoy) - dia(i)) / 86_400_000);
    return dias === 1 ? "1 día" : `${dias} días`;
  }
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const a = anios === 1 ? "1 año" : `${anios} años`;
  const m = resto === 1 ? "1 mes" : `${resto} meses`;
  return anios === 0 ? m : resto === 0 ? a : `${a} y ${m}`;
}

export type EstadoVencimiento = { clave: "vencido" | "por_vencer" | "vigente"; dias: number; texto: string } | null;

/** Vencido, por vencer (dentro de `aviso` días) o vigente. null sin fecha. */
export function estadoVencimiento(fecha: string | null | undefined, hoy: string, aviso = 30): EstadoVencimiento {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) return null;
  const dias = Math.round((dia(fecha.slice(0, 10)) - dia(hoy)) / 86_400_000);
  if (dias < 0) return { clave: "vencido", dias, texto: `Vencida hace ${-dias === 1 ? "1 día" : `${-dias} días`}` };
  if (dias <= aviso) return { clave: "por_vencer", dias, texto: dias === 0 ? "Vence hoy" : `Vence en ${dias === 1 ? "1 día" : `${dias} días`}` };
  return { clave: "vigente", dias, texto: "Vigente" };
}
