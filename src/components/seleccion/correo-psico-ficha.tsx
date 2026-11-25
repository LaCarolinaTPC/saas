"use client";

/**
 * Correo para la prueba psicosensotécnica en la ficha (24-nov-2026): en qué
 * va (pedido, por confirmar, enviado, confirmado, inscrito) y lo que puede
 * hacer Gestión Humana: pedirlo de nuevo, escribirlo, reenviar el enlace y
 * marcar que ya lo inscribió en la plataforma.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import {
  datosCorreoPsico,
  deshacerInscritoFicha,
  escribirCorreoFicha,
  marcarInscritoFicha,
  pedirCorreoFicha,
  reenviarCorreoFicha,
  type VistaCorreoPsico,
} from "@/app/(dashboard)/candidatos/correo-psico-actions";
import { ESTADOS_CORREO } from "@/lib/seleccion/correo-psico";

// Mismos estilos que las demás secciones de la ficha (seccion-entrega3, que importa este archivo).
const campo = "w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#4F46E5]";
const botonSec = "rounded-md border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const botonPri = "rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50";
const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

const TONO: Record<string, string> = {
  pedido: "bg-amber-50 text-amber-800",
  por_confirmar: "bg-amber-50 text-amber-800",
  enviado: "bg-sky-50 text-sky-800",
  validado: "bg-indigo-50 text-indigo-800",
  inscrito: "bg-emerald-50 text-emerald-700",
};

export function CorreoPsicoFicha({ procesoId }: { procesoId: string }) {
  const router = useRouter();
  const [datos, setDatos] = useState<VistaCorreoPsico | { error: string } | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const [escribir, setEscribir] = useState(false);
  const [correo, setCorreo] = useState("");
  const [confirmado, setConfirmado] = useState(false);

  const recargar = useCallback(() => {
    datosCorreoPsico(procesoId)
      .then(setDatos)
      .catch((e: Error) => setDatos({ error: e.message }));
  }, [procesoId]);
  useEffect(recargar, [recargar]);

  const correr = (accion: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito: string, despues?: () => void) => {
    setMensaje(null);
    enTransicion(async () => {
      const r = await accion().catch((e: Error) => ({ ok: false, error: e.message, aviso: undefined }));
      setMensaje(r.ok ? { texto: r.aviso ? `${exito} ${r.aviso}` : exito, error: false } : { texto: r.error ?? "No se pudo completar.", error: true });
      if (r.ok) {
        despues?.();
        recargar();
        router.refresh();
      }
    });
  };

  if (!datos) return <p className="text-xs text-gray-500">Cargando el correo…</p>;
  if ("error" in datos) return <p className="text-xs text-red-700">{datos.error}</p>;
  if (!datos.disponible) return <p className="text-xs text-gray-500">El correo para la psicosensotécnica se activa al aplicar su migración.</p>;

  const d = datos;
  const editar = d.puedeEditar && !d.cerrado;
  const confirmadoYa = d.estado === "validado" || d.estado === "inscrito";

  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());
  const guardarCorreo = () =>
    correr(
      () => escribirCorreoFicha(procesoId, correo, confirmado),
      confirmado ? "Correo guardado y confirmado." : "Correo guardado: se le envió el enlace para confirmarlo.",
      () => {
        setEscribir(false);
        setCorreo("");
        setConfirmado(false);
      }
    );

  return (
    <div className="rounded-md border border-[#F1F5F9] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
          <Mail className="h-4 w-4" /> Correo para la plataforma
        </p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.estado ? TONO[d.estado] : "bg-gray-100 text-gray-600"}`}>
          {d.estado ? ESTADOS_CORREO[d.estado] : d.cerrado ? "Proceso cerrado: no se pide" : d.enEtapa ? "Todavía no se le ha pedido" : "Se pide al entrar a exámenes · fase 1"}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-sm text-gray-700">
        {d.correo && (
          <p>
            <span className="break-all font-medium">{d.correo}</span>
            {d.validadoAt && (
              <span className="text-xs text-gray-500">
                {" "}
                · confirmado {d.validadoPor === "enlace" ? "por el aspirante en el enlace" : `por ${d.validadoPor ?? "Gestión Humana"}`} el {fechaHora(d.validadoAt)}
              </span>
            )}
          </p>
        )}
        {d.estado === "inscrito" && d.inscritoAt && (
          <p className="text-xs text-emerald-700">
            Inscrito en la plataforma el {fechaHora(d.inscritoAt)}
            {d.inscritoPor ? ` por ${d.inscritoPor}` : ""}. Se le avisó que le llega la información por correo.
          </p>
        )}
        {(d.estado === "pedido" || d.estado === "por_confirmar" || d.estado === "enviado") && (
          <p className="text-xs text-gray-500">
            {d.estado === "enviado" && d.enviadoAt ? `Correo con el enlace enviado el ${fechaHora(d.enviadoAt)}. ` : d.pedidoAt ? `Pedido el ${fechaHora(d.pedidoAt)}. ` : ""}
            Recordatorios: {d.recordatorios} de {d.maxRecordatorios}.
            {d.escaladoAt ? " No respondió a los recordatorios: el chat quedó para una persona." : ""}
          </p>
        )}
        {d.ultimoError && <p className="text-xs text-red-700">Último error al enviar el correo: {d.ultimoError}</p>}
        {!d.smtp && <p className="text-xs text-amber-700">El envío de correos no está configurado (SMTP): el enlace no puede salir.</p>}
        {!d.activo && <p className="text-xs text-gray-500">Pedir el correo está apagado en Tiempos y reglas: no sale nada automático.</p>}
      </div>

      {editar && (
        <div className="mt-3 flex flex-wrap gap-2">
          {d.estado === "validado" && (
            <button type="button" className={botonPri} disabled={ocupado} onClick={() => correr(() => marcarInscritoFicha(procesoId), "Marcado como inscrito.")}>
              Ya lo inscribí en la plataforma
            </button>
          )}
          {d.estado === "inscrito" && (
            <button type="button" className={botonSec} disabled={ocupado} onClick={() => correr(() => deshacerInscritoFicha(procesoId), "Volvió a «confirmado».")}>
              Deshacer «inscrito»
            </button>
          )}
          {d.estado === "enviado" && (
            <button type="button" className={botonSec} disabled={ocupado} onClick={() => correr(() => reenviarCorreoFicha(procesoId), "Correo reenviado con un enlace nuevo.")}>
              Reenviar el correo
            </button>
          )}
          {!confirmadoYa && (
            <button type="button" className={botonSec} disabled={ocupado} onClick={() => correr(() => pedirCorreoFicha(procesoId), d.estado ? "Se le volvió a pedir." : "Listo.")}>
              {d.estado ? "Pedírselo de nuevo" : "Pedírselo ahora"}
            </button>
          )}
          <button type="button" className={botonSec} disabled={ocupado} onClick={() => setEscribir((v) => !v)}>
            {d.correo ? "Cambiar el correo" : "Escribir el correo"}
          </button>
        </div>
      )}

      {editar && escribir && (
        // Un <div> y no un <form>: esta sección va dentro del formulario de la ficha, y un formulario
        // dentro de otro es HTML inválido (al enviarlo también se guardaba la ficha). 25-nov-2026.
        <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-2">
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (correoValido && !ocupado) guardarCorreo();
            }}
            placeholder="nombre@gmail.com"
            className={campo}
          />
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-0.5" />
            Ya lo confirmé con el aspirante (por teléfono o en persona): no enviar el enlace.
          </label>
          <button type="button" className={botonPri} disabled={ocupado || !correoValido} onClick={guardarCorreo}>
            Guardar
          </button>
        </div>
      )}

      {mensaje && <p className={`mt-2 text-xs ${mensaje.error ? "text-red-700" : "text-emerald-700"}`}>{mensaje.texto}</p>}
    </div>
  );
}
