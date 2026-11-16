# Selección de conductores — diseño y plan de las entregas 2, 3 y 4

## Contexto

La junta aprobó el 12 de noviembre cuatro entregas. La Entrega 1 (asistente, preselección, reactivación, mensajes y tiempos) ya está en el commit `1589f79` y se muestra el martes 17. Faltan:

| Entrega | Fecha | Requerimientos | Hito |
|---|---|---|---|
| E2 · Agenda y profesor | Jue 19 nov | D1–D4, E1, E2, NF7 | Prueba real con el profesor a la 1:00 p. m. |
| E3 · Exámenes, carpeta y antecedentes | Lun 23 nov | C1–C3, M1–M3, G1, H1, H2, NF1 | Demostración 4:00 p. m. |
| E4 · Lectura con IA e indicadores | Mié 25 nov | A6, R1–R7, I1, K1, NF3, NF4 | Capacitación 3:00 p. m. |
| Ajustes y acta | Jue 26 – Vie 27 | — | Acta y primer informe del embudo |

Lo que la E1 ya dejó sembrado y hoy nadie usa (se reutiliza, no se rehace):

- 10 mensajes del catálogo con plantilla de Meta aprobada: `citacion`, `cita_reprogramada`, `recordatorio_cita`, `inasistencia`, `escuela`, `examenes_fase1`, `examenes_fase2`, `documentos_pendientes`, `reenviar_archivo`, `recordatorio_psicotecnica`.
- Ajustes de E2 y E3 en `seleccion_ajustes` (`cita_hora_semana`, `cita_hora_sabado`, `cita_limite_mismo_dia`, `recordatorio_cita_hora`, `alerta_no_confirmo_hora`, `tolerancia_inasistencia_minutos`, `reprogramaciones_max`, `recordatorio_escuela_hora`, `laboratorio_hora`, `documentos_pendientes_dias`).
- `enviarMensajeSeleccion` (`src/lib/seleccion/envio.ts`): envía cualquier clave según su modo y la ventana de 24 h.
- `verificaciones_externas` con `fuente`, `pdf_path` y `costo` (estos dos sin usar).
- El cron `seguimiento-whatsapp` (cada 15 min) con el patrón `intentar()`.

Lo que no existe y hay que construir: hora y estado de la cita, registros del profesor, resultados de exámenes, archivos privados del proceso, tipo de contacto «laboratorio», rutas aprendidas, carpeta, reglas de antecedentes, consultas de Croma distintas de SIMIT y RUNT, cualquier lectura de imagen, PDF o audio, registro de costo y tope mensual, e indicadores del embudo de procesos.

## Decisiones de diseño que aplican a las tres entregas

- **Una migración por entrega**, creada con `npm run migracion:nueva -- "..."`, idempotente, con `GRANT` a `service_role` en cada tabla nueva y RLS activado sin políticas (todo el código usa `createAdminClient()`).
- **Lógica pura con pruebas, y un ejecutor aparte**, como `reactivacion.ts` + `reactivacion-ejecutar.ts`. Cada paso automático se reserva con un `UPDATE` condicional para que dos corridas del cron no envíen dos veces.
- **Todo cambio pasa por `cambiarEstadoProceso` y `registrarEvento`** (`src/lib/contratacion/servidor.ts`), con el actor correcto. Se agrega el tipo de evento `cita`, `prueba`, `examen`, `antecedente`, `carpeta`, `lectura`.
- **La máquina propone y una persona decide** cuando se descarta a alguien (regla de la E1). Única excepción: el «no continúa» del profesor, que ya es una decisión humana.
- **Ningún envío automático nuevo fuera del horario permitido** (`enHorario`) ni por encima del tope mensual (desde la E3).
- **Días hábiles de lunes a sábado sin festivos:** se reutiliza `esDiaHabilRecobro` de `src/lib/tesoreria/recobros.ts` (ya es lunes a sábado) y `festivosColombia`.
- **Archivos:** por ruta de API, nunca por server action (límite de 1 MB), copiando `src/lib/incapacidades/adjuntos.ts`.
- **Cada server action nueva revisa permiso** (`test:permisos` falla si no).

