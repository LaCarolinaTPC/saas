import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Phone, Mail, MapPin, IdCard, HeartPulse, Briefcase, User,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateBogota } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface ConductorFicha {
  id: string;
  cedula: string;
  nombre: string;
  codigo: string | null;
  correo: string | null;
  direccion: string | null;
  celular: string | null;
  telefono: string | null;
  tipo_conductor: string | null;
  licencia: string | null;
  venc_licencia: string | null;
  venc_contrato: string | null;
  fecha_ingreso: string | null;
  fecha_retiro: string | null;
  experiencia: string | null;
  fecha_nacimiento: string | null;
  observacion: string | null;
  eps: string | null;
  arl: string | null;
  pension: string | null;
  compensacion: string | null;
  tipo_sangre: string | null;
  nivel_educativo: string | null;
  num_hijos: number | null;
  estado_civil: string | null;
  reubicado: string | null;
  estado: string | null;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function estadoStyle(estado: string | null): { bg: string; color: string } {
  const e = (estado ?? "").toUpperCase();
  if (e === "ACTIVO") return { bg: "#DCFCE7", color: "#166534" };
  if (e === "RETIRADO") return { bg: "#FEE2E2", color: "#EF4444" };
  return { bg: "#F1F5F9", color: "#64748B" };
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-800">{value ?? "—"}</p>
    </div>
  );
}

function Section({
  icon: Icon, title, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-[#4F46E5]" />
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

export default async function ConductorFichaPage({
  params,
}: {
  params: Promise<{ cedula: string }>;
}) {
  const { cedula } = await params;
  const supabase = createAdminClient();

  const { data: c } = await supabase
    .from("conductores")
    .select("*")
    .eq("cedula", cedula)
    .maybeSingle<ConductorFicha>();

  if (!c) notFound();

  const st = estadoStyle(c.estado);
  const fmt = (d: string | null) => (d ? formatDateBogota(d) : "—");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/conductores"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[#4F46E5]"
          >
            <ArrowLeft className="h-4 w-4" /> Conductores
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {/* Encabezado */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#4F46E5]/10 text-lg font-semibold text-[#4F46E5]">
            {getInitials(c.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-gray-900">{c.nombre}</h1>
            <p className="text-sm text-gray-500">
              C.C. {c.cedula}
              {c.codigo ? ` · Cód. ${c.codigo}` : ""}
              {c.tipo_conductor ? ` · ${c.tipo_conductor}` : ""}
            </p>
          </div>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: st.bg, color: st.color }}
          >
            {c.estado ?? "—"}
          </span>
        </div>

        <Section icon={Phone} title="Contacto">
          <Field label="Celular" value={c.celular} />
          <Field label="Teléfono" value={c.telefono} />
          <Field
            label="Correo"
            value={
              c.correo ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-gray-400" /> {c.correo}
                </span>
              ) : null
            }
          />
          <Field
            label="Dirección"
            value={
              c.direccion ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" /> {c.direccion}
                </span>
              ) : null
            }
          />
        </Section>

        <Section icon={Briefcase} title="Información laboral">
          <Field label="Cargo" value={c.tipo_conductor} />
          <Field label="Fecha de ingreso" value={fmt(c.fecha_ingreso)} />
          <Field label="Fecha de retiro" value={fmt(c.fecha_retiro)} />
          <Field label="Experiencia" value={c.experiencia} />
          <Field label="Vencimiento contrato" value={fmt(c.venc_contrato)} />
          <Field label="Reubicado" value={c.reubicado} />
        </Section>

        <Section icon={IdCard} title="Licencia">
          <Field label="Licencia" value={c.licencia} />
          <Field label="Vencimiento licencia" value={fmt(c.venc_licencia)} />
        </Section>

        <Section icon={HeartPulse} title="Seguridad social">
          <Field label="EPS" value={c.eps} />
          <Field label="ARL" value={c.arl} />
          <Field label="Pensión" value={c.pension} />
          <Field label="Caja de compensación" value={c.compensacion} />
        </Section>

        <Section icon={User} title="Datos personales">
          <Field label="Fecha de nacimiento" value={fmt(c.fecha_nacimiento)} />
          <Field label="Estado civil" value={c.estado_civil} />
          <Field label="Hijos" value={c.num_hijos ?? "—"} />
          <Field label="Tipo de sangre" value={c.tipo_sangre} />
          <Field label="Nivel educativo" value={c.nivel_educativo} />
        </Section>

        {c.observacion && (
          <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Observaciones</h2>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{c.observacion}</p>
          </section>
        )}
      </div>
    </div>
  );
}
