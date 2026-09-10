/**
 * Análisis predictivo de riesgo por conductor — informe HTML + CSV.
 *
 * La lógica (variables, panel conductor × mes, regresión logística, puntuación
 * y tramos) vive en `src/lib/riesgo/`, compartida con el cron y la pantalla de
 * Gestivo, así el informe y el módulo nunca dicen cifras distintas. Este script
 * es la línea de comandos: corre una corrida y la escribe como HTML y CSV.
 *
 * Predice dos cosas por conductor:
 *
 *   - retiro60: el conductor sale de la empresa en los 60 días siguientes
 *               (fecha_retiro del maestro).
 *   - novedad30: falta no justificada registrada (incluye "sin contacto") en
 *               los 30 días siguientes. Los viajes perdidos por ausencia del
 *               conductor no sirven como resultado: los tiene el 66% de los
 *               conductores cada mes y no discriminan; sí entran como variable.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.json scripts/analisis-riesgo-conductores.mts
 *   npx tsx --tsconfig tsconfig.json scripts/analisis-riesgo-conductores.mts --salida "<carpeta>" --corte 2026-09-09
 *
 * Solo lee la base (service_role desde .env.local o .env). La salida es
 * nominal: va a exports/ del vault (o a --salida), nunca al repositorio.
 * Contiene datos personales: no reenviar por correo ni subir a la wiki. La vía
 * de consulta habitual es el módulo Riesgo de Gestivo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ejecutarCorrida, resumenModelo, type TablaTramos } from "../src/lib/riesgo/corrida";
import { nivel, type Modelo } from "../src/lib/riesgo/modelo";
import { hoyBogota } from "../src/lib/riesgo/fechas";
import { ETIQUETA, KEYS, type Fila } from "../src/lib/riesgo/variables";
import type { Db } from "../src/lib/riesgo/datos";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── Utilidades ───────────────────────────────────────────────────────────────

function leerEnv(): Record<string, string> {
  const archivo = [".env.local", ".env"].map((n) => path.join(RAIZ, n)).find(existsSync);
  if (!archivo) throw new Error("No hay .env.local ni .env en la raíz del proyecto.");
  const out: Record<string, string> = {};
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    if (!linea || linea.startsWith("#") || !linea.includes("=")) continue;
    const i = linea.indexOf("=");
    out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const fmtPct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmtNum = (x: number, d = 1) =>
  x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );

// ── Programa ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const valorDe = (b: string) => {
    const i = args.indexOf(b);
    return i >= 0 ? args[i + 1] ?? null : null;
  };
  const hoy = valorDe("--corte") ?? hoyBogota();
  const salida = valorDe("--salida") ?? path.resolve(RAIZ, "../../exports");
  mkdirSync(salida, { recursive: true });

  const env = leerEnv();
  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  ) as unknown as Db;
  console.log(`Corte ${hoy} · salida ${salida}`);

  const { resultado, modelos, panelFilas, filasDelCorte } = await ejecutarCorrida(db, {
    corte: hoy,
    onProgreso: (m) => console.log(m),
  });
  const { mR, mN, fR, fN, dR, dN } = modelos;
  console.log("retiro60:  ", resumenModelo(resultado.modelos.retiro));
  console.log("novedad30: ", resumenModelo(resultado.modelos.novedad));

  // El informe HTML y el CSV se armaron sobre la forma original de la
  // puntuación; se adapta aquí en vez de tocar la plantilla.
  const puntuados: Puntuado[] = resultado.puntuados.map((p) => ({
    cedula: p.cedula,
    nombre: p.nombre,
    corte: resultado.corte,
    x: p.variables,
    retiro60: null,
    novedad30: null,
    codigo: p.codigo,
    tipo: p.tipoConductor,
    pRetiro: p.probRetiro,
    fRetiro: p.factoresRetiro,
    pNovedad: p.probNovedad,
    fNovedad: p.factoresNovedad,
  }));
  const { descriptivos, retirosMes } = resultado;

  // ── Salidas ──
  const csv = [
    ["cedula", "codigo", "nombre", "tipo_conductor", "prob_retiro_60d", "nivel_retiro", "factores_retiro", "prob_no_justificada_30d", "nivel_no_justificada", "factores_no_justificada", ...KEYS].join(";"),
    ...puntuados.map((p) => [
      p.cedula, p.codigo ?? "", `"${p.nombre.replace(/"/g, '""')}"`, p.tipo ?? "", (p.pRetiro * 100).toFixed(1).replace(".", ","), nivel(p.pRetiro, fR.base),
      `"${p.fRetiro.map((f) => ETIQUETA[f.key]).join(" · ")}"`, (p.pNovedad * 100).toFixed(1).replace(".", ","), nivel(p.pNovedad, fN.base),
      `"${p.fNovedad.map((f) => ETIQUETA[f.key]).join(" · ")}"`, ...KEYS.map((k) => String(Math.round(p.x[k] * 100) / 100).replace(".", ",")),
    ].join(";")),
  ].join("\r\n");
  writeFileSync(path.join(salida, `riesgo-conductores-${hoy}.csv`), "﻿" + csv + "\r\n", "utf8");

  const ventana = `${resultado.cortes[0].slice(0, 7)} a ${resultado.cortes[resultado.cortes.length - 1].slice(0, 7)}`;
  const html = informeHtml({ hoy, ventana, mR, mN, fR, fN, dR, dN, puntuados, nivel, descriptivos, retirosMes, filas: panelFilas, conductores: filasDelCorte.length });
  const rutaHtml = path.join(salida, `analisis-predictivo-ausentismo-conductores-${hoy}.html`);
  writeFileSync(rutaHtml, html, "utf8");
  console.log(`Informe: ${rutaHtml}`);
  console.log(`CSV:     ${path.join(salida, `riesgo-conductores-${hoy}.csv`)}`);
  console.log(`Conductores puntuados: ${puntuados.length} · retiro Alto ${resultado.resumen.retiroAlto} · novedad Alto ${resultado.resumen.novedadAlto}`);
}

// ── Informe HTML ─────────────────────────────────────────────────────────────

type Puntuado = Fila & { codigo: string | null; tipo: string | null; pRetiro: number; fRetiro: { key: string; z: number }[]; pNovedad: number; fNovedad: { key: string; z: number }[] };

function informeHtml(p: {
  hoy: string;
  /** Rango de meses del panel, p. ej. "2026-03 a 2026-09". */
  ventana: string;
  mR: Modelo; mN: Modelo; fR: Modelo; fN: Modelo;
  dR: { mesesTest: string[] }; dN: { mesesTest: string[] };
  puntuados: Puntuado[]; nivel: (p: number, base: number) => string;
  descriptivos: TablaTramos[];
  retirosMes: { mes: string; plantilla: number; retiros: number; tasa: number }[];
  filas: Fila[]; conductores: number;
}): string {
  const { hoy, mR, mN, fR, fN, puntuados, nivel, descriptivos, retirosMes } = p;
  const coefs = (m: Modelo) => m.keys.map((k, j) => ({ key: k, w: m.w[j] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const colorNivel: Record<string, string> = { Alto: "#DC2626", Medio: "#D97706", Bajo: "#059669" };
  const chip = (n: string) => `<span class="chip" style="background:${colorNivel[n]}1a;color:${colorNivel[n]}">${n}</span>`;
  const topRetiro = puntuados.filter((x) => nivel(x.pRetiro, fR.base) !== "Bajo").slice(0, 40);
  const topNovedad = [...puntuados].sort((a, b) => b.pNovedad - a.pNovedad).filter((x) => nivel(x.pNovedad, fN.base) !== "Bajo").slice(0, 40);
  const altoR = puntuados.filter((x) => nivel(x.pRetiro, fR.base) === "Alto").length;
  const medioR = puntuados.filter((x) => nivel(x.pRetiro, fR.base) === "Medio").length;
  const altoN = puntuados.filter((x) => nivel(x.pNovedad, fN.base) === "Alto").length;
  const medioN = puntuados.filter((x) => nivel(x.pNovedad, fN.base) === "Medio").length;

  const tablaCoef = (m: Modelo) => `
    <table><thead><tr><th>Variable</th><th class="r">Peso estandarizado</th><th>Lectura</th></tr></thead><tbody>
    ${coefs(m).slice(0, 12).map((c) => `<tr><td>${esc(ETIQUETA[c.key])}</td><td class="r ${c.w > 0 ? "mal" : "bien"}">${c.w > 0 ? "+" : ""}${c.w.toFixed(2)}</td><td>${c.w > 0 ? "A más valor, más riesgo" : "A más valor, menos riesgo"}</td></tr>`).join("")}
    </tbody></table>`;
  const tablaTramos = (d: { titulo: string; datos: { etiqueta: string; n: number; tasa: number }[] }) => `
    <div class="card"><h3>${esc(d.titulo)}</h3><table><thead><tr><th>Tramo</th><th class="r">Conductor-mes</th><th class="r">Tasa</th><th>Barra</th></tr></thead><tbody>
    ${d.datos.map((x) => `<tr><td>${esc(x.etiqueta)}</td><td class="r">${fmtNum(x.n, 0)}</td><td class="r">${fmtPct(x.tasa)}</td><td><div class="bar" style="width:${Math.min(100, x.tasa * 400).toFixed(0)}%"></div></td></tr>`).join("")}
    </tbody></table></div>`;
  const tablaRiesgo = (lista: Puntuado[], obj: "retiro" | "novedad") => `
    <table><thead><tr><th>#</th><th>Conductor</th><th>Tipo</th><th class="r">Probabilidad</th><th>Nivel</th><th>Factores que pesan</th><th class="r">Aus. 90d</th><th class="r">No just. 90d</th><th class="r">Viajes perdidos 90d</th><th class="r">Antig. (meses)</th></tr></thead><tbody>
    ${lista.map((x, i) => {
      const pr = obj === "retiro" ? x.pRetiro : x.pNovedad;
      const base = obj === "retiro" ? fR.base : fN.base;
      const fac = obj === "retiro" ? x.fRetiro : x.fNovedad;
      return `<tr><td>${i + 1}</td><td><strong>${esc(x.nombre)}</strong><br><span class="muted">${x.codigo ? `${esc(x.codigo)} · ` : ""}CC ${esc(x.cedula)}</span></td><td class="muted">${esc(x.tipo ?? "")}</td><td class="r"><strong>${fmtPct(pr)}</strong></td><td>${chip(nivel(pr, base))}</td><td class="muted">${fac.map((f) => esc(ETIQUETA[f.key])).join(" · ") || "—"}</td><td class="r">${x.x.aus90}</td><td class="r">${x.x.nj90}</td><td class="r">${x.x.vp_cond90}</td><td class="r">${fmtNum(x.x.antig_meses, 0)}</td></tr>`;
    }).join("")}
    </tbody></table>`;

  const hallazgos: string[] = [];
  const antigR = descriptivos[0].datos;
  if (antigR[0].tasa > antigR[antigR.length - 1].tasa * 1.5) hallazgos.push(`Los conductores con menos de 3 meses se retiran a una tasa de ${fmtPct(antigR[0].tasa)} en 60 días, frente a ${fmtPct(antigR[antigR.length - 1].tasa)} entre quienes llevan más de 3 años: la antigüedad es el primer factor de retención.`);
  const njR = descriptivos[1].datos;
  if (njR[3].n > 0 && njR[3].tasa > njR[0].tasa) hallazgos.push(`Con 3 o más faltas no justificadas en 90 días, la probabilidad de retiro en 60 días sube de ${fmtPct(njR[0].tasa)} a ${fmtPct(njR[3].tasa)}.`);
  const vpR = descriptivos[3].datos;
  if (vpR[3].n > 0 && vpR[3].tasa > vpR[0].tasa) hallazgos.push(`Más de 10 viajes perdidos por causa del conductor en 90 días multiplica el retiro: ${fmtPct(vpR[3].tasa)} frente a ${fmtPct(vpR[0].tasa)} sin viajes perdidos.`);
  const njN = descriptivos[5].datos;
  if (njN[1].tasa > njN[0].tasa) hallazgos.push(`Una sola falta no justificada en el último mes eleva la probabilidad de volver a faltar sin justificación en los 30 días siguientes de ${fmtPct(njN[0].tasa)} a ${fmtPct(njN[1].tasa)}${njN[3].n ? `; con 3 o más, ${fmtPct(njN[3].tasa)}` : ""}.`);
  const reinc = descriptivos[6].datos;
  if (reinc[1].n > 0) hallazgos.push(`Los reincidentes (3+ ausencias en 30 días) tienen ${fmtPct(reinc[1].tasa)} de probabilidad de una falta no justificada en el mes siguiente, frente a ${fmtPct(reinc[0].tasa)} del resto.`);
  hallazgos.push(`El modelo de retiro ordena bien el riesgo (AUC ${mR.auc.toFixed(2)} en meses no vistos): el 10% de conductores con mayor puntaje concentra ${mR.liftTop10.toFixed(1)} veces la tasa de retiro promedio y el 20% superior captura ${fmtPct(mR.capturaTop20, 0)} de los retiros.`);
  hallazgos.push(`El modelo de falta no justificada alcanza AUC ${mN.auc.toFixed(2)} en meses no vistos: el 10% con mayor puntaje tuvo ${fmtPct(mN.precisionTop10)} de faltas reales, ${mN.liftTop10.toFixed(1)} veces la tasa base.`);
  hallazgos.push(`Hoy hay ${altoR} conductores en riesgo alto de retiro y ${medioR} en riesgo medio; ${altoN} en riesgo alto de falta no justificada y ${medioN} en medio, sobre ${puntuados.length} en plantilla.`);

  const grafRetiros = JSON.stringify({ labels: retirosMes.map((r) => r.mes), retiros: retirosMes.map((r) => r.retiros), tasa: retirosMes.map((r) => +(r.tasa * 100).toFixed(1)) });
  const grafCoefR = JSON.stringify({ labels: coefs(fR).slice(0, 10).map((c) => ETIQUETA[c.key]), w: coefs(fR).slice(0, 10).map((c) => +c.w.toFixed(3)) });
  const grafCoefN = JSON.stringify({ labels: coefs(fN).slice(0, 10).map((c) => ETIQUETA[c.key]), w: coefs(fN).slice(0, 10).map((c) => +c.w.toFixed(3)) });

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Análisis predictivo de ausentismo y retiro de conductores · ${hoy}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{--ink:#1F2937;--muted:#64748B;--line:#E2E8F0;--bg:#F8FAFC;--brand:#4F46E5}
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;color:var(--ink);background:var(--bg);font-size:14px;line-height:1.45}
header{background:#111827;color:#fff;padding:28px 32px}header h1{margin:0 0 6px;font-size:22px}header p{margin:0;color:#CBD5E1}
main{max-width:1280px;margin:0 auto;padding:24px 32px 48px}
h2{font-size:18px;margin:32px 0 12px;border-left:4px solid var(--brand);padding-left:10px}h3{font-size:14px;margin:0 0 10px;color:var(--ink)}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(auto-fit,minmax(380px,1fr))}.g4{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
.kpi .v{font-size:28px;font-weight:700}.kpi .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 8px;border-bottom:1px solid #F1F5F9;text-align:left;vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}td.r,th.r{text-align:right}
.muted{color:var(--muted);font-size:12px}.chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}
.bar{height:10px;background:var(--brand);border-radius:4px;min-width:2px}.mal{color:#DC2626;font-weight:600}.bien{color:#059669;font-weight:600}
ul.hallazgos li{margin:6px 0}.nota{background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 14px;color:#92400E;font-size:13px}
canvas{max-height:280px}
</style></head><body>
<header><h1>Análisis predictivo de ausentismo y retiro de conductores</h1>
<p>La Carolina De Transporte · Recursos Humanos · corte ${hoy} · panel ${esc(p.ventana)} · ${fmtNum(p.filas.length, 0)} observaciones conductor-mes</p></header>
<main>
<section class="grid g4">
  <div class="card kpi"><div class="v">${puntuados.length}</div><div class="l">Conductores en plantilla hoy</div></div>
  <div class="card kpi"><div class="v" style="color:#DC2626">${altoR}</div><div class="l">Riesgo alto de retiro (60 días)</div><div class="muted">${medioR} en riesgo medio</div></div>
  <div class="card kpi"><div class="v" style="color:#D97706">${altoN}</div><div class="l">Riesgo alto de falta no justificada (30 días)</div><div class="muted">${medioN} en riesgo medio</div></div>
  <div class="card kpi"><div class="v">${fmtPct(fR.base)}</div><div class="l">Tasa base de retiro en 60 días</div><div class="muted">${fmtPct(fN.base)} tasa base de falta no justificada en 30 días</div></div>
</section>

<h2>Hallazgos</h2>
<div class="card"><ul class="hallazgos">${hallazgos.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>

<h2>Qué mueve el riesgo</h2>
<div class="grid g2">
  <div class="card"><h3>Retiro en 60 días · peso de cada variable</h3><canvas id="coefR"></canvas>${tablaCoef(fR)}</div>
  <div class="card"><h3>Falta no justificada en 30 días · peso de cada variable</h3><canvas id="coefN"></canvas>${tablaCoef(fN)}</div>
</div>
<p class="muted" style="margin-top:8px">Peso estandarizado: cuánto cambia el logaritmo de la probabilidad cuando la variable sube una desviación estándar, con las demás fijas. Positivo empuja el riesgo; negativo protege.</p>

<h2>Tasas observadas por tramo</h2>
<div class="grid g2">${descriptivos.map(tablaTramos).join("")}</div>

<h2>Retiros observados por mes</h2>
<div class="card"><canvas id="retiros"></canvas>
<table><thead><tr><th>Mes</th><th class="r">Conductores en plantilla</th><th class="r">Retiros en el mes</th><th class="r">Tasa mensual</th></tr></thead><tbody>
${retirosMes.map((r) => `<tr><td>${r.mes}</td><td class="r">${r.plantilla}</td><td class="r">${r.retiros}</td><td class="r">${fmtPct(r.tasa)}</td></tr>`).join("")}
</tbody></table></div>

<h2>Conductores con mayor riesgo de retiro (60 días)</h2>
<div class="card">${topRetiro.length ? tablaRiesgo(topRetiro, "retiro") : '<p class="muted">Ningún conductor por encima del riesgo bajo.</p>'}</div>

<h2>Conductores con mayor riesgo de falta no justificada (30 días)</h2>
<div class="card">${topNovedad.length ? tablaRiesgo(topNovedad, "novedad") : '<p class="muted">Ningún conductor por encima del riesgo bajo.</p>'}</div>

<h2>Cómo leer y usar este análisis</h2>
<div class="card">
<ul>
<li><strong>Riesgo alto</strong> = probabilidad de al menos 3 veces la tasa base; <strong>medio</strong> = entre 1,5 y 3 veces. No es una sentencia: es una lista de prioridad para conversar con el conductor, revisar su asignación o su vehículo antes de que la novedad ocurra.</li>
<li><strong>Retiro:</strong> ${esc(`AUC ${mR.auc.toFixed(3)} en los meses de prueba (${p.dR.mesesTest.map((x) => x.slice(0, 7)).join(", ")}) con ${mR.nTest} conductor-mes y ${mR.positivos} retiros; el 10% de mayor puntaje tuvo ${fmtPct(mR.precisionTop10)} de retiro real.`)}</li>
<li><strong>Falta no justificada:</strong> ${esc(`AUC ${mN.auc.toFixed(3)} en (${p.dN.mesesTest.map((x) => x.slice(0, 7)).join(", ")}) con ${mN.nTest} conductor-mes y ${mN.positivos} faltas; el 10% de mayor puntaje tuvo ${fmtPct(mN.precisionTop10)} de falta real. Incluye las registradas como "sin contacto".`)}</li>
<li>Fuentes: registro diario de ausentes (histórico migrado y módulo), maestro de conductores, viajes perdidos por causa del conductor, cierres diarios y matriz EPS. Los cierres sin cédula se cruzaron por código de conductor.</li>
<li>Limitaciones: nueve meses de histórico, retiros con fecha del maestro (no distingue renuncia de despido), y variables sociodemográficas incompletas (estado civil y nivel educativo "sin definir" en la mitad del maestro, por eso no entran al modelo). Regenerar cada mes con <code>npm run riesgo:conductores</code>.</li>
</ul>
<p class="nota">Este informe contiene datos personales de trabajadores. Úselo dentro de RRHH y Gerencia; no lo reenvíe por correo ni lo suba a la wiki.</p>
</div>
</main>
<script>
const barras=(id,d,color)=>new Chart(document.getElementById(id),{type:'bar',data:{labels:d.labels,datasets:[{data:d.w,backgroundColor:d.w.map(w=>w>0?'#DC2626':'#059669')}]},options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:'#F1F5F9'}},y:{ticks:{font:{size:11}}}}}});
barras('coefR',${grafCoefR});barras('coefN',${grafCoefN});
const r=${grafRetiros};new Chart(document.getElementById('retiros'),{data:{labels:r.labels,datasets:[{type:'bar',label:'Retiros',data:r.retiros,backgroundColor:'#4F46E5',yAxisID:'y'},{type:'line',label:'Tasa mensual %',data:r.tasa,borderColor:'#DC2626',backgroundColor:'#DC2626',yAxisID:'y1'}]},options:{scales:{y:{position:'left',grid:{color:'#F1F5F9'}},y1:{position:'right',grid:{display:false},ticks:{callback:v=>v+'%'}}}}});
</script>
</body></html>`;
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
