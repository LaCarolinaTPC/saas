# 2026-10-29 · Agente biométrico 1.3.0: la lectura directa por fin en tiempo real

## Qué pasaba

Hoy no llegó ninguna huella a Gestivo. La bitácora de LCPC07 y los envíos del
servidor mostraron dos fallas de la vía equipo, ninguna de cuelgue ni de arranque:

1. **El canal en vivo nunca entregó una huella.** `TablaPull.EnVivo` leía el
   tipo de evento en la columna 6 de `GetRTLog` (el modo de verificación); va en
   la 4. Toda huella real se descartaba en silencio: 0 «Huella en vivo» en diez
   días. Solo entraban con la puesta al día al reconectar (946 huellas, mediana
   de 4,6 h de atraso; el 28 una reconexión encontró 133 que el canal había tirado).
2. **Se apartaba todo el día.** Con `Access.exe` abierto el agente cedía la
   conexión, aunque el MA500 admite varias sesiones por el SDK pull. El 28 a las
   13:40 cedió y no volvió a conectar; ZKAccess sigue abierto.

La vía Access corría bien, cada 10 min, pero con 0 huellas: nadie descargó en ZKAccess.

## Cambios en el agente (ops/agente-biometrico, versión 1.3.0)

- Tipo de evento en la columna 4; las líneas descartadas raras van a la bitácora
  y al paso 7 de «Probar equipo…».
- Con el SDK pull no se cede a ZKAccess (sí con el clásico).
- Robustez: `Conectado` sin candado, perro guardián del sondeo (3 min), topes en
  conectar / latido / soltar / puesta al día, `GetRTLog` tolera 3 negativos,
  ciclo Access con tope de 20 min, timeout HTTP tratado como error, reintento a
  los 2 min tras un fallo, reintento al volver la red y al salir de suspensión,
  arranque de las dos vías en paralelo, config.json atómico con `.bak`, vigilante
  en el Programador de tareas, autoinicio reparado si apunta a otra copia,
  diagnóstico que reanuda al terminar, más rastro en la bitácora.
- Autopruebas con el formato real (196 comprobaciones, verdes).

## Marcaciones (Gestivo)

- Cada huella muestra la vía («Directa», «Directa y Access», «Access») y el PC
  cuyo agente la envió (`biometrico_envios.agente` del envío que la insertó, sin
  migración). También en los exportes.
- Las fichas de resumen muestran con huella / sin huella, y hay una ficha
  «Sin huella».

## Pendiente

- Copiar `ops/agente-biometrico/publicar/` a LCPC07 (y a los demás PCs con la vía
  equipo), cerrar el agente viejo y abrir el nuevo; reactivar «Iniciar con
  Windows» para que cree el vigilante.
- Verificar con un dedo: «Huella en vivo · Entrada · …» en la bitácora a los
  pocos segundos y la huella en Marcaciones con «Directa · LCPC07».
