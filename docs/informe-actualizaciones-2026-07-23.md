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

## 4. Propuesta pendiente: simulador de devengados para socialización

**Qué es:** una pantalla donde las promotoras puedan mostrarle a un conductor,
con cifras hipotéticas, *"si produces tanto al día, tu excedente sería tanto"* —
usando exactamente el mismo motor de cálculo de la caja, así el número simulado
siempre coincide con el que se pagará.

**Qué tendría:** modo rápido (promedio diario y días trabajados → resultado),
modo día a día (para explicar cómo un día flojo baja el excedente liberado) y
un PDF marcado "SIMULACIÓN — no es un valor exigible" para dejarle al
conductor. Sin datos reales y sin tocar la base de datos.

**Estado:** documento de propuesta listo
(`docs/propuesta-simulador-devengados.md`) con tres preguntas por definir con
Néstor: si las promotoras tendrán usuario en Gestivo o será una página sin
login, si el PDF lleva el nombre del conductor, y si se simulan quincenas de 16
días. **No se construye nada hasta acordarlo.**

---

## Resumen

| # | Mejora | Estado | Quién lo nota |
|---|--------|--------|---------------|
| 1 | Filtro de Entregas solo con cajeros reales | En producción | Administradores |
| 2 | Retirados identificados en el Análisis (chip, filtro, Excel/PDF) | En producción | Tesorería y contabilidad |
| 3 | Caja bloquea pagos a retirados; liquidación solo por admin | En producción | Cajeros y administradores |
| 4 | Simulador para socializar el esquema | Propuesta | Promotoras (cuando se apruebe) |
