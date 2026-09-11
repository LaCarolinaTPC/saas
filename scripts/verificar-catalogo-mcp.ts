// Verifica la coherencia entre la lista blanca de la Data API
// (src/lib/external/resources.ts) y el catálogo semántico del MCP
// (src/lib/mcp/catalogo). Un recurso sin documentación llega al agente de IA
// sin contexto, que es justo lo que el MCP pretende evitar.
//
//   npm run mcp:verificar-catalogo
//
// Errores (salida 1): recursos sin documentar, columnas referenciadas que no
// están documentadas, columnas sensibles entre las columnas por defecto.
// Avisos: relaciones hacia recursos que no están expuestos.

import { EXTERNAL_RESOURCES } from "../src/lib/external/resources";
import { CATALOGO, DOMINIOS, GLOSARIO } from "../src/lib/mcp/catalogo";

const errores: string[] = [];
const avisos: string[] = [];

const expuestos = new Set(EXTERNAL_RESOURCES.map((r) => r.name));
const documentados = new Map<string, (typeof CATALOGO)[number]>();

for (const doc of CATALOGO) {
  if (documentados.has(doc.nombre)) errores.push(`${doc.nombre}: documentado dos veces.`);
  documentados.set(doc.nombre, doc);
  if (!expuestos.has(doc.nombre)) {
    errores.push(`${doc.nombre}: documentado en el catálogo pero ausente de EXTERNAL_RESOURCES.`);
  }
  if (!DOMINIOS[doc.dominio]) errores.push(`${doc.nombre}: dominio desconocido '${doc.dominio}'.`);
}

for (const recurso of EXTERNAL_RESOURCES) {
  const doc = documentados.get(recurso.name);
  if (!doc) {
    errores.push(`${recurso.name}: expuesto sin documentación en src/lib/mcp/catalogo.`);
    continue;
  }
  const columnas = doc.columnas;
  const existe = (c: string) => Object.prototype.hasOwnProperty.call(columnas, c);
  const id = recurso.idColumn ?? "id";

  if (!existe(doc.identificador)) errores.push(`${doc.nombre}: identificador '${doc.identificador}' sin documentar.`);
  if (doc.identificador !== id) {
    avisos.push(`${doc.nombre}: identificador del catálogo '${doc.identificador}' distinto de idColumn '${id}'.`);
  }
  if (doc.columnaFecha && !existe(doc.columnaFecha)) {
    errores.push(`${doc.nombre}: columnaFecha '${doc.columnaFecha}' sin documentar.`);
  }
  if (recurso.defaultOrder && !existe(recurso.defaultOrder)) {
    errores.push(`${doc.nombre}: defaultOrder '${recurso.defaultOrder}' sin documentar.`);
  }

  if (doc.columnasPorDefecto.length === 0 || doc.columnasPorDefecto.length > 15) {
    errores.push(`${doc.nombre}: columnasPorDefecto debe tener entre 1 y 15 columnas.`);
  }
  for (const c of doc.columnasPorDefecto) {
    if (!existe(c)) errores.push(`${doc.nombre}: columna por defecto '${c}' sin documentar.`);
    else if (columnas[c].sensible) errores.push(`${doc.nombre}: columna por defecto '${c}' es sensible.`);
  }

  if (doc.filtroPorDefecto && !existe(doc.filtroPorDefecto.columna)) {
    errores.push(`${doc.nombre}: filtroPorDefecto sobre '${doc.filtroPorDefecto.columna}' sin documentar.`);
  }

  for (const [nombre, columna] of Object.entries(columnas)) {
    if (!columna.descripcion?.trim()) errores.push(`${doc.nombre}.${nombre}: sin descripción.`);
    const destino = columna.relacion?.match(/^([a-z_0-9]+)\.([a-z_0-9]+)$/);
    if (columna.relacion && !destino) {
      avisos.push(`${doc.nombre}.${nombre}: relación con formato libre '${columna.relacion}'.`);
    } else if (destino) {
      const [, tabla, col] = destino;
      const docDestino = documentados.get(tabla);
      if (!expuestos.has(tabla)) avisos.push(`${doc.nombre}.${nombre}: apunta a '${tabla}', que no está expuesto.`);
      else if (docDestino && !Object.prototype.hasOwnProperty.call(docDestino.columnas, col)) {
        errores.push(`${doc.nombre}.${nombre}: apunta a '${tabla}.${col}', columna no documentada.`);
      }
    }
  }

  for (const r of [...(doc.relaciones ?? []), ...(doc.noConfundirCon ?? [])]) {
    if (!expuestos.has(r.recurso)) {
      avisos.push(`${doc.nombre}: menciona '${r.recurso}', que no está expuesto por el MCP.`);
    }
  }
}

const terminos = new Set<string>();
for (const t of GLOSARIO) {
  const clave = t.termino.toLowerCase();
  if (terminos.has(clave)) errores.push(`Glosario: término repetido '${t.termino}'.`);
  terminos.add(clave);
}

const columnasTotales = CATALOGO.reduce((n, d) => n + Object.keys(d.columnas).length, 0);
console.log(
  `Catálogo MCP: ${CATALOGO.length} recursos, ${columnasTotales} columnas, ${GLOSARIO.length} términos de glosario.`
);
if (avisos.length) {
  console.log(`\nAvisos (${avisos.length}):`);
  for (const a of [...new Set(avisos)]) console.log(`  · ${a}`);
}
if (errores.length) {
  console.error(`\nErrores (${errores.length}):`);
  for (const e of errores) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nSin errores.");
