import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaBandeja } from "@/lib/incapacidades/auditoria";
import { buscarEnFuente, fuentesPermitidas, type ResultadoBusqueda } from "@/lib/buscador/fuentes";
import { palabrasDe } from "@/lib/buscador/texto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };
const MAX_LARGO_CONSULTA = 120;

export interface RespuestaBuscador {
  grupos: { clave: string; grupo: string; resultados: ResultadoBusqueda[] }[];
  /** Alguna fuente falló: los resultados pueden estar incompletos. */
  parcial: boolean;
}

/**
 * Búsqueda de registros del buscador global. Es POST para que nombres y cédulas
 * no queden en la URL ni en los logs de acceso. El proxy no revisa `/api/*`: aquí
 * se exige la sesión y solo se consultan las fuentes que el usuario puede abrir.
 */
export async function POST(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!perms.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: SIN_CACHE });

  const cuerpo = (await req.json().catch(() => null)) as { q?: unknown } | null;
  const q = typeof cuerpo?.q === "string" ? cuerpo.q.slice(0, MAX_LARGO_CONSULTA) : "";
  const palabras = palabrasDe(q);
  if (palabras.length === 0) return NextResponse.json({ grupos: [], parcial: false } satisfies RespuestaBuscador, { headers: SIN_CACHE });

  const db = createAdminClient();
  const permitidas = fuentesPermitidas(perms.efectivos);
  const respuestas = await Promise.allSettled(permitidas.map(({ fuente, ficha }) => buscarEnFuente(db, fuente, ficha, palabras)));

  const grupos: RespuestaBuscador["grupos"] = [];
  let parcial = false;
  respuestas.forEach((r, i) => {
    const { fuente } = permitidas[i];
    if (r.status === "rejected") {
      parcial = true;
      // Sin el término buscado: puede ser un nombre o una cédula.
      console.error(`[buscador] falló la fuente ${fuente.clave}:`, r.reason instanceof Error ? r.reason.name : "error");
    } else if (r.value.length > 0) {
      grupos.push({ clave: fuente.clave, grupo: fuente.grupo, resultados: r.value });
    }
  });

  // Encontrar a alguien en incapacidades revela que tiene una: queda auditado
  // igual que la bandeja de consulta (src/app/(dashboard)/incapacidades/consulta).
  const incapacidades = grupos.find((g) => g.clave === "incapacidades");
  if (incapacidades) {
    await auditarConsultaBandeja({
      filtros: { bandeja: "buscador", q },
      filas: incapacidades.resultados.length,
      rol: perms.userType,
      userEmail: perms.userEmail,
    }).catch((e) => console.error("[buscador] no se pudo auditar:", e instanceof Error ? e.name : "error"));
  }

  return NextResponse.json({ grupos, parcial } satisfies RespuestaBuscador, { headers: SIN_CACHE });
}
