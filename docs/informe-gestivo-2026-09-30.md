# Informe de la plataforma Gestivo

**Corte:** 30 de septiembre de 2026
**Fuente:** historial del repositorio (425 commits) y menú de la aplicación (`src/lib/constants.ts`).

Gestivo es la plataforma de gestión humana, operativa y financiera de La Carolina de Transporte. Toma los datos
operativos de GEMA (despacho, recaudo, vehículos, conductores), los guarda en Supabase y los presenta por
departamento, con permisos por módulo y por usuario.

---

## 1. Fecha de inicio y etapas

| Hito | Fecha |
|------|-------|
| Primer commit (creación del proyecto) | **2026-03-20** |
| Primera versión en línea (`gestivo.vercel.app`, conexión a Supabase y webhook de Varylo) | 2026-03-24 |
| Pausa sin desarrollo | abril y mayo de 2026 |
| Reanudación con el módulo de Rotación | 2026-06-03 |
| Conexión directa a GEMA (reemplaza las cargas en Excel) | 2026-06-17 |
| Último cambio a la fecha de corte | 2026-09-29 |

**Actividad por mes (commits):**

| Mes | Commits | Qué se construyó |
|-----|--------:|------------------|
| Marzo 2026 | 48 | Base de RR. HH.: vacantes, candidatos, empleados, documentos, webhook de Varylo |
| Abril – mayo 2026 | 0 | Pausa |
| Junio 2026 | 38 | Rotación, Accidentabilidad, sincronización con GEMA, Campañas, usuarios y permisos, Data API |
| Julio 2026 | 94 | Contratación, API por recurso, Devengados (Tesorería), Simulador, Ausentismo, Rendimiento del día |
| Agosto 2026 | 23 | Liquidación conductor, Producción conductor, Liquidación de producción, Mantenimiento |
| Septiembre 2026 | 222 | Mapa de calor, Comunicaciones, Operativo, Riesgo, Incapacidades, servidor MCP, Gestión Resultado Flota, Liquidación de afiliados y su portal, nuevo menú |

---

## 2. Módulos: fechas de gestión

"Inicio" es el primer commit que crea el módulo; "última gestión", el último que lo modificó. La columna de commits
cuenta los que tocaron sus pantallas o su lógica.

| Grupo del menú | Módulo | Inicio | Última gestión | Commits |
|----------------|--------|--------|----------------|--------:|
| — | Dashboard | 2026-03-24 | 2026-03-24 | 1 |
| Accidentabilidad | Reportar y consultar accidentes | 2026-06-04 | 2026-09-08 | 5 |
| Recursos Humanos | Vacantes | 2026-03-24 | 2026-07-03 | 4 |
| Recursos Humanos | Candidatos | 2026-03-24 | 2026-09-15 | 19 |
| Recursos Humanos | Empleados | 2026-03-24 | 2026-09-08 | 16 |
| Recursos Humanos | Conductores | 2026-06-17 | 2026-09-08 | 8 |
| Recursos Humanos | Ausentismo | 2026-07-27 | 2026-09-25 | 32 |
| Recursos Humanos | Incapacidades | 2026-09-11 | 2026-09-29 | 10 |
| Recursos Humanos | Riesgo | 2026-09-10 | 2026-09-14 | 11 |
| Recursos Humanos | Documentos | 2026-03-24 | 2026-09-08 | 11 |
| Recursos Humanos | Campañas | 2026-06-17 | 2026-09-11 | 6 |
| Recursos Humanos | Contratación (sin entrada propia en el menú) | 2026-07-02 | 2026-07-03 | 11 |
| Rotación | Conductores, Rendimiento, Mapa de calor, Alarmas, Datos | 2026-06-03 | 2026-09-10 | 44 |
| Financiera | Gestión Resultado Flota | 2026-09-21 | 2026-09-28 | 24 |
| Financiera | Devengados (caja, análisis, entregas, simulador, parámetros, auditoría) | 2026-07-15 | 2026-09-29 | 57 |
| Financiera | Revisión cartulina | 2026-09-01 | 2026-09-01 | 8 |
| Financiera | Liquidación afiliados | 2026-09-25 | 2026-09-29 | 8 |
| — | Portal de afiliados (acceso externo) | 2026-09-25 | 2026-09-25 | 3 |
| — | Comunicaciones | 2026-09-01 | 2026-09-04 | 8 |
| — | Rendimiento del día | 2026-07-28 | 2026-09-08 | 3 |
| — | Registrar daño / Reportar daño (público) | 2026-09-01 | 2026-09-03 | 2 |
| Mantenimiento | Tablero, reportes, alertas, frenos | 2026-08-24 | 2026-09-08 | 15 |
| Operativo | Vencimientos, Vehículos, Exceso velocidad | 2026-09-04 | 2026-09-08 | 9 |
| — | Liquidación conductor | 2026-08-05 | 2026-09-08 | 11 |
| — | Liquidación Producción | 2026-08-24 | 2026-09-08 | 6 |
| — | Producción conductor | 2026-08-19 | 2026-09-08 | 2 |
| Configuración | General, Usuarios, API | 2026-03-24 | 2026-09-14 | 23 |
| Configuración | Integraciones | 2026-03-24 | 2026-09-08 | 14 |

