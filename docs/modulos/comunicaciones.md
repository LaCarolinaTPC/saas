# Documentación del Módulo: comunicaciones

## 1. Visión General y Propósito

### Resumen Ejecutivo
El módulo **`comunicaciones`** es una solución integral de mensajería omnicanal centrada en la integración oficial con la API de **WhatsApp Business Cloud (Meta Graph API v21.0)** dentro del sistema ERP/SaaS de transporte. 

Resuelve la necesidad operativa de mantener un canal de comunicación directo, trazable y centralizado con la flota operative (conductores), los tenedores de vehículos (propietarios) y los aspirantes a vacantes de la empresa (candidatos en procesos de selección).

### Responsabilidades Principales
1. **Gestión de Mensajería WhatsApp:** Envío de mensajes de texto libre (dentro de la ventana de 24 horas permitida por Meta) y envío de plantillas de WhatsApp aprobadas (WABA) para iniciar conversaciones fuera de dicha ventana.
2. **Recepción e Ingesta de Datos (Webhooks):** Normalización, procesamiento y almacenamiento de mensajes entrantes (texto, imágenes, videos, audios, documentos, ubicación, respuestas interactivas, etc.) y de actualizaciones de estado (enviado, entregado, leído, fallido).
3. **Persistencia y Respaldo de Medios:** Descarga e ingesta automática de archivos multimedia desde los servidores temporales de Meta hacia el almacenamiento privado de la plataforma (Supabase Storage), garantizando su disponibilidad a largo plazo mediante URLs firmadas.
4. **Cruce de Datos de Negocio ("Ficha del Contacto"):** Enlazado dinámico entre el número telefónico de WhatsApp y las entidades clave del ERP (`conductores`, `propietarios`, `procesos_contratacion`), permitiendo a los operadores contextualizar inmediatamente con quién interactúan.
5. **Seguridad y Gestión de Credenciales:** Cifrado simétrico fuerte (AES-256-GCM) para tokens de acceso y secretos de integración de la API de Meta almacenados en base de datos.
6. **Control de Accesos y Permisos:** Validación de permisos en servidor (*Server Actions*) para delimitar quién puede interactuar con el módulo o gestionar la configuración del canal.

---

## 2. Arquitectura y Estructura de Archivos

### Archivos del Módulo

| Archivo | Rol y Propósito |
| :--- | :--- |
| `actions.ts` | **Server Actions de Next.js.** Puntos de entrada invocables desde la interfaz de usuario. Administra permisos, validaciones de envío (texto/plantillas), vinculación de candidatos y actualización de canales. |
| `cifrado.ts` | **Capa de Cryptografía.** Proporciona utilidades para cifrar y descifrar credenciales sensibles (Tokens de Meta) usando AES-256-GCM. Soporta fallback en texto plano si no se define clave maestra. |
| `data.ts` | **Consultas de Conversaciones y Chat.** Recupera el listado optimizado de conversaciones para la bandeja de entrada (evitando el problema N+1) y consulta el historial de mensajes formateado con URLs firmadas. |
| `ficha.ts` | **Capa de Integración de Entidades ERP.** Realiza la búsqueda y cruzado del número de WhatsApp contra las tablas `conductores`, `propietarios` y `procesos_contratacion`. |
| `formato.ts` | **Utilidades de UI.** Formateadores puros para visualización: fechas relativas, iniciales de usuario, paleta cromática determinista para avatares y formato de teléfono local (E.164 a visual). |
| `medios.ts` | **Gestión de Archivos Adjuntos (Storage).** Maneja la subida, firma temporal de URLs (1 hora) y la descarga/sincronización de medios entre Meta CDN y el bucket `whatsapp` de Supabase Storage. |
| `registro.ts` | **Operaciones de Persistencia Auxiliares.** Funciones para resolución/creación de conversaciones y contactos, registro de mensajes salientes en base de datos y traducción de errores de Meta. |
| `whatsapp.ts` | **Cliente de Meta WhatsApp Cloud API.** Implementación cliente para endpoints de Meta: envío de mensajes, gestión de plantillas WABA, prueba de credenciales, marcas de lectura y parser completo del payload de Webhooks. |

### Diagrama de Flujo Conceptual

