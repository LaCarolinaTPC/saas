import Link from "next/link";
import { Bot, Clock, Hand, MessageCircle } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { leerIndicadores } from "@/lib/comunicaciones/indicadores-servidor";
import { formatoDuracion } from "@/lib/comunicaciones/indicadores";

const GRIS = "#64748B";

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#0F172A]">Comunicaciones · últimos 30 días</h2>
        <Link href="/candidatos/indicadores/whatsapp" className="text-[13px] font-medium text-[#4F46E5] hover:underline">
          Ver indicadores
        </Link>
      </div>
      {children}
    </section>
  );
}

/**
 * Indicadores de Comunicaciones en el panel principal. Es un componente de
 * servidor: el panel lo monta solo si el usuario puede ver Comunicaciones, así
 * que a quien no tiene acceso ni se le calculan los datos.
 */
export async function ResumenComunicaciones() {
  let ind;
  try {
    ind = await leerIndicadores({ dias: 30, completo: false });
  } catch (e) {
    console.error("[panel] indicadores de comunicaciones:", e);
    return (
      <Marco>
        <p className="rounded-xl border border-[#F1F5F9] bg-white px-6 py-5 text-sm text-[#64748B]">
          No se pudieron cargar los indicadores de Comunicaciones en este momento.
        </p>
      </Marco>
    );
  }
  const { volumen, atencion, primeraRespuesta } = ind;
  const sinConversaciones = volumen.conversacionesNuevas === 0;
  return (
    <Marco>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatCard
          label="Conversaciones nuevas"
          value={sinConversaciones ? "—" : volumen.conversacionesNuevas.toLocaleString("es-CO")}
          change={sinConversaciones ? "sin conversaciones" : ""}
          changeColor={GRIS}
          icon={MessageCircle}
        />
        <StatCard
          label="Atendidas solo por el asistente"
          value={atencion.pctSoloAsistente == null ? "—" : `${Math.round(atencion.pctSoloAsistente)}%`}
          change={atencion.base ? `${atencion.soloAsistente.toLocaleString("es-CO")} de ${atencion.base.toLocaleString("es-CO")}` : "sin datos"}
          changeColor={GRIS}
          icon={Bot}
        />
        <StatCard
          label="Esperando a una persona ahora"
          value={ind.esperandoAhora.toLocaleString("es-CO")}
          change=""
          icon={Hand}
        />
        <StatCard
          label="Primera respuesta (mediana)"
          value={primeraRespuesta.general.n ? formatoDuracion(primeraRespuesta.general.mediana) : "—"}
          change={primeraRespuesta.general.n ? "" : "sin respuestas"}
          changeColor={GRIS}
          icon={Clock}
        />
      </div>
    </Marco>
  );
}

/** Lo que se ve mientras se calculan los indicadores (el resto del panel no espera). */
export function ResumenComunicacionesCargando() {
  return (
    <Marco>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[124px] animate-pulse rounded-xl border border-[#F1F5F9] bg-white" />
        ))}
      </div>
    </Marco>
  );
}
