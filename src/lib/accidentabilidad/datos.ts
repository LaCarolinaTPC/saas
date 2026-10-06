// Lectura de catálogos y armado de filas del formato de accidentes (servidor).

import { createAdminClient } from "@/lib/supabase/admin";
import {
  flagsDesdeCodigos,
  type CatalogoItem,
  type Catalogos,
  type FormatoPayload,
  type SiNo,
} from "./formato";

type Admin = ReturnType<typeof createAdminClient>;

/** Catálogos del módulo agrupados por tipo; por defecto solo los activos. */
export async function getCatalogosAccidente(opts: { incluirInactivos?: boolean } = {}): Promise<Catalogos> {
  const admin = createAdminClient();
  let q = admin
    .from("accidente_catalogos")
    .select("id, tipo, codigo, label, categoria, factor_politica, orden, activo")
    .order("orden", { ascending: true })
    .order("codigo", { ascending: true });
  if (!opts.incluirInactivos) q = q.eq("activo", true);
  const { data } = await q;
  const out: Catalogos = { ciudad: [], factor: [], tipo_vehiculo: [], aseguradora: [] };
  for (const row of (data ?? []) as CatalogoItem[]) out[row.tipo]?.push(row);
  return out;
}

const txt = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};
const siNo = (v: unknown): SiNo => (v === true || v === false ? v : null);

/**
 * Columnas de `accidentes` que vienen del formato, más las banderas fact_*
 * de la Política de Correctivos derivadas de los códigos marcados.
 */
export async function columnasFormato(admin: Admin, f: Partial<FormatoPayload>) {
  const vp = f.vehiculo_propio;
  const codigos = Array.isArray(f.factores_codigos)
    ? [...new Set(f.factores_codigos.filter((c): c is string => typeof c === "string"))]
    : [];

  // Se consultan todos los factores (también inactivos) para respetar el
  // mapeo de un código que se desactivó después de marcarlo.
  const { data: factores } = await admin
    .from("accidente_catalogos")
    .select("codigo, factor_politica")
    .eq("tipo", "factor");
  const flags = flagsDesdeCodigos(codigos, factores ?? [], Boolean(f.uso_celular));

  const velocidad = Number(String(vp?.velocidad ?? "").replace(",", "."));
  const agente = f.agente;

  return {
    flags,
    columnas: {
      vehiculo_codigo: txt(vp?.codigo),
      vehiculo_placa: txt(vp?.placa)?.toUpperCase() ?? null,
      vehiculo_ruta: txt(vp?.ruta),
      vehiculo_empresa: siNo(vp?.empresa),
      vehiculo_afiliado: siNo(vp?.afiliado),
      inmovilizacion: siNo(vp?.inmovilizacion),
      transaccion: siNo(vp?.transaccion),
      tiene_fotos: siNo(vp?.tiene_fotos),
      tiene_ipat: siNo(vp?.tiene_ipat),
      ipat_numero: vp?.tiene_ipat ? txt(vp?.ipat_numero) : null,
      huella_frenado: txt(vp?.huella_frenado),
      huella_arrastre: txt(vp?.huella_arrastre),
      velocidad_kmh: vp?.velocidad && Number.isFinite(velocidad) ? velocidad : null,
      factores_codigos: codigos,
      agente_nombre: txt(agente?.nombre),
      agente_placa: txt(agente?.placa),
      agente_celular: txt(agente?.celular),
      fact_exceso_velocidad: flags.exceso_velocidad,
      fact_uso_celular: flags.uso_celular,
      fact_no_distancia: flags.no_guardar_distancia,
      fact_fatiga: flags.fatiga_comprobada,
    },
  };
}

/**
 * Reemplaza los vehículos del tercero y las víctimas del accidente. El
 * vehículo propio vive en columnas de `accidentes`; aquí solo se guardan
 * los terceros (es_propio = false).
 */
export async function guardarTercerosYVictimas(admin: Admin, accidenteId: string, f: Partial<FormatoPayload>) {
  const terceros = (f.terceros ?? [])
    .filter((t) => t.placa?.trim() || t.descripcion?.trim() || t.conductor_nombre?.trim())
    .map((t) => ({
      accidente_id: accidenteId,
      es_propio: false,
      placa: txt(t.placa)?.toUpperCase() ?? null,
      descripcion: txt(t.descripcion),
      clase_vehiculo: txt(t.clase_vehiculo),
      tipo_vehiculo: txt(t.tipo_vehiculo),
      color: txt(t.color),
      modelo: txt(t.modelo),
      conductor_nombre: txt(t.conductor_nombre),
      conductor_cedula: txt(t.conductor_cedula),
      conductor_celular: txt(t.conductor_celular),
      conductor_direccion: txt(t.conductor_direccion),
      propietario_nombre: txt(t.propietario_nombre),
      propietario_telefono: txt(t.propietario_telefono),
      propietario_direccion: txt(t.propietario_direccion),
      aseguradora: txt(t.aseguradora),
      afiliado_a: txt(t.afiliado_a),
    }));
  const victimas = (f.victimas ?? [])
    .filter((v) => v.nombre?.trim())
    .map((v) => ({
      accidente_id: accidenteId,
      nombre: v.nombre.trim(),
      cedula: txt(v.cedula),
      direccion: txt(v.direccion),
      municipio: txt(v.municipio),
      telefono: txt(v.telefono),
      condicion: txt(v.condicion),
      fallecido: Boolean(v.fallecido),
    }));

  await admin.from("accidente_vehiculos").delete().eq("accidente_id", accidenteId);
  if (terceros.length > 0) {
    const { error } = await admin.from("accidente_vehiculos").insert(terceros);
    if (error) throw new Error(`No se pudieron guardar los vehículos del tercero: ${error.message}`);
  }
  await admin.from("accidente_victimas").delete().eq("accidente_id", accidenteId);
  if (victimas.length > 0) {
    const { error } = await admin.from("accidente_victimas").insert(victimas);
    if (error) throw new Error(`No se pudieron guardar los lesionados: ${error.message}`);
  }
}
