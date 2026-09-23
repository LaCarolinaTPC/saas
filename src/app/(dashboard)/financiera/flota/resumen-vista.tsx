// Vista de Gestión Resultado Flota. Se separa de `page.tsx` igual que en la
// pantalla de Datos: la página resuelve permisos y carga, y esto solo pinta.
// Así la vista previa temporal de /docs puede renderizarla sin sesión.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Permissions } from "@/lib/permissions";
import type { cargarPantalla } from "@/lib/financiera/pantalla";
import {
  agruparPorSemaforo,
  aplicarFiltros,
  mantenimiento,
  porMes,
  resumenFlota,
  tieneTimbradas,
  valoresVista,
  vistaPrincipal,
  type FilaConsolidada,
} from "@/lib/financiera/analisis";
import { nivelSemaforo } from "@/lib/financiera/motor";
import { cop, decimal, entero, nombrePeriodo, porcentaje, rotuloRango } from "@/lib/financiera/formato";
import { BarrasMes, LineaMes } from "@/components/graficos/graficos-financiera";
import { MarcoFlota } from "./marco";
import { AvisoCobertura, AvisoSalvedades, AvisoVacio, ChipSemaforo, NotaVista, Tarjeta, TarjetasSemaforo } from "./ui";

// ── Piezas locales ───────────────────────────────────────────────────────────

/** Variación entre dos valores; null cuando la base es cero. */
function variacion(antes: number, despues: number): number | null {
  if (antes === 0) return null;
  return ((despues - antes) / Math.abs(antes)) * 100;
}

function Delta({ valor, invertido = false }: { valor: number | null; invertido?: boolean }) {
  if (valor == null) return <span className="text-gray-400">—</span>;
  const bueno = invertido ? valor < 0 : valor > 0;
  const color = Math.abs(valor) < 0.05 ? "text-gray-500" : bueno ? "text-emerald-700" : "text-red-600";
  return (
    <span className={`tabular-nums font-medium ${color}`}>
      {valor > 0 ? "+" : ""}
      {decimal(valor)} %
    </span>
  );
}

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
      {ayuda && <p className="mb-3 text-xs text-gray-500">{ayuda}</p>}
      {children}
    </section>
  );
}

