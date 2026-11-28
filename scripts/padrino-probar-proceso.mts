// El proceso del Plan Padrino de punta a punta contra la base de .env.local (desarrollo), con la
// política vigente (v3 en desarrollo desde el 27-nov-2026). Lo pedido en la reunión de soporte:
//   1. «Viene recomendado: sí» → aparece en «Apadrinados sin padrino».
//   2. Registrar el padrino → En validación; R13 se mide contra la contratación.
//   3. El proceso se cierra → el referido pasa solo a «No contratado»; si se reabre, vuelve a validación.
//   4. Elegible y contratado → Contratado; si un requisito que bloquea falla al contratar (exámenes),
//      los hitos no se crean y Gestión Humana los aprueba como excepción documentada.
//   5. Contratado sin decidir la elegibilidad → elegible solo si nada bloquea.
//   6. Registro después de la contratación → R13 no cumple → solo se aprueba como excepción.
// Crea procesos ficticios «chat_prueba» (cédulas 99900097NN) y lo borra todo al terminar. No envía nada.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/padrino-probar-proceso.mts
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEstadoProceso, type ActorProceso } from "@/lib/contratacion/servidor";
import { getApadrinadosPendientes, getPoliticaVigente, hoyBogota } from "@/lib/padrino/datos";
import { aprobarHitosPorExcepcionNucleo, decidirElegibilidadNucleo, registrarReferidoNucleo } from "@/lib/padrino/registro-servidor";
import { sincronizarConProceso } from "@/lib/padrino/servidor";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo.");
const db = createAdminClient();
const actor = { userId: null, userEmail: "prueba-padrino@gestivo.test" };
const actorProceso: ActorProceso = { tipo: "usuario", userId: null, userEmail: actor.userEmail };
const PREFIJO = "99900097";
// Padrino de prueba: un conductor activo de la copia de producción (el de Pedro Luis en el chat de prueba).
const PADRINO = process.env.PADRINO_PRUEBA ?? "8567283";

