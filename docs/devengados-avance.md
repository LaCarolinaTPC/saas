# Devengados / Tesorería — avance

**Última actualización:** 22-jul-2026
**Rama:** `main` (despliega a producción por webhook de Vercel)

Estado del trabajo del módulo de Tesorería · Devengados. Marca `[x]` lo
terminado, `[ ]` lo pendiente.

---

## ✅ Hecho y desplegado

- [x] **Filtros en Auditoría** (fecha, acción, módulo, resultado, usuario,
  conductor) + paginación. — `58c4422`
- [x] **Corte lateral del dashboard**: `<main>` sin `min-w-0` recortaba tablas
  anchas sin scroll. Afectaba a todo el dashboard. — `58c4422`
- [x] **Total al pie** de Entregas del día (neto de caja, no suma de columna). — `a208db1`
- [x] **Reverso en la fecha de la entrega original** (migración 037) + realineación
  de los 2 reversos viejos (038, aplicada). — `8738a8d`
- [x] **22 pagos del 21 reasignados al 18** (migración 039, aplicada): quedaron
  mal por mover la fecha operativa global. El 18 cerró en $2.986.995. — `3ecbe60`
- [x] **Filtro por cajero** en Entregas del día (solo admin); lista **todos** los
  cajeros de Tesorería, no solo los del día. — `8c17c83`, `65669bf`
- [x] **Registrar entrega a nombre de otro cajero también en el día en curso**
  (migración 040, aplicada). Antes solo para días cerrados, lo que obligaba a
  mover la fecha operativa global (causa del descuadre del 18). — `0d84525`
- [x] **Textos "pruebas" → "cierres"** en caja y parámetros. — `7cef02e`, `0d84525`
- [x] **Retirados con pago aparecen en el Análisis** (`data.ts` getAnalisisQuincena).
  Antes se descartaba su entregado en silencio. — `fddad8d`
- [x] **Estado de cuenta del conductor** en Caja: columnas "Pago (real)" y
  "Saldo" + fila de total, y **PDF imprimible** por conductor. Cubre las 3
  peticiones de contabilidad (producción acumulada día a día, ver el pago, saldo
  respaldado por movimiento). — `7a08bf4`

---

## ⏳ Pendiente

### De contabilidad (audios del 22-jul) — ver `devengados-caso-amador-y-retirados.md`

- [x] **Estado de cuenta del conductor** — HECHO en Caja + PDF (`7a08bf4`).
  Cubre "producción acumulada día a día" (audio 11:16), "ver el pago dentro de
  la operación" (audio 17:34) y "saldo respaldado por una transacción" (18:36).
  Pendiente: confirmar con contabilidad si además lo quieren en el Análisis.
- [ ] **Explicar a Néstor el caso AMADOR** (no es error): el déficit de $16.145
  del 18-jul ya se descuenta el **18** (el liberado baja de $95.217 a $79.072),
  no el 20. Pendiente correcto: $4.789. Tabla lista en el doc del caso.
- [ ] Confirmar con Néstor **un retirado concreto** con pago para verificar que
  el arreglo `fddad8d` ya lo muestra.

### Diferencias / datos por aclarar

- [ ] **Los $4.341** de diferencia en la quincena: sin explicación dentro del
  sistema; falta saber contra qué cifra compara el usuario.
- [ ] **MANOTAS MARTINEZ DAVID ENRIQUE duplicado** en la maestra de conductores:
  cédulas `8527063` (con producción) y `852700636` (sin nada). Riesgo de que un
  pago quede contra la ficha equivocada. Limpiar.

### Mejoras de prevención (propuestas, sin aprobar)

- [ ] **Aviso de fecha operativa** en la pantalla de caja cuando ≠ día real.
  Menos urgente ahora que el registro a nombre de otro cajero ya no obliga a
  mover la fecha operativa global.

---

## Notas / decisiones

- **Regla de la fecha del reverso:** la fecha contable de un movimiento es la de
  la operación que corrige, no la de cuando se digita. `created_at` guarda cuándo
  se registró.
- **Neto de caja ≠ suma de columna:** una entrega devuelta se lista con su valor
  pero no cuenta como efectivo salido; su crédito se anula contra el débito del
  mismo día (migración 037).
- **Novedad de caja:** un movimiento es novedad cuando `registrada_por` (quien
  digitó) ≠ `aprobada_por` (cajero acreditado). Aplica a día cerrado
  (`extemporanea = true`) y día en curso (`extemporanea = false`).
- **Working docs sin commitear:** `devengados-caso-amador-y-retirados.md` y este
  `devengados-avance.md` están en `docs/` pero pendientes de decidir si se suben
  al repo o se dejan como material interno.

## Migraciones aplicadas esta sesión

| # | Archivo | Estado |
|---|---------|--------|
| 037 | `037_reverso_fecha_original.sql` | aplicada |
| 038 | `038_realinear_reversos_existentes.sql` | aplicada |
| 039 | `039_reasignar_pagos_21_al_18.sql` | aplicada |
| 040 | `040_entrega_a_nombre_de_cajero.sql` | aplicada |