**Servicios de fondo (sin pantalla propia):**

| Servicio | Inicio | Última gestión | Objetivo |
|----------|--------|----------------|----------|
| Sincronización con GEMA | 2026-06-17 | 2026-09-29 | Traer a diario despacho, recaudo, ingreso tercero, vehículos, velocidades, puntos virtuales y personal |
| Data API externa | 2026-06-27 | 2026-07-14 | Consulta de solo lectura por recurso con llaves por consumidor (documentada en `/docs/api`) |
| Servidor MCP | 2026-09-11 | 2026-09-24 | Acceso de solo lectura para agentes de IA, con catálogo semántico y OAuth 2.1 |

---

## 3. Objetivo de cada opción

### Dashboard
Vista de entrada con los indicadores generales de la plataforma.

### Accidentabilidad
- **Reportar accidente:** registrar un accidente de tránsito de un conductor. El conductor se completa desde GEMA.
- **Consultar accidentes:** revisar, completar y editar los reportes; la evaluación y el correctivo salen de la
  política de la empresa según los criterios del reporte.

### Recursos Humanos
- **Vacantes:** crear y administrar las vacantes por departamento.
- **Candidatos:** tablero tipo kanban del proceso de selección, con etapas configurables, documentos del candidato y
  paso a empleado. Recibe candidatos de Varylo por webhook y se puede segmentar por fecha de citación.
- **Empleados:** hoja de vida del personal administrativo: datos personales, seguridad social, novedades, procesos
  disciplinarios, notas, documentos y retiro o reingreso, con auditoría inmutable de cambios.
- **Conductores:** ficha de RR. HH. de cada conductor (contacto, información laboral, licencia, seguridad social,
  datos personales) a partir del maestro de GEMA.
- **Ausentismo:** control diario de ausentes y matriz de incapacidades EPS con catálogos validados (EPS, ARL, IPS,
  profesional, CIE10). Incluye indicadores, reincidentes no justificados con escalamiento a descargos y
  terminación, y exportes a PDF y Excel.
- **Incapacidades:** recuperación de incapacidades ante EPS y ARL. Cada incapacidad es un expediente que se
  completa, liquida, radica, recauda y concilia. Tiene bandeja de cobro, recaudos, conciliación, tablero, consulta
  auditada, alta manual y parámetros. Desde el 2026-09-29, las incapacidades EPS sin 4 semanas cotizadas no se
  habilitan para cobro.
- **Riesgo:** riesgo predictivo de cada conductor (retiro y falta no justificada), calculado cada noche, con detalle
  por conductor y descargas en CSV, Excel y PDF.
- **Documentos:** repositorio de documentos por persona, con estado de revisión (pendiente, aprobado, firmado,
  vencido, rechazado).
- **Campañas:** embudo de reclutamiento a partir del pipeline de candidatos y de las conversaciones de Meta Ads.
- **Contratación:** procesos de contratación. Al guardar uno se crea o se vincula el candidato por cédula y su
  estado se sincroniza con el pipeline.

### Rotación
- **Conductores:** asignación y rotación de conductores por vehículo.
- **Rendimiento:** rendimiento de los conductores por periodo.
- **Mapa de calor:** subidas y bajadas de pasajeros por ruta, zona, vehículo y viaje, con el trazado de la ruta, la
  velocidad y las alarmas de la registradora.
