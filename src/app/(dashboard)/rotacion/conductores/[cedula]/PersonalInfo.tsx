import Section from "@/components/rotacion/ui/Section";
import { User } from "lucide-react";
import { formatDate } from "@/lib/rotacion/utils/format";
import type { ConductorConGrupo } from "@/types/rotacion";

export default function PersonalInfo({
  conductor: c,
}: {
  conductor: ConductorConGrupo;
}) {
  const fields = [
    ["Celular", c.celular],
    ["Correo", c.correo],
    ["Direccion", c.direccion],
    ["Telefono", c.telefono],
    ["Tipo Conductor", c.tipo_conductor],
    ["Fecha Ingreso", formatDate(c.fecha_ingreso)],
    ["Licencia", c.licencia],
    ["Venc. Licencia", formatDate(c.venc_licencia)],
    ["Venc. Contrato", formatDate(c.venc_contrato)],
    ["EPS", c.eps],
    ["ARL", c.arl],
    ["Pension", c.pension],
    ["Compensacion", c.compensacion],
    ["Tipo Sangre", c.tipo_sangre],
    ["Nivel Educativo", c.nivel_educativo],
    ["Estado Civil", c.estado_civil],
    ["Num. Hijos", c.num_hijos],
    ["Fecha Nacimiento", formatDate(c.fecha_nacimiento)],
    ["Observacion", c.observacion],
  ].filter(([, v]) => v != null && v !== "—" && v !== "");

  return (
    <Section icon={<User className="w-4 h-4" />} title="Datos Personales">
      <div className="divide-y divide-border-subtle">
        {fields.map(([label, val]) => (
          <div
            key={label as string}
            className="flex items-center justify-between py-3"
          >
            <span className="text-sm text-text-tertiary">
              {label as string}
            </span>
            <span className="text-sm font-medium text-text-primary text-right ml-4 truncate max-w-[180px]">
              {String(val)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
