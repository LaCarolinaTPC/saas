"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import { importarRegistroExamenes } from "@/lib/seleccion/estadisticas-examenes-servidor";

const LIMITE = 10 * 1024 * 1024;

/** Carga el Excel del registro de exámenes de ingreso (Salud Ocupacional). */
export async function cargarRegistroExamenes(form: FormData): Promise<{ ok: boolean; error?: string; texto?: string }> {
  try {
    const actor = actorUsuario(await exigirPermiso("candidatos.editar"));
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elija el Excel del registro de exámenes." };
    if (archivo.size > LIMITE) return { ok: false, error: "El archivo pesa más de 10 MB." };
    if (!/\.(xlsx|xls|xlsm)$/i.test(archivo.name)) return { ok: false, error: "Suba el Excel (.xlsx)." };
    const r = await importarRegistroExamenes({ nombre: archivo.name, buffer: Buffer.from(await archivo.arrayBuffer()) }, actor);
    if (!r.ok) return r;
    revalidatePath("/candidatos/indicadores/examenes");
    const rango = r.desde && r.hasta ? ` (fase 1 del ${r.desde.split("-").reverse().join("/")} al ${r.hasta.split("-").reverse().join("/")})` : "";
    return { ok: true, texto: `Se cargaron ${r.cargadas.toLocaleString("es-CO")} aspirantes${rango}.${r.omitidas ? ` ${r.omitidas} filas sin cédula o sin fase 1 no se cargaron.` : ""}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo cargar el archivo." };
  }
}