---

## Entrega 2 — Agenda y profesor (jueves 19)

### Datos (migración `seleccion entrega 2 agenda y profesor`)

- **`seleccion_citas`**: `id`, `proceso_id` FK, `tipo` (`prueba_manejo` | `examen_f1` | `examen_f2` | `psicotecnica`), `fecha DATE`, `hora TIME`, `estado` (`programada` | `confirmada` | `pide_otra_fecha` | `asistio` | `no_asistio` | `reprogramada` | `cancelada`), `confirmada_at`, `llego_at`, `recordatorio_at`, `alerta_at`, `inasistencia_at`, `creada_por`, `created_at`. Índices por `(fecha, tipo)` y `(proceso_id, created_at desc)`. Sirve también para las citas de laboratorio (E3) y la psicotécnica (E4).
- **`seleccion_pruebas_manejo`**: `proceso_id`, `cita_id`, `fecha`, `profesor_id`, `resultado` (`aprobo` | `escuela` | `no_continua`), `prueba_ruta_escrita`, `prueba_partes_motor` (sí/no/sin tomar), `clases_sugeridas`, `observacion`.
- **`seleccion_clases_escuela`**: `proceso_id`, `fecha`, `profesor_id`, `resultado` (`sigue` | `listo` | `no_continua`), `observacion`. Sin tope de clases.
- `procesos_contratacion.escuela_recordatorio_fecha DATE` (para no repetir el recordatorio del día).
- `pipeline_stages`: agregar `antecedentes` (hoy `vincularCandidatoVacante` escribe una etapa que el tablero antiguo no tiene).
- Rol `profesor_manejo` («Profesor de manejo») en `roles` y sus permisos en `rol_permisos`.
- Ajuste nuevo `citar_exige_antecedentes` (regla, apagado hasta la E3).

### Lógica (`src/lib/seleccion/`)

- **`agenda.ts` (pura, con `agenda.test.ts`)**
  - `proximaCita(ahora, ajustes)`: antes de `cita_limite_mismo_dia` y día hábil → hoy a `cita_hora_semana`; si no, el siguiente día hábil; sábado → `cita_hora_sabado`.
  - `fechaEnTexto` / `horaEnTexto` en español para las variables `{fecha}` y `{hora}`.
  - `accionAgenda(cita, ahora, ajustes)` → `recordatorio` | `alerta_no_confirmo` | `inasistencia` | `nada`.
  - `interpretarRespuestaCita(texto)`: «Sí, voy» → confirma; «Necesito otra fecha» / «Sí, reprogramar» → pide otra fecha. Los botones de plantilla ya llegan como texto (`whatsapp.ts:448`).
  - `reprogramacionesDe(citas)` y `superaReprogramaciones`.
- **`agenda-servidor.ts`**
  - `conversacionDeProceso(procesoId)`: la conversación enlazada o, si el proceso es manual, la del celular (crea contacto y conversación si no existen).
  - `citarProceso(procesoId, {fecha, hora}, actor)`: crea la cita, pasa a `citado`, llena `fecha_citacion` y envía `citacion` (por defecto queda como borrador en la bandeja).
  - `reprogramarCita`, `marcarLlegada`, `marcarNoAsistio`, `deshacerNoAsistio`, `confirmarCita`.
  - Al superar `reprogramaciones_max` propone el cierre por «Desistimiento»; lo confirma una persona.
- **`agenda-ejecutar.ts`** (`ejecutarAgenda(ahora)`, colgado del cron con `intentar()`):
  - 8:00 a. m.: `recordatorio_cita` a las citas de hoy.
  - 11:00 a. m.: sin confirmar → marca «Llamar» en la conversación (`requiere_humano`) y en la agenda.
  - Hora + tolerancia: sin llegada registrada → `no_asistio` y `inasistencia` como borrador. Reversible con un clic.
  - 7:30 a. m. de lunes a sábado: `escuela` a quien siga en `en_escuela`.
