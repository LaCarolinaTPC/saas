"use client";

/**
 * Lo que pide una etapa al arrastrar la tarjeta hacia adelante en el tablero
 * (24-nov-2026). Va arriba de la ficha: muestra el paso que toca, lo hace con
 * las mismas acciones de siempre (citas, mensajes, orden al laboratorio) y, si
 * la columna está a varios pasos, sigue con el siguiente hasta llegar.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { estadoInfo } from "@/lib/contratacion/constants";
import { fechaEnTexto, horaEnTexto } from "@/lib/seleccion/agenda";
import { siguientePaso, type EtapaConPaso } from "@/lib/seleccion/mover-tablero";
import {
  estadoParaPaso, faseAptaDesdeFicha, llegoALaPrueba, pasarAAntecedentes, pasarAEscuela, pasarAExamenesDesdeFicha, revisarListoDesdeFicha, type EstadoParaPaso,
} from "@/app/(dashboard)/candidatos/tablero-actions";
import { CITAR_REAL } from "./acciones-reales";
import { CitarDialog } from "./citar-dialog";
import { textoEnvio } from "./profesor-tipos";

const campo = "w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:border-[#4F46E5] focus:outline-none";
const boton = "inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50";

/** Pestaña de la ficha donde está lo de cada etapa. */
export function pestanaDeEtapa(destino: EtapaConPaso): "resumen" | "citas" {
  return destino === "antecedentes" || destino === "contratado" || destino === "listo_contratar" ? "resumen" : "citas";
}

const etiqueta = (e: string) => estadoInfo(e)?.label ?? e;