let ok = 0;
const fallos: string[] = [];
const titulo = (t: string) => console.log(`\n── ${t}`);
const revisar = (nombre: string, condicion: unknown, detalle?: unknown) => {
  if (condicion) {
    ok++;
    console.log(`  ✔ ${nombre}`);
  } else {
    const d = detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 500)}` : "";
    fallos.push(`${nombre}${d}`);
    console.log(`  ✘ ${nombre}${d}`);
  }
};
const intentar = async <T,>(fn: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; error: string }> => {
  try {
    return { ok: true, valor: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((p) => p.id as string);
  if (!ids.length) return;
  const { data: refs } = await db.from("padrino_referidos").select("id").in("proceso_id", ids);
  const rids = (refs ?? []).map((r) => r.id as string);
  if (rids.length) {
    await db.from("padrino_hitos").delete().in("referido_id", rids);
    await db.from("padrino_eventos").delete().in("referido_id", rids);
    await db.from("padrino_referidos").delete().in("id", rids);
  }
  await db.from("seleccion_citas").delete().in("proceso_id", ids);
  await db.from("procesos_contratacion_eventos").delete().in("proceso_id", ids);
  await db.from("procesos_contratacion").delete().in("id", ids);
}

let n = 0;
async function crearProceso(nombre: string, extra: Record<string, unknown> = {}): Promise<string> {
  const cedula = `${PREFIJO}${String(++n).padStart(2, "0")}`;
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({
      fecha_creacion: "2026-11-18",
      nombre,
      cedula,
      estado: "pendiente",
      origen: "chat_prueba",
      medio_postulacion: "whatsapp",
      reingreso: false,
      autorizacion_datos: "si",
      licencia_categoria: "C2",
      antecedentes: "ok",
      simit_valor: 0,
      recomendado: true,
      recomendado_por: "conductor de prueba",
      recomendado_at: "2026-11-18T15:00:00Z",
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
const referido = async (procesoId: string) => (await db.from("padrino_referidos").select("*").eq("proceso_id", procesoId).is("anulado_at", null).maybeSingle()).data as Record<string, unknown> | null;
const req = (r: Record<string, unknown> | null, codigo: string) =>
  ((r?.validacion as { referido: { codigo: string; estado: string; dato: string }[] } | undefined)?.referido ?? []).find((x) => x.codigo === codigo);
const bitacora = async (id: string) => ((await db.from("padrino_eventos").select("accion, detalle").eq("referido_id", id).order("created_at")).data ?? []).map((e) => e.accion as string);
/** Contratado como lo deja Procesos de contratación (sin dar de alta al conductor ficticio). */
async function contratar(procesoId: string, fecha: string) {
  await db.from("procesos_contratacion").update({ estado: "contratado", fecha_contrato: fecha }).eq("id", procesoId);
  await sincronizarConProceso(procesoId, actor);
}

await limpiar();
try {
  titulo("0. Política");
  const pol = await getPoliticaVigente(hoyBogota(), db);
  revisar(`rige una política (${pol?.version ?? "ninguna"})`, !!pol);
  console.log(`  (política vigente hoy: ${pol?.version}; padrino de prueba ${PADRINO})`);

  // ── 1 y 2 ───────────────────────────────────────────────────────────────
  titulo("1-2. Viene recomendado y se registra el padrino");
  const p1 = await crearProceso("REFERIDO PRUEBA CIERRE");
  const pend = await getApadrinadosPendientes(db);
  revisar("aparece en «Apadrinados sin padrino»", pend.some((x) => x.procesoId === p1));
  const reg1 = await intentar(() => registrarReferidoNucleo({ procesoId: p1, cedulaPadrino: PADRINO }, actor, null));
  revisar("se registra con el padrino", reg1.ok, reg1);
  let r1 = await referido(p1);
  revisar("queda En validación", r1?.estado === "en_validacion", r1?.estado);
  revisar("la fecha de registro es la del chat (18 nov)", String(r1?.registrado_el ?? "").startsWith("2026-11-18"), r1?.registrado_el);
  const r13a = req(r1, "R13");
  revisar(`R13 sin contratar no bloquea (${r13a?.estado}: ${r13a?.dato})`, !r13a || r13a.estado === "cumple", r13a);
  revisar("ya no sale en «Apadrinados sin padrino»", !(await getApadrinadosPendientes(db)).some((x) => x.procesoId === p1));

  // ── 3 ───────────────────────────────────────────────────────────────────
  titulo("3. El proceso se cierra y se reabre");
  await cambiarEstadoProceso(p1, "cierre", { actor: actorProceso, causa: "Licencia no válida (no tiene, vencida o distinta de C2/C3)" });
  r1 = await referido(p1);
  revisar("al cerrar, el referido pasa solo a «No contratado»", r1?.estado === "no_contratado", r1?.estado);
  revisar("con la causa en la observación del cierre", /Licencia no válida/.test(String(r1?.cierre_observacion ?? "")), r1?.cierre_observacion);
  revisar("y en la bitácora", (await bitacora(r1!.id as string)).includes("no_contratado"));
  await cambiarEstadoProceso(p1, "pendiente", { actor: actorProceso, detalle: { reabierto: true } });
  r1 = await referido(p1);
  revisar("al reabrir, vuelve a «En validación»", r1?.estado === "en_validacion", r1?.estado);

  // ── 4 ───────────────────────────────────────────────────────────────────
  titulo("4. Elegible, contratado y hitos");
  const dec = await intentar(() => decidirElegibilidadNucleo({ id: r1!.id as string, decision: "elegible", observacion: "Revisado con GH (prueba).", excepcion: false }, actor, null));
  revisar("Gestión Humana lo decide elegible", dec.ok, dec);
  await contratar(p1, "2026-11-25");
  r1 = await referido(p1);
  revisar("al contratar pasa a Contratado (o a seguimiento con hitos)", ["contratado", "en_seguimiento"].includes(String(r1?.estado)), r1?.estado);
  revisar("con la fecha de ingreso de la contratación", r1?.fecha_ingreso === "2026-11-25", r1?.fecha_ingreso);
  const r13b = req({ validacion: r1?.validacion_contratacion } as Record<string, unknown>, "R13");
  revisar(`R13 al contratar se mide contra la contratación (${r13b?.estado}: ${r13b?.dato})`, r13b?.estado === "cumple" && /contrataron el 25/.test(r13b.dato), r13b);
  if (r1?.hitos_bloqueados_motivo) {
    console.log(`  (hitos bloqueados al contratar: ${r1.hitos_bloqueados_motivo})`);
    const sinObs = await intentar(() => aprobarHitosPorExcepcionNucleo(r1!.id as string, "  ", actor, null));
    revisar("aprobar como excepción sin observación no se deja", !sinObs.ok);
    const exc = await intentar(() => aprobarHitosPorExcepcionNucleo(r1!.id as string, "El padrino estaba en la hoja de vida desde el comienzo (prueba).", actor, null));
    revisar("aprobados como excepción documentada", exc.ok, exc);
    r1 = await referido(p1);
    const { count } = await db.from("padrino_hitos").select("id", { count: "exact", head: true }).eq("referido_id", r1!.id as string);
    revisar(`se crean los hitos (${count}) y pasa a seguimiento`, (count ?? 0) > 0 && r1?.estado === "en_seguimiento" && !r1?.hitos_bloqueados_motivo, { count, estado: r1?.estado });
    revisar("queda en la bitácora", (await bitacora(r1!.id as string)).includes("hitos_por_excepcion"));
  } else {
    const { count } = await db.from("padrino_hitos").select("id", { count: "exact", head: true }).eq("referido_id", r1!.id as string);
    revisar(`sin bloqueo: se crean los hitos (${count})`, (count ?? 0) > 0, count);
  }

  // ── 5 ───────────────────────────────────────────────────────────────────
  titulo("5. Contratado sin decidir la elegibilidad");
  const p2 = await crearProceso("REFERIDO PRUEBA SIN DECIDIR", { estado: "en_examenes", fecha_examenes: "2026-11-20", fecha_examenes_fase2: "2026-11-22" });
  const reg2 = await intentar(() => registrarReferidoNucleo({ procesoId: p2, cedulaPadrino: PADRINO }, actor, null));
  revisar("se registra", reg2.ok, reg2);
  await contratar(p2, "2026-11-26");
  const r2 = await referido(p2);
  const acc2 = r2 ? await bitacora(r2.id as string) : [];
  revisar(
    `al contratar se revalida: elegible solo si nada bloquea, si no queda para GH (${r2?.estado})`,
    (acc2.includes("elegible_al_contratar") && ["contratado", "en_seguimiento"].includes(String(r2?.estado))) || (acc2.includes("contratado_sin_decidir") && r2?.estado === "en_validacion"),
    { estado: r2?.estado, acc2 }
  );

  // ── 6 ───────────────────────────────────────────────────────────────────
  titulo("6. Registrado después de la contratación");
  const p3 = await crearProceso("REFERIDO PRUEBA TARDIO", { estado: "contratado", fecha_contrato: "2026-11-10", recomendado_at: null });
  const reg3 = await intentar(() => registrarReferidoNucleo({ procesoId: p3, cedulaPadrino: PADRINO }, actor, null));
  revisar("se registra", reg3.ok, reg3);
  const r3 = await referido(p3);
  const r13c = req(r3, "R13");
  revisar(`R13 no cumple: lo registraron después de contratarlo (${r13c?.dato})`, r13c?.estado === "no_cumple" && /contrataron el 10/.test(r13c.dato), r13c);
  const sinExc = await intentar(() => decidirElegibilidadNucleo({ id: r3!.id as string, decision: "elegible", observacion: "x", excepcion: false }, actor, null));
  revisar("sin excepción no se aprueba", !sinExc.ok && /excepción/.test(sinExc.ok ? "" : sinExc.error), sinExc);
  const conExc = await intentar(() => decidirElegibilidadNucleo({ id: r3!.id as string, decision: "elegible", observacion: "Venía con el padrino desde el inicio (prueba).", excepcion: true }, actor, null));
  revisar("como excepción documentada sí", conExc.ok, conExc);
} finally {
  await limpiar();
  const { count } = await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`);
  console.log(`\nLimpieza: quedan ${count ?? 0} procesos de esta prueba.`);
}

console.log(`\n${ok} bien, ${fallos.length} mal.`);
if (fallos.length) {
  for (const f of fallos) console.log(` - ${f}`);
  process.exitCode = 1;
}
