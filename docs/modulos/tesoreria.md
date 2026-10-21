# Documentación del Módulo: tesoreria

## 1. Visión General y Propósito

### 1.1 Resumen Ejecutivo
El módulo **Tesorería** es el núcleo de control financiero, auditoría operativa y liquidación a propietarios afiliados dentro del ERP de transporte (**Gestivo**). En una empresa de transporte público colectivo y de pasajeros en Colombia bajo el modelo de afiliación, conviven propietarios independientes ("afiliados") que entregan sus vehículos para ser despachados y operados bajo las rutas autorizadas de la empresa.

Este módulo resuelve tres problemas operativos y de negocio críticos:
1. **Auditoría y Control de Ingresos por Pasajeros (Revisión de Timbradas/Registradoras):** Cruza en tiempo real las cuatro fuentes transaccionales del despacho (despacho físico/cartulina, eventos de telemetría GPS/geocercas de terminal, recaudos de taquilla y novedades de timbradas descontadas) para detectar evasión, fraudes en taquilla, fallas en sensores de conteo o discrepancias entre el dinero entregado por el conductor y los pasajeros transportados.
2. **Conciliación de Abonos Operativos:** Controla y concilia las entregas parciales de dinero que realizan los conductores previo a la formalización del recaudo en caja, identificando abonos pendientes, faltantes, sobrantes o bloqueos administrativos en el sistema central heredado (GEMA).
3. **Liquidación y Pago a Afiliados (Reporte GEMA GAF-R-12):** Liquida matemáticamente la producción bruta de los vehículos afiliados, deduce los conceptos operativos (gastos de despacho, administración empresarial, combustible, pólizas contractuales/extracontractuales, retenciones de ICA, fondos de ahorro y pagos de obligaciones de crédito/facturas) y programa los calendarios de dispersión de pagos (semanal y quincenal) respetando la normativa laboral y el calendario bancario colombiano (Ley Emiliani y feriados gregorianos).

### 1.2 Responsabilidades Principales
- **Auditoría de validación de pasajeros:** Clasificación automática de viajes despachados según su estatus operativo y legal (`OK`, `Diferencia Por Revisar`, `Sin Recaudo - Con Timbradas`, `Revisar - Cartulina Con PV`, `Revisar - Sin Datos PV`, `Revisar - Datos Incompletos`, `N/A - No Despachado`).
- **Motor de calendarios y festivos:** Cálculo dinámico de domingos de Pascua y festivos colombianos mediante algoritmo astronómico gregoriano y aplicación de la Ley 51 de 1983 para determinar fechas exactas de corte y pago a afiliados.
- **Conciliación de cartera y caja volante (Abonos):** Monitoreo de descalces entre abonos y recaudos netos con márgenes de tolerancia financiera.
- **Generación de reportes de liquidación:** Emisión fiel (peso a peso) del formato estándar de la empresa (reporte GEMA GAF-R-12), tanto en hojas de cálculo Excel (ExcelJS) como en documentos vectoriales PDF para firma de recibido (jsPDF + autoTable).
- **Gestión documental y probatoria (Soportes):** Recepción segura, inspección por *magic bytes* y almacenamiento de comprobantes de descuento que justifican deducciones a propietarios, accesibles tanto para auditores como para los afiliados en su portal.

---

## 2. Arquitectura y Estructura de Archivos

El módulo aplica un patrón arquitectónico desacoplado (**Clean Architecture / Functional Core, Imperative Shell**):
- **Archivos de Reglas (`*-reglas.ts` / módulos puros):** No dependen de base de datos ni de APIs del navegador; implementan lógica de negocio determinista ejecutable tanto en Node.js/Edge (servidor) como en el cliente.
- **Archivos de Datos (`*-data.ts` / `soportes.ts`):** Exclusivos de servidor; encapsulan la comunicación con Supabase (PostgreSQL y Supabase Storage), controlando paginación forzada (PostgREST a 1.000 filas) y segmentación por lotes de IDs.
- **Archivos de Exportación (`*-excel.ts` / `*-pdf.ts`):** Ensambladores de artefactos binarios descargables.

