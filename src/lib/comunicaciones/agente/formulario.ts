/**
 * Del formulario de la pantalla del agente a su configuración. Puro: lo usan
 * las acciones del agente y el chat de prueba de la selección.
 */
import type { AgenteConfig, ModoOpenRouter, NivelCosto, Proveedor } from "./opciones";

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
  };
}
