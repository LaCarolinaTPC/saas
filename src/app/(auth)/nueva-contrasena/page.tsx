"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Estado = "verificando" | "listo" | "invalido";

/**
 * Destino del enlace de recuperación enviado por correo. Supabase deja la
 * sesión de recuperación en la URL (código PKCE o fragmento) y aquí solo se
 * define la nueva contraseña.
 */
export default function NuevaContrasenaPage() {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [listoParaEntrar, setListoParaEntrar] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // El SDK puede consumir el código de la URL por su cuenta
    // (detectSessionInUrl); este listener cubre ese camino.
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY" || evento === "SIGNED_IN") setEstado("listo");
    });

    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      if (url.searchParams.get("error_description") || hash.get("error_description")) {
        setEstado("invalido");
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error: exError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exError) {
          setEstado("listo");
          return;
        }
        // Si falla puede ser porque el SDK ya lo canjeó: lo confirma la sesión.
      }

      const { data } = await supabase.auth.getSession();
      setEstado(data.session ? "listo" : "invalido");
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

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
      // Ya definió una clave personal: no hay que forzarle otro cambio.
      data: { must_change_password: false },
    });
    if (updError) {
      setError(
        updError.message.includes("different from the old")
          ? "La nueva contraseña debe ser diferente a la actual."
          : "No se pudo actualizar la contraseña. Solicita un enlace nuevo."
      );
      setLoading(false);
      return;
    }

    void fetch("/api/auth/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "cambio_password" }),
    });

    setListoParaEntrar(true);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#EEF2FF]">
            <KeyRound className="h-8 w-8 text-[#4F46E5]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A]">GESTIVO</h1>
          <p className="mt-1 text-sm text-[#64748B]">Nueva contraseña</p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8">
          {estado === "verificando" && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#64748B]">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando el enlace…
            </div>
          )}

          {estado === "invalido" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-[#334155]">
                El enlace no es válido o ya venció.
              </p>
              <p className="text-xs text-[#64748B]">
                Solicita uno nuevo, o pídele a un administrador que te restablezca la
                clave desde el sistema.
              </p>
              <Link
                href="/recuperar-contrasena"
                className="inline-block text-sm font-medium text-[#4F46E5] hover:underline"
              >
                Solicitar un enlace nuevo
              </Link>
            </div>
          )}

          {estado === "listo" && listoParaEntrar && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-[#334155]">
                Tu contraseña quedó actualizada.
              </p>
              <Button
                onClick={() => window.location.assign("/login")}
                className="w-full bg-[#4F46E5] hover:bg-[#4338CA]"
              >
                Iniciar sesión
              </Button>
            </div>
          )}

          {estado === "listo" && !listoParaEntrar && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#334155]">
                  Nueva contraseña
                </Label>
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
                <Label htmlFor="confirmacion" className="text-[#334155]">
                  Confirmar contraseña
                </Label>
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
                {loading ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </form>
          )}

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-1 text-sm text-[#64748B] hover:text-[#4F46E5]"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
