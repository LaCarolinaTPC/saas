# 2026-10-23 · El N.º interno del vehículo, obligatorio al reportar accidentes

Reporte: «en registros de accidente está dejando el campo número de vehículo
sin diligenciar; es obligatorio y no debe permitir grabar sin ese dato».

## Lo verificado

Ninguna de las tres capas lo exigía:

| Capa | Qué pedía |
|---|---|
| `validateAccidente()` (ReportWizard) | dirección, fecha, ciudad, lesionados, daños |
| `POST /api/rotacion/accidentes` | conductor, dirección, firma |
| `columnasFormato()` | `vehiculo_codigo: txt(vp?.codigo)` → escribía `null` |

Sobre los 1.575 accidentes: **7 sin N.º interno**, todos recientes
(2026-10-11 al 22), y **6 de ellos CON placa**:

```
#1589 pendiente_revision  placa "STL  243"   ← dos espacios
#1588 pendiente_revision  placa "TZK 544"
#1587 pendiente_revision  placa "WPV 324"
#1583 falta_informacion   placa —
#1580 pendiente_revision  placa "TDV 352"
#1572 pendiente_revision  placa "534"        ← ¡es un N.º interno en el campo Placa!
#1564 aprobado            placa "LJO 712"
```

## La causa, que cambió el arreglo

El código **solo se llenaba al elegir una sugerencia** del buscador. Quien
teclea la placa a mano —en la vía, de afán— dejaba el campo vacío. Poner el
campo obligatorio y nada más habría dejado a esa persona atascada sin saber
qué escribir. Así que además:

- **Placa → N.º interno**: si el código está vacío y la placa coincide con
  **un solo** vehículo del maestro, se completan código, placa y ruta. La
  placa se normaliza (`"STL  243"` → `STL243`), que es justo lo que impedía
  encontrarla.
- **Número escrito en «Placa»**: se ofrece moverlo a su campo (caso #1572).
- Nunca pisa un código escrito a mano, y con dos coincidencias decide la
  persona.

## El bloqueo, en las cuatro capas

Una sola regla, `faltantesVehiculoPropio` (`lib/accidentabilidad/formato.ts`,
con pruebas): asistente, edición, servidor (`POST` y `actualizarAccidente`) y
base de datos. Tres validaciones sueltas se desincronizan.

En el asistente no se pasa del paso «Datos del accidente», con el campo en
rojo; y al guardar se vuelve a comprobar, porque se puede borrar el vehículo
retrocediendo.

## La migración

`20261023185131_accidentes_exigen_numero_interno_del_vehiculo.sql`:
`CHECK (vehiculo_codigo IS NOT NULL AND btrim(...) <> '') NOT VALID`.

`NOT VALID` es lo que la hace aplicable hoy: rige para toda fila nueva o
modificada y **deja en paz las 7 históricas**. Un `NOT NULL` fallaría al
aplicarse, y rellenarlas con un valor inventado sería peor: nadie sabe qué bus
era. Cuando no quede ninguna se puede `VALIDATE CONSTRAINT`.

**No** se exige que el código exista en el maestro `vehiculos`: de 159 códigos
usados, uno (`903`) no está, y rechazarlo sería inventar un bloqueo donde el
dato es correcto.

## Pendiente para RRHH

Los 7 reportes de arriba. El de `falta_informacion` (#1583) se edita y ya; los
5 `pendiente_revision` y el `aprobado` hay que devolverlos a «falta de
información» para completarlos. Con la placa que traen, el formulario resuelve
el código solo.

## Archivos

```
src/lib/accidentabilidad/formato.ts        + faltantesVehiculoPropio, placaNormalizada, pareceInterno
src/lib/accidentabilidad/formato.test.ts   + 3 pruebas (30 en total)
src/components/accidentabilidad/FormatoSecciones.tsx   placa → código, «*», borde rojo, ayudas
src/components/accidentabilidad/ReportWizard.tsx       no deja pasar el paso 2 ni guardar
src/components/accidentabilidad/AccidenteEditForm.tsx  misma regla al editar
src/app/api/rotacion/accidentes/route.ts               400
src/lib/actions.ts                                     actualizarAccidente
supabase/migrations/20261023185131_…sql                CHECK NOT VALID
docs/modulos/accidentabilidad.md
```