- **Alarmas:** alarmas de las registradoras, incluida la verificación de timbrada cuando la registradora se reinicia.
- **Datos:** estado de la sincronización con GEMA, que reemplazó las cargas en Excel.

### Financiera
- **Gestión Resultado Flota:** resultado económico de cada bus a partir de la consolidación diaria de GEMA y del
  archivo contable. Sus pantallas: rentabilidad (se puede segmentar por marca), vehículos en pérdida, gasto por
  timbrada, productividad, mantenimiento, comparación de periodos con detalle de conceptos, datos de flota,
  parámetros de semáforo con cierre y reapertura de periodos, y auditoría. El histórico contable desde 2025-01 está
  migrado.
- **Caja de devengados:** entrega diaria del excedente a los conductores, acumulada por día.
- **Análisis quincenal:** análisis de los devengados por quincena.
- **Entregas del día:** registro de las entregas del día, con permisos granulares y auditoría de cada transacción.
- **Revisión cartulina:** el mapa de calor dentro de Tesorería, para cotejar las timbradas de la cartulina.
- **Liquidación afiliados:** liquidación de los propietarios afiliados (formato GAF-R-12) con calendario de pagos,
  pago de obligaciones, producido neto, soportes y observaciones de los descuentos, en pantalla, PDF y Excel.
- **Simulador:** simula la quincena del conductor para explicarle el esquema de pago, incluido el rendimiento del día
  con la fórmula de GEMA.
- **Parámetros:** fecha operativa y parámetros de devengados, y la recarga por meses del ingreso tercero (solo
  administrador).
- **Auditoría:** rastro de las operaciones de Tesorería.

### Portal de afiliados
Acceso externo en el que cada afiliado entra con su correo y consulta su propia liquidación y sus soportes. Tiene
sesión propia del servidor, sin Supabase Auth.

### Comunicaciones
Bandeja interna de WhatsApp que reemplaza a la de Varylo: medios, adjuntos, plantillas, leído y no leído, ficha del
contacto y creación del contacto como candidato sin salir de la conversación.

### Rendimiento del día
Vista restringida para conductores: el rendimiento de su día consultado por código.

### Registrar daño
Captura de daños de los vehículos, separada del resto de Mantenimiento para quien solo registra. Los conductores
reportan sin cuenta desde el celular en `/reportar-dano`.

### Mantenimiento
- **Tablero:** los cinco contadores del sistema de origen.
- **Reportes de daños:** historial filtrable de daños por vehículo y concepto.
- **Alertas:** alertas de daños recurrentes y su gestión.
- **Graduación de frenos:** registro con el formato CPA-R-31.
- **Reportes de frenos:** historial de las graduaciones.

### Operativo
- **Vencimientos:** documentos del vehículo (SOAT, técnico-mecánica, pólizas, tarjeta de operación) con alerta
  temprana de vencimiento.
- **Vehículos:** ficha de cada vehículo con los datos del maestro de GEMA, el conductor asignado y el propietario.
- **Exceso velocidad:** excesos por conductor entre dos fechas, con consolidado semanal, reporte a RR. HH. e informe
  mensual. Los datos de velocidad de GEMA existen desde el 2026-08-26.

### Liquidaciones del conductor
- **Liquidación conductor:** reporte consolidado por día con retiros y disponible.
- **Liquidación Producción:** liquidación quincenal de la producción del conductor.
- **Producción conductor:** el mismo reporte sin base, saldos ni retiros: solo lo producido. Es un módulo aparte para
  poder darlo sin mostrar la deuda.

### Configuración
- **General:** ajustes generales y etapas del pipeline.
- **Usuarios:** creación de usuarios, tipos de usuario y permisos por módulo y sub-función.
- **API:** llaves de acceso a la Data API por consumidor.
- **Integraciones:** webhooks (Varylo) con mapeo de campos y registro de las cargas recibidas.

---

## 4. Pendientes a la fecha de corte

- Aplicar la migración `20260929221301` (incapacidades EPS sin 4 semanas cotizadas) y verificar su resultado.
- Aplicar la migración `20260929201023` (observaciones de los descuentos otros) y sincronizar.
- Correr en producción la recarga de ingreso tercero de enero a agosto de 2026 para completar el pago de
  obligaciones del histórico.
- Gestión Resultado Flota: definir tres umbrales de semáforo y el apagado del aplicativo anterior.
