/**
 * Del formulario de la pantalla del agente a su configuración. Puro: lo usan
 * las acciones del agente y el chat de prueba de la selección.
 */
import { CONFIG_POR_DEFECTO, type AgenteConfig, type ModeloVoz, type ModoOpenRouter, type NivelCosto, type Proveedor, type ProveedorVoz } from "./opciones";

export interface AgenteFormulario {
  activo: boolean;
  proveedor: Proveedor;
  modelo: string;
  openrouterModo: ModoOpenRouter;
  openrouterNivelCosto: NivelCosto;
  openrouterModelosPermitidos: string;
  prompt: string;
  mensajeTransferencia: string;
  frasesTransferencia: string;
  mensajesHistorial: number;
  esperaSegundos: number;
  preguntasRequisitos: string;
  documentosRequeridos: string;
  temasReservados: string;
  respuestaReservada: string;
  transferirAlCompletar: boolean;
  intentosSinEntender: number;
  // Opcionales: los chats de prueba guardados en el navegador antes del 21-nov no los traen.
  documentosProveedor?: Proveedor;
  documentosModelo?: string;
  vozProveedor?: ProveedorVoz;
  vozModelo?: ModeloVoz;
}

export function configDesdeFormulario(f: AgenteFormulario): AgenteConfig {
  return {
    activo: f.activo,
    proveedor: f.proveedor,
    modelo: f.modelo.trim() || null,
    openrouterModo: f.openrouterModo,
    openrouterNivelCosto: f.openrouterNivelCosto,
    openrouterModelosPermitidos: f.openrouterModelosPermitidos.trim() || null,
    prompt: f.prompt,
    mensajeTransferencia: f.mensajeTransferencia,
    frasesTransferencia: f.frasesTransferencia,
    mensajesHistorial: f.mensajesHistorial,
    esperaSegundos: f.esperaSegundos,
    preguntasRequisitos: f.preguntasRequisitos,
    documentosRequeridos: f.documentosRequeridos,
    temasReservados: f.temasReservados,
    respuestaReservada: f.respuestaReservada,
    transferirAlCompletar: f.transferirAlCompletar,
    intentosSinEntender: f.intentosSinEntender,
    documentosProveedor: f.documentosProveedor ?? CONFIG_POR_DEFECTO.documentosProveedor,
    documentosModelo: f.documentosProveedor ? f.documentosModelo?.trim() || null : CONFIG_POR_DEFECTO.documentosModelo,
    vozProveedor: f.vozProveedor ?? CONFIG_POR_DEFECTO.vozProveedor,
    vozModelo: f.vozModelo ?? CONFIG_POR_DEFECTO.vozModelo,
  };
}