### 2.1 Inventario de Archivos Analizados

| Archivo | Capa / Entorno | Responsabilidad y Propósito |
| :--- | :--- | :--- |
| `calendario-pago.ts` | Dominio / Puro (Isomórfico) | Aritmética de fechas ISO, cálculo de Pascua/festivos Colombia (Ley Emiliani), definición de periodos (`SEMANAL`, `DECADA`) y fechas hábiles de pago. |
| `conciliacion-abonos-reglas.ts` | Dominio / Puro (Isomórfico) | Lógica pura para clasificar el cruce entre abonos de dinero y recaudo en taquilla. Cálculo de tolerancias, horas de espera y consolidación estadística. |
| `conciliacion-abonos-data.ts` | Infraestructura / Servidor | Consultas masivas paginadas a `abonos`, `viajes_recaudados`, `historico_despacho` y `gema_sync_state`. |
| `detalle-afiliado.ts` | Aplicación / Servidor | Orquestador de la ficha de detalle de un afiliado; combina perfil, histórico de periodos, liquidación y soportes vigentes. |
| `formato-liquidacion.ts` | Presentación / Isomórfico | Funciones de formateo de moneda colombiana (`es-CO`), redondeo y representación de negativos según estilo GEMA (`$-22.283`). |
| `liquidacion-afiliados-reglas.ts` *(en `liquidacion-afiliados.ts`)* | Dominio / Puro (Isomórfico) | Algoritmos de deduplicación de cierres CU vs. INDIVIDUAL, suma de conceptos de deducción, desglose de obligaciones y producido neto. |
| `liquidacion-afiliados-data.ts` | Infraestructura / Servidor | Lectura tolerante de `ingreso_tercero`, validación de flota afiliada contra `vehiculos`, consulta de reglas en `tesoreria_calendario_pago` y búsqueda de propietarios. |
| `liquidacion-excel.ts` | Infraestructura / Servidor | Creación del libro de liquidación en formato `.xlsx` mediante ExcelJS, con pestaña de resumen gerencial y pestañas diarias por vehículo. |
| `liquidacion-pdf.ts` | Infraestructura / Isomórfico | Generación vectorial con `jspdf` y `jspdf-autotable` del informe oficial GAF-R-12 idéntico al emitido por GEMA. |
| `pagos-afiliados.ts` | Dominio / Puro (Isomórfico) | Orquesta el cruce entre el calendario de pagos y las filas de liquidación acumuladas para estructurar la nómina de pagos de afiliados. |
| `revision-timbradas-reglas.ts` | Dominio / Puro (Isomórfico) | Motor analítico de auditoría de conteo de pasajeros. Tablas históricas de descuentos, margen de cortesía nocturna (18:00), diferencias de sensores y geocercas. |
| `revision-timbradas-data.ts` | Infraestructura / Servidor | Ingesta y agrupamiento de los 4 datasets de auditoría: `historico_despacho`, `puntos_virtuales`, `viajes_recaudados` y `timbradas_descontadas`. |
| `revision-timbradas-excel.ts` | Infraestructura / Servidor | Generación del reporte analítico diario de timbradas en Excel con colores semáforo y segmentación de alertas. |
| `revision-timbradas-consolidado.ts` | Dominio / Puro (Isomórfico) | Reglas de seguimiento de estados diarios de revisión (avance de checks, cierres de auditoría y reaperturas automáticas). |
| `revision-timbradas-consolidado-data.ts` | Infraestructura / Servidor | Persistencia y consulta de estados diarios en `tesoreria_revision_timbradas_dias`, marcas manuales y cierres formales. |
| `revision-timbradas-consolidado-excel.ts` | Infraestructura / Servidor | Exportación ejecutiva del avance de revisión por día, estado de auditoría y rendimiento de usuarios revisores. |
| `soportes-reglas.ts` | Dominio / Puro (Isomórfico) | Validación de archivos binarios por *magic bytes*, tipos de soporte admitidos y algoritmo de cruce de obligaciones. |
| `soportes.ts` | Infraestructura / Servidor | Manejo de Supabase Storage (bucket `afiliados-soportes`), subida atómica, firmado de URLs temporales y anulación de registros. |