```
                                  +-----------------------+
                                  |   Meta / WhatsApp     |
                                  |   Cloud API v21.0     |
                                  +-----------+-----------+
                                              ^
                                  (HTTP)      |      (Webhook)
                      +-----------------------+-----------------------+
                      |                                               |
                      v                                               v
        +---------------------------+                   +---------------------------+
        |   acciones.ts / data.ts   |                   |  whatsapp.ts (Parse)      |
        +-------------+-------------+                   +-------------+-------------+
                      |                                               |
                      v                                               v
       +------------------------------+                +------------------------------+
       |   medios.ts (Storage Backup) |                |   registro.ts (Persistencia) |
       +--------------+---------------+                +--------------+---------------+
                      |                                               |
                      +-----------------------+-----------------------+
                                              |
                                              v
                                +---------------------------+
                                |  Supabase DB & Storage    |
                                | (wa_conversaciones/msjs)  |
                                +-------------+-------------+
                                              ^
                                              | (Matching por Teléfono)
                                +-------------+-------------+
                                |    ficha.ts (Core ERP)    |
                                |  Conductores/Propietarios |
                                +---------------------------+
```

---

## 3. Modelos de Datos y Entidades

### Interfaces y Tipos TypeScript Clave

#### `ConversacionResumen` (`data.ts`)
Representa cada ítem dentro del listado principal de la bandeja de entrada.
```typescript
export interface ConversacionResumen {
  id: string;
  telefono: string;
  nombre: string | null;
  ultimoMensaje: string;
  ultimoMensajeAt: string;
  ultimoEntranteAt: string | null;
  noLeidos: number;
  esCandidato: boolean; // Indica si tiene un proceso_id vinculado
}
```

#### `MensajeChat` (`data.ts`)
Representa un mensaje individual dentro del hilo de una conversación.
```typescript
export interface MensajeChat {
  id: string;
  direccion: "entrante" | "saliente";
  contenido: string;
  estado: string | null;            // sent | delivered | read | failed
  errorMensaje: string | null;
  mediaTipo: string | null;          // image | video | audio | document | sticker
  mimeType: string | null;
  nombreArchivo: string | null;
  mediaUrl: string | null;           // URL firmada de Supabase Storage (1 hora)
  plantilla: string | null;
  enviadoPor: string | null;         // Email del usuario del ERP que envió el mensaje
  timestamp: string;
}
```

#### `FichaContacto` (`ficha.ts`)
Objeto consolidado que agrega el perfil de WhatsApp con la información operacional del ERP.
```typescript
export interface FichaContacto {
  telefono: string;
  nombreWhatsApp: string | null;
  desde: string | null;
  totalMensajes: number;
  entrantes: number;
  salientes: number;
  conductor: ConductorFicha | null;    // Datos de la tabla 'conductores'
  propietario: PropietarioFicha | null;// Datos de la tabla 'propietarios'
  proceso: ProcesoFicha | null;        // Datos de 'procesos_contratacion'
}
```

#### `Plantilla` (`whatsapp.ts`)
Definición de las plantillas oficiales aprobadas por Meta.
```typescript
export interface Plantilla {
  id: string;
  nombre: string;
  idioma: string;
  categoria: string;
  estado: string;
  componentes: PlantillaComponente[]; // Contiene estructuras HEADER, BODY, FOOTER, BUTTONS
}
```

### Tablas de Base de Datos y Almacenamiento

| Tabla / Bucket | Operaciones Realizadas | Propósito de Negocio |
| :--- | :--- | :--- |
| **`wa_canal`** | `SELECT`, `UPSERT` | Contiene la configuración del canal (Phone Number ID, WABA ID, Tokens cifrados, Verify Token). Un solo registro (`id = 1`). |
| **`wa_contactos`** | `SELECT`, `UPSERT` | Directorio de números telefónicos y nombres de perfil reportados por WhatsApp. |
| **`wa_conversaciones`** | `SELECT`, `UPDATE`, `UPSERT` | Hilos de conversación. Almacena contadores de mensajes no leídos, fecha del último mensaje y relación opcional con `proceso_id` (candidato). |
| **`wa_mensajes`** | `SELECT`, `INSERT`, `UPDATE` | Histórico de mensajes entrantes y salientes. Guarda metadatos de medios, `wamid`, estados de entrega y errores. |
| **`conductores`** | `SELECT` *(Read-only)* | Lectura de datos de conductores activos/inactivos para relacionar mediante matching de número celular. |
| **`propietarios`** | `SELECT` *(Read-only)* | Lectura de datos de propietarios de vehículos para el cruce telefónico. |
| **`procesos_contratacion`**| `SELECT` *(Read-only)* | Lectura de procesos de reclutamiento (candidatos) para enlazar chats con vacantes. |
| **`bucket: whatsapp`** | `UPLOAD`, `CREATE_SIGNED_URL` | Bucket de Supabase Storage para almacenamiento permanente de archivos binarios enviados o recibidos. |

