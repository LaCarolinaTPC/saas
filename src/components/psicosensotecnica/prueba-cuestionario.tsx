"use client";

/**
 * Los cuestionarios de la batería: conducción riesgosa (escala de frecuencia),
 * personalidad (IPIP, qué tan cierto), y perfil del cargo e integridad (escala
 * de acuerdo).
 */

import { useState } from "react";
import { ESCALA, ESCALA_PERSONALIDAD, ITEMS, ITEMS_PERSONALIDAD, type DatosPrueba } from "@/lib/psicosensotecnica/bateria";
import { ESCALA_ACUERDO, ITEMS_INTEGRIDAD, ITEMS_PERFIL } from "@/lib/psicosensotecnica/cuestionarios";
import { Avance, BotonPrincipal, Instrucciones, Tarjeta, useInterrupciones } from "./comun";

type Respuestas = DatosPrueba["cuestionario"];

const POR_PAGINA = 10;

function Cuestionario({
  titulo, pasos, encabezado, items, escala, onTerminar,
}: {
  titulo: string;
  pasos: string[];
  encabezado: string;
  items: { id: string; texto: string }[];
  escala: readonly string[];
  onTerminar: (datos: Respuestas) => void;
}) {
  const [empezo, setEmpezo] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [pagina, setPagina] = useState(0);
  const interrupciones = useInterrupciones(empezo);
  const contestadas = Object.keys(respuestas).length;
  // De a 10 preguntas por pantalla: en el celular una lista de 70 no se termina.
  const paginas = Math.ceil(items.length / POR_PAGINA);
  const visibles = items.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const faltanAqui = visibles.filter((it) => respuestas[it.id] == null).length;
  const ultima = pagina === paginas - 1;

  if (!empezo) return <Instrucciones titulo={titulo} pasos={pasos} boton="Empezar" onSeguir={() => setEmpezo(true)} />;

  const seguir = () => {
    if (!ultima) {
      setPagina((p) => p + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    onTerminar({ respuestas, interrupciones: interrupciones.current });
  };

  return (
    <Tarjeta>
      <Avance hecho={contestadas} total={items.length} etiqueta={encabezado} />
      <ol className="space-y-5" start={pagina * POR_PAGINA + 1}>
        {visibles.map((item, i) => {
          const n = pagina * POR_PAGINA + i;
          return (
          <li key={item.id}>
            <fieldset>
              <legend className="text-[15px] font-medium text-gray-800">
                {n + 1}. {item.texto}
              </legend>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                {escala.map((etiqueta, i) => {
                  const valor = i + 1;
                  const marcada = respuestas[item.id] === valor;
                  return (
                    <label
                      key={etiqueta}
                      className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2 text-center text-sm ${
                        marcada ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={item.id}
                        className="sr-only"
                        checked={marcada}
                        onChange={() => setRespuestas((r) => ({ ...r, [item.id]: valor }))}
                      />
                      {etiqueta}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
          );
        })}
      </ol>
      <div className="mt-6 space-y-2">
        <BotonPrincipal disabled={faltanAqui > 0} onClick={seguir}>
          {faltanAqui > 0 ? `Faltan ${faltanAqui} por contestar` : ultima ? "Terminar el cuestionario" : "Siguiente"}
        </BotonPrincipal>
        {pagina > 0 && (
          <button type="button" className="w-full py-2 text-sm text-gray-500 hover:text-gray-700" onClick={() => setPagina((p) => p - 1)}>
            Volver a las anteriores
          </button>
        )}
        {paginas > 1 && <p className="text-center text-xs text-gray-400">Página {pagina + 1} de {paginas}</p>}
      </div>
    </Tarjeta>
  );
}

export function PruebaCuestionario({ onTerminar }: { onTerminar: (datos: DatosPrueba["cuestionario"]) => void }) {
  return (
    <Cuestionario
      titulo="Cuestionario de conducción"
      pasos={[
        `Son ${ITEMS.length} afirmaciones sobre situaciones al conducir.`,
        "Para cada una marque con qué frecuencia le ha pasado en el último año.",
        "No hay respuestas buenas ni malas: conteste con sinceridad y sin pensarlo demasiado.",
      ]}
      encabezado="En el último año, ¿con qué frecuencia…?"
      items={ITEMS}
      escala={ESCALA}
      onTerminar={onTerminar}
    />
  );
}

export function PruebaPersonalidad({ onTerminar }: { onTerminar: (datos: DatosPrueba["personalidad"]) => void }) {
  return (
    <Cuestionario
      titulo="Cuestionario de personalidad"
      pasos={[
        `Son ${ITEMS_PERSONALIDAD.length} frases cortas que describen formas de ser. Toma unos 10 minutos.`,
        "Para cada una marque qué tan cierta es en usted, tal como es hoy y no como le gustaría ser.",
        "No hay respuestas buenas ni malas: conteste con sinceridad y sin pensarlo demasiado.",
      ]}
      encabezado="¿Qué tan cierto es en usted?"
      items={ITEMS_PERSONALIDAD}
      escala={ESCALA_PERSONALIDAD}
      onTerminar={onTerminar}
    />
  );
}

export function PruebaPerfil({ onTerminar }: { onTerminar: (datos: DatosPrueba["perfil"]) => void }) {
  return (
    <Cuestionario
      titulo="Cómo es usted en el trabajo"
      pasos={[
        `Son ${ITEMS_PERFIL.length} frases sobre su forma de ser y de trabajar. Toma unos 12 minutos.`,
        "Para cada una marque qué tan de acuerdo está, pensando en cómo es usted de verdad.",
        "No hay respuestas buenas ni malas. Si exagera sus virtudes, la prueba lo detecta.",
      ]}
      encabezado="¿Qué tan de acuerdo está?"
      items={ITEMS_PERFIL}
      escala={ESCALA_ACUERDO}
      onTerminar={onTerminar}
    />
  );
}

export function PruebaIntegridad({ onTerminar }: { onTerminar: (datos: DatosPrueba["integridad"]) => void }) {
  return (
    <Cuestionario
      titulo="Valores en el trabajo"
      pasos={[
        `Son ${ITEMS_INTEGRIDAD.length} frases sobre situaciones del trabajo. Toma unos 8 minutos.`,
        "Para cada una marque qué tan de acuerdo está con lo que dice.",
        "Conteste con sinceridad: no hay respuestas buenas ni malas, y si exagera sus virtudes la prueba lo detecta.",
      ]}
      encabezado="¿Qué tan de acuerdo está?"
      items={ITEMS_INTEGRIDAD}
      escala={ESCALA_ACUERDO}
      onTerminar={onTerminar}
    />
  );
}
