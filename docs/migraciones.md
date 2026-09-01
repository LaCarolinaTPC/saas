# Migraciones de base de datos

## Cómo crear una

```bash
npm run migracion:nueva -- "permisos del modulo mantenimiento"
```

Eso crea `supabase/migrations/20260901194710_permisos_del_modulo_mantenimiento.sql` con una plantilla. Escriba el SQL, ejecútelo en el **SQL Editor** del Studio autoalojado y commitee el archivo.

No cree migraciones a mano ni les ponga un número secuencial: el verificador las rechaza.

## Por qué la marca de tiempo

Hasta la migración `076` los nombres eran secuenciales (`001_…`, `002_…`). El problema es que el siguiente número libre se calcula mirando la copia local, así que dos personas trabajando en paralelo toman el mismo y quien empuja después tiene que renumerar.

El 2026-09-01 pasó **tres veces en una sola jornada**: una migración del módulo Mantenimiento tuvo que renumerarse de `050` a `056`, luego a `063` y finalmente a `072`, porque Rotación iba ocupando esos números en paralelo. Cada renumeración obliga a tocar el archivo, su documento de aplicación y las referencias cruzadas, y el riesgo real es que dos archivos con el mismo prefijo lleguen a convivir en la carpeta sin un orden de ejecución definido.

Con una marca de tiempo en segundos, dos personas solo colisionan si crean una migración en el mismo segundo, y el generador ya resuelve ese caso avanzando al siguiente. La marca va en **UTC** para que no dependa de la zona horaria de quien la crea.

## Orden de ejecución

Las migraciones se ejecutan en orden alfabético del nombre del archivo. Como `0` es menor que `2`, el histórico `001`–`076` sigue ordenándose antes que cualquier marca de tiempo `2026…`, así que la secuencia se conserva sin renombrar nada.

```
074_verificacion_timbrada.sql
075_timbradas_reconstruidas.sql
076_reconstruccion_envolvente.sql
20260901194710_permisos_del_modulo_mantenimiento.sql   ← las nuevas van aquí
```

## Qué valida el verificador

```bash
npm run migracion:verificar
```

Hay dos niveles, a propósito.

**Error, siempre.** Es el daño concreto que causan las colisiones:

- Dos archivos comparten prefijo. Única excepción: el par `044_api_request_logs.sql` y `044_modulo_liquidacion_conductor.sql`, duplicado anterior a esta regla, que no se renombra porque ambas ya están aplicadas en producción.
- Un nombre no sigue ninguna de las dos formas válidas: `<3 dígitos>_descripcion.sql` (histórico) o `<14 dígitos>_descripcion.sql` (marca de tiempo), en minúsculas y con guiones bajos.

**Aviso, mientras dure la transición.** Una migración secuencial nueva, por encima de `076`, recuerda usar el generador pero no bloquea nada.

El aviso se convierte en error poniendo `SECUENCIAL_NUEVA_ES_ERROR = true` en `scripts/verificar-migraciones.mjs`. **Acuérdelo antes con el equipo**: a partir de ese momento el hook y CI rechazan cualquier migración numerada a mano, y no tiene sentido bloquearle el trabajo a alguien que todavía no conoce la convención.

## Dónde corre la validación

| Punto | Cobertura | Cómo se activa |
|---|---|---|
| `npm run migracion:verificar` | manual | siempre disponible |
| Hook de `pre-commit` | quien lo instale | `npm run hooks:instalar`, una sola vez por clon |
| GitHub Actions | **toda la gente del repositorio** | automático en cada push y pull request que toque migraciones |

El hook local da el aviso más temprano, pero solo protege a quien lo instaló. La red de seguridad real es el workflow de CI, que corre sin que nadie tenga que configurar nada.

Para saltarse el hook de forma deliberada: `git commit --no-verify`.

## Cómo se aplican

Esta instalación de Supabase es **autoalojada** y las migraciones se ejecutan **a mano** en el SQL Editor del Studio. No hay `supabase db push` ni tabla que registre qué migraciones se aplicaron, y el proyecto de Supabase Cloud al que apunta `supabase/.temp/` **no** es la base de Gestivo.

De eso se derivan tres reglas prácticas:

1. El script debe poder ejecutarse **entero de una sola vez**.
2. Hágalo idempotente donde se pueda: `IF EXISTS`, `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`.
3. En esta instancia las tablas nuevas **no conceden privilegios a `service_role` por defecto**. Si crea una tabla que la aplicación consulta desde Server Components o Server Actions, incluya su `GRANT` en la misma migración, o las consultas devolverán `403`.

Si una migración necesita explicación aparte para quien la ejecuta, escriba un documento en `docs/` que la nombre por su archivo completo, no por un número suelto.
