import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { ExpedienteDetalle } from "@/lib/incapacidades/expedientes";
import {
  PERSONA_FUENTE_LABEL,
  PROCEDENCIA,
  RECIBIDO_DESDE_LABEL,
  cop,
  fechaCorta,
  fechaHora,
} from "@/lib/incapacidades/formato";
import { ChipEstado } from "./bandeja-tabla";

/**
 * Ficha del expediente (plan, pantalla 3), componente puro. Cada bloque dice de
 * dónde sale su información y, cuando falta, dice «pendiente»: nunca un cero
 * ni un «NO» inventado.
 */

function Bloque({
  titulo,
  procedencia,
  children,
  nota,
}: {
  titulo: string;
  procedencia: keyof typeof PROCEDENCIA;
  children: React.ReactNode;
  nota?: string;
}) {
  const p = PROCEDENCIA[procedencia];
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4" style={{ borderTop: `3px solid ${p.color}` }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
        <span className="text-[11px] uppercase tracking-wide" style={{ color: p.color }}>{p.label}</span>
      </div>
      {children}
      {nota && <p className="mt-3 text-xs text-gray-500">{nota}</p>}
    </section>
  );
}

function Dato({ label, valor, pendiente = "pendiente" }: { label: string; valor: React.ReactNode; pendiente?: string }) {
  const vacio = valor == null || valor === "" || valor === "—";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#F1F5F9] py-1.5 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      {vacio ? (
        <span className="text-xs italic text-gray-400">{pendiente}</span>
      ) : (
        <span className="text-right text-sm font-medium tabular-nums text-gray-900">{valor}</span>
      )}
    </div>
  );
}

const ACCION_LABEL: Record<string, string> = {
  expediente_creado: "Expediente creado desde la matriz",
  expediente_alta_manual: "Alta manual",
  expediente_matriz_cambiada: "La matriz cambió después de recibir el expediente",
  expediente_excepcion: "Pasó a excepción",
  expediente_restaurado: "Restaurado",
};