### 2.2 Diagrama de Flujo Conceptual

```mermaid
graph TD
    subgraph Fuentes de Datos (GEMA Sync / Espejo)
        HD[(historico_despacho)]
        PV[(puntos_virtuales)]
        VR[(viajes_recaudados)]
        TD[(timbradas_descontadas)]
        IT[(ingreso_tercero)]
        AB[(abonos)]
    end

    subgraph Módulos Analíticos de Tesorería
        subgraph Auditoría de Pasajeros
            RTD[revision-timbradas-data] --> RTR[revision-timbradas-reglas]
            RTR --> RTC[revision-timbradas-consolidado]
            RTC --> RTCD[revision-timbradas-consolidado-data]
        end

        subgraph Conciliación de Caja
            CAD[conciliacion-abonos-data] --> CAR[conciliacion-abonos-reglas]
        end

        subgraph Liquidación a Propietarios
            CP[calendario-pago] --> LAD[liquidacion-afiliados-data]
            LAD --> LAR[liquidacion-afiliados]
            LAR --> PA[pagos-afiliados]
            SOP[soportes] --> DA[detalle-afiliado]
            LAR --> DA
        end
    end

    subgraph Salidas del Módulo
        RTR --> XL1[revision-timbradas-excel]
        RTC --> XL2[consolidado-excel]
        LAR --> PDF[liquidacion-pdf: GAF-R-12]
        LAR --> XL3[liquidacion-excel]
        CAR --> CSV[conciliacionCsv]
    end

    HD --> RTD
    PV --> RTD
    VR --> RTD
    TD --> RTD

    AB --> CAD
    VR --> CAD
    HD --> CAD

    IT --> LAD
```

---

## 3. Modelos de Datos y Entidades

### 3.1 Tipos e Interfaces TypeScript Principales

#### 3.1.1 Dominio de Calendario y Fechas
```typescript
export type Plazo = "SEMANAL" | "DECADA";

export interface ReglaPago {
  plazo: Plazo;
  etiqueta: string;
  diaCorte: number;              // ISO: 7 (Domingo) en SEMANAL; 15 en DECADA
  diaPago: number;               // ISO: 2 (Martes)
  diaPagoAlterno: number;        // ISO: 3 (Miércoles)
  correrSiLunesFestivo: boolean; // true: si el lunes previo es festivo, se corre el pago
  correrSiDiaPagoFestivo: boolean; // true: si el martes es festivo, se corre al miércoles
}

export interface Periodo {
  plazo: Plazo;
  desde: string;   // "YYYY-MM-DD"
  hasta: string;   // "YYYY-MM-DD"
  clave: string;   // "2026-W39" o "2026-09-Q1"
  etiqueta: string;// "Semana del 21 al 27 sep 2026"
}
```

#### 3.1.2 Dominio de Conciliación de Abonos
```typescript
export type EstadoConciliacion = "pendiente" | "recaudo_mayor" | "recaudo_menor" | "cuadrado" | "anulado";

export interface FilaConciliacion {
  idViaje: number;
  fechaViaje: string | null;
  numViaje: number | null;
  codigoVehiculo: string | null;
  placa: string | null;
  conductor: string | null;
  cedula: string | null;
  ruta: string | null;
  estadoDespacho: string | null;
  abonos: Abono[];
  abonado: number;              // Sumatoria de abonos vigentes
  concepto: string;
  conceptos: string[];
  estadosGema: string[];
  porGestionar: number;         // Conteo en estado 0 en GEMA
  primerAbono: string;
  recaudoNeto: number | null;
  recaudoBruto: number | null;
  fechaRecaudo: string | null;
  cajero: string | null;
  diferencia: number | null;    // recaudoNeto - abonado
  horas: number | null;         // Tiempo transcurrido entre primer abono y recaudo
  estado: EstadoConciliacion;
}
```

