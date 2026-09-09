# Migración del histórico de ausentes 2026 a `ausentismo_registros`

**Estado (2026-09-09):** script listo y ensayado. **Pendiente de escribir** hasta que RRHH complete las
cédulas faltantes y corrija las fechas mal digitadas.

## Qué se migra

RRHH consolidó la planilla diaria de ausentes de Recepción (enero–agosto 2026) en
`Administrador Datos\Recursos Humanos\Bd_ausentismo_2026.xlsx`, hoja **BD Ausentismo**, una fila por
conductor ausente por día. Desde septiembre esa planilla la reemplaza el módulo Ausentismo → Registro del día,
que escribe en `ausentismo_registros`. El histórico entra a esa misma tabla para que Historial, Reincidentes y
las alertas de descargos/terminación vean el año completo.

El archivo es una lista nominal: **no se copia al vault ni al repositorio**. El script trabaja sobre una copia
en `%TEMP%\migracion-ausentismo\` y deja allí sus informes; los que RRHH necesita se copian a
`Recursos Humanos\migracion-ausentismo\`, junto al Excel.

## Cómo se corre

```
npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --ensayo
npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --ensayo --equivalencias "<ruta>\nombres-sin-cedula.csv"
npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --escribir --equivalencias "<ruta>\nombres-sin-cedula.csv"
npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts --reversar
```

- `--ensayo` solo lee y deja `resumen.txt`, `rechazadas.csv`, `nombres-sin-cedula.csv` y `avisos.csv`.
- `--escribir` respalda `ausentismo_registros` y `ausentismo_log` a JSON y luego inserta por lotes de 200,
  con una entrada de bitácora (`accion = creado`) por registro. Si un lote falla, se detiene y se corre `--reversar`.
- `--reversar` borra todo lo que lleve la marca `migracion:Bd_ausentismo_2026.xlsx` en
  `ausentismo_registros.created_by_email` y `ausentismo_log.user_email`.
- Es idempotente: las llaves (fecha, cédula) que ya existan en la base se omiten.

## Reglas de transformación

Replican las del formulario (`crearRegistro` en `src/app/(dashboard)/ausentismo/actions.ts`): un registro por
conductor y día, concepto del catálogo, vehículo del maestro, claves de contacto y soporte válidas.

| Campo | Regla |
|---|---|
| Cédula | La columna; si viene vacía, el diccionario nombre → cédula del propio archivo (las hojas de enero a julio traen ambos); luego el maestro `conductores` si el nombre casa una sola cédula; luego el CSV de equivalencias que llena RRHH. Sin resolver, se rechaza |
| Nombre, código, teléfono | Del maestro `conductores` por cédula; teléfono del Excel si viene |
| Tipo | Tabla de equivalencias de abajo. "Asistió / Llegó tarde" se excluye (el conductor trabajó) |
| Contacto | Solo en No justificada, a partir de la justificación: apagado, no contesta, desvía llamadas |
| Justificación | Texto original; "Relevo: sí" cuando aplica; en fusiones se anexan las demás con " \| " y, si los tipos difieren, "Tipos en Excel: A, B" |
| Incapacidad | Rango "dd/mm/aaaa – dd/mm/aaaa" o fecha sola; ilegible → vacío con aviso |
| Reintegro | Fecha; ilegible (p. ej. 29/02/2026) → vacío con aviso |
| Soporte | Registrado y Entregado → presentado · Pendiente → pendiente · vacío → no aplica. El texto original queda en observaciones del soporte |
| Vehículo | Solo si el código existe en `vehiculos`; si no, vacío con aviso |
| Fecha inicio | La fecha del registro. Fecha fuera de ene–ago 2026 → se rechaza (año mal digitado) |
| Repetidos | Mismo conductor y día se funden en uno: la primera fila manda |

Decisiones de RRHH (2026-09-09): excluir "Llegó tarde"; mapear a conceptos existentes sin crear nuevos;
Registrado = soporte presentado; fusionar los repetidos.

| Excel | Concepto | Excel | Concepto |
|---|---|---|---|
| Incapacidad, Incapacidad indefinida, Hospitalizado | `incapacidad` | Cita médica / EPS | `eps` |
| Permiso, Trámite de licencia, Reunión | `permiso` | Vehículo en taller | `taller` |
| Vacaciones | `vacaciones` | Retiro / Renuncia | `renuncia` |
| Descanso | `descanso` | Sin justificación, Ausencia injustificada, Sin contacto | `no_justificada` |
| Suspensión | `suspension` | Calamidad | `calamidad` |
| Licencia (paternidad/luto) | `licencia` | Otro, Cobro de viajes | `otra` |

## Resultado del ensayo (2026-09-09)

| Hoja | Filas | Excluidas | Rechazadas | Fusionadas | A insertar |
|---|---|---|---|---|---|
| enero | 584 | 37 | 27 | 3 | 517 |
| febrero | 533 | 54 | 1 | 11 | 467 |
| marzo | 494 | 45 | 2 | 1 | 446 |
| abril | 478 | 30 | 7 | 5 | 436 |
| mayo | 489 | 32 | 82 | 9 | 366 |
| junio | 451 | 42 | 1 | 6 | 402 |
| julio | 935 | 105 | 35 | 380 | 415 |
| agosto | 501 | 29 | 1 | 2 | 469 |
| **Total** | **4.465** | **374** | **156** | **417** | **3.518** |

- **Julio viene duplicado en el origen**: 935 filas con 482 firmas distintas; 333 de las fusiones son filas
  idénticas. La fusión las deja en una.
- **Rechazadas**: 129 filas (26 nombres distintos, sobre todo de mayo y julio) sin cédula que no casan con el
  archivo ni con el maestro → `nombres-sin-cedula.csv` para que RRHH llene la columna `cedula`; 27 filas con
  fecha de 2025 en la hoja de enero (26 del 03/12/2025 y 1 del 15/01/2025) → corregir el año en el Excel.
- **Avisos** (no impiden la carga): 115 incapacidades y 21 reintegros ilegibles entran sin esas fechas; 6 filas
  con el vehículo 903, que no está en el maestro; 4 filas de cédulas fuera del maestro de conductores.

## Pasos que faltan

1. RRHH llena `nombres-sin-cedula.csv` y corrige las 27 fechas en el Excel.
2. `--ensayo --equivalencias` hasta que las rechazadas sean solo las esperadas.
3. Avisar a RRHH que las alertas de reincidentes y las notificaciones de descargos se calcularán sobre el
   histórico; luego `--escribir`.
4. Verificar: conteo por marca = "a insertar" del resumen; misma cantidad en bitácora; sin (fecha, cédula)
   repetidos; Historial e Indicadores con rango enero–agosto.

## Límite conocido

Historial y PostgREST recortan a 1.000 filas por consulta. Con ~3.500 registros nuevos, un rango de ocho meses
sale truncado en Historial; los filtros por mes o por conductor siguen completos. Paginar Historial es trabajo aparte.
