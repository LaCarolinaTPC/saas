// Batería de «¿vienes recomendado?» y apadrinados contra la base de .env.local (desarrollo).
// Necesita la migración 20261121181420. Crea candidatos ficticios «chat_prueba» (no sale WhatsApp ni se consulta
// Croma) y un registro ficticio en el Plan Padrino, y lo borra todo al terminar.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-recomendado.mts
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarAspirante } from "@/lib/seleccion/proceso-desde-chat";
import { PREFILTRO_VACIO, type DatosPrefiltro } from "@/lib/seleccion/extraccion";
import { fechaRegistro, getApadrinadosPendientes, getPoliticas, idsApadrinadosSinPadrino, validar } from "@/lib/padrino/datos";
import { bloqueoPorRecomendado } from "@/lib/padrino/reglas";
import { registrarEvento } from "@/lib/contratacion/servidor";

const db = createAdminClient();
let ok = 0;
const fallos: string[] = [];
let seccion = "";
const titulo = (t: string) => {
  seccion = t;
  console.log(`\n── ${t}`);
};
const revisar = (nombre: string, condicion: unknown, detalle?: unknown) => {
  if (condicion) {
    ok++;
    console.log(`  ✔ ${nombre}`);
  } else {
    fallos.push(`${seccion}: ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
    console.log(`  ✘ ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
  }
};

const PREFIJO = "99900021";
const CED_SI = `${PREFIJO}01`;
const CED_NO = `${PREFIJO}02`;
const CED_MANO = `${PREFIJO}03`;
const DIA = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();
const dia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));

async function limpiar() {
  const { data: refs } = await db.from("padrino_referidos").select("id").like("cedula_referido", `${PREFIJO}%`);
  const idsRef = (refs ?? []).map((r) => r.id as string);
  if (idsRef.length) {
    await db.from("padrino_eventos").delete().in("referido_id", idsRef);
    await db.from("padrino_referidos").delete().in("id", idsRef);
  }
  const { data } = await db.from("procesos_contratacion").select("id").eq("origen", "chat_prueba").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((p) => p.id as string);
  if (ids.length) {
    await db.from("procesos_contratacion_eventos").delete().in("proceso_id", ids);
    await db.from("procesos_contratacion").delete().in("id", ids);
  }
  await db.from("candidates").delete().like("document_number", `${PREFIJO}%`);
}

const datos = (p: Partial<DatosPrefiltro>): DatosPrefiltro => ({
  ...PREFILTRO_VACIO,
  ciudad: "Soledad",
  fecha_nacimiento: "1990-05-03",
  autorizacion: "si",
  ...p,
});
const registrar = (d: DatosPrefiltro) =>
  registrarAspirante({ datos: d, celular: null, autorizacionAt: new Date().toISOString(), autorizacionMensajeId: null, origen: "chat_prueba", sinCroma: true });
const leer = async (id: string) =>
  (await db.from("procesos_contratacion").select("recomendado, recomendado_at, recomendado_por").eq("id", id).maybeSingle()).data as {
    recomendado: boolean | null;
    recomendado_at: string | null;
    recomendado_por: string | null;
  } | null;