---

## 4. Reglas de Negocio y Lógica Crítica

### 1. Política de la Ventana de 24 Horas de Meta
* **Mensajes de Texto Libre:** Solo pueden enviarse si la conversación está dentro de la ventana de 24 horas (desde el último mensaje recibido del usuario). Si se intenta enviar fuera de tiempo, Meta retorna el código de error `131047`. El módulo captura este error y lo transforma en una advertencia clara para el operador (`actions.ts` y `registro.ts`).
* **Plantillas Aprobadas (WABA):** Es la única vía permitida para iniciar conversaciones o responder a hilos cuya ventana de 24 horas ha expirado. Al enviar una plantilla, no se abre inmediatamente la ventana de 24 horas; esta solo se abre cuando el cliente responde.

### 2. Normalización de Teléfonos y Matching Inteligente
* **Formato Interno:** Los números telefónicos en Colombia (10 dígitos comenzando por `3`) son convertidos automáticamente al estándar E.164 agregando el código de país `57` (ej. `3001234567` $\rightarrow$ `573001234567`).
* **Matching por Tensión Mínima de Dígitos:** Dado que los registros de conductores o propietarios en el ERP pueden contener espacios, guiones o carecer de indicativo, el módulo aplica una regla en memoria (`mismoTelefono` en `ficha.ts`) que valida si los **últimos 10 dígitos** coinciden. La consulta SQL previa filtra dinámicamente usando los **últimos 7 dígitos** (`%XXXXXXX%`).

### 3. Mecanismo de Cifrado de Credenciales (`cifrado.ts`)
* **Algoritmo:** `aes-256-gcm`.
* **Estructura del Texto Cifrado:** `${iv_hex}:${auth_tag_hex}:${ciphertext_hex}`.
* **Seguridad Gradual:** Requiere una clave hexadecimal de 64 caracteres (`ENCRYPTION_KEY` de 32 bytes). Si la variable no existe en el entorno, el módulo almacena los valores en texto plano (aprovechando que la tabla `wa_canal` solo es accesible mediante la directiva `service_role`). El sistema detecta dinámicamente si el texto está cifrado mediante expresiones regulares antes de intentar descifrarlo.

### 4. Ciclo de Vida y Respaldo de Archivos Multimedia (`medios.ts`)
* **Vencimiento en Meta:** La API de Meta elimina los archivos multimedia de sus servidores CDN transcurridos ~30 días.
* **Respaldo Automático:** Toda imagen, audio, video o documento entrante/saliente es respaldado en el bucket privado de Supabase Storage (`whatsapp`).
* **Acceso Seguro:** La aplicación cliente nunca expone la ruta directa del bucket; los enlaces se generan mediante **URLs firmadas con tiempo de expiración de 60 minutos** (`URL_FIRMADA_SEG = 3600`).
* **Lazy Archiving (`asegurarMedios`):** Al consultar mensajes, si existen registros con `media_id` pero sin `media_path` (que no superen los 29 días), el sistema intenta automáticamente descargarlos de Meta y almacenarlos en Supabase Storage (hasta un máximo de 10 adjuntos por llamada).

### 5. Prevención de Consultas N+1 (`data.ts`)
Al listar las conversaciones en la bandeja de entrada, en lugar de consultar el último mensaje de cada conversación en bucle, se ejecuta una consulta agregada agrupando los IDs activos (`in('conversacion_id', ids)`) limitando el resultado a los últimos 600 mensajes, mapeando el resultado en memoria mediante una estructura de mapa tipo `Map<string, string>`.

---

## 5. Puntos de Entrada y Funciones Principales

### Server Actions (`actions.ts`)

