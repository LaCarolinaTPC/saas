import Section from "@/components/rotacion/ui/Section";
import { Users } from "lucide-react";

interface FamiliarRow {
  nombre_familiar: string | null;
  parentesco: string | null;
  edad: number | null;
}

export default function FamiliaSection({
  familia,
}: {
  familia: FamiliarRow[];
}) {
  if (!familia.length) return null;

  return (
    <Section
      icon={<Users className="w-4 h-4" />}
      title="Nucleo Familiar"
      count={familia.length}
    >
      <div className="space-y-3">
        {familia.map((f, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">
                {f.nombre_familiar || "—"}
              </p>
              <p className="text-xs text-text-tertiary mt-0.5">
                {f.parentesco || "—"}
              </p>
            </div>
            {f.edad != null && (
              <span className="text-xs font-medium text-text-tertiary bg-bg px-2 py-0.5 rounded-full">
                {f.edad} anos
              </span>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
