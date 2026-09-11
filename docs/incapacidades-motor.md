# Motor de incapacidades — Fase 1 del plan de recuperación

**Plan:** `docs/Plan_desarrollo_incapacidades_GESTIVO.md`, sección 11, fase 1.
**Código:** `src/lib/incapacidades/motor.ts` · fixtures `fixtures-excel-2024.ts` · pruebas `motor.test.ts`.
**Correr:** `npm run test:incapacidades` (Node `node:test` vía `tsx`; no hay base de datos ni migración).

## Qué es

Funciones puras que calculan cuántos días y cuánto dinero se reclama a la entidad por una
incapacidad. Sin acceso a datos: las comparten pantalla, exportación y pruebas. Nada aquí
produce un desembolso: `valorEmpresa` (P) y `diasEmpresa` (M) son distribución histórica.

## Reglas versionadas

| Código | Qué hace | Para qué |
|---|---|---|
| `excel-2024-v1` | Las fórmulas literales del libro `Incapacidades 2024_V1.xlsm`: ARL SURA inicial −1 día, cualquier otra entidad inicial −2, prórroga o modalidad vacía todos los días; factor 1 para AT/EG y 0.67 para el resto incluido el vacío; F/30 | Compatibilidad y pruebas. **No liquida en GESTIVO.** |
| `excel-2024-v1-round0` | Igual, con Q redondeado a cero decimales (variante observada en la celda Q70) | Compatibilidad |
| `gestivo-cobro-dias` | **Regla operativa.** La ARL (por clase de entidad, o por tipo AT/EL si no viene la clase) responde por todos los días; la EPS reconoce una inicial desde el día 3 y una prórroga completa. Mismos factores e importes que el libro | Decisión 12.2 del 2026-09-11. Coincide con `diasACargoPagador` de la matriz EPS |

`REGLA_OPERATIVA = "gestivo-cobro-dias"` es la que usan `liquidar`, `diasEntidad` y `factor` cuando
no se les pasa otra. Los parámetros (divisor, factores, días del empleador, redondeo) viven en
`REGLAS[...].parametros`; en la fase 2 pasan a la tabla `incapacidad_reglas` con la misma forma.

## Funciones

- `diasIncapacidad(inicio, fin)` (I): ambos extremos incluidos. Sin inicio → 0. Con inicio y sin fin
  → `IncidenciaMotor("fecha_fin_faltante")`; el libro daba un negativo sin sentido.
- `validarDiasContraInformados(calculados, informados)`: los días calculados desde las fechas tienen que
  ser los mismos que trae la información inicial (`dias_it_pagados` de la matriz). Si difieren →
  `IncidenciaMotor("dias_no_coinciden")` y no se liquida con ninguno de los dos. `liquidar` la aplica
  cuando la entrada trae `diasInformados` (requisito 12.19 del plan, 2026-09-11).
- `diasEntidad(entrada, dias, regla)` (N) y `factor(tipo, regla)`.
- `liquidar(entrada, regla)` → I, N, M, factor, O, Q, P y `salarioDiario`, con la misma secuencia de
  operaciones del libro (`((F/30)*I)*factor`). Salario vacío = 0 como en Excel; la aplicación exige
  diligenciarlo antes (decisión 12.4).
- `indicadoresLegado({cedula, cobrada, valorPagado}, liquidacion)` → S, T, U, V, W, Y del libro. Se
  conservan para pruebas y para explicar diferencias; **no** son el estado ni el saldo del expediente.
- `valorPagadoNumerico(x)`: vacío o solo espacios = 0; texto numérico se convierte; texto no
  convertible → `IncidenciaMotor("valor_pagado_no_numerico")` (el libro lo trataba como texto
  mayor que cualquier número).
- `nombrePorCedula(cedula, catalogo)` (C): dice si lo encontró; `compat` es el espacio en blanco que
  dejaba el libro cuando fallaba.
- `igualExcel`, `redondeoExcel`: comparación de texto sin distinguir mayúsculas pero sin recortar
  espacios, y ROUND con la mitad alejándose de cero.

## Pruebas

| Bloque | Qué verifica |
|---|---|
| Compatibilidad | 79 filas sintéticas (una por cada fila del anexo A) × 13 fórmulas = **1.027 aserciones**, 0 diferencias. El oráculo es la transcripción literal de cada fórmula del anexo B con semántica de Excel; el motor llega por otro camino (reglas parametrizadas). Importes con tolerancia técnica 1e-6 (anexo H); días, S y Y exactos. Cubre I = 0, ARL SURA, modalidad vacía, prórroga, tipo vacío, EP/LM/LP, mayúsculas, cédula 0, R vacío, X = 1 y 1,01, X = T − 0,01, X > T, X vacío y la fila 70 |
| 13.2 de la especificación | Los 14 casos que competen al motor. Filtrado, reimportación y concurrencia son de las fases 2 en adelante |
| Semántica de Excel | ROUND, Q70, días con fechas incompletas, nombre por cédula, determinismo |
| Regla operativa | ARL BOLIVAR inicial de 3 días → 3 (el libro daría 1); EPS inicial 5 → 3, 2 → 0, prórroga 5 → 5; la clase ARL manda sobre el nombre; ARL SURA ya no tiene regla propia |

Los fixtures no contienen datos del libro: la especificación conserva las fórmulas, no los valores,
y el plan prohíbe que ninguna fila del Excel entre a GESTIVO.

## Lo que la fase 1 no hace

Ni tablas, ni trigger, ni corte, ni pantalla. Eso es la fase 2 (esquema, corte y etapa 1), que ya no
tiene ninguna decisión pendiente que la bloquee.
