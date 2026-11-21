// Escenarios de Croma simulado del chat de prueba (19-nov-2026): corre cada uno de
// punta a punta (RUNT, SIMIT, preselección, antecedentes, «Listo para citar»,
// revisión) con aspirantes ficticios «chat_prueba» y los borra al terminar.
// No consulta Croma ni envía WhatsApp.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-escenarios-croma.mts
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { PREFILTRO_VACIO, type DatosPrefiltro } from "@/lib/seleccion/extraccion";
import { ESCENARIOS, type EscenarioCroma } from "@/lib/seleccion/escenario-croma";
import { marcarListoParaCitar, marcarRevisionAntecedentes } from "@/lib/seleccion/servidor";
import { simularCromaProceso } from "@/lib/verificacion/servidor";

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-escenarios@gestivo.test" };
const PREFIJO = "9990006";
async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").eq("origen", "chat_prueba").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((x) => x.id as string);
  if (ids.length) await db.from("procesos_contratacion").delete().in("id", ids);
  return ids.length;
}

interface Esperado {
  estado: string;
  listo: boolean;
  revision?: boolean;
  licenciaVerificada?: boolean;
  nota?: string;
}
// Lo que debe pasar en cada escenario con los ajustes de hoy (se imprime al lado de lo que pasó).
const ESPERADO: Record<string, Esperado> = {
  todo_bien: { estado: "citado|antecedentes", listo: true, licenciaVerificada: true },
  vencida: { estado: "pendiente", listo: false, nota: "licencia vencida: el asistente pregunta si la renueva" },
  inferior: { estado: "pendiente", listo: false, nota: "semáforo en rojo por licencia (se cierra a los 30 min)" },
  no_aparece: { estado: "pendiente", listo: false, nota: "pide confirmar cédula y apellido" },
  multas: { estado: "citado|antecedentes", listo: true, nota: "multas bajo el tope de $3.000.000" },
  policia: { estado: "antecedentes", listo: false, revision: true },
  rnmc: { estado: "antecedentes", listo: false, revision: true },
  caido: { estado: "antecedentes", listo: false, nota: "depende de si las fuentes son obligatorias" },
  runt_caido: { estado: "pendiente|antecedentes", listo: false, nota: "depende de si el SIMIT es obligatorio" },
};

