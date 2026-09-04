"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Phone, Copy, Check, IdCard, Bus, Clock, MessageCircle, ExternalLink, UserRound, X, UserPlus, ClipboardList, StickyNote,
} from "lucide-react";
import type { FichaContacto as Ficha } from "@/lib/comunicaciones/ficha";
import { estadoInfo } from "@/lib/contratacion/constants";
import { iniciales, telefonoBonito } from "@/lib/comunicaciones/formato";

const FECHA_LARGA = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });

function fecha(v: string | null): string {
  if (!v) return "—";
  // Las fechas DATE llegan como "YYYY-MM-DD": se formatean sin zona horaria.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? v : FECHA_LARGA.format(d);
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-[11px] text-text-tertiary">{etiqueta}</dt>
      <dd className="min-w-0 truncate text-right text-xs text-text-primary" title={valor ?? undefined}>
        {valor || "—"}
      </dd>
    </div>
  );
}

function Estado({ estado }: { estado: string }) {
  const activo = estado === "ACTIVO";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-text-tertiary"
      }`}
    >
      {activo ? "Activo" : estado.charAt(0) + estado.slice(1).toLowerCase()}
    </span>
  );
}

function Seccion({ titulo, icono, children }: { titulo: string; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        {icono} {titulo}
      </h3>
      {children}
    </section>
  );
}

/**
 * Panel derecho del hilo: quién es el contacto según WhatsApp y a quién
 * corresponde en Gestivo (conductor o propietario, cruzado por teléfono).
 */
export default function FichaContacto({
  ficha,
  ventanaAbierta,
  ultimoEntranteAt,
  onCerrar,
  onCrearCandidato,
}: {
  ficha: Ficha;
  ventanaAbierta: boolean;
  ultimoEntranteAt: string | null;
  onCerrar: () => void;
  onCrearCandidato: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const nombre =
    ficha.conductor?.nombre ?? ficha.propietario?.nombre ?? ficha.proceso?.nombre ?? ficha.nombreWhatsApp;
  const estadoProceso = ficha.proceso ? estadoInfo(ficha.proceso.estado) : null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`+${ficha.telefono}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sin portapapeles (http, permisos): no pasa nada */
    }
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
          <UserRound className="h-3.5 w-3.5 text-text-tertiary" /> Datos del contacto
        </h2>
        <button
          onClick={onCerrar}
          className="rounded-md p-1 text-text-muted hover:bg-slate-100 cursor-pointer"
          aria-label="Ocultar datos del contacto"
          title="Ocultar panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-4 pb-4 pt-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {iniciales(nombre, ficha.telefono)}
          </div>
          <p className="mt-2.5 max-w-full truncate text-sm font-semibold text-text-primary" title={nombre ?? undefined}>
            {nombre ?? "Sin nombre"}
          </p>
          {ficha.nombreWhatsApp && nombre !== ficha.nombreWhatsApp && (
            <p className="max-w-full truncate text-[11px] text-text-tertiary">
              En WhatsApp: {ficha.nombreWhatsApp}
            </p>
          )}
          <button
            onClick={copiar}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-text-secondary hover:bg-slate-50 cursor-pointer"
            title="Copiar número"
          >
            <Phone className="h-3 w-3 text-text-muted" />
            {telefonoBonito(ficha.telefono)}
            {copiado ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-text-muted" />}
          </button>
          <span
            className={`mt-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              ventanaAbierta ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            <Clock className="h-3 w-3" />
            {ventanaAbierta ? "Se le puede escribir libremente" : "Ventana de 24 h cerrada"}
          </span>
        </div>

        {ficha.proceso ? (
          <Seccion titulo="Candidato" icono={<ClipboardList className="h-3 w-3" />}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-text-primary">{ficha.proceso.nombre}</span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: estadoProceso?.bg ?? "#F1F5F9", color: estadoProceso?.color ?? "#64748B" }}
              >
                {estadoProceso?.label ?? ficha.proceso.estado}
              </span>
            </div>
            <dl className="divide-y divide-border/60">
              <Dato etiqueta="Cédula" valor={ficha.proceso.cedula} />
              <Dato etiqueta="Vacante" valor={ficha.proceso.vacante} />
              <Dato etiqueta="Creado" valor={fecha(ficha.proceso.fechaCreacion)} />
              <Dato etiqueta="Origen" valor={ficha.proceso.desdeConversacion ? "Esta conversación" : "Módulo Candidatos"} />
            </dl>
            <Link
              href={`/candidatos?q=${encodeURIComponent(ficha.proceso.cedula)}`}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50"
            >
              Ver proceso de contratación <ExternalLink className="h-3 w-3" />
            </Link>
          </Seccion>
        ) : (
          <Seccion titulo="Candidato" icono={<ClipboardList className="h-3 w-3" />}>
            <p className="mb-2 text-xs leading-relaxed text-text-tertiary">
              Este contacto aún no tiene proceso de contratación.
            </p>
            <button
              onClick={onCrearCandidato}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" /> Crear como candidato
            </button>
          </Seccion>
        )}

        {ficha.conductor ? (
          <Seccion titulo="Conductor" icono={<IdCard className="h-3 w-3" />}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-text-primary">{ficha.conductor.nombre}</span>
              <Estado estado={ficha.conductor.estado} />
            </div>
            <dl className="divide-y divide-border/60">
              <Dato etiqueta="Cédula" valor={ficha.conductor.cedula} />
              <Dato etiqueta="Código" valor={ficha.conductor.codigo} />
              <Dato etiqueta="Tipo" valor={ficha.conductor.tipoConductor} />
              <Dato etiqueta="Ingreso" valor={fecha(ficha.conductor.fechaIngreso)} />
              {ficha.conductor.fechaRetiro && <Dato etiqueta="Retiro" valor={fecha(ficha.conductor.fechaRetiro)} />}
              <Dato etiqueta="Licencia" valor={ficha.conductor.licencia} />
              <Dato etiqueta="Vence licencia" valor={fecha(ficha.conductor.vencLicencia)} />
              <Dato etiqueta="EPS" valor={ficha.conductor.eps} />
              <Dato etiqueta="ARL" valor={ficha.conductor.arl} />
              <Dato etiqueta="Correo" valor={ficha.conductor.correo} />
            </dl>
            {ficha.conductor.observacion && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  <StickyNote className="h-3 w-3" /> Observaciones
                </p>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-amber-900">
                  {ficha.conductor.observacion}
                </p>
              </div>
            )}
            <Link
              href={`/rotacion/conductores/${encodeURIComponent(ficha.conductor.cedula)}`}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50"
            >
              Ver ficha completa <ExternalLink className="h-3 w-3" />
            </Link>
          </Seccion>
        ) : null}

        {ficha.propietario ? (
          <Seccion titulo="Propietario" icono={<Bus className="h-3 w-3" />}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-text-primary">{ficha.propietario.nombre ?? "—"}</span>
              <Estado estado={ficha.propietario.estado} />
            </div>
            <dl className="divide-y divide-border/60">
              <Dato etiqueta="Cédula / NIT" valor={ficha.propietario.cedula} />
              <Dato etiqueta="Código" valor={ficha.propietario.codigo} />
              <Dato etiqueta="Tipo" valor={ficha.propietario.tipoPropietario} />
              <Dato etiqueta="Correo" valor={ficha.propietario.correo} />
            </dl>
          </Seccion>
        ) : null}

        {!ficha.conductor && !ficha.propietario && (
          <Seccion titulo="En Gestivo" icono={<IdCard className="h-3 w-3" />}>
            <p className="text-xs leading-relaxed text-text-tertiary">
              Este número no coincide con el celular de ningún conductor ni propietario registrado.
              Si es un empleado, actualiza su celular en la ficha y aparecerá aquí.
            </p>
          </Seccion>
        )}

        <Seccion titulo="Conversación" icono={<MessageCircle className="h-3 w-3" />}>
          <dl className="divide-y divide-border/60">
            <Dato etiqueta="Primer mensaje" valor={fecha(ficha.desde)} />
            <Dato etiqueta="Último suyo" valor={fecha(ultimoEntranteAt)} />
            <Dato etiqueta="Mensajes" valor={`${ficha.totalMensajes} · ${ficha.entrantes} recibidos, ${ficha.salientes} enviados`} />
          </dl>
        </Seccion>
      </div>
    </aside>
  );
}