#### 3.1.3 Dominio de Liquidación de Afiliados
```typescript
export interface FilaTercero {
  fecha: string;
  tipo_cierre: string | null;     // "INDIVIDUAL" o "CU (RUTAS,GRUPOS,PROM)"
  ruta: string | null;
  codigo_vehiculo: string;
  placa: string | null;
  cedula_propietario: string;
  propietario_nombre: string | null;
  tipo_propietario: string | null;
  viajes: number | null;
  timbradas: number | null;
  bruto: number | null;
  total_cartulina: number | null; // Despacho + estudio + fondo + préstamo (sin póliza)
  cartu_admon: number | null;
  cartu_poliza: number | null;
  salario: number | null;         // Anticipo al conductor
  factura: number | null;
  combustible: number | null;
  sitra: number | null;
  rtica: number | null;
  admon: number | null;           // 2.5% del bruto
  liquido: number | null;         // Saldo antes de obligaciones
  descuentos_otros: number | null;// Pago de obligaciones financieras
  observaciones_descuento?: string | null;
}

export interface ResumenDeducciones {
  base: number;                   // Bruto
  cartulina: number;
  poliza: number;
  anticipo: number;
  facturas: number;
  sitra: number;
  combustible: number;
  rtica: number;
  admon: number;
  incentivo: number;
  obligaciones: number | null;
  obligacionesParciales: boolean;
  totalDeducciones: number;
  liquido: number;
  producidoNeto: number | null;   // base - totalDeducciones
}
```

#### 3.1.4 Dominio de Auditoría de Timbradas
```typescript
export type EstadoTimbrada =
  | "Diferencia Por Revisar"
  | "Sin Recaudo - Con Timbradas"
  | "Revisar - Cartulina Con PV"
  | "Revisar - Sin Datos PV"
  | "Revisar - Datos Incompletos"
  | "OK"
  | "N/A - No Despachado";

export interface FilaRevision {
  numero: number;                // Número de viaje en despacho
  viaje: number;                 // Vuelta (1, 2, 3...)
  placa: string;
  vehiculo: string | null;
  regSalida: number | null;      // Lectura registradora geocerca salida
  regLlegada: number | null;     // Lectura registradora geocerca llegada
  acReg: number | null;          // regLlegada - regSalida
  acSub: number | null;          // Subidas detectadas por sensor
  acBaj: number | null;          // Bajadas detectadas por sensor
  difSR: number | null;          // acSub - acReg
  difSB: number | null;          // acSub - acBaj
  timR: number | null;           // Timbradas registradas en recaudo
  dctoVr: number | null;         // Descuento en recaudo
  tdDcto: number | null;         // Descuento en timbradas_descontadas (ACTUALIZACIÓN CONTEO)
  timNeto: number | null;        // timR - dctoVr
  sensor: "NUEVO" | "VIEJO" | null;
  estado: EstadoTimbrada;
  observacion: string | null;
  autorizado: number | null;
}
```

### 3.2 Tablas de Base de Datos y Operaciones de E/S

