import { Loader2 } from "lucide-react";

export default function RendimientoLoading() {
  return (
    <div className="max-w-6xl mx-auto pt-16 text-center animate-fade-in">
      <Loader2 className="w-8 h-8 animate-spin text-text-muted mx-auto mb-4" />
      <p className="text-sm text-text-tertiary">Cargando datos de rendimiento...</p>
    </div>
  );
}
