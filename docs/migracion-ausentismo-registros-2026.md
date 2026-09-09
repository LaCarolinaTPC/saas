# Migración del histórico de ausentes 2026 a `ausentismo_registros`

**Estado (2026-09-09, 15:05):** RRHH completó las 42 cédulas; el ensayo v2 da **3.537 filas a insertar** y
`a-insertar.csv` está en revisión de RRHH. **Pendiente de escribir** hasta el visto bueno de esa lista y la
corrección de las 27 fechas de 2025 en el Excel (o la decisión de dejarlas fuera).

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
npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --ensayo --correcciones "<ruta>\rechazadas-correcciones-rrhh.csv"
npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts "<ruta>\Bd_ausentismo_2026.xlsx" --escribir --correcciones "<ruta>\rechazadas-correcciones-rrhh.csv"
npx tsx --tsconfig tsconfig.json scripts/migrar-ausentismo-registros.mts --reversar
```

- `--ensayo` solo lee y deja `resumen.txt`, `rechazadas.csv`, `nombres-sin-cedula.csv` y `avisos.csv`.
- `--correcciones` recibe el `rechazadas.csv` del ensayo revisado por RRHH: una cédula escrita en la columna
  `cedula` (o encima de `causa`) corrige esa fila exacta del Excel, identificada por `origen` ("mes!fila N").
  Las filas que RRHH borró del archivo quedan excluidas de la carga. Es la vía que RRHH eligió el 2026-09-09.
- `--equivalencias` recibe `nombres-sin-cedula.csv` con la columna `cedula` llena: asigna la cédula a todas
  las filas con ese nombre. Alternativa a `--correcciones`; se pueden combinar.
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
| Cédula | La columna; si viene vacía, el diccionario nombre → cédula del propio archivo (las hojas de enero a julio traen ambos, y solo cuentan cédulas que existan en el maestro); luego el maestro `conductores` si el nombre casa una sola cédula; luego el CSV de equivalencias que llena RRHH. Sin resolver, se rechaza. **La cédula debe existir en el maestro `conductores`**; si no, la fila se rechaza (número mal digitado) |
| Nombre, código, teléfono | Siempre del maestro `conductores` por cédula; el nombre del Excel solo sirve para resolver la cédula. Teléfono del Excel si viene |
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

## Resultado del ensayo con las correcciones de RRHH (2026-09-09, tarde)

RRHH revisó el `rechazadas.csv` del primer ensayo (copia en `Recursos Humanos\migracion-ausentismo\
rechazadas-correcciones-rrhh-2026-09-09.csv`): escribió la cédula correcta de la fila que traía "548" (existe
en el maestro, activa, mismo nombre) y borró 87 filas sin cédula (las 82 de mayo y 5 más), que por decisión
de RRHH quedan fuera de la carga. El motivo de esa exclusión no quedó escrito.

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
- **Rechazadas (156)**: 87 sin cédula excluidas por RRHH; 42 sin cédula que RRHH conservó en el archivo pero
  aún sin cédula (23 nombres: 35 de julio, 6 de abril, 1 de agosto); 27 con fecha de 2025 en la hoja de enero
  (26 del 03/12/2025 y 1 del 15/01/2025) → corregir el año en el Excel.
- **Avisos** (no impiden la carga): 115 incapacidades y 21 reintegros ilegibles entran sin esas fechas; 6 filas
  con el vehículo 903, que no está en el maestro; 1 cédula corregida por RRHH.

## Ensayo v2 con las 42 cédulas completadas (2026-09-09, 15:05)

Archivo de correcciones vigente: `Recursos Humanos\migracion-ausentismo\rechazadas-correcciones-rrhh-2026-09-09-v2.csv`
(RRHH escribió las 42 cédulas en la columna `cedula`; las 42 existen en el maestro). Informes en
`ensayo-2026-09-09-v2\`, incluido `a-insertar.csv` con las filas exactas que entrarían.

| Hoja | Filas | Excluidas | Rechazadas | Fusionadas | A insertar |
|---|---|---|---|---|---|
| enero | 584 | 37 | 27 | 3 | 517 |
| febrero | 533 | 54 | 1 | 11 | 467 |
| marzo | 494 | 45 | 2 | 1 | 446 |
| abril | 478 | 30 | 1 | 6 | 441 |
| mayo | 489 | 32 | 82 | 9 | 366 |
| junio | 451 | 42 | 1 | 6 | 402 |
| julio | 935 | 105 | 0 | 402 | 428 |
| agosto | 501 | 29 | 0 | 2 | 470 |
| **Total** | **4.465** | **374** | **114** | **440** | **3.537** |

Rechazadas que quedan: 87 excluidas por RRHH y 27 con fecha de 2025 en la hoja de enero (el Excel no se ha
corregido). Ya no hay nombres sin cédula.

## Pasos que faltan

1. RRHH revisa `a-insertar.csv` y corrige las 27 fechas en el Excel, o confirma que se quedan fuera.
3. Avisar a RRHH que las alertas de reincidentes y las notificaciones de descargos se calcularán sobre el
   histórico; luego `--escribir`.
4. Verificar: conteo por marca = "a insertar" del resumen; misma cantidad en bitácora; sin (fecha, cédula)
   repetidos; Historial e Indicadores con rango enero–agosto.

## Límite conocido

Historial y PostgREST recortan a 1.000 filas por consulta. Con ~3.500 registros nuevos, un rango de ocho meses
sale truncado en Historial; los filtros por mes o por conductor siguen completos. Paginar Historial es trabajo aparte.
