# Corte y migración desde Da-o_Busetas

El módulo de Mantenimiento de Gestivo reemplaza al sistema **Da-o_Busetas** (repositorio `administradordatos-mtc/Da-o_Busetas`, base Supabase en la nube `lqeddrpbwunzcyjxuiei`), que **sigue en producción**: el último reporte del que se tiene registro es del 2026-09-01, el mismo día de la extracción.

Por eso esto no es una importación única sino un corte: hay que congelar el legado, traer lo que falte y solo entonces mandar a la gente a Gestivo.

## Qué se migra

| Tabla origen | Filas | Destino en Gestivo |
|---|---|---|
| `alertas_recurrencia` | 5 | `mantenimiento_alertas` |
| `registros_danos` | 55 | `mantenimiento_reportes` |
| `graduaciones_frenos` | 1 | `mantenimiento_frenos` |

Los catálogos **no** se migran: los vehículos y los conductores ya viven en Gestivo sincronizados desde GEMA, y los quince conceptos ya se cargaron con los nombres idénticos a los del origen.

## Homologación, verificada antes de escribir el script

- Las **60 placas** activas del origen existen todas en `vehiculos`; 57 con `estado = 1`.
- Las **35 cédulas** con reportes existen todas en `conductores`. Nueve figuran como `RETIRADO`, así que la carga valida contra el maestro completo y no contra los activos: estaban vigentes cuando reportaron.
- Los **quince conceptos** coinciden por nombre, literalmente.
- Los **61 identificadores** del script se compararon uno a uno contra la base origen: idénticos.
- Los **10 reportes** que colgaban de una alerta son dos por cada una de las cinco, que es justo el `cantidad = 2` que traen.

## Cómo correr la carga

1. Aplique la migración `supabase/migrations/20260901211004_source_id_para_importacion_del_sistema_origen.sql` en el SQL Editor del Studio autoalojado.
2. Ejecute `supabase/imports/2026-09-01-da-o-busetas.sql` completo, de una sola vez.

El script:

- **Desactiva el trigger de recurrencia** durante la carga y lo vuelve a activar al final. Sin eso, insertar reportes históricos abriría alertas nuevas fechadas hoy en vez de respetar las del origen.
- Carga primero las alertas, con su fecha de apertura, su cierre, su orden de taller y sus notas; después los reportes, resolviendo su alerta por la llave del origen.
- Deja `cerrada_por` y `created_by` en nulo: los usuarios del legado no son los de Gestivo.
- Escribe una fila de auditoría por reporte, con `origen: importacion_da_o_busetas` en el detalle.
- Termina con una **reconciliación que aborta** si no quedan exactamente 5 alertas, 55 reportes y 1 graduación, o si alguno de los diez reportes perdió su alerta. Los JOIN de homologación son internos, así que sin esa comprobación una placa que no cuadre desaparecería en silencio y la carga parecería correcta.

## Es repetible

Cada fila viaja con la llave que tenía en el origen, en la columna `source_id`, y todos los INSERT llevan `ON CONFLICT (source_id) DO NOTHING`. Se puede correr un ensayo, volver a correrlo después del corte y no se duplica nada. La auditoría también comprueba antes de escribir.

Lo que **no** hace es traer lo que se reporte en el legado después de la extracción. Para eso hay que generar un script delta con el mismo formato, filtrando por fecha.

## Secuencia recomendada del corte

1. Acordar día y hora con el área de Mantenimiento.
2. Anunciar a los conductores el cambio de dirección del formulario.
3. Congelar el legado: dejarlo solo de lectura o sacarlo de línea, para que nadie reporte ahí durante el cambio.
4. Extraer el delta desde la fecha de este script y añadirlo con el mismo formato.
5. Correr la carga y comprobar que la reconciliación no aborte.
6. Verificar en Gestivo: `/mantenimiento/reportes` debe mostrar 55 más el delta, y `/mantenimiento/alertas` cinco alertas, cuatro cerradas con su orden y notas y una abierta en el vehículo `TDV340` por FRENOS.
7. Publicar la dirección nueva del formulario y retirar la del legado.

## Un registro de prueba que conviene decidir

El origen trae dos filas nacidas de una prueba de auditoría interna:

- El reporte `278b9fba` del vehículo TZM643, con descripción "direccionales no funcionan (PRUEBA DE AUDITORIA)".
- La alerta `0aed2ae2` que ese reporte disparó, cerrada con la orden "OTD-PRUEBA CONTROL" y la nota "Esta alerta se generó por prueba de auditoria".

El script las trae, porque forman parte del historial real y de su rastro de auditoría. Si el área prefiere no arrastrarlas, se borran después por `source_id`; hacerlo así es más seguro que quitarlas del script, porque la reconciliación cuenta 55 y 5.