/** Enlace a una de las pantallas de detalle. */
function Ir({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
      {children}
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}


export interface ResumenVistaProps {
  perms: Permissions;
  p: Awaited<ReturnType<typeof cargarPantalla>>;
  /** Sub-funciones del usuario, para no ofrecer enlaces que no puede abrir. */
  verAnalisis: boolean;
  verDatos: boolean;
}

/**
 * Gestión Resultado Flota: la portada del módulo. Reúne en una pantalla lo
 * que las nueve de detalle muestran por separado, escrita para Subgerencia y
 * junta: pocas cifras grandes, la tendencia del rango y las alertas. Cada
 * bloque enlaza a la pantalla que lo desarrolla.
 */
export function ResumenVista({ perms, p, verAnalisis, verDatos }: ResumenVistaProps) {
  const principal = vistaPrincipal(p.filtros.vista);
  const kpi = valoresVista(p.resumen, principal);
  const techo = p.resumen.cobertura !== "completo";
  const meses = porMes(p.filas);
  const conContable = p.vehiculos.filter((v) => v.tieneContable);

  // Contra el año anterior, pero solo los meses que el año en curso ya tiene.
  // Comparar nueve meses contra doce da una caída del 25 % que no existe, y
  // esta es la pantalla donde esa cifra se lee sin mirar la letra pequeña.
  const mesesConDato = new Set(p.filas.map((f) => f.periodo.slice(5, 7)));
  const filasAnterior = aplicarFiltros(p.anterior, { ...p.filtros, anio: p.filtros.anio - 1 }, p.owners).filter((f) =>
    mesesConDato.has(f.periodo.slice(5, 7))
  );
  const resumenAnterior = resumenFlota(filasAnterior);
  const previo = valoresVista(resumenAnterior, principal);
  const hayAnterior = filasAnterior.length > 0;

  // Reparto del semáforo de los tres indicadores del tablero. En gasto por
  // timbrada quedan fuera los que no tienen timbradas: saldrían en verde.
  const conTimbradas = conContable.filter(tieneTimbradas);
  const repartos = [
    {
      clave: "rentabilidad" as const,
      titulo: "Rentabilidad",
      href: "/financiera/flota/rentabilidad",
      grupos: agruparPorSemaforo(conContable, (v) => valoresVista(v.indicadores, principal).rentabilidad, p.parametros.rentabilidad),
      formato: (n: number) => porcentaje(n),
      base: conContable.length,
      exigeArchivo: true,
      sinTimbradas: 0,
    },
    {
      clave: "gasto_timbrada" as const,
      titulo: "Gasto por timbrada",
      href: "/financiera/flota/timbrada",
      grupos: agruparPorSemaforo(conTimbradas, (v) => valoresVista(v.indicadores, principal).gastosPorTimbrada, p.parametros.gasto_timbrada),
      formato: (n: number) => cop(n),
      base: conTimbradas.length,
      exigeArchivo: true,
      sinTimbradas: conContable.length - conTimbradas.length,
    },
    {
      clave: "productividad" as const,
      titulo: "Productividad",
      href: "/financiera/flota/productividad",
      // La productividad sale entera de GEMA: no exige archivo contable.
      grupos: agruparPorSemaforo(p.vehiculos, (v) => v.productividad, p.parametros.productividad),
      formato: (n: number) => `${decimal(n)} viajes`,
      base: p.vehiculos.length,
      exigeArchivo: false,
      sinTimbradas: 0,
    },
  ];

  // Alertas.
  const enPerdida = conContable.filter((v) => valoresVista(v.indicadores, principal).utilidad < 0);
  const perdidaTotal = enPerdida.reduce((s, v) => s + valoresVista(v.indicadores, principal).utilidad, 0);
  // Mantenimiento se mide como en su pantalla: basta que el vehículo tenga
  // algún mes con archivo, no todos. Si no, el año en curso da siempre cero.
  const conAlgunArchivo = p.vehiculos.filter((v) => v.mesesConContable > 0);
  const mant = mantenimiento(conAlgunArchivo);
  const mantTotal = mant.reduce((s, f) => s + f.total, 0);
  const ingresosConContable = conAlgunArchivo.reduce((s, v) => s + v.ingresos, 0);
  const mesesSinArchivo = meses.filter((m) => m.resumen.cobertura === "sin_dato").map((m) => m.periodo);
  const mesesParciales = meses.filter((m) => m.resumen.cobertura === "parcial").map((m) => m.periodo);

  // Resultado por flota. Ojo con la comparación: ver la nota del bloque.
  const porFlota = (() => {
    const g = new Map<string, FilaConsolidada[]>();
    for (const f of p.filas) {
      const k = f.tipoPropietario ?? "Sin dato";
      const l = g.get(k) ?? [];
      l.push(f);
      g.set(k, l);
    }
    return [...g.entries()]
      .map(([flota, filas]) => ({ flota, resumen: resumenFlota(filas) }))
      .sort((a, b) => b.resumen.ingresos - a.resumen.ingresos);
  })();

  return (
    <MarcoFlota
      perms={perms}
      titulo="Gestión Resultado Flota"
      descripcion={`${rotuloRango(p.filtros.anio, p.filtros.mes)} · ${entero(p.resumen.vehiculosDistintos)} vehículos · ${entero(p.resumen.vehiculoMes)} vehículo-mes`}
      anios={p.anios}
      opciones={p.opciones}
      conVista
    >
      <AvisoCobertura cobertura={p.resumen.cobertura} vehiculoMes={p.resumen.vehiculoMes} />
      <AvisoSalvedades salvedades={p.salvedades} />

      {p.filas.length === 0 ? (
        <AvisoVacio mensaje="No hay datos consolidados para el rango elegido. Revisa los filtros o consolida desde GEMA en Datos de flota." />
      ) : (
        <>
          {/* ── El resultado en cuatro cifras ─────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta
              titulo="Utilidad neta"
              valor={`${techo ? "≤ " : ""}${cop(kpi.utilidad)}`}
              pie={`ingresos ${cop(p.resumen.ingresos)}`}
            />
            <Tarjeta
              titulo="Rentabilidad ponderada"
              valor={`${techo ? "≤ " : ""}${porcentaje(kpi.rentabilidad)}`}
              nivel={techo ? undefined : nivelSemaforo(kpi.rentabilidad, p.parametros.rentabilidad)}
              pie="Σ utilidad / Σ ingresos"
              ayuda="Promedio ponderado, nunca el promedio de la columna."
            />
            <Tarjeta
              titulo="Gasto por timbrada"
              valor={`${techo ? "≥ " : ""}${cop(kpi.gastosPorTimbrada)}`}
              nivel={techo ? undefined : nivelSemaforo(kpi.gastosPorTimbrada, p.parametros.gasto_timbrada)}
              pie={`${entero(p.resumen.timbradas)} timbradas`}
            />
            <Tarjeta
              titulo="Productividad"
              valor={`${decimal(p.resumen.productividad)} viajes`}
              nivel={nivelSemaforo(p.resumen.productividad, p.parametros.productividad)}
              pie="por vehículo-mes · exacta, sale de GEMA"
            />
          </div>
          <NotaVista vista={p.filtros.vista} />

          {/* ── Contra el año anterior ────────────────────────────────────── */}
          <Bloque
            titulo={`Frente a ${p.filtros.anio - 1}`}
            ayuda={
              hayAnterior
                ? `${mesesConDato.size === 1 ? "El mismo mes" : `Los mismos ${mesesConDato.size} meses`} de ${p.filtros.anio - 1}, con los mismos filtros. Comparar contra el año entero cuando el actual va por la mitad inventa una caída que no existe.`
                : `No hay datos de ${p.filtros.anio - 1} en esos meses, así que no hay con qué comparar.`
            }
          >
            {hayAnterior && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { etiqueta: "Ingresos", antes: resumenAnterior.ingresos, ahora: p.resumen.ingresos, texto: cop(p.resumen.ingresos) },
                  { etiqueta: "Utilidad", antes: previo.utilidad, ahora: kpi.utilidad, texto: cop(kpi.utilidad) },
                  { etiqueta: "Rentabilidad", antes: previo.rentabilidad, ahora: kpi.rentabilidad, texto: porcentaje(kpi.rentabilidad) },
                  {
                    etiqueta: "Gasto por timbrada",
                    antes: previo.gastosPorTimbrada,
                    ahora: kpi.gastosPorTimbrada,
                    texto: cop(kpi.gastosPorTimbrada),
                    invertido: true,
                  },
                ].map((x) => (
                  <div key={x.etiqueta} className="rounded-lg border border-[#E2E8F0] p-3">
                    <p className="text-xs text-gray-500">{x.etiqueta}</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">{x.texto}</p>
                    <p className="text-xs">
                      <Delta valor={variacion(x.antes, x.ahora)} invertido={x.invertido} /> frente a {p.filtros.anio - 1}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3">
              <Ir href="/financiera/flota/comparacion">Comparación mes a mes y contra el año anterior</Ir>
            </p>
          </Bloque>

          {/* ── Tendencia ─────────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque titulo="Utilidad por mes" ayuda="En millones de pesos. Las barras claras son meses sin archivo contable.">
              <BarrasMes
                titulo="Utilidad"
                datos={meses.map((m) => ({
                  periodo: m.periodo,
                  nombre: nombrePeriodo(m.periodo),
                  valor: valoresVista(m.resumen, principal).utilidad,
                  techo: m.resumen.cobertura !== "completo",
                  detalle: `${entero(m.resumen.vehiculoMes)} vehículos · ingresos ${cop(m.resumen.ingresos)}`,
                }))}
              />
            </Bloque>
            <Bloque titulo="Rentabilidad por mes" ayuda="Ponderada del mes, con las bandas del semáforo.">
              <LineaMes
                titulo="Rentabilidad"
                datos={meses.map((m) => ({
                  periodo: m.periodo,
                  nombre: nombrePeriodo(m.periodo),
                  valor: valoresVista(m.resumen, principal).rentabilidad,
                  techo: m.resumen.cobertura !== "completo",
                }))}
                bandas={{ excelente: p.parametros.rentabilidad.umbralExcelente, aceptable: p.parametros.rentabilidad.umbralAceptable }}
              />
            </Bloque>
          </div>

          {/* ── Semáforo de los tres indicadores ──────────────────────────── */}
          {repartos.map((r) => (
            <Bloque
              key={r.clave}
              titulo={`Semáforo · ${r.titulo}`}
              ayuda={
                `Sobre ${entero(r.base)} de ${entero(p.vehiculos.length)} vehículos. ` +
                (r.exigeArchivo && conContable.length < p.vehiculos.length
                  ? `Solo se clasifican los que tienen el archivo contable en TODOS los meses del rango; los otros ${entero(p.vehiculos.length - conContable.length)} no. `
                  : "") +
                (r.sinTimbradas > 0
                  ? `${entero(r.sinTimbradas)} sin timbradas quedan fuera: su gasto por timbrada valdría 0 y saldrían en verde. `
                  : "") +
                `Umbrales: excelente ${r.formato(p.parametros[r.clave].umbralExcelente)}, aceptable ${r.formato(p.parametros[r.clave].umbralAceptable)}.`
              }
            >
              {r.base === 0 ? (
                <AvisoVacio mensaje="Ningún vehículo del rango se puede clasificar en este indicador." />
              ) : (
                <>
                  <TarjetasSemaforo grupos={r.grupos} formato={r.formato} total={r.base} />
                  <p className="mt-3">
                    <Ir href={r.href}>Ver {r.titulo.toLowerCase()} por vehículo</Ir>
                  </p>
                </>
              )}
            </Bloque>
          ))}

          {/* ── Alertas ───────────────────────────────────────────────────── */}
          <Bloque titulo="Dónde está el problema" ayuda="Lo que exige una decisión, con el enlace a la pantalla que lo desarrolla.">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#E2E8F0] p-3">
                <p className="text-xs text-gray-500">Vehículos en pérdida</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{entero(enPerdida.length)}</p>
                <p className="text-xs text-gray-600">
                  de {entero(conContable.length)} con archivo completo · {cop(perdidaTotal)}
                </p>
                {verAnalisis && (
                  <p className="mt-1">
                    <Ir href="/financiera/flota/perdida">Ver cuáles</Ir>
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-[#E2E8F0] p-3">
                <p className="text-xs text-gray-500">Mantenimiento</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{cop(mantTotal)}</p>
                <p className="text-xs text-gray-600">
                  {ingresosConContable > 0
                    ? `${porcentaje((mantTotal / ingresosConContable) * 100)} del ingreso de los ${entero(conAlgunArchivo.length)} vehículos con archivo`
                    : "ningún vehículo del rango tiene archivo contable"}
                </p>
                {verAnalisis && (
                  <p className="mt-1">
                    <Ir href="/financiera/flota/mantenimiento">Repuestos y mano de obra</Ir>
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-[#E2E8F0] p-3">
                <p className="text-xs text-gray-500">Cobertura contable</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
                  {p.resumen.vehiculoMes > 0 ? porcentaje((p.resumen.conContable / p.resumen.vehiculoMes) * 100) : "—"}
                </p>
                <p className="text-xs text-gray-600">
                  {entero(p.resumen.conContable)} de {entero(p.resumen.vehiculoMes)} vehículo-mes
                </p>
                <p className="text-xs text-gray-600">
                  {mesesSinArchivo.length > 0
                    ? `sin archivo: ${mesesSinArchivo.map(nombrePeriodo).join(", ")}`
                    : mesesParciales.length > 0
                      ? `parcial en ${mesesParciales.length} mes(es)`
                      : "todos los meses del rango cargados"}
                </p>
                {verDatos && (
                  <p className="mt-1">
                    <Ir href="/financiera/flota/datos">Cargar el archivo contable</Ir>
                  </p>
                )}
              </div>
            </div>
          </Bloque>

          {/* ── Resultado por flota ───────────────────────────────────────── */}
          <Bloque titulo="Resultado por flota">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[#E2E8F0] text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Flota</th>
                    <th className="px-3 py-2 text-right">Vehículo-mes</th>
                    <th className="px-3 py-2 text-right">Ingresos</th>
                    <th className="px-3 py-2 text-right">Utilidad</th>
                    <th className="px-3 py-2 text-right">Rentabilidad</th>
                    <th className="px-3 py-2 text-left">Semáforo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {porFlota.map((x) => {
                    const v = valoresVista(x.resumen, principal);
                    const parcial = x.resumen.cobertura !== "completo";
                    return (
                      <tr key={x.flota} className="hover:bg-[#F8FAFC]">
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{x.flota}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(x.resumen.vehiculoMes)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(x.resumen.ingresos)}</td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${v.utilidad < 0 ? "text-red-600" : ""}`}>
                          {parcial ? "≤ " : ""}
                          {cop(v.utilidad)}
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${v.rentabilidad < 0 ? "text-red-600" : ""}`}>
                          {parcial ? "≤ " : ""}
                          {porcentaje(v.rentabilidad)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {parcial ? (
                            <span className="text-xs text-gray-400">sin clasificar</span>
                          ) : (
                            <ChipSemaforo nivel={nivelSemaforo(v.rentabilidad, p.parametros.rentabilidad)} pequeno />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Estas dos rentabilidades no son comparables.</strong> Al bus afiliado no se le registran repuestos ni mano
              de obra, porque ese costo lo asume el propietario y no entra a la contabilidad de la empresa; en la flota propia
              esos dos rubros valen alrededor del 13 % y del 11 % del ingreso. Esos puntos de diferencia explican casi toda la
              brecha. Leer la tabla como «los afiliados rinden más» es un error.
            </p>
          </Bloque>
        </>
      )}
    </MarcoFlota>
  );
}