- **Respuestas del aspirante:** en `responderConAgente` (`agente/responder.ts`), antes de generar, si hay cita vigente se aplica `interpretarRespuestaCita`. `contextoSeleccion` recibe la cita (fecha, hora, dirección, estado) para que el asistente la recuerde y no pase el chat por «¿a qué hora es?».
- **`profesor-servidor.ts`**
  - `registrarPrueba`: `aprobo` → `en_examenes`, `fecha_prueba_manejo`, cita `examen_f1` el siguiente día hábil a `laboratorio_hora` y mensaje `examenes_fase1`; `escuela` → `en_escuela`; `no_continua` → cierre «No pasó prueba de manejo».
  - `registrarClase`: `sigue`, `listo` (igual que `aprobo`) o `no_continua`.

### Interfaz

- **Citar:** botón «Citar» en la ficha (`ProcesoFormDialog`) y en la bandeja sobre la etiqueta «Listo para citar». Diálogo con la fecha y hora propuestas, editables.
- **Agenda del día:** nueva vista «Agenda» en Candidatos (`src/components/seleccion/agenda-dia.tsx`), pensada para celular: selector de día, lista de citados con estado, y botones grandes Llegó · No asistió · Reprogramar · Llamar (`tel:`). La ficha muestra las citas y el contador de reprogramaciones.
- **Profesor:** módulo propio `profesor` en `src/lib/permisos/catalogo.ts` con ruta `/profesor` (no puede ser una función de Candidatos: le abriría toda la lista). Entrada en `INICIO_POR_ROL`, `NAV_TREE`, `permissions-shared.ts` y el buscador.
  - Pantalla «Hoy»: citados a prueba de manejo y aspirantes en escuela.
  - Por aspirante, un paso por pantalla con botones grandes (patrón de `src/app/(publico)/reportar-dano/reportar-client.tsx`): Llegó → pruebas de conducción (ruta escrita, partes del motor) → resultado (Pasa a exámenes · Escuela · No continúa).
  - Escuela: «Registrar clase de hoy» y cómo sigue.
- **Tiempo real:** `useAvisosProcesos` sale de `kanban-procesos.tsx` a un hook compartido; lo usan el tablero, la agenda y la vista del profesor. Las tablas nuevas disparan el mismo aviso.

### Corte si falta tiempo
Primero se aplaza la interpretación automática de «Necesito otra fecha» (queda como chat marcado para una persona) y luego la alerta de las 11:00. No se aplaza la vista del profesor: es la prueba real del jueves.

---

## Entrega 3 — Exámenes, rutas, carpeta y antecedentes (lunes 23)

### Datos (migración `seleccion entrega 3 examenes carpeta antecedentes`)