| Tabla | Operación | Propósito |
| :--- | :--- | :--- |
| `tesoreria_calendario_pago` | `SELECT` | Lee reglas de corte, día de pago y feriados para SEMANAL y DECADA. |
| `abonos` | `SELECT` | Lee registros de anticipos entregados por conductores (ID de viaje, fecha, valor, estado GEMA). |
| `viajes_recaudados` | `SELECT` | Lectura de cierres de caja en taquilla (bruto, neto, cajero, timbradas reales, contador inicial/final). |
| `historico_despacho` | `SELECT` | Datos de la orden de despacho (placa, conductor, horas de salida/llegada, ruta, estado). |
| `ingreso_tercero` | `SELECT` | Cierres de producción diarios de vehículos afiliados y deducciones operativas (fuente del GAF-R-12). |
| `vehiculos` | `SELECT` | Filtro maestro para validar `tipo_propietario_op = 'AFILIADO'`. |
| `propietarios` | `SELECT` | Datos maestros del afiliado (cédula, nombre, código interno, plazo asignado). |
| `gema_sync_state` | `SELECT` | Monitoreo de marcas de agua temporales (`last_synced_date`, `last_run_at`) de los pipelines de sincronización. |
| `tesoreria_revision_timbradas` | `SELECT`, `INSERT` | Registro de checks de revisión humana y observaciones sobre viajes auditados. |
| `tesoreria_revision_timbradas_dias` | `SELECT`, `UPSERT` | Almacenamiento de la foto/snapshot diaria de auditoría para tracking de avance. |
| `tesoreria_revision_timbradas_cierres`| `SELECT`, `INSERT` | Histórico inmutable de formalización de cierres de revisión de timbradas. |
| `puntos_virtuales` | `SELECT` | Lectura de eventos de geocerca del Terminal (`Salida de Geo-Fence`, `Entrada a Geo-Fence`). |
| `timbradas_descontadas` | `SELECT` | Justificaciones de descuento registradas en GEMA (conteo, venta adicional, margen nocturno, etc.). |
| `afiliado_soportes` | `SELECT`, `INSERT`, `UPDATE` | Registro, vinculación y anulación lógica (`anulado_at`) de comprobantes de descuento. |
| *Supabase Storage (`afiliados-soportes`)* | `UPLOAD`, `REMOVE`, `SIGNED_URL` | Almacén binario privado de documentos probatorios de descuento. |

---

## 4. Reglas de Negocio y Lógica Crítica

### 4.1 Aritmética de Calendario y Festivos Colombianos
La dispersión de dinero a afiliados sigue una estricta política acordada por Tesorería:
1. **Regla de Plazos:**
   - **SEMANAL:** Corte domingo (ISO 7). Día de pago previsto: primer martes siguiente (ISO 2).
   - **DECADA (Quincenal):** Corte el 15 del mes (primera quincena) o último día del mes (segunda quincena). Día de pago previsto: primer martes tras el corte.
2. **Desplazamiento por Festivos:**
   - Si el día previsto (martes) es festivo en Colombia, el pago se traslada al día alterno: miércoles (ISO 3).
   - Si el lunes previo al pago es festivo (día en que Tesorería prepara bancariamente la dispersión), el pago también se traslada al miércoles.
   - Si el día alterno resultase no hábil (por contingencia), avanza en bucle `while (!esDiaHabil(fecha))` al siguiente día hábil (lunes a viernes no festivos).
3. **Cálculo de Feriados:**
   - Algoritmo anónimo gregoriano para calcular el Domingo de Pascua de cualquier año:
     $$a = \text{año} \pmod{19},\quad b = \lfloor \text{año} / 100 \rfloor,\quad c = \text{año} \pmod{100},\dots$$
   - Fiestas fijas: 01-Ene, 01-May, 20-Jul, 07-Ago, 08-Dic, 25-Dic.
   - Fiestas trasladables al lunes (Ley 51 / Ley Emiliani): 06-Ene, 19-Mar, 29-Jun, 15-Ago, 12-Oct, 01-Nov, 11-Nov.
   - Fiestas dependientes de Pascua: Jueves Santo ($-3$ días), Viernes Santo ($-2$ días), Ascensión ($+43$ días trasladada al lunes), Corpus Christi ($+64$ días trasladada al lunes), Sagrado Corazón ($+71$ días trasladada al lunes).

### 4.2 Conciliación de Abonos
- **Definición Operativa:** Un abono es dinero entregado antes de que el viaje sea liquidado formalmente en taquilla.
- **Tolerancia:** Se define `TOLERANCIA_PESOS = 1000`. Diferencias de $\le \$1.000$ COP entre el neto liquidado en caja y el total de abonos se catalogan como `cuadrado` (asimiladas a redondeos de caja).
- **Antigüedad de Pendientes:** Un abono sin recaudo con más de 24 horas se considera atrasado. Para no penalizar operaciones en vuelo cuando la sincronización de recaudos tiene retraso, la antigüedad no se calcula contra la hora del servidor sino contra el `last_run_at` de `gema_sync_state` de la tabla `viajes_recaudados`.
- **Estados de Conciliación:**
  - `anulado`: Viaje con todos sus abonos anulados en GEMA.
  - `pendiente`: Viaje con abonos vigentes sin recaudo registrado.
  - `cuadrado`: $|\text{recaudoNeto} - \text{abonado}| < 1000$.
  - `recaudo_mayor`: $\text{recaudoNeto} - \text{abonado} \ge 1000$.
  - `recaudo_menor`: $\text{recaudoNeto} - \text{abonado} \le -1000$ (sobrante no aclarado en favor del conductor).

