export interface Conductor {
  id: string;
  cedula: string;
  nombre: string;
  codigo: string | null;
  correo: string | null;
  direccion: string | null;
  celular: string | null;
  telefono: string | null;
  tipo_conductor: string | null;
  licencia: string | null;
  venc_licencia: string | null;
  venc_contrato: string | null;
  fecha_ingreso: string | null;
  fecha_retiro: string | null;
  fecha_reingreso: string | null;
  experiencia: string | null;
  fecha_nacimiento: string | null;
  observacion: string | null;
  eps: string | null;
  arl: string | null;
  pension: string | null;
  compensacion: string | null;
  tipo_sangre: string | null;
  nivel_educativo: string | null;
  num_hijos: number | null;
  estado_civil: string | null;
  reubicado: string | null;
  estado: string;
}

export interface ConductorConGrupo extends Conductor {
  grupo_antiguedad: string;
  meses_antiguedad: number;
}

export interface CierreDiario {
  id: string;
  cod_conductor: string;
  conductor_nombre: string;
  fecha: string;
  tipo_cierre: string | null;
  ruta: string | null;
  grupo_liquidacion: string | null;
  vehiculo: string | null;
  viajes: number;
  timbradas: number;
  diff_tim: number;
  prom_tim: number;
  pct_indiv: number | null;
  pct_grupo: number | null;
  pct_total: number | null;
  tim_grupo: number | null;
  viajes_grupo: number | null;
  prom_grupo: number | null;
}

export interface ViajePerdido {
  id: string;
  cedula_conductor: string;
  tipologia: string | null;
  novedad: string | null;
  detalle_novedad: string | null;
  fecha: string;
  despacho: string | null;
  vehiculo: string | null;
  placa: string | null;
  conductor_nombre: string | null;
  turno: string | null;
  viaje: string | null;
  ruta: string | null;
  planillero: string | null;
  periodo: string | null;
  quincena: number | null;
}

export interface Ausentismo {
  id: string;
  cedula: string;
  nombre: string | null;
  dias_it_pagados: number | null;
  origen: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  diagnostico: string | null;
  eps: string | null;
  tipo_conductor: string | null;
}

export interface Familiar {
  id: string;
  cedula_empleado: string;
  nombre_familiar: string | null;
  parentesco: string | null;
  edad: number | null;
}

export interface Incentivo {
  id: string;
  cedula: string;
  nombre: string | null;
  mes_entrega: string | null;
  periodo: string | null;
  valor: number;
  concepto: string | null;
}
