"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Autoservicio: el usuario pide un enlace de recuperación a su correo.
 * El correo lo envía Supabase con el SMTP corporativo (@lacarolina.com.co) y
 * apunta a /nueva-contrasena, donde define la clave.
 */
export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/nueva-contrasena` }
    );

    // Se responde igual exista o no la cuenta: así no se revela qué correos
    // están registrados en el sistema.
    if (resetError && resetError.status !== 400) {
      setError("No se pudo enviar el correo. Intenta de nuevo en unos minutos.");
      setLoading(false);
      return;
    }

    void fetch("/api/auth/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "password_recuperacion_solicitada", email }),
    });

    setEnviado(true);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#EEF2FF]">
            <MailCheck className="h-8 w-8 text-[#4F46E5]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A]">GESTIVO</h1>
          <p className="mt-1 text-sm text-[#64748B]">Recuperar contraseña</p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8">
          {enviado ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-[#334155]">
                Si <span className="font-medium">{email}</span> corresponde a un usuario
                registrado, le enviamos un correo con el enlace para crear una nueva
                contraseña.
              </p>
              <p className="text-xs text-[#64748B]">
                El enlace vence en una hora. Revisa también la carpeta de correo no
                deseado. Si no llega, pídele a un administrador que te restablezca la
                clave desde el sistema.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-6 text-sm text-[#64748B]">
                Escribe tu correo y te enviaremos un enlace para crear una nueva
                contraseña.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#334155]">
                    Correo electrónico
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@lacarolina.com.co"
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
                  {loading ? "Enviando..." : "Enviar enlace"}
                </Button>
              </form>
            </>
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
