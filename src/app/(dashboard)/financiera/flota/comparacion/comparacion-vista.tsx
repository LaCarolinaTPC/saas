"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, CalendarDays, Layers } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compararVehiculos, filasDelCorte, resumirComparacion, type CorteComparacion, type FilaComparacion, type ModoComparacion, type ResumenComparacion, type VehiculoComparado, type VistaComparacion } from "@/lib/financiera/comparacion";
import { cop, entero, MESES, porcentaje } from "@/lib/financiera/formato";
import { nivelSemaforo, type ParametroSemaforo } from "@/lib/financiera/motor";
import type { InformeFlota } from "@/lib/financiera/exportar";
import { ExportarFlota } from "../exportar-flota";
import { ChipSemaforo } from "../ui";
import { TablaInteractiva } from "../tabla-interactiva";

type Seleccion = { anio: string; mes: string };
type Orden = "codigo" | "utilidad1" | "rentabilidad1" | "utilidad2" | "rentabilidad2" | "diferencia" | "mejora";
const VACIO: Seleccion = { anio: "", mes: "" };
const SELECT = "h-9 w-full rounded-md border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-indigo-400";
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function corteValido(seleccion: Seleccion): CorteComparacion | null {
  const anio = Number(seleccion.anio);
  const mes = Number(seleccion.mes);
  return Number.isInteger(anio) && Number.isInteger(mes) && mes >= 1 && mes <= 12 ? { anio, mes } : null;
}

function etiquetaCorte(seleccion: Seleccion, modo: ModoComparacion, corta = false): string {
  const corte = corteValido(seleccion);
  if (!corte) return "—";
  const mes = corta ? MESES_CORTOS[corte.mes - 1] : MESES[corte.mes - 1];
  return modo === "acumulado"
    ? corta ? `Ene–${mes}/${String(corte.anio).slice(-2)}` : `enero a ${mes} ${corte.anio}`
    : corta ? `${mes}/${String(corte.anio).slice(-2)}` : `${mes} ${corte.anio}`;
}

