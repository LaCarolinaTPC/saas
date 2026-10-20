/**
 * Fichas de conductor que GEMA nunca confirmó: cédulas mal digitadas al
 * contratar. Para cada una propone la ficha real.
 *
 *   npm run conductores:revisar-altas
 *
 * Solo lee. No escribe nada: cambiar una cédula es decisión de una persona,
 * porque reasignarla mal le pegaría la historia de alguien a otro.
 *
 * El porqué y las mediciones, en `src/lib/conductores/confirmacion.ts`.
 */
import { leerEnv } from "./biometrico-comun.mjs";
import {
  altaSinConfirmarVencida,
  confirmadoPorGema,
  DIAS_GRACIA_CONFIRMACION,
} from "../src/lib/conductores/confirmacion";
import { buscarFichaReal, type FichaCandidata } from "../src/lib/conductores/duplicados";

const env = leerEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !LLAVE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env o .env.local.");
  process.exit(1);
}

async function todas<T>(consulta: string): Promise<T[]> {
  const filas: T[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const r = await fetch(`${URL_BASE}/rest/v1/${consulta}`, {
      headers: {
        apikey: LLAVE,
        Authorization: `Bearer ${LLAVE}`,
        Range: `${desde}-${desde + paso - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!r.ok) throw new Error(`${consulta}: ${r.status} ${await r.text()}`);
    const lote = (await r.json()) as T[];
    filas.push(...lote);
    if (lote.length < paso) break;
  }
  return filas;
}

interface Fila extends FichaCandidata {
  observacion: string | null;
  fecha_ingreso: string | null;
  created_at: string | null;
  solo_informativo: boolean | null;
}

const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);

const conductores = await todas<Fila>(
  "conductores?select=cedula,nombre,estado,codigo,observacion,fecha_ingreso,created_at,solo_informativo"
);
const confirmadas = conductores.filter(confirmadoPorGema);
const esActivo = (e: string | null) => {
  const s = String(e ?? "").trim().toUpperCase();
  return s === "ACTIVO" || s === "1";
};

const vencidas = conductores.filter((c) => altaSinConfirmarVencida(c, hoy));
const enPlazo = conductores.filter((c) => !confirmadoPorGema(c) && !altaSinConfirmarVencida(c, hoy));

console.log(`Fecha: ${hoy} · gracia de ${DIAS_GRACIA_CONFIRMACION} días`);
console.log(`Conductores: ${conductores.length} · confirmados por GEMA: ${confirmadas.length}`);
console.log(`Sin confirmar y DENTRO del plazo (normal, GEMA aún puede): ${enPlazo.length}`);
console.log(`Sin confirmar y VENCIDAS (hay que revisar la cédula): ${vencidas.length}`);

if (enPlazo.length > 0) {
  console.log("");
  for (const c of enPlazo) {
    console.log(`  en plazo · ${String(c.cedula).padEnd(13)} ${c.nombre ?? ""}`);
  }
}

if (vencidas.length === 0) {
  console.log("\nNada que revisar.");
  process.exit(0);
}

// Las que además están en ACTIVO son las que ensucian las pantallas.
const activas = vencidas.filter((c) => esActivo(c.estado));
console.log(`  de esas, en ACTIVO: ${activas.length}`);

let conPropuesta = 0;
console.log("");
console.log("═".repeat(100));
for (const c of vencidas.sort((a, b) => String(a.cedula).localeCompare(String(b.cedula)))) {
  const dias = c.created_at
    ? Math.floor((Date.parse(hoy) - Date.parse(c.created_at)) / 86_400_000)
    : null;
  console.log(
    `${String(c.cedula).padEnd(13)} ${String(c.estado ?? "?").padEnd(9)} ` +
      `creada hace ${dias === null ? "?" : dias} días · ${c.nombre ?? "(sin nombre)"}`
  );

  const parecidos = buscarFichaReal(String(c.cedula), c.nombre, confirmadas);
  if (parecidos.length === 0) {
    console.log("              -> SIN propuesta: ninguna cédula conocida se parece.");
    console.log("                 Hay que preguntar la cédula correcta.");
  } else {
    conPropuesta++;
    for (const p of parecidos) {
      console.log(
        `              -> seria ${String(p.ficha.cedula).padEnd(12)} ${String(p.ficha.estado ?? "").padEnd(9)}` +
          ` ${p.ficha.nombre ?? ""}`
      );
      console.log(
        `                 (${p.motivo}, nombre coincide ${Math.round(p.similitudNombre * 100)} %)`
      );
    }
  }
}
console.log("═".repeat(100));
console.log("");
console.log(`${conPropuesta} de ${vencidas.length} tienen una ficha real propuesta.`);
console.log("");
console.log("Qué hacer con cada una, en el módulo de conductores:");
console.log("  · Si la propuesta es correcta y esa persona YA ESTÁ en GEMA: borre la ficha");
console.log("    de la cédula mala. La buena ya existe y es la que manda.");
console.log("  · Si la persona trabaja y GEMA no la tiene: hay que crearla en GEMA, que es");
console.log("    el origen. Gestivo la recibe en el siguiente sync.");
console.log("  · Si no trabaja: la ficha no es de nadie y se puede borrar.");
console.log("");
console.log("Mientras estén así, no cuentan como conductores en Ausentismo › Marcaciones.");