### 4.3 Deduplicación y Liquidación GAF-R-12
1. **Deduplicación CU vs. INDIVIDUAL:** GEMA emite cierres individuales por vuelta y consolidados de "Caja Única" (CU). Cuando coexisten ambos para un mismo día, vehículo, conductor, propietario, ruta, número de viajes y timbradas, **se descarta la fila INDIVIDUAL y se preserva la fila CU**.
2. **Composición de Deducciones:**
   - $\text{Total Cartulina} = \text{Despacho} + \text{Estudio} + \text{Fondo} + \text{Préstamo}$ (excluye explícitamente póliza).
   - $\text{Total Deducciones} = \text{Cartulina} + \text{Póliza} + \text{Anticipo (Salario)} + \text{Facturas} + \text{Sitra} + \text{Combustible} + \text{Rtica} + \text{Admon (2.5\%)} + \text{Incentivo C} + \text{Obligaciones (Descuentos Otros)}$.
   - $\text{Líquido} = \text{Bruto} - \text{Deducciones operativas antes de obligaciones}$.
   - $\text{Producido Neto} = \text{Bruto} - \text{Total Deducciones}$.
3. **Tolerancia a Migraciones de Obligaciones:** Los registros sincronizados previo a la captura de `descuentos_otros` muestran `obligaciones = null`. En dicho escenario, el sistema no calcula Producido Neto ficticio, sino que muestra como saldo a favor el `Líquido` alertando la ausencia de datos de obligaciones mediante la bandera `obligacionesParciales`.

### 4.4 Auditoría de Timbradas y Conteo de Pasajeros
El análisis compara el ciclo físico de un despacho:
1. **Emparejamiento Espacio-Temporal (Geocercas):**
   - Identifica la salida del terminal buscando el evento `Salida de Geo-Fence` de la placa respectiva más cercano a la `hora_despacho`.
   - Identifica la llegada buscando `Entrada a Geo-Fence`. Si la `hora_llegada < hora_despacho`, se asume **viaje nocturno** y el evento de entrada se busca en la fecha del día siguiente.
2. **Delta de Pasajeros en Geocerca:**
   - $\text{Ac.Reg} = \text{Registradora}_{\text{Llegada}} - \text{Registradora}_{\text{Salida}}$.
   - $\text{Ac.Sub} = \text{Subidas}_{\text{Llegada}} - \text{Subidas}_{\text{Salida}}$.
   - $\text{Ac.Baj} = \text{Bajadas}_{\text{Llegada}} - \text{Bajadas}_{\text{Salida}}$.
3. **Política de Descuentos por Política Histórica (Corte 2026-08-13):**
   - **Antes del 13/08/2026:** Convivían sensores viejos y nuevos.
     - *Nuevos:* 80–119 pas $\to 1$ dcto; $\ge 120$ pas $\to 2$ dctos.
     - *Viejos:* 50–70 pas $\to 1$ dcto; 71–100 pas $\to 2$ dctos; $\ge 101$ pas $\to 3$ dctos.
   - **Desde el 13/08/2026:** Flota estandarizada con sensor nuevo.
     - *Lunes a Sábado:* 60–89 $\to 1$; 90–119 $\to 2$; 120–149 $\to 3$; $\ge 150 \to 4$.
     - *Domingo/Festivo Ruta Express:* 30–49 $\to 1$; 50–69 $\to 2$; $\ge 70 \to 3$.
     - *Domingo/Festivo Otras Rutas:* 40–69 $\to 1$; 70–99 $\to 2$; $\ge 100 \to 3$.
