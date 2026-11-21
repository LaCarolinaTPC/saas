"use client";

import { useState, useTransition } from "react";
import { NOMBRE_PRUEBA, type ClavePrueba } from "@/lib/psicosensotecnica/bateria";
import { BotonPrincipal, Tarjeta } from "@/components/psicosensotecnica/comun";
import { PruebaReaccion } from "@/components/psicosensotecnica/prueba-reaccion";
import { PruebaAtencion } from "@/components/psicosensotecnica/prueba-atencion";
import { PruebaAnticipacion } from "@/components/psicosensotecnica/prueba-anticipacion";
import { PruebaCuestionario, PruebaIntegridad, PruebaPerfil, PruebaPersonalidad } from "@/components/psicosensotecnica/prueba-cuestionario";
import { guardarPrueba, identificar, iniciar, terminar, vincularEquipo } from "./actions";

type Paso = "equipo" | "cedula" | "datos" | "prueba" | "guardando" | "listo";

interface Persona {
  cedula: string;
  nombre: string | null;
  pedirDatos: boolean;
  retoma: boolean;
}

const campo = "w-full rounded-lg border border-gray-300 px-3 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function PruebaClient({ pideEquipo }: { pideEquipo: boolean }) {
  const [paso, setPaso] = useState<Paso>(pideEquipo ? "equipo" : "cedula");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, enTransicion] = useTransition();

  const [codigo, setCodigo] = useState("");
  const [cedula, setCedula] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [autoriza, setAutoriza] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<ClavePrueba[]>([]);
  const [total, setTotal] = useState(0);
  /** Lo que no se pudo guardar, para reintentar sin repetir la prueba. */
  const [sinGuardar, setSinGuardar] = useState<{ prueba: ClavePrueba; datos: unknown } | null>(null);

  const correr = (f: () => Promise<void>) => {
    setError(null);
    enTransicion(async () => {
      try {
        await f();
      } catch {
        setError("No hay conexión con el servidor. Revise el internet e intente de nuevo.");
      }
    });
  };

  const alVincular = () =>
    correr(async () => {
      const r = await vincularEquipo(codigo);
      if (!r.success) return setError(r.error);
      setPaso("cedula");
    });

  const alIdentificar = () =>
    correr(async () => {
      const r = await identificar(cedula);
      if (!r.success) return setError(r.error);
      setPersona({ cedula: r.cedula, nombre: r.nombre, pedirDatos: r.pedirDatos, retoma: r.retoma });
      setPaso("datos");
    });

  const alEmpezar = () =>
    correr(async () => {
      if (!persona) return;
      const r = await iniciar({
        cedula: persona.cedula,
        nombre: persona.pedirDatos ? nombre : undefined,
        celular: persona.pedirDatos ? celular : undefined,
        autoriza,
        tipoEntrada: window.matchMedia("(pointer: coarse)").matches ? "tactil" : "raton",
      });
      if (!r.success) return setError(r.error);
      setToken(r.token);
      setPendientes(r.pendientes);
      setTotal(r.pendientes.length);
      if (r.pendientes.length) setPaso("prueba");
      else await cerrar(r.token);
    });

  async function cerrar(clave: string) {
    const r = await terminar(clave);
    if (!r.success) {
      setError(r.error);
      setPaso("guardando");
      return;
    }
    setPaso("listo");
  }

  const enviar = (prueba: ClavePrueba, datos: unknown) => {
    setPaso("guardando");
    setSinGuardar({ prueba, datos });
    correr(async () => {
      if (!token) return;
      const r = await guardarPrueba(token, prueba, datos);
      if (!r.success) return setError(r.error);
      setSinGuardar(null);
      const resto = pendientes.filter((p) => p !== prueba);
      setPendientes(resto);
      if (resto.length) setPaso("prueba");
      else await cerrar(token);
    });
  };

  const reintentar = () => {
    if (sinGuardar) return enviar(sinGuardar.prueba, sinGuardar.datos);
    if (token) correr(() => cerrar(token));
  };

  const aviso = error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;

  if (paso === "equipo") {
    return (
      <Tarjeta>
        <h2 className="text-lg font-semibold">Vincular este equipo</h2>
        <p className="mt-2 text-sm text-gray-600">
          Esta prueba solo se presenta en equipos de la empresa. Pídale a la persona encargada el código de 6 dígitos y escríbalo aquí.
        </p>
        <input
          className={`${campo} mt-4 text-center text-2xl tracking-[0.3em]`}
          inputMode="numeric"
          autoComplete="off"
          maxLength={7}
          placeholder="000 000"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        {aviso}
        <div className="mt-4">
          <BotonPrincipal disabled={ocupado || codigo.replace(/\D/g, "").length !== 6} onClick={alVincular}>
            {ocupado ? "Verificando…" : "Vincular"}
          </BotonPrincipal>
        </div>
      </Tarjeta>
    );
  }

  if (paso === "cedula") {
    return (
      <Tarjeta>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            alIdentificar();
          }}
        >
          <label htmlFor="cedula" className="text-lg font-semibold">
            Escriba su número de cédula
          </label>
          <p className="mt-1 text-sm text-gray-600">Solo los números, sin puntos ni espacios.</p>
          <input
            id="cedula"
            className={`${campo} mt-4 text-xl`}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={14}
            value={cedula}
            onChange={(e) => setCedula(e.target.value.replace(/[^\d.\s]/g, ""))}
          />
          {aviso}
          <div className="mt-4">
            <BotonPrincipal type="submit" disabled={ocupado || cedula.replace(/\D/g, "").length < 5}>
              {ocupado ? "Verificando…" : "Continuar"}
            </BotonPrincipal>
          </div>
        </form>
      </Tarjeta>
    );
  }

  if (paso === "datos" && persona) {
    const faltanDatos = persona.pedirDatos && nombre.trim().length < 5;
    return (
      <Tarjeta>
        <h2 className="text-lg font-semibold">{persona.nombre ? `Hola, ${persona.nombre}` : "Sus datos"}</h2>
        <p className="mt-1 text-sm text-gray-500">Cédula {persona.cedula}</p>
        {persona.retoma && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Tiene una prueba a medias: va a continuar donde la dejó.</p>
        )}
        {persona.pedirDatos && (
          <div className="mt-4 space-y-3">
            <input className={campo} placeholder="Nombre completo" autoComplete="name" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <input className={campo} placeholder="Celular (opcional)" inputMode="tel" autoComplete="tel" maxLength={15} value={celular} onChange={(e) => setCelular(e.target.value)} />
          </div>
        )}
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-gray-700">
          <li>La prueba completa dura entre 35 y 45 minutos y se puede retomar si se interrumpe. Hágala de una vez, en un lugar tranquilo y sin distracciones.</li>
          <li>No cambie de ventana ni bloquee la pantalla mientras la presenta: queda registrado.</li>
          <li>Al terminar no verá un puntaje: el resultado lo revisa el área de psicología de la empresa.</li>
        </ul>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} />
          <span>
            Autorizo el tratamiento de mis datos personales y de los resultados de esta prueba para el proceso de selección y seguimiento de conductores, según la{" "}
            <a href="/politica-de-datos" target="_blank" rel="noreferrer" className="font-medium text-indigo-600 underline">
              política de tratamiento de datos
            </a>
            .
          </span>
        </label>
        {aviso}
        <div className="mt-4 space-y-2">
          <BotonPrincipal disabled={ocupado || !autoriza || faltanDatos} onClick={alEmpezar}>
            {ocupado ? "Preparando…" : persona.retoma ? "Continuar la prueba" : "Empezar la prueba"}
          </BotonPrincipal>
          <button
            type="button"
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            onClick={() => {
              setPersona(null);
              setError(null);
              setPaso("cedula");
            }}
          >
            No soy yo: cambiar la cédula
          </button>
        </div>
      </Tarjeta>
    );
  }

  if (paso === "prueba" && pendientes.length) {
    const prueba = pendientes[0];
    const numero = total - pendientes.length + 1;
    return (
      <div>
        <p className="mb-3 text-center text-sm text-gray-500">
          Prueba {numero} de {total} · {NOMBRE_PRUEBA[prueba]}
        </p>
        {/* La clave obliga a montar de cero cada prueba. */}
        {prueba === "reaccion" && <PruebaReaccion key={prueba} onTerminar={(d) => enviar(prueba, d)} />}
        {prueba === "atencion" && <PruebaAtencion key={prueba} onTerminar={(d) => enviar(prueba, d)} />}
        {prueba === "anticipacion" && <PruebaAnticipacion key={prueba} onTerminar={(d) => enviar(prueba, d)} />}
        {prueba === "cuestionario" && <PruebaCuestionario key={prueba} onTerminar={(d) => enviar(prueba, d)} />}
        {prueba === "personalidad" && <PruebaPersonalidad key={prueba} onTerminar={(d) => enviar(prueba, d)} />}
        {prueba === "perfil" && <PruebaPerfil key={prueba} onTerminar={(d) => enviar(prueba, d)} />}
        {prueba === "integridad" && <PruebaIntegridad key={prueba} onTerminar={(d) => enviar(prueba, d)} />}
      </div>
    );
  }

  if (paso === "guardando") {
    return (
      <Tarjeta>
        <p className="text-center text-base font-medium">{error ? "No se pudo guardar" : "Guardando…"}</p>
        {error && (
          <>
            {aviso}
            <p className="mt-3 text-sm text-gray-600">No cierre esta ventana: sus respuestas siguen aquí. Revise el internet y vuelva a intentar.</p>
            <div className="mt-4">
              <BotonPrincipal disabled={ocupado} onClick={reintentar}>
                {ocupado ? "Guardando…" : "Volver a intentar"}
              </BotonPrincipal>
            </div>
          </>
        )}
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <h2 className="text-center text-lg font-semibold">Terminó la prueba</h2>
      <p className="mt-2 text-center text-sm text-gray-600">
        Gracias. Sus respuestas quedaron guardadas. El área de selección le informará el resultado; ya puede cerrar esta ventana.
      </p>
    </Tarjeta>
  );
}