#### `enviarMensaje(conversacionId: string, texto: string)`
* **Propósito:** Envía un mensaje de texto libre a un hilo existente.
* **Parámetros:** `conversacionId` (UUID de la conversación), `texto` (String de hasta 4096 caracteres).
* **Retorno:** `{ ok: boolean; error?: string }`
* **Excepciones/Validaciones:** Valida permisos de usuario, mensaje no vacío, longitud máxima, existencia de la conversación y errores retornados por Meta (ej. ventana cerrada).

#### `enviarMensajePlantilla(input: {...})`
* **Propósito:** Envía una plantilla estructurada. Permite enviar a un hilo existente o crear un contacto/conversación nuevo desde cero.
* **Parámetros (`input`):**
  * `conversacionId` (opcional)
  * `telefono` (opcional, si es un número nuevo)
  * `nombreContacto` (opcional)
  * `plantilla`: Objeto tipo `Plantilla`
  * `encabezado`: Array de variables para el header
  * `cuerpo`: Array de variables para el body
* **Retorno:** `{ ok: boolean; error?: string; conversacionId?: string }`
* **Lógica:** Valida las variables según el conteo de la plantilla, renderiza la previsualización, procesa la llamada a Meta y registra el mensaje saliente.

#### `guardarCanal(input: {...})`
* **Propósito:** Configura las credenciales globales del canal de WhatsApp.
* **Acceso:** Exclusivo para administradores (`isAdmin`).
* **Lógica Critical:** Antes de guardar en base de datos, llama a Meta (`probarCredenciales`) para verificar que el token sea válido. Cifra los tokens antes de guardarlos en `wa_canal`.

---

### Data Fetchers (`data.ts` y `ficha.ts`)

#### `getConversaciones(): Promise<ConversacionResumen[]>`
* **Propósito:** Obtiene las últimas 200 conversaciones ordenadas por fecha del último mensaje. Resuelve datos del contacto y último extracto de texto.

#### `getMensajes(conversacionId: string): Promise<MensajeChat[]>`
* **Propósito:** Carga hasta 500 mensajes de una conversación.
* **Efecto Secundario:** Restablece implícitamente el contador `no_leidos = 0` en `wa_conversaciones` y genera URLs firmadas para los medios adjuntos.

#### `getFichaContacto(conversacionId: string): Promise<FichaContacto | null>`
* **Propósito:** Obtiene el contexto completo del contacto. Cruza el número telefónico contra las tablas `conductores`, `propietarios` y `procesos_contratacion`.

---

### Cliente de Webhook & Parsing (`whatsapp.ts`)

#### `parseWebhook(body: any)`
* **Propósito:** Parsea el payload JSON complejo enviado por el Webhook de Meta.
* **Salida:** `{ mensajes: MensajeEntrante[]; estados: EstadoMensaje[] }`
* **Tipos de Mensajes Soportados:** Texto libre, imágenes, video, audio, documentos, stickers, ubicación geográfica, contactos compartidos, reacciones (emojis) y botones/respuestas interactivas.

---

## 6. Integraciones y Dependencias

### Servicios Externos
* **Meta WhatsApp Business Cloud API (v21.0):**
  * Endpoint Base: `https://graph.facebook.com/v21.0`
  * Operaciones: Envío de mensajes (`/{phone_number_id}/messages`), carga/descarga de medios (`/{media_id}`), listado de plantillas (`/{waba_id}/message_templates`).

### Dependencias del Proyecto (`src/lib`)
* **`@/lib/supabase/admin` (`createAdminClient`):** Cliente de Supabase ejecutado con privilegios de administrador (`service_role`), necesario para bypass de RLS en operaciones de lectura/escritura de conversaciones y canal.
* **`@/lib/permissions` (`getCurrentPermissions`):** Sistema centralizado de RBAC (Control de Acceso Basado en Roles) del ERP. Valida el rol `isAdmin` o la inclusión del módulo `"comunicaciones"`.

### Módulos del Sistema Operativo Node.js
* **`crypto` (`randomBytes`, `createCipheriv`, `createDecipheriv`):** Empleado directamente para la implementación del cifrado de seguridad AES-256-GCM.

### Variables de Entorno Requeridas
* `ENCRYPTION_KEY`: Clave hexadecimal de 64 caracteres (32 bytes) para cifrado de tokens (opcional pero recomendado).
* `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`: Variables de respaldo por si no existe configuración activa en la tabla `wa_canal`.