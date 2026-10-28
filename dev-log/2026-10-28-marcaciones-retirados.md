# 2026-10-28 · Marcaciones: retirados que salían como esperados

**Caso.** 72231546, RETIRADO desde el 2026-10-21, seguía saliendo en
Marcaciones el 27 y el 28. El bus 702 salió en GEMA con la cédula de relleno
`99999999`, la cascada de esperados bajó al histórico y el conductor más
frecuente del 702 en 45 días era él. `agregar()` solo miraba que la cédula
existiera en el maestro, no que estuviera activa. Había 40 retirados en la
ventana expuestos a lo mismo.

**Hecho** (commit 672f042 «Coregimos informacion retiros en marcaciones», en
Desarrollo):

- `activoEnFecha` (`plantilla.ts`): activo en la fecha mirada. Cuenta quien
  está ACTIVO, o RETIRADO con `fecha_retiro` posterior a ese día; el día del
  retiro ya no cuenta. Además las reglas de la plantilla (sin reubicar,
  confirmado por GEMA, ya ingresado).
- `esperados.ts`: ningún esperado deducido de un bus (despacho sin salir,
  histórico, conductor fijo) entra si no pasa esa regla. Quien rodó entra
  siempre.
- `dominante.ts`: el más frecuente del bus se elige solo entre activos; la
  confianza se sigue midiendo sobre todos los días del bus.
- Se probó primero con el estado de hoy y el 20-oct perdía 4 esperados que se
  retiraron después; por eso se usa la fecha de retiro.

**Medido** (versión anterior → nueva): 20-oct 155→155; 22-oct 152→150;
27-oct 155→151; 28-oct 154→153. Nadie entra de más.

**Verificado.** `test:biometrico` 175 (9 nuevas), `tsc` y `eslint` sin errores
fuera de `work/`. El build no corrió: `next dev` abierto bloquea `.next`.

**Pendiente.**
- Correr el build con `next dev` cerrado (Vercel lo construye al desplegar).

**Confirmado por el usuario** en la pantalla de Marcaciones de producción:
72231546 ya no aparece.

**Subido.** Desarrollo en GitHub (merge 4cd2364 con el monitor de roles) y main
con el merge `aa6ad83` «Coregimos informacion retiros en marcaciones».
