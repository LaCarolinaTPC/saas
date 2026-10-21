Esta es la documentación técnica del módulo `exportar`, diseñada bajo estándares de arquitectura de software para facilitar su mantenimiento y escalabilidad.

---

# Documentación del Módulo: exportar

## 1. Visión General y Propósito
El módulo `exportar` es una utilidad de infraestructura encargada de transformar datos tabulares (procedentes del ERP de transporte) en formatos de archivo consumibles por el usuario final (PDF y CSV).

- **Problema de negocio:** Facilita la extracción de reportes, historiales y resúmenes operativos desde la interfaz web hacia formatos offline, garantizando compatibilidad con herramientas de oficina (Excel, lectores PDF) y manteniendo la identidad visual de la empresa ("La Carolina").
- **Responsabilidades:**
    - Formateo de datos a CSV compatible con Excel (manejo de BOM y separadores).
    - Generación dinámica de reportes PDF estilizados con encabezados, logos, paginación y segmentación lógica.
    - Normalización de caracteres especiales (limpieza de fuentes para compatibilidad WinAnsi).

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol | Propósito |
| :--- | :--- | :--- |
| `csv.ts` | Utilidad | Lógica de serialización y descarga de archivos CSV. |
| `formatos.ts` | Definición | Tipos compartidos para los formatos de salida (`pdf`, `xlsx`, `csv`). |
| `pdf-tabla.ts` | Motor | Lógica compleja de generación de PDF utilizando `jsPDF` y `jspdf-autotable`. |

### Flujo de generación (PDF)
```mermaid
graph TD
    A[Llamada a descargarPdfTabla] --> B[Cargar Logo y Dependencias]
    B --> C[Configurar Documento jsPDF]
    C --> D[Dibujar Encabezado (Logo, Título, Contexto)]
    D --> E{¿Existen Secciones?}
    E -- Sí --> F[Renderizar tablas por sección]
    E -- No --> G[Renderizar tabla principal]
    F --> H[Renderizar Anexos y Notas]
    G --> H
    H --> I[Generar totales de página y Guardar]
```

## 3. Modelos de Datos y Entidades

### Tipos Clave (TypeScript)
- `CeldaCsv`: Unión de tipos básicos para celdas CSV.
- `InformePdf`: Interfaz raíz para la construcción del reporte. Contiene metadatos (`archivo`, `modulo`, `titulo`), `contexto` (filtros), `columnas` y `filas` (cuerpo de la tabla).
- `CeldaPdfEstilada`: Permite modificar dinámicamente el estilo de una celda (fondo, color, negrita).

### Interacción con Base de Datos
Este módulo es **agnóstico a la base de datos**. No realiza consultas SQL ni llamadas a Supabase directamente; recibe los datos ya procesados desde las capas de servicio o componentes de UI, lo que favorece el desacoplamiento.

## 4. Reglas de Negocio y Lógica Crítica
- **Compatibilidad con Excel (CSV):** Se fuerza el uso del carácter `\uFEFF` (BOM - Byte Order Mark) y el punto y coma (`;`) como separador para asegurar que Excel reconozca la codificación UTF-8 automáticamente en español.
- **Normalización (WinAnsi):** La función `saneaWinAnsi` es crítica. Dado que `jsPDF` utiliza fuentes estándar con codificación WinAnsi, se eliminan o reemplazan caracteres no soportados (emojis, guiones tipográficos, flechas) para evitar errores de renderizado.
- **Manejo de Memoria:** Uso de `URL.revokeObjectURL()` tras la descarga para liberar recursos de memoria del navegador.
- **Paginación y Encabezados:** El módulo implementa una lógica de "dibujado repetitivo". En cada salto de página, se vuelve a invocar `dibujarEncabezado` para mantener el contexto del reporte en todas las hojas.

## 5. Puntos de Entrada y Funciones Principales

*   **`descargarCsv(nombre: string, filas: CeldaCsv[][])`**:
    *   *Input:* Nombre del archivo, matriz de datos.
    *   *Output:* Dispara una descarga inmediata en el navegador.
*   **`descargarPdfTabla(inf: InformePdf)`**:
    *   *Input:* Objeto `InformePdf` con la configuración completa.
    *   *Output:* Genera, renderiza y guarda el archivo `.pdf`.
    *   *Excepciones:* La carga del logo y dependencias (`jsPDF`) es dinámica; si falla, el reporte se genera pero sin el logo.

## 6. Integraciones y Dependencias
- **`jsPDF` y `jspdf-autotable`**: Librerías externas para la manipulación de documentos PDF. Se importan mediante *Dynamic Imports* (`import(...)`) para reducir el tamaño del bundle inicial de la aplicación.
- **Nativo del Navegador**: Utiliza la API `Blob` y `URL.createObjectURL` para la generación de archivos en cliente.
- **Infraestructura**: El logo se sirve desde una ruta estática predefinida (`/sgc/logo-formato.png`).