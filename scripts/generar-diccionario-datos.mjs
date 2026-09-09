import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const sourceRoots = [path.join(root, "src"), path.join(root, "supabase", "seed")];
const output = path.join(root, "docs", "diccionario-datos-gestivo.md");

const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
const schema = new Map();

function cleanIdent(value) {
  return value.replace(/^["']|["']$/g, "").replace(/^public\./i, "").toLowerCase();
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0, depth = 0, quote = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote && value[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function extractCreates(sql, file) {
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ");
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(["']?[a-z_][\w$]*["']?)\s*\(/ig;
  let match;
  while ((match = re.exec(sql))) {
    let depth = 1, quote = null, i = re.lastIndex;
    for (; i < sql.length && depth > 0; i++) {
      const c = sql[i];
      if (quote) {
        if (c === quote && sql[i - 1] !== "\\") quote = null;
      } else if (c === "'" || c === '"') quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    const table = cleanIdent(match[1]);
    const entry = schema.get(table) ?? { name: table, columns: new Map(), createdIn: file, changes: [] };
    for (const raw of splitTopLevel(sql.slice(re.lastIndex, i - 1))) {
      const line = raw.trim().replace(/\s+/g, " ");
      const like = line.match(/^like\s+(?:public\.)?(["']?[a-z_][\w$]*["']?)/i);
      if (like) {
        const source = schema.get(cleanIdent(like[1]));
        if (source) for (const column of source.columns.values()) entry.columns.set(column.name, { ...column, addedIn: file });
        continue;
      }
      if (!line || /^(constraint|primary\s+key|foreign\s+key|unique\s*\(|check\s*\(|exclude\s*\()/i.test(line)) continue;
      const cm = line.match(/^(["']?[a-z_][\w$]*["']?)\s+(.+)$/i);
      if (!cm) continue;
      const name = cleanIdent(cm[1]);
      entry.columns.set(name, { name, definition: cm[2].replace(/,$/, "").trim(), addedIn: file });
    }
    schema.set(table, entry);
    re.lastIndex = i;
  }
}

function applyAlters(sql, file) {
  const statements = sql.split(/;\s*(?:\r?\n|$)/);
  for (const statement of statements) {
    const compact = statement.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim();
    const tm = compact.match(/^alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(["']?[a-z_][\w$]*["']?)\s+(.+)$/i);
    if (!tm) continue;
    const table = cleanIdent(tm[1]);
    const entry = schema.get(table);
    if (!entry) continue;
    const action = tm[2];
    for (const am of action.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(["']?[a-z_][\w$]*["']?)\s+(.+?)(?=,\s*add\s+column|$)/ig)) {
      const name = cleanIdent(am[1]);
      entry.columns.set(name, { name, definition: am[2].trim(), addedIn: file });
      entry.changes.push(`${file}: se agregó \`${name}\``);
    }
    for (const dm of action.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?(["']?[a-z_][\w$]*["']?)/ig)) {
      const name = cleanIdent(dm[1]);
      entry.columns.delete(name);
      entry.changes.push(`${file}: se eliminó \`${name}\``);
    }
    const rm = action.match(/rename\s+column\s+(["']?[a-z_][\w$]*["']?)\s+to\s+(["']?[a-z_][\w$]*["']?)/i);
    if (rm) {
      const oldName = cleanIdent(rm[1]), newName = cleanIdent(rm[2]);
      const column = entry.columns.get(oldName);
      if (column) {
        entry.columns.delete(oldName);
        entry.columns.set(newName, { ...column, name: newName, addedIn: file });
      }
    }
    const type = action.match(/alter\s+column\s+(["']?[a-z_][\w$]*["']?)\s+type\s+(.+?)(?:\s+using\s+|$)/i);
    if (type) {
      const name = cleanIdent(type[1]);
      const column = entry.columns.get(name);
      if (column) column.definition = type[2].trim();
    }
  }
}

for (const file of migrationFiles) extractCreates(fs.readFileSync(path.join(migrationsDir, file), "utf8"), file);
for (const file of migrationFiles) applyAlters(fs.readFileSync(path.join(migrationsDir, file), "utf8"), file);
for (const file of migrationFiles) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  for (const match of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(["']?[a-z_][\w$]*["']?)/ig)) schema.delete(cleanIdent(match[1]));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const codeFiles = sourceRoots.flatMap(walk).filter((f) => /\.(?:ts|tsx|js|mjs)$/.test(f));
const code = codeFiles.map((file) => ({ file, text: fs.readFileSync(file, "utf8") }));

const tablePurpose = {
  profiles: "Perfil, rol y alcance organizacional de cada usuario autenticado.", departments: "Catálogo de áreas/departamentos.", vacancies: "Vacantes abiertas o cerradas del proceso de selección.", candidates: "Datos personales y de contacto de aspirantes.", candidate_vacancy: "Vincula candidatos con vacantes y conserva su etapa actual.", stage_history: "Historial de movimientos del candidato entre etapas.", notes: "Notas internas asociadas a candidatos.", employees: "Maestro de empleados sincronizados o creados manualmente.", document_categories: "Catálogo de categorías documentales.", documents: "Metadatos de documentos de empleados.", employee_events: "Eventos laborales del empleado.", disciplinary_records: "Procesos o registros disciplinarios.", webhook_logs: "Bitácora de entregas de webhooks.", whatsapp_messages: "Mensajes de WhatsApp del módulo legado.", notifications: "Notificaciones internas para usuarios.", webhook_configs: "Configuración de integraciones salientes.", conductores: "Maestro analítico de conductores para rotación y rendimiento.", cierres_diarios: "Producción y cierre diario por conductor/vehículo.", viajes_perdidos: "Viajes no realizados y su causal.", ausentismo: "Dataset histórico/importado de ausentismo usado en analítica de rotación.", familia: "Composición o datos familiares del conductor.", data_uploads: "Trazabilidad de archivos cargados al módulo de rotación.", incentivos: "Incentivos reconocidos a conductores.", accidentes: "Cabecera del reporte de accidente y su investigación.", accidente_vehiculos: "Vehículos involucrados en un accidente.", accidente_eventos: "Trazabilidad de eventos/cambios del accidente.", app_settings: "Parámetros configurables de la aplicación.", propietarios: "Propietarios importados desde GEMA.", ingreso_tercero: "Ingresos de terceros importados desde GEMA.", viajes_recaudados: "Viajes y recaudo importados desde GEMA.", gema_sync_state: "Estado y marcas de agua de sincronización con GEMA.", recruitment_daily_metrics: "Métricas diarias del embudo de reclutamiento.", meta_campaigns: "Campañas publicitarias de Meta.", meta_spend_daily: "Inversión diaria por campaña de Meta.", user_types: "Roles funcionales y matriz de permisos.", pipeline_stages: "Etapas configurables del pipeline de selección.", accidente_evaluaciones: "Evaluación y decisión de revisión de accidentes.", procesos_contratacion: "Seguimiento operativo de contratación.", puntos_virtuales: "Maestro de puntos virtuales/geográficos operativos.", api_keys: "Credenciales hash y permisos de la API externa.", devengados_entregas: "Entregas de dinero y movimientos del flujo de devengados.", tesoreria_audit_log: "Auditoría de acciones sensibles de tesorería.", devengados_bloqueos: "Bloqueos de operación por fecha en devengados.", ausentismo_registros: "Casos transaccionales de ausentismo con soporte y seguimiento.", ausentismo_log: "Auditoría de cambios en casos de ausentismo.", api_request_logs: "Bitácora de consumo de la API externa.", mantenimiento_conceptos: "Catálogo de conceptos de mantenimiento.", mantenimiento_alertas: "Alertas preventivas/correctivas de mantenimiento.", mantenimiento_reportes: "Reportes de daño o necesidad de mantenimiento.", mantenimiento_auditoria: "Auditoría del módulo de mantenimiento.", geo_direcciones: "Caché de geocodificación de direcciones.", vehiculos: "Maestro de vehículos sincronizado con GEMA.", velocidades: "Lecturas o eventos de velocidad obtenidos de GEMA.", pv_deltas: "Deltas operativos por punto virtual usados en mapas y análisis.", geo_trazados: "Trazados geográficos calculados para rutas.", wa_contactos: "Contactos del canal de WhatsApp.", wa_conversaciones: "Conversaciones y estado de atención por WhatsApp.", wa_mensajes: "Mensajes entrantes y salientes de conversaciones.", wa_canal: "Configuración cifrada del canal de WhatsApp.", mantenimiento_frenos: "Mediciones e historial de graduación de frenos.", ausentismo_conceptos: "Catálogo normalizado de conceptos de ausentismo.", ausentismo_catalogos: "Catálogos validados usados por la matriz de ausentismo.", ausentismo_duplicados: "Registros detectados como posibles duplicados en cargas.", ausentismo_notificaciones: "Notificaciones y evidencias de descargos/terminación.", operativo_documento_tipos: "Tipos y reglas de documentos obligatorios del vehículo.", operativo_vehiculo_documentos: "Documentos y vencimientos registrados por vehículo.", operativo_velocidad_parametros: "Umbrales configurables para detectar exceso de velocidad.", operativo_velocidad_reportes: "Incidencias de velocidad consolidadas y reportadas a RR. HH."
};

const words = {
  id: "Identificador único del registro.", created_at: "Fecha y hora de creación; sirve para ordenar y auditar.", updated_at: "Fecha y hora de la última modificación.", deleted_at: "Marca de eliminación lógica; permite excluir sin borrar físicamente.", created_by: "Usuario que creó el registro.", updated_by: "Usuario que realizó la última modificación.", cedula: "Documento de identidad usado para identificar y cruzar personas.", email: "Correo electrónico para contacto o identidad.", phone: "Número telefónico de contacto.", telefono: "Número telefónico de contacto.", nombre: "Nombre legible mostrado en la interfaz y reportes.", name: "Nombre legible mostrado en la interfaz y reportes.", codigo: "Código del sistema origen o catálogo para identificación e integración.", estado: "Estado del ciclo de vida que controla filtros y acciones permitidas.", status: "Estado del ciclo de vida que controla filtros y acciones permitidas.", fecha: "Fecha de ocurrencia usada en filtros, periodos e indicadores.", observaciones: "Texto libre de contexto operativo y seguimiento.", metadata: "Datos adicionales flexibles en formato JSON.", source_id: "Identificador en el sistema origen; evita duplicados y permite reconciliación.", origen: "Sistema o mecanismo del que provino el dato.", activo: "Indica si el registro está disponible para uso operativo.", active: "Indica si el registro está disponible para uso operativo.", placa: "Placa del vehículo usada para cruces operativos.", vehiculo_id: "Referencia al vehículo relacionado.", employee_id: "Referencia al empleado relacionado.", candidate_id: "Referencia al candidato relacionado.", user_id: "Referencia al usuario autenticado relacionado.", config: "Configuración flexible consumida por el módulo correspondiente."
};

function describeColumn(name, definition, table) {
  if (words[name]) return words[name];
  if (/_id$/.test(name)) return `Referencia al registro de ${name.replace(/_id$/, "").replaceAll("_", " ")}.`;
  if (/^fecha_|_fecha$|date|_at$/.test(name)) return "Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso.";
  if (/^(es_|tiene_|permite_|requiere_|enviado_|procesado_|activo_)/.test(name) || /boolean/i.test(definition)) return "Indicador lógico que habilita, clasifica o controla una regla del proceso.";
  if (/valor|monto|salario|costo|total|precio|recaudo|devengado|saldo/.test(name)) return "Valor monetario o acumulado usado en cálculos, conciliación y reportes.";
  if (/cantidad|numero|conteo|dias|horas|minutos|kilometros|km|velocidad|porcentaje|latitud|longitud/.test(name)) return "Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación.";
  if (/tipo|categoria|concepto|motivo|causa|clasificacion|etapa|rol|cargo/.test(name)) return "Clasificación del registro para aplicar reglas, segmentar y reportar.";
  if (/url|path|archivo|documento|soporte|adjunto|foto|firma|audio/.test(name)) return "Referencia o metadato de un archivo/evidencia usado por el proceso.";
  if (/descripcion|detalle|comentario|mensaje|contenido|direccion|respuesta/.test(name)) return "Contenido descriptivo mostrado o utilizado como contexto del registro.";
  const label = name.replaceAll("_", " ");
  return `Almacena «${label}» como parte de ${table}; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo.`;
}

function usageFor(table) {
  const hits = [];
  for (const item of code) {
    const regex = new RegExp(`(?:from\\s*\\(\\s*[\\"']${table}[\\"']|\\b${table}\\b)`, "i");
    const m = regex.exec(item.text);
    if (!m) continue;
    const around = item.text.slice(Math.max(0, m.index - 300), m.index + 900);
    const ops = [];
    if (/\.select\s*\(/i.test(around)) ops.push("consulta");
    if (/\.insert\s*\(/i.test(around)) ops.push("alta");
    if (/\.upsert\s*\(/i.test(around)) ops.push("sincronización/upsert");
    if (/\.update\s*\(/i.test(around)) ops.push("actualización");
    if (/\.delete\s*\(/i.test(around)) ops.push("eliminación");
    hits.push({ file: path.relative(root, item.file).replaceAll("\\", "/"), ops: [...new Set(ops)] });
  }
  return hits;
}

function moduleFor(table) {
  const groups = {
    "Accidentabilidad": ["accidentes", "accidente_vehiculos", "accidente_eventos", "accidente_evaluaciones"],
    "Ausentismo": ["ausentismo", "ausentismo_registros", "ausentismo_log", "ausentismo_conceptos", "ausentismo_catalogos", "ausentismo_duplicados", "ausentismo_notificaciones"],
    "Comunicaciones": ["whatsapp_messages", "wa_canal", "wa_contactos", "wa_conversaciones", "wa_mensajes"],
    "Configuración, acceso e integración": ["profiles", "user_types", "app_settings", "api_keys", "api_request_logs", "webhook_configs", "webhook_logs", "notifications"],
    "Gestión documental y empleados": ["employees", "document_categories", "documents", "employee_events", "disciplinary_records"],
    "Integración GEMA": ["propietarios", "ingreso_tercero", "viajes_recaudados", "gema_sync_state"],
    "Mantenimiento": ["mantenimiento_conceptos", "mantenimiento_alertas", "mantenimiento_reportes", "mantenimiento_auditoria", "mantenimiento_frenos"],
    "Operativo": ["vehiculos", "velocidades", "puntos_virtuales", "pv_deltas", "geo_direcciones", "geo_trazados", "operativo_documento_tipos", "operativo_vehiculo_documentos", "operativo_velocidad_parametros", "operativo_velocidad_reportes"],
    "Reclutamiento y contratación": ["departments", "vacancies", "candidates", "candidate_vacancy", "stage_history", "notes", "procesos_contratacion", "pipeline_stages", "recruitment_daily_metrics", "meta_campaigns", "meta_spend_daily"],
    "Rotación y rendimiento": ["conductores", "cierres_diarios", "viajes_perdidos", "familia", "incentivos", "data_uploads"],
    "Tesorería/devengados": ["devengados_entregas", "devengados_bloqueos", "tesoreria_audit_log"]
  };
  return Object.entries(groups).find(([, tables]) => tables.includes(table))?.[0] ?? "Transversal";
}

function fieldUsage(column, tableUsage) {
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "g");
  const hits = tableUsage
    .map((u) => ({ ...u, count: (code.find((c) => path.relative(root, c.file).replaceAll("\\", "/") === u.file)?.text.match(re) ?? []).length }))
    .filter((u) => u.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!hits.length) return "Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa.";
  const shown = hits.slice(0, 3).map((h) => `\`${h.file}\``).join("<br>");
  return `${shown}${hits.length > 3 ? `<br>y ${hits.length - 3} archivo(s) más` : ""}`;
}

const active = [...schema.values()].sort((a, b) => a.name.localeCompare(b.name));
const grouped = new Map();
for (const table of active) {
  table.usage = usageFor(table.name);
  table.module = moduleFor(table.name);
  if (!grouped.has(table.module)) grouped.set(table.module, []);
  grouped.get(table.module).push(table);
}

const lines = [];
lines.push("# Diccionario de datos y uso de campos en Gestivo", "", `> Estado reconstruido desde las migraciones y el código del repositorio al ${new Date().toISOString().slice(0, 10)}.`, "", "## Resumen técnico", "", `Se identificaron **${active.length} tablas activas** en el esquema administrado por las migraciones. El documento explica para qué existe cada tabla, qué representa cada campo y en qué partes de Gestivo se encontró uso directo.`, "", "La etiqueta **sin referencia directa encontrada** no significa que la tabla esté vacía o sea inútil: puede ser consumida por SQL (funciones, vistas o triggers), por integraciones externas o por una ruta construida dinámicamente. El inventario describe el esquema esperado por el repositorio, no una introspección de la base desplegada.", "", "## Cómo leer este documento", "", "- **Definición SQL** conserva tipo, nulabilidad, valor por defecto y restricciones declaradas cuando están disponibles.", "- **Uso del campo** explica su función de negocio o técnica; las descripciones genéricas se marcan por el contexto del nombre y tipo.", "- **Uso comprobado en Gestivo** enumera archivos de aplicación o semillas donde aparece la tabla y clasifica las operaciones detectadas.", "- El esquema `auth` y tablas internas de Supabase no se incluyen porque Gestivo no las crea mediante estas migraciones.", "", "## Inventario general", "", "| Módulo | Tablas |", "|---|---:|");
for (const [module, tables] of [...grouped.entries()].sort()) lines.push(`| ${module} | ${tables.length} |`);
lines.push("");

for (const [module, tables] of [...grouped.entries()].sort()) {
  lines.push(`## ${module}`, "");
  for (const table of tables) {
    lines.push(`### \`${table.name}\``, "", tablePurpose[table.name] ?? "Tabla operativa del sistema Gestivo.", "", `- **Origen del esquema:** \`supabase/migrations/${table.createdIn}\``);
    if (table.usage.length) {
      const ops = [...new Set(table.usage.flatMap((u) => u.ops))];
      lines.push(`- **Operaciones detectadas:** ${ops.length ? ops.join(", ") : "referencia/uso indirecto"}`);
      lines.push("- **Uso comprobado en Gestivo:**");
      for (const hit of table.usage.slice(0, 8)) lines.push(`  - \`${hit.file}\`${hit.ops.length ? ` — ${hit.ops.join(", ")}` : ""}`);
      if (table.usage.length > 8) lines.push(`  - … y ${table.usage.length - 8} archivo(s) adicionales.`);
    } else lines.push("- **Uso comprobado en Gestivo:** sin referencia directa encontrada en `src/` ni en las semillas.");
    lines.push("", "| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |", "|---|---|---|---|");
    for (const column of table.columns.values()) lines.push(`| \`${column.name}\` | \`${column.definition.replaceAll("|", "\\|")}\` | ${describeColumn(column.name, column.definition, table.name)} | ${fieldUsage(column.name, table.usage)} |`);
    if (!table.columns.size) lines.push("| — | — | No fue posible reconstruir columnas desde el SQL estático. | — |");
    lines.push("");
  }
}

lines.push("## Relaciones y flujos principales", "", "- **Selección:** `candidates` → `candidate_vacancy` → `stage_history` / `notes` → `procesos_contratacion` → `employees`.", "- **Rotación:** `conductores` concentra la persona; `cierres_diarios`, `viajes_perdidos`, `ausentismo`, `familia`, `incentivos` y `accidentes` aportan señales para análisis y fichas.", "- **Tesorería:** `cierres_diarios` alimenta cálculos de devengados; `devengados_entregas` registra movimientos; `devengados_bloqueos` controla fechas y `tesoreria_audit_log` conserva trazabilidad.", "- **Mantenimiento:** `vehiculos` es el maestro; `mantenimiento_reportes`, `mantenimiento_alertas`, `mantenimiento_frenos` y `mantenimiento_auditoria` registran ejecución, alertas y control.", "- **Operación:** `velocidades`, `pv_deltas`, `puntos_virtuales`, `geo_direcciones` y `geo_trazados` soportan mapas, recorridos e incidencias; los documentos del vehículo viven en `operativo_vehiculo_documentos`.", "- **Comunicaciones:** `wa_contactos` agrupa la identidad, `wa_conversaciones` el caso de atención y `wa_mensajes` el intercambio; `wa_canal` configura el proveedor.", "", "## Limitaciones y mantenimiento", "", "1. El resultado se reconstruye estáticamente; debe contrastarse con `information_schema` si se sospechan cambios manuales en producción.", "2. Las consultas dinámicas, funciones SQL, vistas, triggers y consumidores externos pueden usar campos que no aparecen directamente en TypeScript.", "3. Cuando se agregue una migración, ejecute `node scripts/generar-diccionario-datos.mjs` y revise las descripciones nuevas antes de publicar.", "4. No se exponen secretos ni valores reales: el documento describe estructura y finalidad, no contenido de producción.", "", "## Fuentes", "", "- `supabase/migrations/*.sql`: definición y evolución del esquema.", "- `src/**/*.{ts,tsx}`: uso en páginas, acciones, API y servicios de Gestivo.", "- `supabase/seed/*.ts`: procesos de carga y datos de desarrollo.");

fs.writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Generado ${path.relative(root, output)} con ${active.length} tablas y ${active.reduce((n, t) => n + t.columns.size, 0)} campos.`);
