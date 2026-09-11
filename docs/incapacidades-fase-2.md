# Recuperación de incapacidades — Fase 2: esquema, corte y etapa 1

**Plan:** `docs/Plan_desarrollo_incapacidades_GESTIVO.md`, sección 11, fase 2.
**Migración:** `supabase/migrations/20260911201033_modulo_de_recuperacion_de_incapacidades_expediente_corte_y_etapa_1.sql`
**Pantallas:** `/incapacidades` (bandeja), `/incapacidades/[id]` (expediente), `/incapacidades/parametros` (admin),
`/incapacidades/alta-manual` (RRHH con permiso de edición).

## Cómo aplicar la migración

1. Abrir el SQL Editor del Studio autoalojado y pegar el archivo **entero**. Es idempotente: se puede volver a
   correr sin duplicar nada (el backfill solo crea expedientes que no existen).
2. Al final imprime cinco consultas de comprobación. Lo esperado al 2026-09-11:

   | Consulta | Esperado |
   |---|---|
   | `corte` | 2026-09-01 |
   | `expedientes` = `deberian_tener` | 23 (las incapacidades vigentes con `fecha_inicio >= 2026-09-01`) |
   | `anteriores_con_expediente` | 0 |
   | `pendientes_homologacion` | 0 si los cinco pagadores del arranque (EPS SURA, SALUD TOTAL, NUEVA EPS, SANITAS, ARL BOLIVAR) están con ese nombre exacto en el catálogo activo |
   | `personas_sin_resolver` | idealmente 0; si hay, son cédulas que no están ni en `conductores` ni en `employees` |
   | reglas | tres filas, solo `gestivo-cobro-dias` operativa |
   | catálogo | todas las EPS con `clase = EPS` y `dias_min_cobro = 4`; la ARL con `clase = ARL` y `dias_min_cobro = 1` |
   | `user_types` | `admin` y `rrhh` con `tiene_incapacidades = true` |

3. En la aplicación: entrar a `/incapacidades` con un usuario `rrhh` o `admin`. La bandeja debe mostrar
   exactamente los 23 expedientes en estado **Recibido**, sin salario, sin responsable y sin valor reclamado
   (dicen «pendiente», nunca cero). Abrir uno deja rastro en Tesorería › Auditoría con módulo
   `incapacidades`, acción `expediente_consultado` (una vez por persona y expediente cada 5 minutos).
4. `anon` y `authenticated` no leen ninguna tabla nueva: RLS habilitada sin políticas, `REVOKE` explícito.

## Qué crea

| Objeto | Para qué |
|---|---|
| `incapacidad_parametros` | Clave/valor. Hoy solo `fecha_corte_gestion = 2026-09-01`. |
| `incapacidad_reglas` | Las tres reglas del motor (`src/lib/incapacidades/motor.ts`), con la misma forma de `parametros`. Solo una operativa. |
| `ausentismo_catalogos` + `clase`, `nit`, `vigente_desde`, `vigente_hasta`, `dias_min_cobro` | Lo que exige radicar. El umbral de días cobrables es **por entidad** (decisión 12.17). |
| `incapacidad_expedientes` | El expediente, 1:1 con `ausentismo`. Copia de la fila recibida en `recibido_json`; homologaciones; salario snapshot; ajustes de nivel 1 y 2; estado; `version` para concurrencia optimista. |
| `incapacidad_liquidaciones` | Un cálculo explicado por fila; recalcular inserta otra y deja la anterior sin vigencia. |
| `incapacidad_ajustes_liquidacion` | Campo, valor anterior, valor nuevo y motivo de cada ajuste (decisión 12.18). Base del conteo al cierre del piloto. |
| `incapacidad_adjuntos` + bucket privado `incapacidades` | Soportes; se anulan con motivo, no se borran. |
| `vw_incapacidad_expedientes` | Lo que lee la bandeja: expediente + matriz + entidad + liquidación vigente + `cobrable`. |
| Triggers sobre `ausentismo` | `AFTER INSERT`: crea el expediente si `fecha_inicio >= corte` y la fila está vigente. `AFTER UPDATE`: marca `matriz_cambio_pendiente` con el detalle en `ausentismo_log`; eliminada → `excepcion`; restaurada → `recibido`; una fila que pasa a cumplir el corte recibe su expediente. |
| `incapacidad_alta_manual(ausentismo_id, motivo, email)` | RPC que usa la pantalla de alta manual. Valida motivo (≥ 10 caracteres), vigencia y duplicado. |

## Reglas que fija

- **El corte es por fecha de inicio**, nunca por fecha de registro. Editar el corte hacia atrás no crea expedientes.
- **La matriz EPS es el único insumo de la etapa 1.** Nada de lo que ya está en la matriz se vuelve a pedir; si un
  dato está mal se corrige en la matriz y el expediente recibe el cambio.
- **Ningún dato de gestión se inventa**: sin salario, sin responsable, sin estado de negocio, sin valor. La
  pantalla dice «pendiente».
- **Homologación automática solo inequívoca**: entidad por nombre exacto (normalizado con `ausentismo_clave`,
  la misma regla del formulario) contra el catálogo activo de EPS/ARL; tipo por código exacto del catálogo ORIGEN.
  Si no coincide, `pendiente_homologacion`.
- **Persona**: comodín `99999999` → sin resolver; luego `conductores.cedula`; luego `employees.document_number`.
- **Permisos** (decisión 12.9): módulo `incapacidades` para `rrhh` y `admin`; `parametros` solo `admin`
  (`SUBS_SOLO_ADMIN`). Las sub-funciones llevan prefijo `incap_` porque los mapas de sub-funciones se indexan sin
  el módulo y `parametros` ya es de Tesorería.

## Verificación hecha antes de commitear

- `tsc`, `eslint` y `npm run migracion:verificar` limpios; las 26 pruebas del motor siguen verdes.
- UX revisada sin sesión con una vista previa temporal bajo `/docs` y Playwright con Chrome, a 1440 y 800 px:
  KPIs, leyenda y franjas de procedencia por columna, chips de estado, ficha de seis bloques e historial. La vista
  previa se borró antes del commit.
- La migración **no** se ha aplicado en la base: la aplica el usuario en el SQL Editor y coteja la tabla de arriba.

## Lo que la fase 2 no hace

Completar datos, liquidar, ajustar y radicar (fases 3 y 4); recaudos y conciliación (fase 5). El expediente es de
solo lectura salvo el alta manual y los parámetros.
