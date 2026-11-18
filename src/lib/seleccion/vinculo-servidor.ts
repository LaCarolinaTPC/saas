/**
 * Vínculo del aspirante con la empresa, del lado del servidor (ver vinculo.ts):
 * busca la cédula en `conductores` y la causa de retiro en `conductores_retiro`;
 * cierra el proceso de quien ya es conductor activo y marca como reingreso,
 * para revisión de una persona, al que trabajó antes.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, cambiarEstadoProceso, registrarEvento } from "@/lib/contratacion/servidor";
import { CAUSA_YA_TRABAJA } from "@/lib/contratacion/constants";
import { cedulaNormalizada, cedulasMencionadas, type VinculoEmpresa } from "./vinculo";
import { inicioVigenteProceso } from "./servidor";

/** Conductor con esa cédula en Gestivo (activo o retirado), o null. Nunca lanza. */
export async function vinculoConEmpresa(cedula: string | null | undefined): Promise<VinculoEmpresa | null> {
  const c = cedulaNormalizada(cedula);
  if (!c) return null;
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("conductores")
      .select("cedula, nombre, codigo, estado, fecha_ingreso, fecha_retiro, fecha_reingreso")
      .eq("cedula", c)
      .limit(5);
    if (!data?.length) return null;
    const activo = data.find((f) => String(f.estado ?? "").toUpperCase() === "ACTIVO");
    const fila = activo ?? data[0];
    const base = {
      cedula: c,
      nombre: (fila.nombre as string | null) ?? null,
      codigo: fila.codigo == null ? null : String(fila.codigo),
      fechaIngreso: ((fila.fecha_reingreso ?? fila.fecha_ingreso) as string | null) ?? null,
    };
    if (activo) return { tipo: "activo", ...base, fechaRetiro: null, causaRetiro: null, notaRetiro: null };
    const { data: retiro } = await db
      .from("conductores_retiro")
      .select("fecha_retiro, causa, nota")
      .eq("cedula", c)
      .order("fecha_retiro", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    return {
      tipo: "retirado",
      ...base,
      fechaRetiro: ((retiro?.fecha_retiro ?? fila.fecha_retiro) as string | null) ?? null,
      causaRetiro: (retiro?.causa as string | null) ?? null,
      notaRetiro: (retiro?.nota as string | null) ?? null,
    };
  } catch (e) {
    console.error("[seleccion] vínculo con la empresa:", e);
    return null;
  }
}

/**
 * Vínculo para el asistente, con UNA sola cédula: la que ya se leyó del chat
 * (o la del proceso), en el orden en que llegan (la primera manda); y mientras
 * no la haya, el número más reciente que escribió y parece cédula (`textos` va
 * del más reciente al más viejo). Antes se revisaban todos los números de la
 * conversación y bastaba con que uno fuera de un conductor activo: en el chat
 * de prueba, una cédula escrita antes hacía decir «ya trabaja aquí» a quien no
 * (18-nov-2026).
 */
export async function vinculoDeCedulas(cedulas: (string | null | undefined)[], textos: string[] = []): Promise<VinculoEmpresa | null> {
  const conocida = cedulas.map(cedulaNormalizada).find((c): c is string => !!c);
  const cedula = conocida ?? cedulasMencionadas(textos)[0];
  return cedula ? vinculoConEmpresa(cedula) : null;
}

/** Vínculo de una conversación de WhatsApp (cédula leída, proceso enlazado y mensajes del aspirante). */
export async function vinculoDeConversacion(conversacionId: string): Promise<VinculoEmpresa | null> {
  const db = createAdminClient();
  const { data: conv } = await db.from("wa_conversaciones").select("prefiltro, proceso_id").eq("id", conversacionId).maybeSingle();
  if (!conv) return null;
  let cedulaProceso: string | null = null;
  if (conv.proceso_id) {
    const { data: p } = await db.from("procesos_contratacion").select("cedula").eq("id", conv.proceso_id).maybeSingle();
    cedulaProceso = (p?.cedula as string | null) ?? null;
  }
  const { data: msjs } = await db
    .from("wa_mensajes")
    .select("contenido")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .order("timestamp", { ascending: false })
    .limit(20);
  const prefiltro = (conv.prefiltro as { cedula?: string | null } | null) ?? null;
  const textos = (msjs ?? []).map((m) => (m.contenido as string | null) ?? "");
  // Si el último mensaje trae una cédula, manda esa: la leída del chat se
  // actualiza después de la respuesta y todavía puede ser la anterior.
  const enUltimo = cedulasMencionadas(textos.slice(0, 1))[0];
  return vinculoDeCedulas([enUltimo, prefiltro?.cedula, cedulaProceso], textos);
}

/**
 * Aplica el vínculo al proceso recién creado o actualizado desde el chat:
 * - activo: lo cierra con CAUSA_YA_TRABAJA (devuelve "cerrado": no hay que consultar nada más);
 * - retirado: lo marca como reingreso y deja el evento para la lista de revisión (una vez).
 */
export async function aplicarVinculo(procesoId: string, cedula: string | null): Promise<"cerrado" | "reingreso" | null> {
  const v = await vinculoConEmpresa(cedula);
  if (!v) return null;
  const db = createAdminClient();
  if (v.tipo === "activo") {
    const r = await cambiarEstadoProceso(procesoId, "cierre", {
      actor: ACTOR_SISTEMA,
      causa: CAUSA_YA_TRABAJA,
      detalle: { motivo: "Ya es conductor activo de la empresa (Gestivo).", automatico: true, vinculo: { codigo: v.codigo, fecha_ingreso: v.fechaIngreso } },
    }).catch((e) => {
      console.error("[seleccion] cierre por vínculo activo:", e);
      return null;
    });
    return r ? "cerrado" : null;
  }
  const { data: p } = await db.from("procesos_contratacion").select("reingreso").eq("id", procesoId).maybeSingle();
  if (!p?.reingreso) await db.from("procesos_contratacion").update({ reingreso: true }).eq("id", procesoId);
  const { data: ya } = await db
    .from("procesos_contratacion_eventos")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("detalle->>revision_reingreso", "true")
    .gte("created_at", await inicioVigenteProceso(procesoId))
    .limit(1)
    .maybeSingle();
  if (!ya) {
    await registrarEvento(
      procesoId,
      {
        tipo: "dato",
        detalle: {
          revision_reingreso: true,
          retiro: { codigo: v.codigo, fecha_ingreso: v.fechaIngreso, fecha_retiro: v.fechaRetiro, causa: v.causaRetiro, nota: v.notaRetiro },
        },
      },
      ACTOR_SISTEMA
    );
  }
  return "reingreso";
}
