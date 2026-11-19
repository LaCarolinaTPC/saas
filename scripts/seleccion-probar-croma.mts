// Prueba directa de las seis fuentes de Croma con una cédula, midiendo tiempos (para saber si Croma está respondiendo).
// Son consultas REALES: úselo solo con cédulas de personas que autorizaron la consulta. No pasa por el caché de
// Gestivo, no guarda nada en la base y no imprime datos personales (solo estados, veredictos y tiempos).
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-croma.mts <cédula> <primer apellido> <AAAA-MM-DD expedición>
import { hallazgoDe } from "@/lib/seleccion/antecedentes";
import { proveedorAntecedentes, proveedorPolicia, proveedorRnmc, proveedorRunt, proveedorSimit } from "@/lib/verificacion/proveedores";

const [cedula, apellido, fecha] = process.argv.slice(2);
if (!cedula || !apellido || !/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "")) {
  console.error("Uso: seleccion-probar-croma.mts <cédula> <primer apellido> <AAAA-MM-DD expedición>");
  process.exit(1);
}
type Base = { estado: string; error?: string | null; trabajoId?: string | null };
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** Si Croma deja la consulta en curso, la sigue hasta casi 4 minutos (lo que en Gestivo hace el cron). */
async function terminar<T extends Base>(r: T, seguir: (id: string) => Promise<T>, nota: { enCurso: boolean }): Promise<T> {
  const hasta = Date.now() + 230_000;
  while (r.estado === "pendiente" && r.trabajoId && Date.now() < hasta) {
    nota.enCurso = true;
    await esperar(8000);
    r = await seguir(r.trabajoId);
  }
  return r;
}
const medir = async <T extends Base>(nombre: string, fn: (nota: { enCurso: boolean }) => Promise<T>, resumen: (r: T) => string) => {
  const t = Date.now();
  const nota = { enCurso: false };
  try {
    const r = await fn(nota);
    console.log(`${nombre.padEnd(13)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)} s · ${r.estado}${r.error ? ` · ${r.error}` : ""} · ${resumen(r)}${nota.enCurso ? " · (quedó en curso: en Gestivo la termina el cron)" : ""}`);
  } catch (e) {
    console.log(`${nombre.padEnd(13)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)} s · EXCEPCIÓN ${e instanceof Error ? e.message : e}`);
  }
};
const veredicto = (h: boolean | null) => (h == null ? "sin veredicto" : h ? "CON hallazgo" : "sin novedad");

const runt = proveedorRunt();
const simit = proveedorSimit();
const rnmc = proveedorRnmc();
const policia = proveedorPolicia();
const ant = proveedorAntecedentes();
if (!runt || !simit || !rnmc || !policia || !ant) {
  console.error("Falta CROMA_API_KEY en el entorno.");
  process.exit(1);
}

await Promise.all([
  medir("RUNT", async (n) => terminar(await runt.consultarRunt(cedula, apellido), (id) => runt.consultarTrabajoRunt(id), n), (r) => {
    const x = r.resumen as { registrado?: boolean; tieneLicencia?: boolean; categorias?: { categoria: string; activa?: boolean }[]; nombre?: string | null } | null;
    const activas = [...new Set((x?.categorias ?? []).filter((c) => c.activa).map((c) => c.categoria))];
    // Campo «fines» del RUNT: solo dice si tiene multas (sí/no), sin el valor; a veces viene vacío.
    const multas = ((r.crudo as { fines?: { has_fines?: boolean | null } | null } | null)?.fines ?? null) as { has_fines?: boolean | null } | null;
    const dice = multas == null ? "campo vacío" : multas.has_fines === true ? "SÍ tiene" : multas.has_fines === false ? "no tiene" : "sin dato";
    return `registrado: ${x?.registrado ?? "-"} · licencias activas: ${activas.join(", ") || "ninguna"} · trae nombre: ${Boolean(x?.nombre)} · multas según el RUNT: ${dice}`;
  }),
  medir("SIMIT", async (n) => terminar(await simit.consultarSimit(cedula), (id) => simit.consultarTrabajoSimit(id), n), (r) => `total: ${(r as unknown as { valor?: number | null }).valor ?? "-"}`),
  medir("RNMC", async (n) => terminar(await rnmc.consultarRnmc(cedula, fecha, { esperaSegundos: 55, timeoutMs: 90_000 }), (id) => rnmc.consultarTrabajoRnmc(id), n), (r) =>
    `fecha coincide: ${r.resumen?.fechaCoincide ?? "-"} · medidas pendientes: ${r.resumen?.medidasPendientes ?? "-"} · trae nombre: ${Boolean(r.resumen?.nombre)}`),
  medir("Policía", async (n) => terminar(await policia.consultarPolicia(cedula), (id) => policia.consultarTrabajoPolicia(id), n), (r) => `${veredicto(hallazgoDe("policia", r.crudo))} · trae nombre: ${Boolean((r.resumen as { nombre?: string | null } | null)?.nombre)}`),
  medir("Procuraduría", async (n) => terminar(await ant.consultar("procuraduria", cedula), (id) => ant.consultarTrabajo(id), n), (r) => veredicto(hallazgoDe("procuraduria", r.crudo))),
  medir("Contraloría", async (n) => terminar(await ant.consultar("contraloria", cedula), (id) => ant.consultarTrabajo(id), n), (r) => veredicto(hallazgoDe("contraloria", r.crudo))),
]);