await limpiar();
let n = 0;
let problemas = 0;
const casos: { titulo: string; escenario: EscenarioCroma; licenciaDicha: string | null; id: string }[] = [];
try {
  // Cada escenario sin haber dicho la licencia (como con la foto de la cédula); «todo bien» también con la licencia dicha.
  const lista = [...ESCENARIOS.map((e) => ({ ...e, licenciaDicha: null as string | null })), { ...ESCENARIOS[0], titulo: "Todo bien (dijo C2)", licenciaDicha: "C2" }];
  for (const e of lista) {
    n++;
    const cedula = `${PREFIJO}${String(n).padStart(3, "0")}`;
    const { data, error } = await db
      .from("procesos_contratacion")
      .insert({
        fecha_creacion: "2026-11-19",
        nombre: "POR CONFIRMAR",
        cedula,
        celular: null,
        reingreso: false,
        estado: "pendiente",
        medio_postulacion: "whatsapp",
        origen: "chat_prueba",
        autorizacion_datos: "si",
        edad: 35,
        ciudad_residencia: "Barranquilla",
        experiencia_meses: 60,
        hoja_vida_recibida_at: new Date().toISOString(),
        licencia_categoria: e.licenciaDicha,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = data.id as string;
    casos.push({ titulo: e.titulo, escenario: e.escenario, licenciaDicha: e.licenciaDicha, id });
    const datos: DatosPrefiltro = {
      ...PREFILTRO_VACIO,
      cedula,
      primer_apellido: "PRUEBA",
      fecha_expedicion: "2008-03-10",
      edad: 35,
      ciudad: "Barranquilla",
      licencia: e.licenciaDicha,
      experiencia_meses: 60,
      hoja_vida: true,
      autorizacion: "si",
      busca_trabajo: true,
    };
    await simularCromaProceso(id, { licencia: e.licenciaDicha, nombre: "NESTOR PRUEBA RUIZ", simit: null, escenario: e.escenario }, actor);
    // Como en cada mensaje: se vuelve a simular (no debe duplicar consultas).
    await simularCromaProceso(id, { licencia: e.licenciaDicha, nombre: "NESTOR PRUEBA RUIZ", simit: null, escenario: e.escenario }, actor);
    const listo = await marcarListoParaCitar(id, datos);
    const aviso = await marcarRevisionAntecedentes(id);

    const { data: p } = await db
      .from("procesos_contratacion")
      .select("estado, nombre, licencia_categoria, licencia_verificada_runt, simit, simit_valor, antecedentes, preseleccion")
      .eq("id", id)
      .single();
    const { data: v } = await db.from("verificaciones_externas").select("fuente, estado").eq("proceso_id", id).order("created_at");
    const { data: citas } = await db.from("seleccion_citas").select("estado, fecha, hora").eq("proceso_id", id);
    const pre = p?.preseleccion as { global?: string; licencia?: { color: string; motivo: string }; simit?: { color: string } } | null;
    const porFuente = new Map<string, number>();
    for (const f of v ?? []) porFuente.set(f.fuente as string, (porFuente.get(f.fuente as string) ?? 0) + 1);
    const duplicadas = [...porFuente].filter(([, c]) => c > 1).map(([f]) => f);

    const key = e.licenciaDicha ? "todo_bien" : e.id;
    const esp = ESPERADO[key];
    const fallas: string[] = [];
    if (esp && !esp.estado.split("|").includes(String(p?.estado))) fallas.push(`estado ${p?.estado} (se esperaba ${esp.estado})`);
    if (esp && esp.listo !== listo) fallas.push(`listo=${listo} (se esperaba ${esp.listo})`);
    if (esp?.revision && !aviso) fallas.push("sin aviso de revisión");
    if (esp?.licenciaVerificada && !p?.licencia_verificada_runt) fallas.push("licencia no verificada");
    if (duplicadas.length) fallas.push(`consultas repetidas: ${duplicadas.join(", ")}`);
    if (e.escenario.runt !== "error" && e.escenario.runt !== "no_aparece" && p?.nombre === "POR CONFIRMAR") fallas.push("sin nombre");
    if (fallas.length) problemas++;

    console.log(`\n${fallas.length ? "✘" : "✔"} ${e.titulo}${e.licenciaDicha ? "" : " (sin decir la licencia)"}`);
    console.log(`   nombre: ${p?.nombre} · licencia: ${p?.licencia_categoria ?? "—"} ${p?.licencia_verificada_runt ? "(RUNT)" : "(sin verificar)"}`);
    console.log(`   semáforo: ${pre?.global} · licencia ${pre?.licencia?.color} «${pre?.licencia?.motivo}» · SIMIT ${pre?.simit?.color} (${p?.simit ?? "—"} ${p?.simit_valor ?? ""})`);
    console.log(`   estado: ${p?.estado} · antecedentes: ${p?.antecedentes ?? "—"} · listo para citar: ${listo ? "sí" : "no"}${aviso ? " · aviso de revisión" : ""}${citas?.length ? ` · cita ${citas[0].fecha} ${citas[0].hora} (${citas[0].estado})` : ""}`);
    console.log(`   Croma: ${(v ?? []).map((f) => `${f.fuente}=${f.estado}`).join(", ")}`);
    if (esp?.nota) console.log(`   nota: ${esp.nota}`);
    for (const f of fallas) console.log(`   ✘ ${f}`);
  }
} finally {
  const borrados = await limpiar();
  console.log(`\nLimpieza: ${borrados} candidatos ficticios borrados.`);
}
console.log(`\nRESULTADO: ${casos.length - problemas} de ${casos.length} escenarios como se esperaba.`);
