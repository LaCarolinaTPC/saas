# Informe · Simulador asignable por tipo de usuario

**Fecha:** 29 de julio de 2026
**Solicitado por:** Nestor Molina Salazar
**Implementado por:** Victor Sandoval
**Resumen:** El simulador de Tesorería deja de ser exclusivo del administrador. Ahora se puede conceder tipo de usuario por tipo de usuario desde la pantalla de permisos, sin que nadie lo reciba por defecto.

---

## 1. Lo solicitado

En "Permisos de Tesorería" la columna **Simulador** aparecía con candado: deshabilitada para todos los tipos de usuario (Operaciones, Recursos Humanos, Tesorería), reservada únicamente al administrador. Nestor solicitó que se habilite para poder asignar el simulador a los usuarios que lo necesiten.

## 2. Cómo funciona ahora

- **Se quitó el candado.** En Configuración → Usuarios → Permisos de Tesorería, la casilla "Simulador" ya se puede marcar o desmarcar para cada tipo de usuario, igual que Caja, Análisis, Entregas, Parámetros y Auditoría.
- **Nadie lo recibe por defecto.** El simulador pasó a ser una sub-función *sensible* (mismo tratamiento que Auditoría): aunque un tipo de usuario tenga el módulo de Tesorería sin restricciones, el simulador solo se concede si el administrador lo marca explícitamente.
- **Estado inicial: sin cambios para nadie.** Hoy ningún tipo de usuario tiene el simulador; sigue viéndolo solo el administrador hasta que se asigne desde la pantalla de permisos.
- El permiso aplica de forma consistente en los tres niveles: el menú lateral, la pantalla del simulador y el servidor (los tres consultan la misma regla `subAllowed`).
- La ruta `/rendimiento` (Rendimiento del día para conductores) no se modificó; sigue funcionando por su propio módulo y rol.

## 3. Cambios técnicos

| Archivo | Cambio |
|---|---|
| `src/lib/permissions-shared.ts` | `simulador` sale de `SUBS_SOLO_ADMIN` (que queda vacío como mecanismo para el futuro) y entra a `SUBS_SENSIBLES`. |
| `src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx` | Las casillas de sub-funciones sensibles solo se muestran marcadas cuando están concedidas de verdad, y al guardar se conserva la lista explícita si hay una sensible activa. |
| `src/app/(dashboard)/rendimiento/page.tsx` | Actualización de comentario (documentación interna). |

Nota: el ajuste de la pantalla de permisos corrige además un desfase que ya existía con **Auditoría**: en tipos sin restricción guardada, la casilla podía verse marcada aunque el servidor no concediera el acceso.

## 4. Pasos para asignar el simulador

1. Entrar como administrador a **Configuración → Usuarios**.
2. En la sección **Permisos de Tesorería**, marcar la casilla **Simulador** en la fila del tipo de usuario deseado.
3. El usuario verá la opción del simulador en el menú en su próxima navegación (o al recargar).

## 5. Verificación

- Verificación de tipos (TypeScript) del proyecto: en verde, sin errores.
- El candado de la columna Simulador desaparece y las casillas quedan operables.
- Ningún tipo de usuario quedó con el simulador concedido automáticamente.