await limpiar();
try {
  titulo("Guardado desde el chat");
  const dijoSi = hace(5);
  const r1 = await registrar(datos({ cedula: CED_SI, recomendado: true, recomendado_por: "Luis Herrera, conductor", recomendado_at: dijoSi }));
  revisar("se crea el candidato", r1?.procesoId);
  const idSi = r1!.procesoId;
  let p = await leer(idSi);
  revisar("queda como recomendado, con quién y la hora del «sí»", p?.recomendado === true && p.recomendado_por === "Luis Herrera, conductor" && p.recomendado_at && Math.abs(Date.parse(p.recomendado_at) - Date.parse(dijoSi)) < 1000, p);
  const { count: ev } = await db.from("procesos_contratacion_eventos").select("id", { count: "exact", head: true }).eq("proceso_id", idSi).eq("tipo", "recomendado");
  revisar("queda el evento en el historial", ev === 1, ev);

  // Otra lectura del chat, después: la fecha del primer «sí» no se mueve y no se repite el evento.
  await registrar(datos({ cedula: CED_SI, recomendado: true, recomendado_por: "Luis Herrera, conductor", recomendado_at: hace(1) }));
  p = await leer(idSi);
  revisar("una lectura posterior no mueve la fecha", p?.recomendado_at && Math.abs(Date.parse(p.recomendado_at) - Date.parse(dijoSi)) < 1000, p);
  const { count: ev2 } = await db.from("procesos_contratacion_eventos").select("id", { count: "exact", head: true }).eq("proceso_id", idSi).eq("tipo", "recomendado");
  revisar("ni repite el evento", ev2 === 1, ev2);

  const dijoNo = hace(3);
  const r2 = await registrar(datos({ cedula: CED_NO, recomendado: false, recomendado_at: dijoNo }));
  let pNo = await leer(r2!.procesoId);
  revisar("con «no» queda en false, sin nombre y con la hora de la respuesta", pNo?.recomendado === false && !pNo.recomendado_por && pNo.recomendado_at && Math.abs(Date.parse(pNo.recomendado_at) - Date.parse(dijoNo)) < 1000, pNo);
  // Un «no» desde el chat es definitivo: un «sí» posterior no lo cambia (Salud Ocupacional, 21-nov-2026).
  await registrar(datos({ cedula: CED_NO, recomendado: true, recomendado_por: "Alguien", recomendado_at: hace(1) }));
  pNo = await leer(r2!.procesoId);
  revisar("el chat no pasa un «no» a «sí»", pNo?.recomendado === false && !pNo.recomendado_por, pNo);
  revisar("el Plan Padrino bloquea a quien dijo «no»", Boolean(bloqueoPorRecomendado(pNo?.recomendado ?? null)));
  // Un administrador lo corrige (lo que hace correccionRecomendado al guardar el formulario): la hora del chat se conserva.
  await db.from("procesos_contratacion").update({ recomendado: true }).eq("id", r2!.procesoId);
  await registrarEvento(r2!.procesoId, { tipo: "recomendado", detalle: { anterior: false, nuevo: true, motivo: "Se equivocó en el chat", origen: "correccion" } }, { tipo: "usuario", userId: null, userEmail: "prueba@gestivo.test" });
  pNo = await leer(r2!.procesoId);
  revisar("corregido a «sí», conserva la hora de la respuesta en el chat (R13)", pNo?.recomendado === true && dia(pNo.recomendado_at!) === dia(dijoNo), pNo);
  revisar("y ya no está bloqueado", !bloqueoPorRecomendado(pNo?.recomendado ?? null));

  const r3 = await registrar(datos({ cedula: CED_MANO }));
  revisar("sin responder queda en null", (await leer(r3!.procesoId))?.recomendado === null);
  // Gestión Humana lo marcó a mano como recomendado: el chat no lo pisa.
  await db.from("procesos_contratacion").update({ recomendado: true, recomendado_at: hace(2), recomendado_por: "Ana (GH)" }).eq("id", r3!.procesoId);
  await registrarEvento(r3!.procesoId, { tipo: "dato", detalle: { campos: ["recomendado", "recomendado_por"] } }, { tipo: "usuario", userId: null, userEmail: "prueba@gestivo.test" });
  await registrar(datos({ cedula: CED_MANO, recomendado: false }));
  const pMano = await leer(r3!.procesoId);
  revisar("lo que marcó una persona a mano no lo pisa el chat", pMano?.recomendado === true && pMano.recomendado_por === "Ana (GH)", pMano);

  titulo("Apadrinados sin padrino");
  let pend = await getApadrinadosPendientes();
  const ids = await idsApadrinadosSinPadrino();
  revisar("el recomendado aparece en la lista, con la fecha y el nombre", pend.some((x) => x.procesoId === idSi && x.recomendadoEl === dia(dijoSi) && x.recomendadoPor === "Luis Herrera, conductor"), pend.filter((x) => x.cedula.startsWith(PREFIJO)));
  revisar("también el marcado a mano", ids.includes(r3!.procesoId));
  revisar("el que dijo que no y fue corregido a sí, también", ids.includes(r2!.procesoId));

  titulo("Plan Padrino: R13 con la fecha del «sí»");
  // El proceso empezó cuando dio la cédula, hace 4 días; dijo «sí» hace 5. GH asigna el padrino hoy.
  await db.from("procesos_contratacion").update({ fecha_creacion: dia(hace(4)) }).eq("id", idSi);
  const politicas = await getPoliticas(undefined, { borradores: true });
  const conR13 = politicas.find((x) => x.parametros.requisitos?.R13?.activo) ?? politicas.find((x) => x.version === "v3");
  revisar("hay una versión con R13 activa para probar", conR13, politicas.map((x) => x.version));
  const { data: cond } = await db.from("conductores").select("cedula").eq("estado", "ACTIVO").limit(1).maybeSingle();
  const padrino = String(cond?.cedula ?? "");
  revisar("hay un conductor activo para hacer de padrino", padrino);
  if (conR13 && padrino) {
    const r13 = (v: Awaited<ReturnType<typeof validar>>) => v.validacion.referido.find((x) => x.codigo === "R13");
    const conSi = await validar(idSi, padrino, undefined, { politica: conR13, registradoEl: dia(dijoSi) });
    revisar(`${conR13.version}: con la fecha del «sí» R13 se cumple`, r13(conSi)?.estado === "cumple", r13(conSi));
    const sinSi = await validar(idSi, padrino, undefined, { politica: conR13 });
    // Desde el 27-nov-2026 la R13 se mide contra la fecha de contratación: antes de contratar, registrar hoy
    // todavía es a tiempo («se confirma al contratar»), aunque hoy sea después del «sí» del chat.
    revisar(
      `${conR13.version}: con la fecha de hoy, antes de contratar, todavía cumple (se confirma al contratar)`,
      r13(sinSi)?.estado === "cumple" && /contrataci/i.test(String(r13(sinSi)?.dato ?? "")),
      r13(sinSi)
    );
    const v2 = politicas.find((x) => x.version === "v2");
    if (v2) {
      const enV2 = await validar(idSi, padrino, undefined, { politica: v2, registradoEl: dia(dijoSi) });
      revisar("v2: sin R13 la fecha no cambia nada", !r13(enV2), r13(enV2));
    }
  }

  titulo("Asignado el padrino");
  // Lo que deja registrarReferido (sin pasar por la acción, que pide sesión).
  const { data: proc } = await db.from("procesos_contratacion").select("nombre, candidate_id").eq("id", idSi).maybeSingle();
  const { data: ref, error: eRef } = await db
    .from("padrino_referidos")
    .insert({
      politica_id: conR13?.id ?? politicas[0].id,
      candidate_id: proc?.candidate_id ?? null,
      proceso_id: idSi,
      cedula_referido: CED_SI,
      nombre_referido: proc?.nombre ?? "PRUEBA",
      cedula_padrino: padrino || "1",
      nombre_padrino: "PADRINO DE PRUEBA",
      padrino_tipo: "conductor",
      estado: "en_validacion",
      registrado_el: dia(dijoSi),
    })
    .select("id, created_at, registrado_el")
    .single();
  revisar("se guarda el registro con registrado_el", ref && !eRef, eRef?.message);
  if (ref) {
    revisar("fechaRegistro usa el día del «sí», no el del registro", fechaRegistro(ref) === dia(dijoSi), { fecha: fechaRegistro(ref), creado: ref.created_at });
    revisar("sin registrado_el vale el día del registro", fechaRegistro({ ...ref, registrado_el: null }) === dia(ref.created_at as string));
    pend = await getApadrinadosPendientes();
    revisar("ya con padrino sale de la lista", !pend.some((x) => x.procesoId === idSi));
  }
} catch (e) {
  fallos.push(`excepción: ${e instanceof Error ? e.stack : String(e)}`);
  console.error(e);
} finally {
  await limpiar();
  const quedan = (await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`)).count;
  revisar("no quedan datos de prueba", quedan === 0, quedan);
}

console.log(`\n${ok} bien, ${fallos.length} mal.`);
for (const f of fallos) console.log(`  · ${f}`);
process.exit(fallos.length ? 1 : 0);