function SelectorPeriodo({ titulo, modo, seleccion, onChange, anios, periodos }: {
  titulo: string;
  modo: ModoComparacion;
  seleccion: Seleccion;
  onChange: (seleccion: Seleccion) => void;
  anios: number[];
  periodos: Set<string>;
}) {
  const meses = seleccion.anio
    ? Array.from({ length: 12 }, (_, i) => i + 1).filter((mes) => periodos.has(`${seleccion.anio}-${String(mes).padStart(2, "0")}`))
    : [];
  return (
    <fieldset className="rounded-lg border border-[#E2E8F0] p-3">
      <legend className="px-1 text-sm font-semibold text-gray-900">{titulo}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-gray-500">
          <span>Año</span>
          <select className={SELECT} value={seleccion.anio} onChange={(e) => onChange({ anio: e.target.value, mes: "" })}>
            <option value="">Seleccionar año</option>
            {anios.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-500">
          <span>{modo === "acumulado" ? "Mes de corte" : "Mes"}</span>
          <select className={SELECT} value={seleccion.mes} disabled={!seleccion.anio} onChange={(e) => onChange({ ...seleccion, mes: e.target.value })}>
            <option value="">Seleccionar mes</option>
            {meses.map((mes) => <option key={mes} value={mes}>{MESES[mes - 1]}</option>)}
          </select>
        </label>
      </div>
      {corteValido(seleccion) && <p className="mt-2 text-xs text-gray-500">{modo === "acumulado" ? "Acumulado" : "Período"}: {etiquetaCorte(seleccion, modo)}</p>}
    </fieldset>
  );
}

function TarjetaComparacion({ titulo, antes, despues, formato, base, comparacion, menorEsMejor = false, incompleto = false }: {
  titulo: string;
  antes: number;
  despues: number;
  formato: (valor: number) => string;
  base: string;
  comparacion: string;
  menorEsMejor?: boolean;
  incompleto?: boolean;
}) {
  const diferencia = despues - antes;
  const variacion = antes !== 0 ? diferencia / Math.abs(antes) * 100 : null;
  const mejora = menorEsMejor ? diferencia < 0 : diferencia > 0;
  return (
    <article className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><p className="text-xs capitalize text-gray-500">{base}</p><p className="font-semibold tabular-nums text-gray-900">{formato(antes)}</p></div>
        <div><p className="text-xs capitalize text-gray-500">{comparacion}</p><p className="font-semibold tabular-nums text-gray-900">{formato(despues)}</p></div>
      </div>
      <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${incompleto ? "bg-amber-50 text-amber-800" : diferencia === 0 ? "bg-gray-100 text-gray-600" : mejora ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
        <strong>{incompleto ? "Dato contable parcial" : diferencia === 0 ? "Sin cambios" : mejora ? "Mejoría" : "Desmejora"}</strong>
        <span className="ml-2 tabular-nums">{diferencia > 0 ? "+" : ""}{formato(diferencia)}{variacion == null ? "" : ` (${variacion > 0 ? "+" : ""}${variacion.toFixed(1)} %)`}</span>
      </div>
    </article>
  );
}

function ResumenPeriodo({ titulo, resumen, modo }: { titulo: string; resumen: ResumenComparacion; modo: ModoComparacion }) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="text-sm font-semibold capitalize text-gray-900">Resumen {titulo}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-gray-500">Vehículos</dt><dd className="font-semibold tabular-nums">{entero(resumen.vehiculos)}</dd></div>
        <div><dt className="text-gray-500">Rentabilidad</dt><dd className="font-semibold tabular-nums">{porcentaje(resumen.rentabilidad)}</dd></div>
        <div><dt className="text-gray-500">Ingresos {modo === "mensual" ? "del mes" : "acumulados"}</dt><dd className="font-semibold tabular-nums">{cop(resumen.ingresos)}</dd></div>
        <div><dt className="text-gray-500">Gastos {modo === "mensual" ? "del mes" : "acumulados"}</dt><dd className="font-semibold tabular-nums">{cop(resumen.gastos)}</dd></div>
        <div className="col-span-2"><dt className="text-gray-500">Utilidad {modo === "mensual" ? "del mes" : "acumulada"}</dt><dd className="text-lg font-bold tabular-nums">{cop(resumen.utilidad)}</dd></div>
      </dl>
    </section>
  );
}