export function ExpedienteFicha({ d }: { d: ExpedienteDetalle }) {
  const v = d.vista;
  const liq = d.liquidaciones.find((l) => l.es_vigente) ?? null;
  const incidencias: string[] = [];
  if (v.persona_fuente === "sin_resolver") incidencias.push("La cédula no está en el maestro de conductores ni en empleados.");
  if (v.pendiente_homologacion) incidencias.push("La entidad o el tipo no coinciden con el catálogo activo: hay que homologarlos.");
  if (v.matriz_cambio_pendiente) incidencias.push("La matriz cambió después de recibir el expediente; revisa el historial.");
  if (v.matriz_eliminada_at) incidencias.push("La incapacidad está eliminada en la matriz EPS.");
  if (v.estado === "excepcion" && v.motivo_excepcion) incidencias.push(v.motivo_excepcion);

  return (
    <div className="space-y-4">
      {incidencias.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Requiere atención</p>
          <ul className="mt-1 list-disc pl-6">
            {incidencias.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Bloque titulo="Incapacidad en la matriz EPS" procedencia="recibido"
          nota="Solo lectura. Si un dato está mal se corrige en la matriz y el expediente recibe el cambio.">
          <Dato label="Trabajador" valor={v.nombre} pendiente="sin nombre" />
          <Dato label="Cédula" valor={v.cedula} />
          <Dato label="Cargo" valor={[v.cargo, v.tipo_conductor].filter(Boolean).join(" · ") || null} pendiente="—" />
          <Dato label="Consecutivo" valor={v.consecutivo_incapacidad} pendiente="—" />
          <Dato label="Inicio → fin" valor={`${fechaCorta(v.fecha_inicio)} → ${fechaCorta(v.fecha_fin)}`} />
          <Dato label="Días de incapacidad" valor={v.dias_incapacidad} />
          <Dato label="Tipo (origen)" valor={v.origen} pendiente="—" />
          <Dato label="Modalidad" valor={v.indicador_prorroga} pendiente="—" />
          <Dato label="Pagador recibido" valor={v.pagador_recibido} pendiente="sin pagador" />
          <Dato label="Diagnóstico" valor={[v.cie10, v.diagnostico].filter(Boolean).join(" · ") || null} pendiente="—" />
          <div className="mt-3 text-xs">
            <Link href="/ausentismo?tab=matriz" className="text-[#0F766E] underline">Abrir la matriz EPS</Link>
          </div>
        </Bloque>

        <Bloque titulo="Homologación" procedencia="homologado"
          nota="Automática solo cuando el nombre o el código coinciden exactamente con el catálogo activo.">
          <Dato label="Persona" valor={v.persona_fuente ? PERSONA_FUENTE_LABEL[v.persona_fuente] : null} />
          <Dato label="Entidad" valor={v.entidad_nombre} pendiente="pendiente de homologar" />
          <Dato label="Clase" valor={v.entidad_clase} pendiente="—" />
          <Dato label="NIT" valor={v.entidad_nit} pendiente="sin NIT en el catálogo" />
          <Dato label="Umbral de días cobrables" valor={v.entidad_dias_min_cobro != null ? `${v.entidad_dias_min_cobro} d` : null} pendiente="sin umbral" />
          <Dato label="Tipo homologado" valor={v.tipo_homologado} pendiente="pendiente de homologar" />
          <Dato label="Cobrable" valor={v.cobrable ? "Sí" : "No, por debajo del umbral"} />
        </Bloque>

        <Bloque titulo="Datos completados por RRHH" procedencia="completado"
          nota="Se diligencian en la etapa 2 (fase 3 del plan). El salario nunca se toma solo del maestro.">
          <Dato label="Responsable" valor={v.responsable_email} />
          <Dato label="Salario base" valor={v.salario_base != null ? cop(v.salario_base) : null} />
          <Dato label="Vigencia del salario" valor={v.salario_vigencia_desde ? fechaCorta(v.salario_vigencia_desde) : null} />
          <Dato label="Fuente del salario" valor={v.salario_fuente === "manual" ? "Diligenciado a mano" : v.salario_fuente === "employees" ? "Sugerencia de empleados aceptada" : null} />
          <Dato label="Modalidad ajustada" valor={v.modalidad_ajustada} pendiente="sin ajuste" />
          <Dato label="Próxima acción" valor={v.proxima_accion ? `${v.proxima_accion}${v.proxima_accion_fecha ? ` · ${fechaCorta(v.proxima_accion_fecha)}` : ""}` : null} />
        </Bloque>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Bloque titulo="Liquidación vigente" procedencia="calculado"
          nota={liq ? `Regla ${liq.regla_codigo} · calculada ${fechaHora(liq.calculado_at)}${liq.calculado_por_email ? ` por ${liq.calculado_por_email}` : ""}.` : "Todavía no hay liquidación: exige salario diligenciado y homologaciones resueltas."}>
          <Dato label="Días a cargo de la entidad" valor={liq?.dias_entidad ?? null} pendiente="sin liquidar" />
          <Dato label="Días a cargo de la empresa (histórico)" valor={liq?.dias_empresa ?? null} pendiente="sin liquidar" />
          <Dato label="Factor" valor={liq ? String(liq.factor).replace(".", ",") : null} pendiente="sin liquidar" />
          <Dato label="Valor total de la incapacidad" valor={liq ? cop(liq.valor_total) : null} pendiente="sin liquidar" />
          <Dato label="Valor reconocido por la entidad" valor={liq ? cop(liq.valor_entidad) : null} pendiente="sin liquidar" />
          <Dato label="Valor empresa (distribución histórica)" valor={liq ? cop(liq.valor_empresa) : null} pendiente="sin liquidar" />
          {v.dias_entidad_ajustados != null && (
            <Dato label="Días a cargo · ajustado a mano" valor={v.dias_entidad_ajustados} />
          )}
          {v.valor_reclamado_ajustado != null && (
            <Dato label="Valor reclamado · ajustado a mano" valor={cop(v.valor_reclamado_ajustado)} />
          )}
          <Dato label="Valor reclamado" valor={v.valor_reclamado != null ? cop(v.valor_reclamado) : null} pendiente="pendiente" />
        </Bloque>

        <Bloque titulo="Ajustes a la liquidación" procedencia="completado"
          nota="Cada ajuste guarda campo, valor anterior, nuevo y motivo. Al cierre del piloto se cuenta por campo y por entidad.">
          {d.ajustes.length === 0 ? (
            <p className="text-xs italic text-gray-400">Sin ajustes.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.ajustes.map((a) => (
                <li key={a.id} className="rounded-lg bg-[#F8FAFC] p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900">{a.campo}</span>
                    <span className="text-xs text-gray-500">{a.nivel}</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    {JSON.stringify(a.valor_anterior)} → {JSON.stringify(a.valor_nuevo)}
                  </div>
                  <div className="text-xs text-gray-500">{a.motivo} · {a.ajustado_por_email} · {fechaHora(a.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Soportes" procedencia="completado" nota="Bucket privado; se sirven con enlace firmado desde el servidor.">
          {d.adjuntos.length === 0 ? (
            <p className="text-xs italic text-gray-400">Sin soportes.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.adjuntos.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-gray-900">{a.archivo_nombre}</span>
                  <span className="shrink-0 text-xs text-gray-500">{a.relacionado_tipo} · {fechaCorta(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Historial</h3>
          <span className="text-xs text-gray-500">
            Recibido {fechaHora(v.recibido_at)} · {RECIBIDO_DESDE_LABEL[v.recibido_desde] ?? v.recibido_desde}
            {v.alta_manual_motivo ? ` · motivo: ${v.alta_manual_motivo}` : ""} · versión {v.version}
          </span>
        </div>
        {d.bitacora.length === 0 ? (
          <p className="text-xs italic text-gray-400">Sin movimientos.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {d.bitacora.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[#F1F5F9] pb-2 last:border-0">
                <span className="w-32 shrink-0 text-xs tabular-nums text-gray-500">{fechaHora(b.created_at)}</span>
                <span className="font-medium text-gray-900">{ACCION_LABEL[b.accion] ?? b.accion}</span>
                {b.user_email && <span className="text-xs text-gray-500">{b.user_email}</span>}
                {b.datos_nuevos != null && (
                  <code className="block w-full break-all text-[11px] text-gray-500">{JSON.stringify(b.datos_nuevos)}</code>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Estado:</span> <ChipEstado estado={v.estado} />
        {v.observaciones && <span>· Observaciones: {v.observaciones}</span>}
      </div>
    </div>
  );
}
