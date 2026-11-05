# Exámenes periódicos (SST)

Módulo de Recursos Humanos – SST para controlar los **exámenes médicos
ocupacionales periódicos**:

- registra cada atención;
- calcula el próximo examen;
- alerta los vencidos y los que están por vencer.

Reemplaza el Excel «LISTADO PERSONAL EXAMEN PERIODICO».

- **Ruta**: `/examenes-periodicos` (menú Recursos Humanos, debajo de «Accidentes de trabajo»).
- **Código**:
  - `src/lib/sst/examenes.ts`: reglas puras;
  - `src/lib/sst/examenes-historico.ts`: lector del Excel, puro;
  - `src/lib/sst/examenes-data.ts`: acceso y lectura;
  - `src/app/(dashboard)/examenes-periodicos/`: página, acciones y formularios.
- **Migración**: `20261105161614_sst_examenes_periodicos.sql`.
- **Pruebas**: `npm run test:sst`.

---

## 1. Modelo

| Tabla o vista | Una fila es | Notas |
|---|---|---|
| `sst_examenes_personas` | una persona en control (PK `cedula`) | Equivale a las hojas de control del Excel. Guarda `grupo`, `fecha_ingreso`, `periodicidad_meses` y si sigue en control (`activo`, `motivo_inactivo`, `inactivo_desde`). |
| `sst_examenes_periodicos` | una atención | Guarda `fecha_atencion`, `fecha_entrega`, `periodicidad_meses`, `proximo_examen`, `recomendaciones` y `observaciones`. Se anula con motivo: nada se borra. Hay una sola atención vigente por cédula y fecha. |
| `sst_examenes_estado` (vista) | una persona **activa** | El semáforo de hoy. **Sin datos de salud.** La usa el MCP. |
| `sst_examenes_atenciones` (vista) | una atención no anulada | Trae `tiene_recomendaciones` en lugar del texto. **Sin datos de salud.** La usa el MCP. |

Las dos tablas tienen RLS sin políticas y `GRANT` solo a `service_role`, como el resto de RRHH.

**Grupos de control**: son las cinco hojas de control del Excel.

| Clave | Grupo |
|---|---|
| `conductores` | Conductores de La Carolina |
| `administrativos` | Administrativos de La Carolina |
| `reubicados` | Reubicados de La Carolina |
| `metrorecaudo` | Metrorecaudo |
| `anaya_giraldo` | Anaya Giraldo |

## 2. Reglas de vencimiento

- **Próximo examen** = fecha de atención + periodicidad, en meses calendario. Si el día no existe en el mes de llegada, se toma el último del mes (31-ene + 1 = 28/29-feb).
  - La periodicidad es de 12 meses por defecto y se cambia en cada examen según el concepto médico. Algunos administrativos y Metrorecaudo tienen 24 o 36.
  - El próximo examen lo calcula la aplicación al guardar y queda en `proximo_examen`.
- **Persona sin exámenes periódicos**: el primer examen vence a **fecha de ingreso + periodicidad de la persona**, porque el examen de ingreso cuenta como el primero. Así lo calculaba el Excel: se comprobó en 122 de 124 conductores y en los administrativos de 24 o 36 meses. En pantalla aparece como «desde el ingreso».
- **Estado** a la fecha de Bogotá. La regla está en `estadoExamen`:

  | Estado | Cuándo |
  |---|---|
  | `vencido` | El próximo examen ya pasó. |
  | `por_vencer` | Faltan 30 días o menos, hoy incluido (`POR_VENCER_DIAS`). |
  | `vigente` | Faltan más de 30 días. |
  | `sin_examen` | No hay examen ni fecha de ingreso. |

- **Quién cuenta**: solo las personas **activas** en control. Sacar a alguien del control (retirado u otro motivo) lo quita de los vencimientos, pero conserva su historial.
  - La pantalla marca «Retirado en el maestro» cuando GEMA (`conductores.estado`) o Empleados (`employees.status`) lo dan por retirado y sigue activo en el control. Si alguno de los dos maestros lo tiene activo, gana el activo.
  - Si a una persona inactiva se le registra un examen posterior a su salida, vuelve al control.

## 3. Pantalla

- **Control**:
  - cifras: en control, vencidos, por vencer, sin examen y vigentes; al hacer clic en una se filtra por ese estado;
  - una fila por persona con el semáforo («Vencido hace N días» o «Faltan N días»), ordenadas con lo urgente primero;
  - el historial de exámenes al expandir la fila;
  - exportación a xlsx o csv **sin** recomendaciones.
- **Atenciones**: cada examen con su entrega («Pendiente» si falta) y sus recomendaciones. Se filtra por año, grupo y texto. Su exportación **sí** incluye las recomendaciones: quien tenga «exportar» del módulo puede sacarlas.
- **Registrar examen**:
  - se busca a la persona en el control o en el maestro;
  - si no estaba en el control, entra con el grupo elegido;
  - el próximo examen se ve en vivo mientras se llena el formulario.
