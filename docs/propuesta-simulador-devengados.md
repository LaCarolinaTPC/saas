# Propuesta — Simulador de devengados para socialización

**Fecha:** 23-jul-2026
**Origen:** audio de Néstor Molina (14:33): *"…que las chicas que están
socializando el tema puedan tener como un simulador de esa información y puedan
generarle al conductor la oportunidad de darle el número que realmente, de
acuerdo a su rendimiento, va a tener acceso."*
**Estado:** IMPLEMENTADO (23-jul-2026) en `/tesoreria/devengados/simulador`,
sub-función `simulador` de Tesorería. Decisiones tomadas sobre las preguntas
abiertas: con login (se habilita por tipo de usuario), nombre del conductor
opcional solo para el impreso, y largo de quincena seleccionable (13–16 días).

---

## 1. Qué se necesita

Las promotoras deben poder sentarse con un conductor y responderle, con números,
la pregunta *"si yo produzco tanto, ¿cuánto me toca?"* — sin depender de que el
conductor ya tenga datos en el sistema y sin exponer información real de otros.

Es distinto del **estado de cuenta** (que muestra lo que YA pasó): el simulador
muestra lo que PASARÍA con una producción hipotética.

## 2. La ventaja: el motor ya existe

La regla de la quincena (base acumulada vs. producción acumulada, excedente
liberado, arrastre de déficit) ya está implementada en `calcularQuincena`
(`src/lib/devengados/engine.ts`) y es **código puro sin base de datos**: puede
correr en el navegador con cifras inventadas. El simulador es solo una pantalla
encima del motor real — **garantiza que el número simulado coincide con el que
la caja pagará**, porque es la misma función.

## 3. Pantalla propuesta

Ruta: `/tesoreria/devengados/simulador`. Sin datos reales: no consulta ni
escribe nada (solo lee la base diaria vigente para precargarla).

```
┌──────────────────────────────────────────────────────────────────────┐
│  Devengados · Simulador                    Base diaria: $85.000  [✎] │
├──────────────────────────────────────────────────────────────────────┤
│  Modo:  (•) Promedio diario   ( ) Día a día                          │
│                                                                      │
│  Producción promedio por día:   [$ 120.000 ]                         │
│  Días trabajados en la quincena:[ 13 ] (de 15)                       │
│                                                                      │
│  ┌────────────────────────── RESULTADO ─────────────────────────┐    │
│  │  Producción de la quincena          $ 1.560.000              │    │
│  │  Base exigida (15 días × $85.000)   $ 1.275.000              │    │
│  │  EXCEDENTE A FAVOR                  $   285.000              │    │
│  │  ── "Esto es lo que recibirías además de tu tarifa" ──       │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Detalle día a día (modo Día a día):                                 │
│  ┌──────┬────────────┬─────────┬──────────────┬────────────────┐     │
│  │ Día  │ Producción │ Base    │ Excedente día│ Liberado acum. │     │
│  │ 16   │  $121.000  │ $85.000 │   +$36.000   │    $36.000     │     │
│  │ 17   │   $60.000  │ $85.000 │   −$25.000   │    $11.000     │     │
│  │ …    │            │         │              │                │     │
│  └──────┴────────────┴─────────┴──────────────┴────────────────┘     │
│                                                                      │
│  [ Imprimir simulación (PDF) ]                                       │
└──────────────────────────────────────────────────────────────────────┘
```

- **Modo promedio:** dos campos y el resultado. Para la charla rápida.
- **Modo día a día:** una grilla de 15 días editable, que muestra cómo un día
  flojo "jala hacia abajo" el liberado (la duda exacta del caso AMADOR). Ideal
  para explicar por qué el pendiente no es la suma de los días buenos.
- **PDF:** hoja simple con la simulación para dejarle al conductor, marcada
  claramente **"SIMULACIÓN — no es un valor exigible"**.
- La base diaria se precarga con la vigente pero es editable (escenarios), con
  la advertencia de que la oficial es la de Parámetros.

## 4. Acceso

Nueva sub-función `simulador` del módulo Tesorería (mismo mecanismo de
`MODULE_SUBS` que caja/análisis). Así se les habilita a las promotoras **solo el
simulador**, sin darles caja ni análisis con datos reales. Los tipos existentes
con Tesorería sin restricción lo verían automáticamente.

## 5. Alcance y esfuerzo

| Incluye | No incluye |
|---|---|
| Pantalla client-side sobre `calcularQuincena` | Guardar simulaciones |
| Modo promedio y modo día a día | Datos reales de conductores |
| PDF imprimible con marca de agua "SIMULACIÓN" | Cambios de base de datos |
| Sub-función `simulador` para permisos | Cambios al motor de cálculo |

Esfuerzo estimado: una sesión de trabajo (la lógica ya existe; es UI).

## 6. Preguntas para revisar con Néstor

1. ¿Las promotoras tendrán usuario en Gestivo, o el simulador debería ser una
   página pública (sin login) con solo la calculadora? La versión con login es
   más simple de gobernar; la pública llega más lejos pero expone la regla.
2. ¿El PDF debe llevar el nombre/cédula del conductor al que se le simula, o
   mejor anónimo?
3. ¿Se simula solo la quincena estándar (15 días) o también quincenas de 16
   días (meses de 31)?