export function PasoTablero({
  procesoId,
  nombre,
  destino,
  onAvanzo,
  onVerPestana,
}: {
  procesoId: string;
  nombre: string;
  destino: EtapaConPaso;
  /** El proceso cambió de etapa (para releer el tablero y la ficha). */
  onAvanzo: () => void;
  onVerPestana: (p: "resumen" | "citas") => void;
}) {
  const [datos, setDatos] = useState<EstadoParaPaso | { error: string } | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const [nota, setNota] = useState("");
  const [clases, setClases] = useState("");
  const [citar, setCitar] = useState(false);
  // De dónde salió la tarjeta (el estado al abrir), para el título aunque ya haya avanzado.
  const [origen, setOrigen] = useState<string | null>(null);
  const caja = useRef<HTMLElement>(null);

  const recargar = useCallback(() => {
    estadoParaPaso(procesoId)
      .then((d) => {
        setDatos(d);
        if (!("error" in d)) setOrigen((o) => o ?? d.estado);
      })
      .catch((e: Error) => setDatos({ error: e.message }));
  }, [procesoId]);
  useEffect(recargar, [recargar]);
  // Va debajo del formulario: al abrir se muestra sin tener que bajar.
  const listo = datos !== null;
  useEffect(() => {
    if (listo) caja.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [listo]);

  const hecho = (texto: string) => {
    setMensaje({ texto, error: false });
    setNota("");
    setClases("");
    recargar();
    onAvanzo();
  };
  const correr = (accion: () => Promise<{ ok: boolean; error?: string; envio?: string }>, exito: string) => {
    setMensaje(null);
    enTransicion(async () => {
      const r = await accion().catch((e: Error) => ({ ok: false, error: e.message, envio: undefined }));
      if (r.ok) hecho(r.envio ? `${exito} ${textoEnvio(r.envio)}` : exito);
      else setMensaje({ texto: r.error ?? "No se pudo completar.", error: true });
    });
  };

  if (!datos) return <div className="rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2 text-sm text-[#4338CA]">Revisando qué pide «{etiqueta(destino)}»…</div>;
  if ("error" in datos) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{datos.error}</p>;


  const actual = datos.estado;
  const paso = siguientePaso(actual, destino);
  const llego = actual === destino;

  return (
    <section ref={caja} className={`scroll-mt-4 rounded-lg border px-3 py-3 text-sm ${llego ? "border-emerald-200 bg-emerald-50" : "border-[#C7D2FE] bg-[#EEF2FF]"}`}>
      <p className="flex flex-wrap items-center gap-1.5 font-semibold text-gray-900">
        Mover en el tablero: {etiqueta(origen ?? actual)} <ArrowRight className="h-4 w-4" /> {etiqueta(destino)}
      </p>

      {llego ? (
        <p className="mt-2 flex items-center gap-1.5 text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Listo: quedó en «{etiqueta(destino)}». Puede cerrar la ficha.
        </p>
      ) : !paso ? (
        <p className="mt-2 flex items-center gap-1.5 text-amber-800">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {actual === "cierre" || actual === "contratado"
            ? "El proceso está cerrado o contratado: para seguir, primero reábralo arrastrándolo a su etapa."
            : `Desde «${etiqueta(actual)}» no se llega a «${etiqueta(destino)}» desde aquí.`}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {paso !== destino && (
            <p className="text-xs text-gray-600">
              Los pasos van en orden: primero «{etiqueta(paso)}», después se sigue hasta «{etiqueta(destino)}».
            </p>
          )}

          {paso === "antecedentes" && (
            <>
              <p className="text-gray-700">
                Pasa a antecedentes sin esperar la preselección automática (edad, residencia, licencia, SIMIT y autorización de datos). Revise el resumen y escriba por qué.
              </p>
              <textarea className={`${campo} min-h-[56px]`} placeholder="¿Por qué pasa? (queda en el historial)" value={nota} onChange={(e) => setNota(e.target.value)} />
              <button type="button" className={boton} disabled={ocupado || nota.trim().length < 5} onClick={() => correr(() => pasarAAntecedentes(procesoId, nota), "Pasó a antecedentes.")}>
                Pasar a antecedentes
              </button>
            </>
          )}

          {paso === "citado" && (
            <>
              <p className="text-gray-700">Citarlo a la prueba de manejo: se crea la cita y se le envía la citación por WhatsApp.</p>
              <button type="button" className={boton} disabled={ocupado} onClick={() => setCitar(true)}>
                Citar a la prueba de manejo
              </button>
            </>
          )}

          {paso === "prueba_manejo" && (
            <>
              <p className="text-gray-700">
                {datos.citaPrueba
                  ? `Citado el ${fechaEnTexto(datos.citaPrueba.fecha)} a las ${horaEnTexto(datos.citaPrueba.hora)}. Marque que llegó a la prueba.`
                  : "No tiene una cita de prueba de manejo en pie: primero cítelo."}
              </p>
              {datos.citaPrueba && (
                <button type="button" className={boton} disabled={ocupado} onClick={() => correr(() => llegoALaPrueba(procesoId), "Llegó a la prueba de manejo.")}>
                  Llegó a la prueba de manejo
                </button>
              )}
            </>
          )}

          {paso === "en_escuela" && (
            <>
              <p className="text-gray-700">Resultado de la prueba de manejo: necesita escuela.</p>
              <div className="flex flex-wrap gap-2">
                <input className={`${campo} w-40`} type="number" min={1} max={99} placeholder="Clases sugeridas" value={clases} onChange={(e) => setClases(e.target.value)} />
                <input className={`${campo} flex-1`} placeholder="Observación (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
              </div>
              <button type="button" className={boton} disabled={ocupado} onClick={() => correr(() => pasarAEscuela(procesoId, nota, clases ? Number(clases) : null), "Pasó a escuela.")}>
                Pasar a escuela
              </button>
            </>
          )}

          {paso === "en_examenes" && (
            <>
              <p className="text-gray-700">
                {actual === "en_escuela" ? "Terminó la escuela" : "Aprobó la prueba de manejo"}: se le cita a los exámenes de la fase 1
                {datos.planFase1
                  ? ` el ${fechaEnTexto(datos.planFase1.fecha)} a las ${horaEnTexto(datos.planFase1.hora)}${datos.planFase1.laboratorio ? ` en ${datos.planFase1.laboratorio}` : ""}`
                  : ""}
                , se le envía el mensaje (con la pregunta del banco) y la orden al laboratorio.
              </p>
              <input className={campo} placeholder="Observación (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
              <button type="button" className={boton} disabled={ocupado} onClick={() => correr(() => pasarAExamenesDesdeFicha(procesoId, nota), "Citado a exámenes, fase 1.")}>
                {actual === "en_escuela" ? "Terminó la escuela: pasar a exámenes" : "Aprobó la prueba: pasar a exámenes"}
              </button>
            </>
          )}

          {(paso === "en_examenes_fase2" || paso === "reconocimiento_ruta") &&
            (() => {
              const fase: 1 | 2 = paso === "en_examenes_fase2" ? 1 : 2;
              if (datos.noApto === fase) {
                return (
                  <p className="flex items-center gap-1.5 text-red-700">
                    <TriangleAlert className="h-4 w-4 shrink-0" /> La fase {fase} está no apta: decida abajo, en «Exámenes médicos» («Sigue» o «No sigue»).
                  </p>
                );
              }
              return (
                <>
                  <p className="text-gray-700">
                    {fase === 1
                      ? "Registre la fase 1 como apta: se le cita a la fase 2 en el mismo laboratorio y se le envía el mensaje."
                      : "Registre la fase 2 como apta: pasa a reconocimiento de ruta (lo cita la encargada del reconocimiento)."}
                  </p>
                  <input className={campo} placeholder="Observación (opcional; p. ej. «apto con restricciones»)" value={nota} onChange={(e) => setNota(e.target.value)} />
                  <button type="button" className={boton} disabled={ocupado} onClick={() => correr(() => faseAptaDesdeFicha(procesoId, fase, nota), fase === 1 ? "Fase 1 apta: citado a la fase 2." : "Fase 2 apta.")}>
                    {fase === 1 ? "Fase 1 apta: citar a la fase 2 y avisarle" : "Fase 2 apta: pasar a reconocimiento de ruta"}
                  </button>
                </>
              );
            })()}

          {paso === "listo_contratar" && (
            <>
              <p className="text-gray-700">
                A «Listo para contratar» no se lleva a mano: Gestivo lo pasa solo cuando cumple todo para contratar menos el visto bueno (antecedentes, exámenes, reconocimiento de ruta, carpeta y prueba psicosensotécnica). Revise qué le falta en «Condiciones para contratar», en el Resumen.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} onClick={() => onVerPestana("resumen")}>
                  Ver las condiciones
                </button>
                <button type="button" className={boton} disabled={ocupado} onClick={() => correr(() => revisarListoDesdeFicha(procesoId), "Revisado.")}>
                  Revisar ahora
                </button>
              </div>
            </>
          )}

          {paso === "contratado" && (
            <>
              <p className="text-gray-700">
                Para contratar se tienen que cumplir las condiciones (exámenes, rutas, carpeta, visto bueno…). Revíselas en «Qué le falta para contratar», en el Resumen, y contrate desde allí.
              </p>
              <button type="button" className={boton} onClick={() => onVerPestana("resumen")}>
                Ver las condiciones
              </button>
            </>
          )}
        </div>
      )}

      {mensaje && <p className={`mt-2 text-xs ${mensaje.error ? "text-red-700" : "text-emerald-800"}`}>{mensaje.texto}</p>}

      {citar && (
        <CitarDialog
          procesoId={procesoId}
          nombre={nombre}
          acciones={CITAR_REAL}
          onClose={() => setCitar(false)}
          onHecho={(r) => {
            setCitar(false);
            hecho(`Citado. ${textoEnvio(r.envio)}`);
          }}
        />
      )}
    </section>
  );
}