- **Agregar al control / Editar persona**: grupo, cargo, fecha de ingreso, periodicidad y la salida del control.

## 4. Permisos

Módulo `examenes_periodicos`, con las acciones ver · crear · editar · anular · exportar (`src/lib/permisos/catalogo.ts`).

- En el sistema anterior, la migración se lo da al admin.
- A los demás se les asigna en Configuración › Usuarios.

## 5. MCP y Data API

Se exponen **solo las dos vistas**: `sst_examenes_estado` y `sst_examenes_atenciones`.

- Las recomendaciones y observaciones del médico son datos de salud y **no salen del módulo**. Fue decisión del usuario, el 2026-11-05. Por eso las tablas no están en `EXTERNAL_RESOURCES`.
- Las ve quien tenga el módulo `examenes_periodicos` (`MODULOS_POR_RECURSO` en `src/lib/external/acceso.ts`).
- La documentación semántica está en `src/lib/mcp/catalogo/sst.ts` (dominio `rrhh`), y el término «Examen periódico» está en el glosario.
- Preguntas típicas: «¿quién tiene el examen vencido?» y «¿cuántos vencen este mes por grupo?».

## 6. Carga del histórico (Excel)

```bash
npm run sst:examenes-historico -- "<ruta>/LISTADO PERSONAL EXAMEN PERIODICO 2026.xlsx" --ensayo
npm run sst:examenes-historico -- "<ruta>/LISTADO PERSONAL EXAMEN PERIODICO 2026.xlsx" --escribir
npm run sst:examenes-historico -- --reversar
```

- **`--ensayo`** escribe el informe en `<tmp>/migracion-sst-examenes/`: `resumen.txt`, `rechazadas.csv`, `avisos.csv` y `comparacion.csv`, que compara el próximo examen y la alerta del Excel con lo calculado. El informe lleva cédulas y datos de salud: **no se copia al repositorio**.
- **`--escribir`** es idempotente: no toca a las personas que ya están y salta los exámenes ya cargados (`historico_ref`) o con la misma cédula y fecha.
- **`--reversar`** borra los exámenes con `origen = 'historico'` y las personas históricas que se quedan sin exámenes.

**Hojas mensuales** («ENERO 25» … «NOVIEMBRE 26»):

- Cada fila es una atención. El encabezado está en la fila 1 o en la 2.
- En «DICIEMBRE 25», la columna de la entrega se llama «OBSERVACION».
- Lo que no es fecha en la entrega va a `observaciones` como «Entrega: …» («REPETIR OPTOMETRIA», «PENDIENTE HC», «OK»).
- Un año truncado («27/05/202») se completa con el año de la hoja, con aviso.
- Una fila sin fecha de atención o con fecha futura es una cita, no un examen: se rechaza.
- La marca «PROTEGER» de la columna A queda en `observaciones`.
- La misma atención repetida en dos meses se funde en una.

**Hojas de control** («COND LA CAROLINA.», «ADMON CAROLINA.», «REUBICADOS.», «METRORECAUDO», «ANAYA GIRALDO.»):

- Encabezado en la fila 2, los años en la 3 y los datos desde la 5.
- Cada fecha de un año es un examen.
- «RETIRADO» saca a la persona del control desde ese año.
- «INCAP» genera un aviso y no crea examen.

**Fusión y periodicidad**:

- Un examen de control a 45 días o menos de uno mensual de la misma cédula es el mismo; gana el mensual, que trae la entrega y las recomendaciones.
- La periodicidad sale del próximo examen escrito en el Excel y se ajusta a 12, 24 o 36 meses:
  - para el último examen de cada persona, desde ese examen;
  - para quien no tiene exámenes, desde su fecha de ingreso.
- Quien solo aparece en las hojas mensuales entra al control por su área: «REUBICADO…» va a reubicados, «CONDUCTOR…» a conductores, vigilante o escolta a Anaya Giraldo, cajero a Metrorecaudo y lo demás a administrativos.

**Resultado del ensayo** con el Excel de noviembre de 2026:

- 405 personas: 303 en control y 102 retiradas.
- 564 exámenes de 2021 a 2026: 189 con recomendaciones y 160 con fecha de entrega.
- 60 filas rechazadas, casi todas citas sin atender. Están en `rechazadas.csv`.
- Contra las alertas del Excel al 2026-11-03, coinciden 294 de 297 estados. Las 3 diferencias son personas con una atención mensual más reciente que la hoja de control no reflejaba.
- 134 próximos exámenes difieren del Excel en un mes o menos: el Excel los escribía a mano y el módulo los calcula.
