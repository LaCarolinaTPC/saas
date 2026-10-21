import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

// Cargar variables de entorno locales (.env.local primero, luego .env)
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
} else {
  dotenv.config();
}

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ ERROR: No se encontró la variable GEMINI_API_KEY en el entorno ni en .env.local");
  console.error("Configúrala con: GEMINI_API_KEY=\"tu_clave\"");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Parámetros por línea de comandos
const args = process.argv.slice(2);
const moduloNombre = args[0];

if (!moduloNombre || moduloNombre === "--help" || moduloNombre === "-h") {
  console.log("Uso:");
  console.log("  npx tsx scripts/documentar-modulo.mts <nombre-del-modulo> [--model <modelo>]");
  console.log("\nEjemplo:");
  console.log("  npx tsx scripts/documentar-modulo.mts incapacidades");
  console.log("  npx tsx scripts/documentar-modulo.mts tesoreria --model gemini-3.8-flash\n");
  
  const modulosDisponibles = fs.readdirSync("src/lib", { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  console.log("Módulos detectados en src/lib/:");
  console.log(" ", modulosDisponibles.join(", "));
  process.exit(0);
}

// Modelo por defecto
const modelArgIndex = args.indexOf("--model");
const modeloSeleccionado = modelArgIndex !== -1 && args[modelArgIndex + 1]
  ? args[modelArgIndex + 1]
  : "gemini-3.1-flash-lite";

async function main() {
  const rutaLib = path.join("src", "lib", moduloNombre);
  if (!fs.existsSync(rutaLib)) {
    console.error(`❌ El directorio "${rutaLib}" no existe.`);
    process.exit(1);
  }

  console.log(`📦 Analizando módulo: "${moduloNombre}" en ${rutaLib}...`);

  // Recolectar archivos fuente (.ts, .tsx) omitiendo tests
  function obtenerArchivos(dir: string): string[] {
    let resultados: string[] = [];
    const entradas = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entradas) {
      const rutaCompleta = path.join(dir, e.name);
      if (e.isDirectory()) {
        resultados = resultados.concat(obtenerArchivos(rutaCompleta));
      } else if (
        (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) &&
        !e.name.endsWith(".test.ts") &&
        !e.name.endsWith(".test.tsx") &&
        !e.name.endsWith(".spec.ts")
      ) {
        resultados.push(rutaCompleta);
      }
    }
    return resultados;
  }

  const archivos = obtenerArchivos(rutaLib);

  if (archivos.length === 0) {
    console.error(`⚠️ No se encontraron archivos TypeScript en ${rutaLib}`);
    process.exit(1);
  }

  console.log(`📄 Se encontraron ${archivos.length} archivos de código para analizar.`);

  let codigoCompilado = "";
  for (const archivo of archivos) {
    const relativo = path.relative(process.cwd(), archivo).replace(/\\/g, "/");
    const contenido = fs.readFileSync(archivo, "utf-8");
    codigoCompilado += `\n\n/* ========================================= */\n`;
    codigoCompilado += `/* ARCHIVO: ${relativo} */\n`;
    codigoCompilado += `/* ========================================= */\n\n`;
    codigoCompilado += contenido;
  }

  const prompt = `
Eres un arquitecto de software senior y especialista en documentación técnica.
Analiza minuciosamente el código fuente del módulo "${moduloNombre}" que pertenece al sistema de transporte (SaaS / ERP).

Genera un documento Markdown exhaustivo, claro y estructurado con el siguiente formato:

# Documentación del Módulo: ${moduloNombre}

## 1. Visión General y Propósito
- Resumen ejecutivo del módulo: ¿qué problema de negocio resuelve dentro de la operación de transporte?
- Responsabilidades principales.

## 2. Arquitectura y Estructura de Archivos
- Tabla o lista de archivos analizados con el rol y propósito de cada uno.
- Diagrama de flujo conceptual en texto/ASCII o Mermaid si aplica.

## 3. Modelos de Datos y Entidades
- Interfaces, tipos TypeScript clave y su significado de negocio.
- Tablas de base de datos con las que interactúa (consultas, inserciones, etc.).

## 4. Reglas de Negocio y Lógica Crítica
- Explicación detallada de los cálculos, validaciones, transiciones de estado y políticas operativas codificadas en este módulo.

## 5. Puntos de Entrada y Funciones Principales
- Lista de funciones exportadas principales, sus parámetros de entrada, salidas esperadas y posibles excepciones/errores.

## 6. Integraciones y Dependencias
- Conexión con Supabase, otros módulos de src/lib, o APIs externas.

---

A continuación el código fuente completo del módulo:

${codigoCompilado}
`;

  console.log(`🤖 Enviando prompt a Google Gemini (${modeloSeleccionado})...`);

  try {
    const respuesta = await ai.models.generateContent({
      model: modeloSeleccionado,
      contents: prompt,
    });

    const markdownGenerado = respuesta.text;
    if (!markdownGenerado) {
      throw new Error("El modelo retornó una respuesta vacía.");
    }

    const carpetaDestino = path.join("docs", "modulos");
    fs.mkdirSync(carpetaDestino, { recursive: true });
    const archivoDestino = path.join(carpetaDestino, `${moduloNombre}.md`);

    fs.writeFileSync(archivoDestino, markdownGenerado, "utf-8");
    console.log(`✅ ¡Documentación generada con éxito!`);
    console.log(`📂 Guardada en: ${archivoDestino}`);
  } catch (error: any) {
    console.error(`❌ Error al consultar la API de Gemini:`, error?.message || error);
    process.exit(1);
  }
}

main();