- Bucket privado **`seleccion`** y **`seleccion_adjuntos`**: `proceso_id`, `tipo` (`hoja_vida`, `cedula`, `licencia`, `carta_laboral`, `certificado_<fuente>`, `radiografia`, `examen`, `psicotecnica`, `otro`), `ruta`, `nombre`, `mime`, `tamano`, `origen` (`subido` | `whatsapp` | `proveedor`), `wa_mensaje_id`, `subido_por`, `anulado_at`, `anulado_motivo`.
- **`seleccion_examenes`**: `proceso_id`, `fase` (1 | 2), `fecha`, `resultado` (`pendiente` | `apto` | `no_apto`), `observacion` (para «apto con restricciones»), `propuesto_por_laboratorio`, `confirmado_por`, `confirmado_at`. Único por `(proceso_id, fase)`.
- `wa_contactos.tipo` (`persona` | `laboratorio`) y **`seleccion_avisos_laboratorio`**: `wa_mensaje_id`, `proceso_id` (nulo si no se pudo asociar), `texto`, `resultado_propuesto`, `media_path`, `estado` (`pendiente` | `confirmado` | `descartado`).
- **`seleccion_rutas_aprendidas`**: `proceso_id`, `ruta`, `fecha`, `registrado_por`; única por `(proceso_id, ruta)`. Ajuste `rutas_minimas` = 2.
- **`seleccion_carpeta_items`** (`proceso_id`, `item`, `estado` pendiente/recibido/validado, `validado_por`, `validado_at`, `nota`) y **`seleccion_referencias`** (`tipo` laboral/personal, `nombre`, `telefono`, `empresa`, `origen`, `hablo_con`, `validada_at`, `validada_por`, `resultado`).
- **`seleccion_reglas_antecedentes`**: `fuente`, `tipo` (artículo y numeral, palabra clave o `*`), `accion` (`tolera` | `revision` | `descarta`), `max_tolerado`, `activo`, `orden`.
- En `procesos_contratacion`: `antecedentes_resultado` (`limpio` | `tolerable` | `revision` | `descarta`), `antecedentes_decision`, `_por`, `_at`, `_justificacion`; `aprobacion_contratacion_at`, `_por`; `documentos_recordatorio_at`.
- **`seleccion_consumos`** (NF1): `proceso_id`, `conversacion_id`, `concepto` (`asistente` | `extraccion` | `lectura` | `transcripcion` | `antecedentes` | `whatsapp`), `proveedor`, `modelo`, `tokens_entrada`, `tokens_salida`, `costo_usd`, `created_at`. Ajustes `tope_mensual_cop` (500.000) y `trm` (3.270).
- Causa de cierre nueva: «Antecedentes».

### Exámenes y laboratorio (M1–M3)

- `src/lib/seleccion/examenes.ts` (pura) y `examenes-servidor.ts`: `registrarExamen`. Fase 1 apta → `en_examenes_fase2`, cita `examen_f2` el siguiente día hábil y `examenes_fase2` automático (en ayunas). No apta → propone cierre «Exámenes médicos».
- **Laboratorio:** un contacto marcado `laboratorio` desde la ficha del contacto en la bandeja.
  - El asistente, el seguimiento y la reactivación lo saltan (`responder.ts`, `seguimiento-ejecutar.ts`, `reactivacion-ejecutar.ts`), y los indicadores lo excluyen.
  - `laboratorio.ts`: cada mensaje entrante se lee con una llamada corta al modelo que devuelve `[{nombre, cedula, fase, resultado}]`; se asocia a procesos en `en_examenes` por cédula o por nombre (`normalizarTexto` y `distancia` de `preseleccion.ts`). El PDF se asocia por el pie, el nombre del archivo o el mensaje vecino y se copia a `seleccion_adjuntos` como radiografía.
  - Lo propuesto aparece en un panel «Avisos del laboratorio» (Candidatos › Agenda) para confirmar con un clic o asignar a mano. Nada cambia el proceso sin confirmación.

### Rutas (G1)
En la ficha y en la vista del profesor: elegir la ruta de `rutasDeGema()` (`src/lib/operativo/rutas-kml.ts`). La ficha muestra «1 de 2». Los reingresos quedan exentos.

### Carpeta y contratación (H1, H2)

- Sección «Carpeta» en la ficha: hoja de vida, cartas laborales, referencias (con quién se habló y cuándo) y certificados de antecedentes (se marcan solos al quedar el PDF). Subida por `src/app/api/seleccion/adjuntos/route.ts`.
- `documentos_pendientes` como borrador cada `documentos_pendientes_dias`, desde la prueba de manejo.
- `condicionesContratar(datos)` (pura, `contratacion.ts`): fase 2 apta, rutas mínimas salvo reingreso, carpeta completa, psicotécnica apta (se activa en la E4 con el ajuste `contratar_exige_psicotecnica`) y aprobación de la directora.
- Se exige dentro de `cambiarEstadoProceso` al pasar a `contratado`, que es el único punto por donde pasan la ficha, el tablero y el selector. Si falta algo, dice qué.
- Permisos especiales nuevos en Candidatos: `aprobar_contratacion` (directora), `decidir_antecedentes` y `contratar_con_excepcion` (para los procesos que venían en curso antes de la entrega; pide justificación y queda en el historial).

### Antecedentes (C1–C3)