function GraficosComparacion({ base, comparacion, resumen1, resumen2 }: { base: string; comparacion: string; resumen1: ResumenComparacion; resumen2: ResumenComparacion }) {
  const financieros = [
    { nombre: "Ingresos", base: resumen1.ingresos, comparacion: resumen2.ingresos },
    { nombre: "Gastos", base: resumen1.gastos, comparacion: resumen2.gastos },
    { nombre: "Utilidad", base: resumen1.utilidad, comparacion: resumen2.utilidad },
  ];
  const rentabilidad = [{ nombre: "Rentabilidad", base: resumen1.rentabilidad, comparacion: resumen2.rentabilidad }];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Comparativo financiero</h3>
        <p className="text-xs text-gray-500">{base} frente a {comparacion} · millones de pesos</p>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={financieros} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis tickFormatter={(v: number) => `${Math.round(v / 1_000_000)} M`} tick={{ fontSize: 11, fill: "#64748B" }} width={58} />
              <Tooltip formatter={(v) => cop(Number(v))} />
              <Legend formatter={(v) => v === "base" ? base : comparacion} />
              <Bar dataKey="base" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="comparacion" fill="#0D9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Comparativo de rentabilidad</h3>
        <p className="text-xs text-gray-500">Rentabilidad ponderada de cada período</p>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rentabilidad} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis tickFormatter={(v: number) => `${v} %`} tick={{ fontSize: 11, fill: "#64748B" }} width={58} />
              <Tooltip formatter={(v) => porcentaje(Number(v))} />
              <Legend formatter={(v) => v === "base" ? base : comparacion} />
              <Bar dataKey="base" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="comparacion" fill="#0D9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function TablaComparacion({ filas, etiqueta1, etiqueta2, parametro }: { filas: VehiculoComparado[]; etiqueta1: string; etiqueta2: string; parametro: ParametroSemaforo }) {
  const [orden, setOrden] = useState<Orden>("codigo");
  const [ascendente, setAscendente] = useState(true);
  const ordenadas = [...filas].sort((a, b) => {
    const diferencia = orden === "codigo"
      ? a.codigo.localeCompare(b.codigo, "es", { numeric: true })
      : orden === "mejora"
        ? Math.sign(a.diferencia) - Math.sign(b.diferencia)
        : a[orden] - b[orden];
    return (ascendente ? diferencia : -diferencia) || a.codigo.localeCompare(b.codigo, "es", { numeric: true });
  });
  const informe: InformeFlota = {
    archivo: `financiera-comparacion-${etiqueta1.replace(/[^a-zA-Z0-9]/g, "-")}-${etiqueta2.replace(/[^a-zA-Z0-9]/g, "-")}`,
    modulo: "Financiera · Gestión de flota",
    titulo: "Reporte comparativo por vehículo",
    contexto: [`Base: ${etiqueta1}`, `Comparación: ${etiqueta2}`],
    resumen: [`${entero(filas.length)} vehículos`],
    columnas: [
      { titulo: "Vehículo", tipo: "texto", ancho: 22 },
      { titulo: `Utilidad ${etiqueta1}`, tipo: "cop", ancho: 30 },
      { titulo: `Rent. ${etiqueta1}`, tipo: "pct", ancho: 24 },
      { titulo: `Utilidad ${etiqueta2}`, tipo: "cop", ancho: 30 },
      { titulo: `Rent. ${etiqueta2}`, tipo: "pct", ancho: 24 },
      { titulo: "Semáforo", tipo: "texto", ancho: 25 },
      { titulo: "Diferencia", tipo: "cop", ancho: 30 },
      { titulo: "Mejora", tipo: "texto", ancho: 25 },
    ],
    filas: ordenadas.map((fila) => {
      const comparable = fila.presente1 && fila.presente2 && fila.completo1 && fila.completo2;
      return [
        fila.codigo,
        fila.presente1 ? fila.utilidad1 : null,
        fila.presente1 ? fila.rentabilidad1 : null,
        fila.presente2 ? fila.utilidad2 : null,
        fila.presente2 ? fila.rentabilidad2 : null,
        fila.presente2 && fila.completo2 ? nivelSemaforo(fila.rentabilidad2, parametro) : "sin dato",
        comparable ? fila.diferencia : null,
        comparable ? fila.diferencia > 0 ? "Mejoría" : fila.diferencia < 0 ? "Desmejora" : "Sin cambios" : "No comparable",
      ];
    }),
    notas: ["La rentabilidad es ponderada. Las diferencias sin ambos períodos y contabilidad completa no se clasifican."],
    orientacion: "landscape",
  };
  const encabezado = (clave: Orden, texto: string, centrar = false) => (
    <th scope="col" aria-sort={orden === clave ? ascendente ? "ascending" : "descending" : "none"} className={`whitespace-nowrap px-3 py-2 ${centrar ? "text-center" : "text-right"}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-gray-900 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" onClick={() => {
        if (orden === clave) setAscendente(!ascendente);
        else { setOrden(clave); setAscendente(false); }
      }}>
        {texto}{orden === clave ? ascendente ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-50" />}
      </button>
    </th>
  );
  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-4 py-3">
        <div><h3 className="text-sm font-semibold text-gray-900">Reporte comparativo por vehículo</h3>
          <p className="text-xs text-gray-500">{entero(filas.length)} vehículos · la diferencia es utilidad de comparación menos utilidad base</p></div>
        <ExportarFlota informe={informe} />
      </div>
      <TablaInteractiva id="detalle-comparacion" columnas={[
        { id: "numero", nombre: "#", fija: true },
        { id: "vehiculo", nombre: "Vehículo", fija: true },
        { id: "utilidad1", nombre: `Utilidad (${etiqueta1})` },
        { id: "rentabilidad1", nombre: `Rent. (${etiqueta1})` },
        { id: "utilidad2", nombre: `Utilidad (${etiqueta2})` },
        { id: "rentabilidad2", nombre: `Rent. (${etiqueta2})` },
        { id: "semaforo", nombre: "Semáforo" },
        { id: "diferencia", nombre: "Diferencia" },
        { id: "mejora", nombre: "Mejora" },
      ]}>
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wide text-gray-500"><tr>
            <th className="px-3 py-2 text-center">#</th>
            {encabezado("codigo", "Vehículo", true)}
            {encabezado("utilidad1", `Utilidad (${etiqueta1})`)}
            {encabezado("rentabilidad1", `Rent. (${etiqueta1})`)}
            {encabezado("utilidad2", `Utilidad (${etiqueta2})`)}
            {encabezado("rentabilidad2", `Rent. (${etiqueta2})`)}
            <th className="px-3 py-2 text-center">Semáforo</th>
            {encabezado("diferencia", "Diferencia")}
            {encabezado("mejora", "Mejora", true)}
          </tr></thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {ordenadas.map((fila, indice) => {
              const comparable = fila.presente1 && fila.presente2 && fila.completo1 && fila.completo2;
              return (
                <tr key={fila.codigo} className="hover:bg-[#F8FAFC]">
                  <td className="px-3 py-2 text-center tabular-nums">{indice + 1}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center font-semibold">{fila.codigo}{fila.placa && <span className="ml-1 text-xs font-normal text-gray-400">{fila.placa}</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fila.presente1 ? cop(fila.utilidad1) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fila.presente1 ? porcentaje(fila.rentabilidad1) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fila.presente2 ? cop(fila.utilidad2) : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fila.presente2 ? porcentaje(fila.rentabilidad2) : "—"}</td>
                  <td className="px-3 py-2 text-center">{fila.presente2 && fila.completo2 ? <ChipSemaforo nivel={nivelSemaforo(fila.rentabilidad2, parametro)} pequeno /> : <span className="text-xs text-gray-400">sin dato</span>}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums ${comparable ? fila.diferencia > 0 ? "text-emerald-700" : fila.diferencia < 0 ? "text-red-600" : "" : "text-gray-400"}`}>{comparable ? `${fila.diferencia > 0 ? "+" : ""}${cop(fila.diferencia)}` : "—"}</td>
                  <td className="px-3 py-2 text-center">{!comparable ? <span className="text-xs text-gray-400">—</span> : fila.diferencia > 0 ? <ArrowUp className="mx-auto h-4 w-4 text-emerald-700" aria-label="Mejoría" /> : fila.diferencia < 0 ? <ArrowDown className="mx-auto h-4 w-4 text-red-600" aria-label="Desmejora" /> : <ArrowRight className="mx-auto h-4 w-4 text-gray-400" aria-label="Sin cambios" />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TablaInteractiva>
    </section>
  );
}

