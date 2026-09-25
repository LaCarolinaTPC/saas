"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Copy, KeyRound, Loader2, RotateCcw, UserPlus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import type { AccesoResumen, CuentaResumen } from "@/lib/portal-afiliados/cuentas";
import { cambiarEstadoCuentaPortal, crearCuentaPortal, restablecerClavePortal } from "./actions";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const botonCls =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50";

const EVENTO: Record<string, string> = {
  ingreso: "Ingresó", ingreso_fallido: "Intento fallido", ingreso_bloqueado: "Intento con la cuenta bloqueada",
  salida: "Salió", cambio_clave: "Cambió su contraseña", consulta: "Consultó", exportacion: "Descargó Excel",
  cuenta_creada: "Cuenta creada", clave_restablecida: "Clave restablecida", cuenta_desactivada: "Cuenta desactivada",
  cuenta_reactivada: "Cuenta reactivada",
};

const fechaHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
    : "—";

/**
 * Cuentas del portal de afiliados de un propietario: crear, restablecer la
 * clave provisional y desactivar. La clave se muestra una sola vez.
 */
export function CuentasPortal({ cedula, nombre, disponible, puedeGestionar, cuentas, accesos }: {
  cedula: string;
  nombre: string | null;
  disponible: boolean;
  puedeGestionar: boolean;
  cuentas: CuentaResumen[];
  accesos: AccesoResumen[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [creando, setCreando] = useState(false);
  const [clave, setClave] = useState<{ para: string; clave: string } | null>(null);
  const [pendiente, start] = useTransition();

  const ejecutar = (fn: () => Promise<void>) =>
    start(async () => {
      try { await fn(); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo completar la acción"); }
    });

  function crear() {
    ejecutar(async () => {
      const r = await crearCuentaPortal(cedula, email, nombre ?? "");
      if (!r.ok) { toast.error(r.error); return; }
      setClave({ para: email.trim().toLowerCase(), clave: r.clave });
      setEmail("");
      setCreando(false);
      toast.success("Cuenta creada");
    });
  }
  function restablecer(c: CuentaResumen) {
    if (!window.confirm(`¿Restablecer la contraseña de ${c.email}?\n\nSe cierran sus sesiones abiertas y deberá cambiarla al ingresar.`)) return;
    ejecutar(async () => {
      const r = await restablecerClavePortal(c.id);
      if (!r.ok) { toast.error(r.error); return; }
      setClave({ para: c.email, clave: r.clave });
    });
  }
  function cambiarEstado(c: CuentaResumen) {
    const accion = c.activo ? "desactivar" : "reactivar";
    if (!window.confirm(`¿${accion[0].toUpperCase()}${accion.slice(1)} la cuenta ${c.email}?`)) return;
    ejecutar(async () => {
      const r = await cambiarEstadoCuentaPortal(c.id, !c.activo);
      if (!r.ok) toast.error(r.error);
      else toast.success(c.activo ? "Cuenta desactivada" : "Cuenta reactivada");
    });
  }

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <UserRound className="h-4 w-4 text-gray-500" /> Acceso al portal de afiliados
        </h2>
        {disponible && puedeGestionar && !creando && (
          <button type="button" onClick={() => setCreando(true)} className={botonCls}>
            <UserPlus className="h-3.5 w-3.5" /> Crear cuenta
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        El afiliado entra en <code>/portal-afiliados</code> con su correo y solo ve la liquidación de sus vehículos, en los
        días en que GEMA los liquidó a su nombre.
      </p>

      {!disponible && (
        <p className="mt-3 text-xs text-[#92400E]">Falta aplicar la migración 20260925203623 para crear cuentas.</p>
      )}

      {creando && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF]/40 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            Correo del afiliado
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@dominio.com" className={`${inputCls} w-72`} />
          </label>
          <button type="button" onClick={crear} disabled={pendiente || !email.includes("@")}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50">
            {pendiente && <Loader2 className="h-4 w-4 animate-spin" />} Crear y generar clave
          </button>
          <button type="button" onClick={() => setCreando(false)} className={botonCls}><X className="h-3.5 w-3.5" /> Cancelar</button>
        </div>
      )}

      {clave && (
        <div className="mt-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3">
          <p className="text-xs font-semibold text-[#92400E]">Clave provisional de {clave.para}</p>
          <p className="mt-0.5 text-[11px] text-[#B45309]">
            Anótela y entréguesela ahora: al cerrar este aviso no se puede volver a ver. Deberá cambiarla al ingresar.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="select-all font-mono text-lg font-bold tracking-wider text-[#0F172A]">{clave.clave}</span>
            <button type="button" className={botonCls}
              onClick={() => navigator.clipboard.writeText(clave.clave).then(() => toast.success("Clave copiada"), () => toast.error("Cópiela a mano"))}>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </button>
            <button type="button" onClick={() => setClave(null)} className={botonCls}><X className="h-3.5 w-3.5" /> Ya la entregué</button>
          </div>
        </div>
      )}

      {cuentas.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-3">Correo</th>
                <th className="py-1.5 pr-3">Estado</th>
                <th className="py-1.5 pr-3">Último ingreso</th>
                <th className="py-1.5 pr-3">Creada</th>
                {puedeGestionar && <th className="py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => {
                const bloqueada = c.bloqueadoHasta && new Date(c.bloqueadoHasta) > new Date();
                return (
                  <tr key={c.id} className="border-b border-[#F1F5F9]">
                    <td className="py-1.5 pr-3 text-gray-900">{c.email}</td>
                    <td className="py-1.5 pr-3 text-xs">
                      {!c.activo ? <span className="text-[#B91C1C]">Desactivada</span>
                        : bloqueada ? <span className="text-[#92400E]">Bloqueada por intentos</span>
                        : c.debeCambiarClave ? <span className="text-[#92400E]">Clave provisional sin cambiar</span>
                        : <span className="text-[#047857]">Activa</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-gray-600">{fechaHora(c.ultimoIngresoAt)}</td>
                    <td className="py-1.5 pr-3 text-xs text-gray-600">{fechaHora(c.createdAt)}{c.createdPorEmail ? ` · ${c.createdPorEmail}` : ""}</td>
                    {puedeGestionar && (
                      <td className="py-1.5">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => restablecer(c)} disabled={pendiente} className={botonCls}>
                            <KeyRound className="h-3.5 w-3.5" /> Restablecer clave
                          </button>
                          <button type="button" onClick={() => cambiarEstado(c)} disabled={pendiente}
                            className={`${botonCls} ${c.activo ? "text-[#B91C1C]" : "text-[#047857]"}`}>
                            {c.activo ? <Ban className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            {c.activo ? "Desactivar" : "Reactivar"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : disponible && (
        <p className="mt-3 text-sm text-gray-500">Este afiliado todavía no tiene cuenta en el portal.</p>
      )}

      {accesos.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-600">Últimos movimientos ({accesos.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            {accesos.map((a, i) => (
              <li key={i}>
                {fechaHora(a.createdAt)} · {EVENTO[a.evento] ?? a.evento}
                {a.actorEmail ? ` · por ${a.actorEmail}` : ""}{a.ip ? ` · IP ${a.ip}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