- **Paso previo, el viernes 20 temprano:** leer en docs.usecroma.com los servicios de Policía, Procuraduría y Contraloría (ruta, cuerpo, forma de la respuesta y si entregan el PDF) y probar cada uno con una cédula de prueba. Si la prueba de Croma no pasa, se escribe un adaptador de TusDatos detrás de la misma interfaz y la entrega se corre uno o dos días, como dice el cronograma.
- `src/lib/verificacion/proveedores.ts`: generalizar a `consultarFuente(fuente, cedula)` con una tabla de servicios e intérpretes por fuente; `servidor.ts`: `consultarAntecedentesProceso` y un solo `resolverPendientes` para todas las fuentes. Se lanzan solas al entrar el proceso a `antecedentes` con la autorización aceptada. Se llena `costo` y, si hay PDF, se guarda en el bucket y en `pdf_path`.
- **RNMC asistida:** enlace al portal con la cédula lista para copiar, registro del hallazgo (artículo y numeral) y subida del PDF. Igual para cualquier fuente cuando Croma falle.
- `antecedentes.ts` (pura): `evaluarAntecedentes(hallazgos, reglas)`. Sin reglas definidas, todo hallazgo va a `revision`.
- Sección «Antecedentes» en la ficha con las seis fuentes (estado, fecha, quién, PDF) y la decisión con justificación. Filtro «Revisión de antecedentes» en Candidatos. Pestaña «Antecedentes» en Selección: mensajes y reglas para editar las reglas.
- Limpio, tolerable o aprobado → el chat queda «Listo para citar» (la etiqueta pasa de «prefiltro completo» a «antecedentes resueltos») y se enciende `citar_exige_antecedentes`. Descarta → propone el cierre.
- El campo antiguo `antecedentes` se mantiene sincronizado porque lo lee la regla R7 del Plan Padrino. De paso se corrige R9 (`src/lib/padrino/reglas.ts`), que no reconoce `en_examenes` ni `en_examenes_fase2` como posteriores a la escuela.

### Costo y tope (NF1)
`src/lib/seleccion/consumos.ts`: `registrarConsumo` (desde `registrarEjecucion`, la extracción y Croma; el costo sale de los precios de `agente/opciones.ts`) y `topeAlcanzado()`. Al 80 % avisa en Selección; al 100 % se detienen los envíos y consultas automáticas, y lo manual sigue.

### Corte si falta tiempo
Primero la lectura automática de los mensajes del laboratorio (queda el registro manual del resultado, que es lo que prevé el cronograma) y luego el recordatorio de documentos pendientes.

---

## Entrega 4 — Lectura con IA, día de contratación e indicadores (miércoles 25)

### Datos (migración `seleccion entrega 4 lectura e indicadores`)

- **`seleccion_lecturas`**: `wa_mensaje_id` (único: cada archivo se lee una vez), `adjunto_id`, `conversacion_id`, `proceso_id`, `clase` (`cedula` | `licencia` | `hoja_vida` | `carta_laboral` | `otro`), `estado` (`pendiente` | `leido` | `ilegible` | `error` | `omitido`), `campos JSONB` (`[{campo, valor, confianza, evidencia, pagina, decision, valor_final}]`), `modelo`, `costo_usd`, `revisado_por`, `revisado_at`.
- `wa_mensajes.transcripcion TEXT`.
- En `procesos_contratacion`: `fecha_nacimiento`, `licencia_restricciones`, `datos_origen JSONB` (por campo: `declarado` | `leido` | `verificado`); `psicotecnica_resultado`, `_fecha`, `_puntaje`, `_por`; `entrevista_at`, `_por`; `induccion_at`, `_por`.
- Ajustes: `lectura_modelo` (Sonnet 5.5), `lectura_activa`, `contratar_exige_psicotecnica` encendido.

### Lectura (A6, R1–R7)

