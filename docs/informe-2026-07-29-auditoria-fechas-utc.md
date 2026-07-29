# Informe · Verificación de fechas en la auditoría (created_at)

**Fecha:** 29 de julio de 2026
**Solicitado por:** Nestor Molina Salazar
**Verificado por:** Victor Sandoval
**Conclusión:** No hay inconsistencias ni transacciones fuera de horario. La diferencia reportada es de zona horaria (UTC vs. hora de Colombia).

---

## 1. Lo reportado

Al consultar directamente la tabla `devengados_entregas` en Supabase, el campo `created_at` mostraba horas como `2026-07-28 20:11:15`, que no coincidían con la fecha/hora que muestra la pantalla de Auditoría. Esto generó la duda de si existían transacciones registradas fuera del horario de operación.

## 2. Causa: el campo `created_at` se almacena en UTC

`created_at` es de tipo `TIMESTAMPTZ` y Supabase (PostgreSQL) lo guarda en **UTC**, que va **5 horas adelante** de la hora de Colombia (UTC−05:00). Un valor `20:11` en la base de datos corresponde a las `3:11 p. m.` en Bogotá.

La pantalla de Auditoría **sí convierte correctamente** a hora de Colombia: el formato usa `timeZone: "America/Bogota"` (`src/app/(dashboard)/tesoreria/devengados/auditoria/page.tsx`). Por eso el sistema muestra una hora distinta a la del valor crudo consultado con un script: **es el mismo instante, representado en dos zonas horarias distintas**.

## 3. Verificación de las transacciones señaladas

Se consultaron directamente las tres transacciones citadas y se cruzaron con la bitácora `tesoreria_audit_log`:

| `created_at` en la DB (UTC) | Hora real en Bogotá | Conductor | Valor | Registrada por |
|---|---|---|---|---|
| 2026-07-28 20:11:15 | 3:11:15 p. m. | CONRADO CAMARGO PEDRO LUIS (10907) | $23.609 | cajero3@lacarolina.com.co |
| 2026-07-28 20:23:33 | 3:23:33 p. m. | ALBOR ESTRADA HABIB (11019) | $61.669 | cajero3@lacarolina.com.co |
| 2026-07-28 20:28:21 | 3:28:21 p. m. | CASTRO DE LA HOZ FRANCISCO JAVIER (4001) | $42.872 | cajero3@lacarolina.com.co |

Resultado del cruce:

- Las tres aparecen en la auditoría como **`entrega_registrada`** con el **mismo timestamp al segundo exacto** que la fila de `devengados_entregas`.
- Todas ocurrieron en **horario normal de operación** (media tarde, hora de Colombia).
- La bitácora registra además el inicio de sesión del cajero minutos antes, consistente con la operación.

## 4. Recomendación para consultas directas a la base de datos

Al verificar `created_at` con scripts o SQL, convertir siempre a hora de Colombia antes de comparar con lo que muestra el sistema:

```sql
SELECT created_at AT TIME ZONE 'America/Bogota' AS hora_colombia
FROM devengados_entregas;
```

O restar 5 horas al valor UTC. **La auditoría del sistema es la que muestra la hora correcta de Colombia**; el valor crudo de la base de datos siempre estará 5 horas adelante.

## 5. Sobre el simulador bloqueado para otros usuarios

La columna **Simulador** en "Permisos de Tesorería" aparece con candado y deshabilitada para Operaciones, Recursos Humanos y Tesorería. **Es el comportamiento definido a propósito**: el simulador es exclusivo del administrador y no se puede habilitar a ningún otro tipo de usuario. No es un error de configuración.

---

*No se realizó ningún cambio en código ni en datos; todo opera según lo esperado.*