4. **Bono de Cortesía Nocturno (18:00):**
   - Viajes despachados a las 18:00:00 o después ($\ge 64.800$ segundos) en estado `DESPACHADO` reciben una timbrada de cortesía.
   - Si $\text{Timbradas Recaudo} (\text{timR}) = \text{Ac.Sub} + 1$, el viaje se clasifica como `OK` bajo la observación: *"Tim R = Ac.Sub + 1 (timbrada de cortesía 18:00)"*.
5. **Detección de Falla en Puertas y Alertas:**
   - Si $|\text{Ac.Sub} - \text{Ac.Baj}| > 10$ (`UMBRAL_SB`), se alerta falla en los sensores de puerta.
   - Si $|\text{Ac.Sub} - \text{Ac.Reg}| > 10$ (`UMBRAL_SR`), el viaje se marca prioritario en Alertas por descalce entre sensor de masa y registradora mecánica/óptica.

---

## 5. Puntos de Entrada y Funciones Principales

### 5.1 Calendario y Nómina de Pagos

#### `fechaPagoDe(regla: ReglaPago, p: Periodo): FechaPago`
- **Entrada:** Regla de pago (semanal o quincenal) y objeto del periodo.
- **Salida:** `{ fecha, prevista, motivo }`.
- **Comportamiento:** Calcula el primer día de pago posterior a `p.hasta`; evalúa si dicho día o el lunes previo es festivo; desplaza a día alterno y garantiza día hábil.

#### `armarPagos(d: { periodos, filas, propietarios, hoy, ultimoSincronizado }): FilaPago[]`
- **Entrada:** Diccionario de periodos programados por plazo, filas de `ingreso_tercero`, mapa de afiliados y marca de sincronización.
- **Salida:** Matriz de afiliados que tienen saldo por cobrar en su respectivo ciclo semanal o quincenal, marcando la bandera `incompleto` si la sincronización no ha cubierto hasta el cierre del periodo.

### 5.2 Conciliación de Abonos

#### `getConciliacionAbonos(desde: string, hasta: string, corte: string): Promise<FilaConciliacion[]>`
- **Entrada:** Rango de fechas ISO y hora de corte de recaudo.
- **Salida:** Lista de viajes con sus abonos agregados, diferencia respecto a recaudo y clasificación de estado.
- **Excepciones:** Arroja `Error` si fallan las consultas paginadas a Supabase.

#### `conciliar(abonos: AbonoRaw[], recaudos: RecaudoRaw[], despachos: DespachoRaw[], ahora: string): FilaConciliacion[]`
- **Entrada:** Vectores puros de abonos, recaudos y despachos.
- **Salida:** `FilaConciliacion[]` ordenada cronológicamente de forma descendente. Función pura y reactiva.

### 5.3 Liquidación de Propietarios Afiliados

#### `getFilasAfiliados(f: { desde: string; hasta: string; cedula?: string | null }): Promise<FilaTercero[]>`
- **Entrada:** Filtro de rango de fechas y cédula opcional.
- **Salida:** Registros validados de `ingreso_tercero` pertenecientes a vehículos tipificados como afiliados en el maestro de operación.
- **Manejo de Errores Tolerante:** Si la base de datos carece de columnas recientes (`descuentos_otros`, `observaciones_descuento`), atrapa el error de Postgres, remueve el campo del `SELECT` y reintenta la lectura degradando la respuesta de forma elegante.

#### `liquidar(cedula: string, filas: FilaTercero[]): LiquidacionAfiliado`
- **Entrada:** Cédula del afiliado y sus filas de producción.
- **Salida:** Objeto estructurado que contiene los totales sumados, el desglose por vehículo ordenado numéricamente y el resumen general de deducciones.

#### `libroAfiliado(cedula: string, desde: string, hasta: string): Promise<{ buffer: ArrayBuffer; archivo: string }>`
- **Entrada:** Identificador del afiliado y fechas.
- **Salida:** `ArrayBuffer` binario del archivo Excel con formato contable oficial (`$#,##0;$-#,##0`), autofiltros y paneles congelados.

