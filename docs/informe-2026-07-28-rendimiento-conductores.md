# Informe — Rendimiento del día para conductores (28-jul-2026)

Pedido de Nestor (WhatsApp 28-jul-2026, imágenes anotadas + audios): antes de
habilitar la consulta a los conductores, el reporte debía ajustarse y poder
desplegarse **solo** la vista "Rendimiento del día", con un acceso propio para
proyectarla en pantalla.

## Qué se pidió

1. Quitar la palabra "Salario" de los encabezados del reporte.
2. Que la pantalla inicial **no** muestre el listado de conductores: la
   información aparece únicamente al digitar el código (o el vehículo).
3. Desplegar a los conductores solo "Rendimiento del día" (sin las demás
   pestañas del simulador), con un link/usuario únicamente para eso.

## Qué se hizo

### 1. Encabezados sin "Salario"

En la tabla del cierre GEMA del simulador (`rendimiento-client.tsx`):

| Antes | Ahora |
| --- | --- |
| SALARIO BRUTO DÍA | BRUTO DÍA |
| SALARIO NETO DÍA | NETO DÍA |

Los valores no cambian: siguen saliendo tal cual quedaron liquidados en el
cierre de GEMA. Solo se renombró el encabezado (la pantalla de Caja no se
tocó; Nestor lo marcó sobre el simulador).

### 2. Pantalla inicial sin listado

Aplica al simulador del admin **y** a la vista nueva: al entrar ya no se
lista ningún conductor. Aparece una tarjeta que invita a digitar el código
del conductor o el número del vehículo, y solo entonces se muestran la tabla
principal y el detalle por ruta (filtrados por esa búsqueda). Un código de
1-6 dígitos exige coincidencia exacta, como ya funcionaba el buscador.

### 3. Nueva ruta restringida `/rendimiento`

- Página nueva `src/app/(dashboard)/rendimiento/page.tsx`: reutiliza el mismo
  componente del simulador (`RendimientoTab`) pero **solo** esa vista:
  - Sin las pestañas "Registro del corte" y "Quincena hipotética".
  - Sin filtros de ruta/flota/segmento y sin editar base, % de pago ni
    ahorro (modo `restringido`): solo el buscador y las fechas.
  - Mismos valores del cierre de GEMA (o el estimado si el cierre del día
    aún no llega), con la base vigente de parámetros.
- El **simulador completo sigue siendo solo de administradores**
  (`SUBS_SOLO_ADMIN` no cambió). La vista nueva es un módulo aparte,
  `rendimiento`, con menú propio "Rendimiento del día".
- Un usuario con solo ese módulo que entre a cualquier otra ruta (incluido
  `/`) es redirigido automáticamente a `/rendimiento` por el middleware.

### 4. Rol y usuario

Migración `supabase/migrations/043_rol_rendimiento_conductores.sql`
(idempotente, pegar en Supabase → SQL Editor):

- Agrega el módulo `rendimiento` al tipo `admin`.
- Crea el rol **`rendimiento_dia` — "Rendimiento del día"**: solo ese módulo,
  sin permisos de edición.

El usuario para proyectar en pantalla se crea desde **Configuración →
Usuarios** con ese rol: llega con contraseña provisional y cambio obligatorio
al primer ingreso, y al entrar cae directo en `/rendimiento`.

## Archivos tocados

- `src/app/(dashboard)/tesoreria/devengados/simulador/rendimiento-client.tsx`
  — encabezados, pantalla inicial sin listado, props `basePath`/`restringido`.
- `src/app/(dashboard)/rendimiento/page.tsx` — ruta nueva (guard por módulo).
- `src/lib/permissions-shared.ts` — módulo `rendimiento` (lista, labels,
  home, mapeo de rutas).
- `src/lib/constants.ts` — entrada de menú "Rendimiento del día".
- `supabase/migrations/043_rol_rendimiento_conductores.sql` — rol y permisos.

## Estado del despliegue (28-jul-2026)

1. ✅ Push a producción — commit `e22b257` en `main` (Vercel despliega
   automáticamente).
2. ✅ Migración 043 aplicada en Supabase.
3. ⏳ Crear el usuario con el rol "Rendimiento del día" (Configuración →
   Usuarios) y entregarle a Nestor el acceso: al iniciar sesión verá
   únicamente `/rendimiento`, sin listado hasta digitar el código.
