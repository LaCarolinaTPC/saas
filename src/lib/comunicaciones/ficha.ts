/**
 * Ficha del contacto que se muestra al lado derecho del hilo: lo que sabemos
 * del número por WhatsApp y a quién corresponde en Gestivo (conductor o
 * propietario), cruzando por teléfono. Meta entrega el número en E.164 sin
 * "+" (573001234567); en conductores/propietarios está a 10 dígitos y a
 * veces con guiones o espacios, así que se compara por dígitos.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface ConductorFicha {
  cedula: string;
  nombre: string;
  codigo: string | null;
  estado: string;
  tipoConductor: string | null;
  fechaIngreso: string | null;
  fechaRetiro: string | null;
  licencia: string | null;
  vencLicencia: string | null;
  correo: string | null;
  eps: string | null;
  arl: string | null;
  celular: string | null;
}

export interface PropietarioFicha {
  cedula: string;
  nombre: string | null;
  codigo: string | null;
  estado: string;
  tipoPropietario: string | null;
  correo: string | null;
  celular: string | null;
}

export interface FichaContacto {
  telefono: string;
  nombreWhatsApp: string | null;
  /** Primer mensaje registrado con este número. */
  desde: string | null;
  totalMensajes: number;
  entrantes: number;
  salientes: number;
  conductor: ConductorFicha | null;
  propietario: PropietarioFicha | null;
}

const soloDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Dos teléfonos son el mismo si coinciden sus últimos 10 dígitos (línea sin indicativo). */
function mismoTelefono(a: string | null | undefined, b: string): boolean {
  const da = soloDigitos(a);
  const db = soloDigitos(b);
  if (da.length < 7 || db.length < 7) return false;
  return da.slice(-10) === db.slice(-10);
}

export async function getFichaContacto(conversacionId: string): Promise<FichaContacto | null> {
  const db = createAdminClient();
  const { data: conv } = await db
    .from("wa_conversaciones")
    .select("id, wa_contactos(telefono, nombre)")
    .eq("id", conversacionId)
    .maybeSingle();
  if (!conv) return null;
  const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as {
    telefono: string; nombre: string | null;
  } | null;
  if (!contacto) return null;

  const telefono = contacto.telefono;
  // Los últimos 7 dígitos casi siempre van seguidos aunque haya guiones
  // ("315-6537195"); el filtro trae candidatos y en memoria se confirma.
  const cola = soloDigitos(telefono).slice(-7);
  const patron = `%${cola}%`;

  const [msjs, conds, props] = await Promise.all([
    db
      .from("wa_mensajes")
      .select("direccion, timestamp")
      .eq("conversacion_id", conversacionId)
      .order("timestamp", { ascending: true })
      .limit(2000),
    db
      .from("conductores")
      .select(
        "cedula, nombre, codigo, estado, tipo_conductor, fecha_ingreso, fecha_retiro, licencia, venc_licencia, correo, eps, arl, celular, telefono"
      )
      .or(`celular.ilike.${patron},telefono.ilike.${patron}`)
      .limit(10),
    db
      .from("propietarios")
      .select("cedula, nombre, codigo, estado, tipo_propietario, correo, celular, telefono")
      .or(`celular.ilike.${patron},telefono.ilike.${patron}`)
      .limit(10),
  ]);

  const mensajes = msjs.data ?? [];
  const entrantes = mensajes.filter((m) => m.direccion === "entrante").length;

  // Si varios coinciden, preferir el activo.
  const porEstado = <T extends { estado: string }>(xs: T[]) =>
    [...xs].sort((a, b) => Number(b.estado === "ACTIVO") - Number(a.estado === "ACTIVO"))[0] ?? null;

  const c = porEstado(
    (conds.data ?? []).filter((x) => mismoTelefono(x.celular, telefono) || mismoTelefono(x.telefono, telefono))
  );
  const p = porEstado(
    (props.data ?? []).filter((x) => mismoTelefono(x.celular, telefono) || mismoTelefono(x.telefono, telefono))
  );

  return {
    telefono,
    nombreWhatsApp: contacto.nombre,
    desde: mensajes[0]?.timestamp ?? null,
    totalMensajes: mensajes.length,
    entrantes,
    salientes: mensajes.length - entrantes,
    conductor: c
      ? {
          cedula: c.cedula,
          nombre: c.nombre,
          codigo: c.codigo,
          estado: c.estado,
          tipoConductor: c.tipo_conductor,
          fechaIngreso: c.fecha_ingreso,
          fechaRetiro: c.fecha_retiro,
          licencia: c.licencia,
          vencLicencia: c.venc_licencia,
          correo: c.correo,
          eps: c.eps,
          arl: c.arl,
          celular: c.celular,
        }
      : null,
    propietario: p
      ? {
          cedula: p.cedula,
          nombre: p.nombre,
          codigo: p.codigo,
          estado: p.estado,
          tipoPropietario: p.tipo_propietario,
          correo: p.correo,
          celular: p.celular,
        }
      : null,
  };
}
