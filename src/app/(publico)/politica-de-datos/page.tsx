import type { Metadata } from "next";
import { leerAjustes } from "@/lib/seleccion/servidor";
import { datosPolitica, seccionesPolitica } from "@/lib/seleccion/politica-datos";

// Ruta pública: la enlaza la autorización de datos que el asistente de
// WhatsApp pide a los aspirantes. Sin sesión ni permisos, a propósito. Los
// datos del responsable salen de los ajustes de Selección (se editan sin
// desplegar), por eso se lee en cada visita.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos personales · Transportes La Carolina",
  description: "Cómo trata la empresa los datos personales de quienes participan en sus procesos de selección",
};

export default async function PoliticaDatosPage() {
  const datos = datosPolitica(await leerAjustes());
  const secciones = seccionesPolitica(datos);
  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-10 text-slate-800">
      <article className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <p className="text-sm font-medium text-teal-700">{datos.razonSocial}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Política de tratamiento de datos personales</h1>
          <p className="mt-2 text-sm text-slate-500">Procesos de selección · Ley 1581 de 2012</p>
        </header>
        <div className="space-y-7">
          {secciones.map((s) => (
            <section key={s.titulo}>
              <h2 className="mb-2 text-lg font-semibold text-slate-900">{s.titulo}</h2>
              {s.parrafos.map((p) => (
                <p key={p} className="mb-2 leading-relaxed">
                  {p}
                </p>
              ))}
              {s.lista && (
                <ul className="ml-5 list-disc space-y-1 leading-relaxed">
                  {s.lista.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
