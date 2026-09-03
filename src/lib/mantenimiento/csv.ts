// El helper vive ahora en src/lib/exportar/csv.ts, compartido por varios
// módulos. Este archivo queda como alias para no tocar a Alertas ni a Frenos.
export { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