export function ComparacionVista({ datos, anios, parametroRentabilidad }: { datos: FilaComparacion[]; anios: number[]; parametroRentabilidad: ParametroSemaforo }) {
  const [modo, setModo] = useState<ModoComparacion>("acumulado");
  const [vista, setVista] = useState<VistaComparacion>("financiero");
  const [flota, setFlota] = useState("");
  const [propietario, setPropietario] = useState("");
  const [marca, setMarca] = useState("");
  const [acumulado1, setAcumulado1] = useState<Seleccion>(VACIO);
  const [acumulado2, setAcumulado2] = useState<Seleccion>(VACIO);
  const [mensual1, setMensual1] = useState<Seleccion>(VACIO);
  const [mensual2, setMensual2] = useState<Seleccion>(VACIO);
  const primero = modo === "acumulado" ? acumulado1 : mensual1;
  const segundo = modo === "acumulado" ? acumulado2 : mensual2;
  const setPrimero = modo === "acumulado" ? setAcumulado1 : setMensual1;
  const setSegundo = modo === "acumulado" ? setAcumulado2 : setMensual2;
  const flotas = useMemo(() => [...new Set(datos.flatMap((fila) => fila.flotas))].sort(), [datos]);
  const propietarios = useMemo(() => {
    const opciones = new Map<string, string>();
    for (const fila of datos) for (const dueno of fila.propietarios) opciones.set(dueno.cedula, `${dueno.cedula} — ${dueno.nombre}`);
    return [...opciones].sort((a, b) => a[1].localeCompare(b[1], "es", { numeric: true }));
  }, [datos]);
  const marcas = useMemo(() => [...new Set(datos.map((fila) => fila.marca).filter((valor): valor is string => !!valor))].sort(), [datos]);
  const filtradas = useMemo(() => datos.filter((fila) =>
    (!flota || fila.flotas.includes(flota)) && (!propietario || fila.propietarios.some((dueno) => dueno.cedula === propietario)) && (!marca || fila.marca === marca)
  ), [datos, flota, propietario, marca]);
  const periodos = useMemo(() => new Set(filtradas.map((fila) => fila.periodo)), [filtradas]);
  const corte1 = corteValido(primero);
  const corte2 = corteValido(segundo);
  const filas1 = corte1 ? filasDelCorte(filtradas, modo, corte1) : [];
  const filas2 = corte2 ? filasDelCorte(filtradas, modo, corte2) : [];
  const listo = filas1.length > 0 && filas2.length > 0;
  const resumen1 = listo ? resumirComparacion(filas1, vista) : null;
  const resumen2 = listo ? resumirComparacion(filas2, vista) : null;
  const vehiculos = listo ? compararVehiculos(filas1, filas2, vista) : [];
  const etiqueta1 = etiquetaCorte(primero, modo);
  const etiqueta2 = etiquetaCorte(segundo, modo);
  const parcial = !!resumen1 && !!resumen2 && (!resumen1.completo || !resumen2.completo);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Filtros de comparación</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs font-medium text-gray-500"><span>Vista de rentabilidad</span><select className={SELECT} value={vista} onChange={(e) => setVista(e.target.value as VistaComparacion)}><option value="financiero">Después de financiero</option><option value="operativa">Operativa (sin intereses)</option></select></label>
          <label className="space-y-1 text-xs font-medium text-gray-500"><span>Flota</span><select className={SELECT} value={flota} onChange={(e) => setFlota(e.target.value)}><option value="">Todas las flotas</option>{flotas.map((valor) => <option key={valor} value={valor}>{valor}</option>)}</select></label>
          <label className="space-y-1 text-xs font-medium text-gray-500"><span>Propietario</span><select className={SELECT} value={propietario} onChange={(e) => setPropietario(e.target.value)}><option value="">Todos los propietarios</option>{propietarios.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</select></label>
          <label className="space-y-1 text-xs font-medium text-gray-500"><span>Marca</span><select className={SELECT} value={marca} onChange={(e) => setMarca(e.target.value)}><option value="">Todas las marcas</option>{marcas.map((valor) => <option key={valor} value={valor}>{valor}</option>)}</select></label>
        </div>
        <p className="mt-2 text-xs text-gray-500">{entero(filtradas.length)} registros vehículo-mes · {entero(periodos.size)} períodos disponibles</p>
      </section>

      <div role="tablist" aria-label="Modo de comparación" className="inline-flex rounded-lg border border-[#E2E8F0] bg-white p-1">
        <button type="button" role="tab" aria-selected={modo === "acumulado"} onClick={() => setModo("acumulado")} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${modo === "acumulado" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}><Layers className="h-4 w-4" />Acumulado</button>
        <button type="button" role="tab" aria-selected={modo === "mensual"} onClick={() => setModo("mensual")} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${modo === "mensual" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}><CalendarDays className="h-4 w-4" />Mes a mes</button>
      </div>

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">{modo === "acumulado" ? "Seleccionar períodos de corte a comparar" : "Comparar rendimiento mes a mes"}</h2>
        <p className="mb-4 text-xs text-gray-500">{modo === "acumulado" ? "Cada período acumula desde enero hasta su propio mes de corte." : "Elige dos meses específicos; pueden pertenecer a años distintos."}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <SelectorPeriodo titulo={modo === "acumulado" ? "Período base (1)" : "Mes base (1)"} modo={modo} seleccion={primero} onChange={setPrimero} anios={anios} periodos={periodos} />
          <SelectorPeriodo titulo={modo === "acumulado" ? "Período de comparación (2)" : "Mes de comparación (2)"} modo={modo} seleccion={segundo} onChange={setSegundo} anios={anios} periodos={periodos} />
        </div>
      </section>

      {!listo ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white px-4 py-12 text-center text-sm text-gray-500">
          <CalendarDays className="mx-auto mb-3 h-9 w-9 text-gray-300" />
          <p>{corte1 && corte2 ? "No hay datos para uno de los períodos con los filtros seleccionados." : modo === "acumulado" ? "Selecciona el año y mes de corte para cada período." : "Selecciona dos meses específicos para comparar."}</p>
        </div>
      ) : resumen1 && resumen2 && (
        <>
          {parcial && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Falta archivo contable en parte de uno de los períodos. Los gastos son un piso y la utilidad y rentabilidad son un techo; las diferencias no se clasifican como mejora o desmejora en las filas afectadas.</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TarjetaComparacion titulo="Ingresos totales" antes={resumen1.ingresos} despues={resumen2.ingresos} formato={cop} base={etiqueta1} comparacion={etiqueta2} />
            <TarjetaComparacion titulo="Costos operativos totales" antes={resumen1.gastos} despues={resumen2.gastos} formato={cop} base={etiqueta1} comparacion={etiqueta2} menorEsMejor incompleto={parcial} />
            <TarjetaComparacion titulo="Utilidad total" antes={resumen1.utilidad} despues={resumen2.utilidad} formato={cop} base={etiqueta1} comparacion={etiqueta2} incompleto={parcial} />
            <TarjetaComparacion titulo="Rentabilidad" antes={resumen1.rentabilidad} despues={resumen2.rentabilidad} formato={porcentaje} base={etiqueta1} comparacion={etiqueta2} incompleto={parcial} />
          </div>
          <GraficosComparacion base={etiqueta1} comparacion={etiqueta2} resumen1={resumen1} resumen2={resumen2} />
          <div className="grid gap-4 lg:grid-cols-2"><ResumenPeriodo titulo={etiqueta1} resumen={resumen1} modo={modo} /><ResumenPeriodo titulo={etiqueta2} resumen={resumen2} modo={modo} /></div>
          <TablaComparacion filas={vehiculos} etiqueta1={etiquetaCorte(primero, modo, true)} etiqueta2={etiquetaCorte(segundo, modo, true)} parametro={parametroRentabilidad} />
          <p className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-xs text-gray-600">La rentabilidad de cada período es Σ utilidad / Σ ingresos. La mejora se determina por el cambio de utilidad del vehículo; los vehículos ausentes de un período o con contabilidad incompleta quedan sin clasificación comparativa.</p>
        </>
      )}
    </div>
  );
}