- **Modelo con adjuntos:** `generarConAdjuntos(config, claves, sistema, partes)` en `src/lib/comunicaciones/agente/proveedores.ts`, para Anthropic (bloques de imagen y documento) y OpenRouter (`image_url` y archivo). Los PDF, tengan texto o sean fotos, se envían como documento: el modelo lee cada página, así que no hace falta una librería de conversión. Antes de escribirlo se consulta la referencia de la API con la habilidad `claude-api`.
- **`src/lib/seleccion/lectura/`**
  - `esquema.ts` (puro, zod): clases, campos por clase y confianza alta, media o baja.
  - `interpretar.ts` (puro): validar la respuesta, calcular meses de experiencia en conducción, marcar periodos sin fecha, comparar la cédula leída con la digitada, edad a partir de la fecha de nacimiento.
  - `leer.ts`: una sola llamada por ráfaga con todas las fotos (máximo 8), que clasifica y extrae; las fotos de hoja de vida de una misma ráfaga son un documento.
  - `ejecutar.ts`: reserva la lectura, revisa el tope, guarda costo y campos.
- **Cuándo corre:** dentro de `responderConAgente`, en paralelo con la espera de la ráfaga y con un límite de unos 15 s. Si termina, el asistente recibe «Leído de los documentos» y no vuelve a preguntar; si la foto es ilegible, pide repetirla con el texto de `reenviar_archivo`. Lo que no alcance (PDF largos) lo termina el cron, que envía `reenviar_archivo` si hace falta.
- **Código de barras de la cédula:** se prueba con `zxing-wasm` durante 2 horas como máximo. Si no lee bien fotos de celular, la cédula se lee solo con visión y se deja anotado.
- **Audios:** `transcribirAudio(buffer, mime)` sale de `src/app/api/rotacion/accidentes/transcribe/route.ts` a `src/lib/ia/transcripcion.ts` (la ruta de accidentes la usa). La transcripción se guarda en `wa_mensajes.transcripcion`, se muestra bajo el audio en la bandeja y `textoDeMensaje` (`motor.ts`) la entrega al asistente, que deja de pedir «escríbelo». Lo dicho en audio cuenta como declarado.
- **Qué hace con lo leído:** llena solo campos vacíos, como propuesta, y marca el origen. Nada leído pone un requisito en rojo sin confirmación de una persona. La restricción de lentes alimenta el mensaje de citación.
- **Pantalla de confirmación (R5):** sección «Documentos leídos» en la ficha, con la imagen a un lado y los campos al otro: aceptar, corregir o rechazar cada uno. Aceptar actualiza el proceso, crea las referencias y marca la carpeta.
- **Calibración:** `scripts/evaluar-lectura.mts` corre los 10 a 15 documentos reales (carpeta fuera del repositorio) y reporta aciertos por clase y por campo. Meta: clase correcta en 9 de cada 10.
- Se corrige el texto «[Envió un foto]» de `extraccion.ts`.

### Día de contratación (I1)
Sección en la ficha: psicotécnica (cita con `recordatorio_psicotecnica`, resultado, puntaje, PDF, quién la interpretó), entrevista e inducción. Solo registro: el tamizaje propio o la IPS se conectan cuando la junta decida (fecha límite: lunes 23).

### Indicadores (K1)
- `src/lib/seleccion/indicadores.ts` (pura, con pruebas) e `indicadores-servidor.ts`, con el patrón de `comunicaciones/indicadores-servidor.ts` (`leerTodo`).
- Vista «Indicadores» en Candidatos: aspirantes por etapa, conversión entre etapas, tiempo mediano entre etapas (de `procesos_contratacion_eventos`), causas de cierre, por semana y por canal; costo por aspirante y gasto del mes frente al tope (de `seleccion_consumos`).
- Los cinco indicadores prometidos a la junta: % que envía hoja de vida, % de citados que asisten, días del primer mensaje a la contratación, consultas de antecedentes automáticas frente a manuales, y costo por aspirante.
- Gráficos con `BarrasConPorcentaje` y `BarrasPorDia` (`src/components/graficos/graficos-comunicaciones.tsx`).

### Corte si falta tiempo
Primero el código de barras, luego la lectura de cartas laborales, luego el desglose por canal de los indicadores.

