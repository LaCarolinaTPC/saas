"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Cambio obligatorio de contraseña en el primer ingreso (o cuando un
 * administrador asignó una clave provisional). El proxy redirige aquí a
 * cualquier usuario con must_change_password en sus metadatos.
 */
export default function CambiarContrasenaPage() {
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (updError) {
      setError(
        updError.message.includes("different from the old")
          ? "La nueva contraseña debe ser diferente a la actual."
          : "No se pudo actualizar la contraseña. Intenta de nuevo."
      );
      setLoading(false);
      return;
    }

    void fetch("/api/auth/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "cambio_password" }),
    });

    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#EEF2FF]">
            <KeyRound className="h-8 w-8 text-[#4F46E5]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A]">GESTIVO</h1>
          <p className="mt-1 text-sm text-[#64748B]">Cambio obligatorio de contraseña</p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8">
          <p className="mb-6 text-sm text-[#64748B]">
            Por seguridad debes definir tu contraseña personal antes de continuar. Debe ser
            personalizada: no la compartas con nadie.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#334155]">Nueva contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                className="border-[#E2E8F0]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmacion" className="text-[#334155]">Confirmar contraseña</Label>
              <Input
                id="confirmacion"
                type="password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                placeholder="••••••••"
                required
                className="border-[#E2E8F0]"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4F46E5] hover:bg-[#4338CA]"
            >
              {loading ? "Guardando..." : "Guardar y continuar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
