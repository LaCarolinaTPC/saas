"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Auditoría: intento fallido (no bloquea el flujo de login).
      void fetch("/api/auth/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "login_fallido", email }),
      });
      setError("Credenciales inválidas. Verifica tu correo y contraseña.");
      setLoading(false);
      return;
    }

    void fetch("/api/auth/evento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "login_exitoso", email }),
    });

    // Primer ingreso (o clave asignada por un administrador): cambio
    // obligatorio de contraseña antes de entrar al sistema.
    // Navegación con recarga completa: limpia el caché del router y evita
    // que aparezca la pantalla donde quedó la sesión anterior.
    if (data.user?.user_metadata?.must_change_password) {
      window.location.assign("/cambiar-contrasena");
      return;
    }

    window.location.assign("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#EEF2FF]">
            <ShieldCheck className="h-8 w-8 text-[#4F46E5]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A]">GESTIVO</h1>
          <p className="mt-1 text-sm text-[#64748B]">Sistema de Gestión de Talento</p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8">
          <h2 className="mb-6 text-center text-lg font-semibold text-[#0F172A]">
            Iniciar Sesión
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#334155]">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                required
                className="border-[#E2E8F0]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#334155]">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {loading ? "Ingresando..." : "Iniciar Sesión"}
            </Button>
          </form>

          <Link
            href="/recuperar-contrasena"
            className="mt-4 block text-center text-sm text-[#64748B] hover:text-[#4F46E5]"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>
    </div>
  );
}