---

## Calendario

| Día | Trabajo |
|---|---|
| Lun 16 (festivo) | Aprobar este plan. Guardarlo como `docs/seleccion-entregas-2-4.md` |
| Mar 17 | E2: migración, `agenda.ts` con pruebas, citar, agenda del día. 4:00 p. m. demostración de la E1 |
| Mié 18 | E2: cron de agenda, respuestas de cita, módulo y vista del profesor, escuela. Prueba en Chrome y en celular. Gestión Humana define quién es el profesor |
| Jue 19 | Mañana: migración en producción, rol al profesor, dirección de la sede. **1:00 p. m. prueba real.** Tarde: ajustes |
| Vie 20 | E3: prueba de los servicios de Croma, migración, adjuntos, exámenes, rutas. Llegan reglas de antecedentes, certificados reales y documentos para calibrar |
| Sáb 21 | E3: antecedentes (consulta, reglas, decisión), carpeta, condiciones para contratar, consumos y tope |
| Lun 23 | E3: laboratorio, pruebas, producción. **4:00 p. m. demostración.** Decisión de la junta sobre psicotécnicas |
| Mar 24 | E4: modelo con adjuntos, lectura, transcripción, pantalla de confirmación, calibración |
| Mié 25 | E4: día de contratación, indicadores, producción. **3:00 p. m. capacitación** |
| Jue 26 | Ajustes con aspirantes reales |
| Vie 27 | Acta e informe del embudo con costos reales |

## Lo que se necesita de La Carolina

| Qué | Para cuándo | Si no llega |
|---|---|---|
| Quién es el profesor y su usuario en Gestivo | Mié 18 | Registra Gestión Humana por él |
| Dirección de la sede y nombre del laboratorio en Selección | Mié 18 | La citación no se puede enviar (`falta_dato`) |
| Laboratorio escribiendo al número de Gestivo | Vie 20 | Los resultados se registran a mano |
| Reglas de antecedentes y 3 o 4 certificados reales por fuente | Vie 20 | Todo hallazgo va a revisión |
| Clave de Croma en Vercel y prueba superada | Vie 20 | Adaptador de TusDatos; E3 se corre 1 o 2 días |
| 10 a 15 documentos reales | Vie 20 | Se calibra con lo que llegue por WhatsApp |
| Clave de OpenAI vigente (audios) y saldo del proveedor del modelo | Lun 23 | Los audios quedan sin transcribir |
| Decisión sobre psicotécnicas | Lun 23 | Queda solo el registro |

## Verificación (en cada entrega)

- `npm run test:seleccion` (con los archivos de prueba nuevos agregados al script), `test:comunicaciones`, `test:permisos`, `test:padrino`, `npx tsc --noEmit`, `eslint` sobre lo tocado y `npm run migracion:verificar`.
- Migración aplicada primero en desarrollo; confirmación del usuario antes de producción.
- En Chrome, con el usuario de prueba de selección y un usuario con el rol de profesor:
  - **E2:** citar antes y después del mediodía y en sábado; cron llamado a mano con la hora simulada (recordatorio, alerta, inasistencia, escuela); responder «Sí, voy» y «Necesito otra fecha»; reprogramar hasta superar el máximo; vista del profesor a ancho de celular; el profesor no puede abrir `/candidatos`.
  - **E3:** un aspirante de prueba de preselección a contratado; intento de contratar con faltantes; antecedentes con y sin hallazgo, con y sin reglas; mensaje y PDF desde un número marcado como laboratorio; tope alcanzado con un valor bajo.
  - **E4:** cédula, licencia, hoja de vida en fotos, PDF de fotos y audio; foto borrosa; cédula que no coincide; `evaluar-lectura` con los documentos reales; indicadores contra un conteo hecho a mano en SQL.
- Al cerrar cada entrega: actualizar `docs/seleccion-conductores.md`, la guía de prueba de Gestión Humana y `docs/crons.md`. El commit y el paso a producción los decide el usuario.