#### `exportarLiquidacionPdf(c: ContextoLiquidacionPdf): Promise<void>`
- **Entrada:** Contexto completo de liquidación, vehículo y periodo.
- **Salida:** Promesa que descarga en el navegador un PDF landscape (carta) estructurado página por página por cada vehículo con tabla diaria, recuadros de deducciones y área de firma de recibido.

### 5.4 Auditoría de Timbradas

#### `getRevisionTimbradas(fecha: string): Promise<RevisionDia>`
- **Entrada:** Fecha ISO `"YYYY-MM-DD"`.
- **Salida:** Objeto consolidado del día que contiene las filas de viajes clasificadas, avisos de desincronización de puntos virtuales y conteos de cobertura.

#### `guardarFotoDia(rev: Pick<ResultadoDia, "fecha" | "filas">, db?: Db): Promise<string | null>`
- **Entrada:** Resultado del cálculo del día.
- **Salida:** Mensaje de error si falla, o `null` si el `UPSERT` en `tesoreria_revision_timbradas_dias` fue exitoso.

#### `consolidar(fechas, fotos, checks, cierres): Consolidado`
- **Entrada:** Rango de fechas, snapshots guardados, marcas manuales de usuario y cierres formales.
- **Salida:** Estadísticas agregadas de avance porcentual de auditoría por día, por estado y por auditor. Detecta reaperturas de días cerrados cuando aparecen nuevos viajes después de la firma de cierre.

### 5.5 Soportes de Afiliados

#### `guardarSoporte(d: { ... }): Promise<string>`
- **Entrada:** Metadatos del descuento, archivo binario `Buffer`, tipo y autor.
- **Salida:** UUID del registro de soporte insertado.
- **Mecanismo de Compensación (Saga corta):** Sube primero el binario al Storage; si la inserción relacional en `afiliado_soportes` falla, ejecuta `storage.remove([ruta])` para evitar acumulación de archivos huérfanos.

#### `urlSoporte(ruta: string, nombre: string, descargar: boolean): Promise<string | null>`
- **Entrada:** Path del bucket, nombre amigable y flag de forzado de descarga.
- **Salida:** URL prefirmada con vencimiento estricto de 60 segundos (`URL_FIRMADA_SEG = 60`).

---

## 6. Integraciones y Dependencias

### 6.1 Dependencias Externas (NPM)
- `@supabase/supabase-js`: Cliente administrativo con Service Role para saltar políticas RLS en tareas de procesamiento batch y consultas de lectura masiva.
- `exceljs`: Motor de generación de libros de cálculo complejos con estilos de celda, formatos numéricos contables y fórmulas.
- `jspdf` & `jspdf-autotable`: Renderizado vectorial de reportes en PDF directamente en el cliente o servidor.
- `crypto` (módulo nativo Node.js): Generación de hashes criptográficos aleatorios (`randomBytes(6)`) para garantizar unicidad y evitar adivinación de rutas de archivos en el Storage.

### 6.2 Integraciones Internas del Sistema
- `@/lib/supabase/admin`: Punto de acceso centralizado que inicializa el cliente con privilegios elevados (`createAdminClient`).
- `@/lib/exportar/pdf-tabla`: Utilidades corporativas de maquetación de PDFs (inyección de isotipo institucional `LOGO`, sanitización de cadenas a juego de caracteres Windows-1252 `saneaWinAnsi`, renderizado de encabezados y foliación global de páginas `TOTAL_PAGINAS`).

### 6.3 Dependencia con el Sistema Heredado (GEMA)
El módulo no ataca directamente la base de datos de GEMA en tiempo real, sino que opera sobre un esquema de tablas espejo sincronizadas periódicamente mediante cron jobs:
- La latencia entre la operación real y la auditoría de Tesorería se monitorea mediante `gema_sync_state`.
- Si un dataset crítico (`puntos_virtuales` o `viajes_recaudados`) presenta rezago, el módulo no aborta: expone diagnósticos en pantalla mediante `cobertura.avisos` y mide tiempos de espera relativos al último lote sincronizado.