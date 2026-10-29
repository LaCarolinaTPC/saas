# 2026-10-29 · Revisión cartulina: el día en curso casi en tiempo real

## Por qué

GEMA registra los puntos virtuales al instante (medido: 5–7 s de atraso, +212
eventos en 93 s), pero mientras el día está en curso les da números
provisionales que reutilizan rangos viejos y solo al cierre los renumera. Como
`puntos_virtuales` usa ese número como llave, lo de hoy chocaba con días ya
guardados y se descartaba: la revisión de hoy tenía 1 evento del terminal
cuando GEMA ya tenía más de 1.000. El recaudo y los descuentos de la tarde
tampoco llegaban hasta la sincronización del día siguiente.

## Qué

- **Hoy:** tabla aparte `pv_terminal_hoy` (migración
  `20261029183325_puntos_virtuales_del_terminal_del_dia_en_curso.sql`, pendiente
  de aplicar) con solo las entradas y salidas del terminal (~2.000 al día),
  identificadas por IMEI + hora + tipo, no por el número provisional. Al abrir
  la revisión de hoy o de ayer (llegadas nocturnas), si el dato tiene más de
  5 min se trae de GEMA: terminal, despacho, recaudo y descuentos de hoy
  (`src/lib/tesoreria/cartulina-hoy.ts`, con candado para varias pestañas).
  Botón «Actualizar ahora» y relectura cada 5 min con la pestaña visible.
- **Aviso:** «Datos sujetos al proceso de cierre de GEMA», con la hora de la
  última actualización. Hoy no se guarda foto para el consolidado.
- **Días cerrados:** los eventos salen de `puntos_virtuales` (con el cierre de
  GEMA). Un día no cerrado todavía (el del marcador o posterior) sale de la
  tabla del día si tiene datos; los días que ya llegaron cerrados se borran de
  ella en cada actualización.

Pruebas en `test:tesoreria` (`cartulina-hoy.test.ts`).
