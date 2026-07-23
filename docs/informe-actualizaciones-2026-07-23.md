# GESTIVO · Tesorería — Actualizaciones del 23 de julio de 2026

Informe para tesorería y contabilidad. Tres mejoras quedaron **en producción**
y una propuesta queda **pendiente de aprobación**. Ninguna cambia cálculos ni
saldos: todo lo ya registrado sigue igual.

---

## 1. El filtro de cajeros ya solo muestra cajeros

**Dónde:** Tesorería → Devengados → **Entregas del día** (y el selector de
cajero al registrar un pago desde Caja).

**Qué cambió:** el filtro "Todos los cajeros" mostraba también cuentas
administrativas (administradordatos, desarrollo, etc.). Ahora solo aparecen los
usuarios con la función de **Caja** asignada: los cajeros y auxiliares reales.

**Cómo se usa:** igual que siempre — se elige el cajero en la lista para ver
sus movimientos del día. Dos detalles a saber:

- Un cajero **sin movimientos** ese día sigue apareciendo en la lista; elegirlo
  muestra la tabla vacía, lo que también es información (no ha cuadrado).
- Si un administrador registró pagos ese día a nombre propio, aparecerá en el
  filtro **solo ese día**, para poder revisar esos movimientos.

---

## 2. Los conductores retirados ahora se identifican en el Análisis Quincenal

**Dónde:** Tesorería → Devengados → **Análisis quincenal**.

**Qué cambió:** antes, una fila con producción $0 y pago registrado no decía si
el conductor estaba retirado o si su producción venía con atraso de GEMA. Ahora
el análisis cruza cada cédula con la maestra de conductores.

**Cómo se usa:**

1. **Chip ámbar "RETIRADO dd/mm/aaaa"** junto al nombre: el conductor está
   desvinculado desde esa fecha. Si no hay chip, está activo (si no trae datos,
   lo más probable es atraso de GEMA).
2. **Casilla "Solo retirados (N)"** (junto a "Solo alertas"): deja la tabla
   solo con los retirados de la quincena, para revisar de una vez qué se les
   pagó y si alguno quedó sobregirado. Se combina con la búsqueda y los demás
   filtros.
3. **Reportes:** los dos Excel ("Entrega" y "Cruce producción") llevan una
   columna nueva **"Situación"** (ACTIVO / RETIRADO con fecha), y en el PDF de
   entrega el nombre sale con el sufijo "(RETIRADO fecha)". Los reportes
   respetan el filtro en pantalla: con "Solo retirados" activo, el archivo sale
   solo con ellos.

> El estado sale de la maestra de conductores (módulo de Rotación). El análisis
> solo lo refleja; no marca ni desmarca retiros.

---

## 3. La caja ya no permite pagarle a un conductor retirado

**Dónde:** Tesorería → Devengados → **Caja**.

**Qué cambió:** antes la caja pagaba a cualquier cédula con excedente
disponible, aunque el conductor ya estuviera retirado. Ahora:

- **Para el cajero:** si el conductor está RETIRADO, el sistema rechaza el pago
  con el mensaje *"Conductor RETIRADO desde el (fecha). Su liquidación debe
  registrarla un administrador con el registro a nombre del cajero."* No hay
  forma de saltárselo desde la caja.
- **Para el administrador:** el **registro a nombre del cajero** (extemporáneo)
  sigue funcionando con retirados — esa es la vía correcta para pagar la
  **liquidación** de un retirado, porque exige motivo y queda en auditoría. Al
  registrarlo, la confirmación advierte: *"el conductor está RETIRADO desde…;
  este pago corresponde a su liquidación."*

**En la práctica:** si un retirado llega a caja a cobrar su saldo, el cajero
verá el rechazo y debe remitirlo con un administrador, quien registra la
liquidación por la vía extemporánea.

---

## 4. Simulador de devengados para socialización

**Dónde:** Tesorería → Devengados → **Simulador**.

**Qué es:** la pantalla para responderle al conductor, con números, *"si
produces tanto al día, ¿cuánto te toca?"*. Usa **el mismo motor de cálculo de
la caja** con cifras hipotéticas, así que el número simulado siempre coincide
con el que la caja pagaría. No usa ni toca datos reales de ningún conductor.

**Cómo se usa:**

1. **Modo "Promedio diario"** (para la charla rápida): se digita la producción
   promedio por día y los días trabajados, y muestra producción de la
   quincena, base exigida y **excedente a favor**.
2. **Modo "Día a día"** (para explicar la regla): una grilla de la quincena
   donde se digita la producción de cada día (0 = no trabajó). El detalle
   muestra cómo un día flojo baja el excedente liberado — la duda típica de
   "¿dónde me descontaron?".
3. La **base diaria** viene precargada con la vigente; se puede cambiar para
   escenarios y la pantalla avisa que es hipotética. También se elige el largo
   de la quincena (13–16 días).
4. **Imprimir simulación**: hoja para dejarle al conductor, marcada en grande
   **"SIMULACIÓN — NO ES UN VALOR EXIGIBLE"**, con el nombre del conductor si
   se digita (opcional).

**Reglas que refleja (las mismas de la caja):** la base solo se exige los días
con producción — un día sin trabajar no genera déficit — y un día por debajo de
la base descuenta del excedente acumulado.

**Acceso:** es una sub-función nueva del módulo Tesorería llamada
**"Simulador"**. A las promotoras se les puede habilitar **solo esa** desde
Configuración → tipos de usuario, sin darles caja ni datos reales. Los tipos
existentes no la ven hasta que se les asigne (el administrador la ve siempre).

### 4b. Pestaña "Rendimiento del día" (fórmula de pago con producción real)

Dentro del mismo Simulador hay una segunda pestaña que reproduce el reporte de
**Promedios de Conductores de GEMA** con los viajes reales del día elegido y
aplica la fórmula de pago:

> **Valor día = (TIMB. CU × tarifa) × 16% − base − $2.000 × viajes realizados**
> Tarifa $3.300 día normal, $3.400 domingo (se detecta solo) o festivo
> (interruptor). El %, la base y el ahorro son editables.

- Agrupa por **ruta** (Calle 30, Calle 17, Miramar, Express), **flota** (NV
  ecológica / GN) y **segmento** (superior/inferior), con filtros por cada uno
  y búsqueda por código.
- Muestra **solo el código del conductor y el vehículo** — sin nombre ni
  cédula — porque es para socializar con el conductor.
- Se ve bien en **celular, tablet y computador** (en el celular cada conductor
  es una tarjeta con su valor a recibir).
- La TIMB. CU se calcula con la misma metodología de GEMA, validada contra el
  reporte del 21-jul: los grupos NV cuadran **dígito a dígito** y los GN quedan
  a ±2% mientras Néstor confirma la regla de los "medios viajes" (media
  vuelta), que no viene en el archivo de GEMA. La pantalla lo advierte: el
  valor oficial sigue siendo el del cierre de GEMA.

---

## Resumen

| # | Mejora | Estado | Quién lo nota |
|---|--------|--------|---------------|
| 1 | Filtro de Entregas solo con cajeros reales | En producción | Administradores |
| 2 | Retirados identificados en el Análisis (chip, filtro, Excel/PDF) | En producción | Tesorería y contabilidad |
| 3 | Caja bloquea pagos a retirados; liquidación solo por admin | En producción | Cajeros y administradores |
| 4 | Simulador para socializar el esquema | En producción | Promotoras (cuando se les asigne la sub-función) |
