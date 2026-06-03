import Link from "next/link";
import { UserX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="text-center py-24 animate-fade-in">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-negative-bg flex items-center justify-center mb-6">
        <UserX className="w-7 h-7 text-negative" />
      </div>
      <h2 className="text-xl font-semibold text-text-primary">
        Conductor no encontrado
      </h2>
      <p className="text-sm text-text-tertiary mt-2">
        La cedula ingresada no existe en el sistema.
      </p>
      <Link
        href="/dashboard/conductores"
        className="inline-block mt-8 px-6 py-2.5 bg-text-primary text-gold-400 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
      >
        Volver al buscador
      </Link>
    </div>
  );
}
