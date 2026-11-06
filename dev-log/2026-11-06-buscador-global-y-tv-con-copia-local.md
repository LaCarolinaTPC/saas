# 2026-11-06 · Buscador global y TV con copia local

## Buscador global

`Ctrl+K`, botón en el menú lateral y en `TopBar`. Busca menú, pantallas internas y
registros, respetando permisos. Detalle en `docs/buscador-global.md`.

- Las pantallas salen de `NAV_TREE` y de `pantallas.generated.json`, que
  `prebuild` y `predev` regeneran recorriendo las páginas.
- Los registros se consultan en vivo con `imatch` y clases de tildes, sin
  migraciones: `munoz` da 11 conductores donde `ilike` daba 0.
- Se usa `candidates` y no `procesos_contratacion`: 0 de 4.632 procesos tienen
  `candidate_id` nulo.
- El buscador es más estricto que el menú en `/configuracion/usuarios`,
  `/configuracion/api` y `/tesoreria/recobros`, que el menú muestra a quien la
  página luego rechaza. El menú no se tocó.

## TV: menos consultas a la base

El TV consultaba `/api/display` unas 238 veces al día. Ahora son 86 (cada 15 min) o
48 (cada 30), noche incluida.

- Selector de 15 o 30 minutos en Pantalla TV (`pantalla.refresco_min` en
  `app_settings`, sin migración).
- Copia local en IndexedDB (`copia-local.ts`): presentación, datos, imágenes y
  videos. Con copia vigente, un reinicio no consulta. Una recarga manual o
  «Actualizar ahora» consultan siempre.
- Service worker `public/display-sw.js` para abrir `/display` sin red tras un
  reinicio. Solo funciona con HTTPS.
- Un fallo reintenta a los 2 minutos en vez de esperar el intervalo.
- Firmas de imágenes de 2 a 12 horas: una URL podía llegar con 20 minutos de vida,
  menos que el nuevo intervalo.
- TTL de accidentabilidad, ausentismo y marcaciones a 14 minutos.

**Error que ya existía, corregido:** al asignar otra presentación con el mismo
número de versión (dos en v1), el TV no cambiaba nunca, porque comparaba solo la
versión. Ahora compara también el contenido.

## Efectos a tener en cuenta

- Publicar, reasignar o revocar se nota en hasta 30 minutos.
- `ausentismo.pendientes` y `permisos.limpiar_metricas` también las dispara el TV:
  si nadie tiene Gestivo abierto, pueden correr hasta 30 minutos tarde.

## Pendiente

- Probar en un televisor real: IndexedDB, blobs de video y espacio disponible. El
  tope de 300 MB por archivo es provisional.
- Siguen por red: videos de YouTube, Vimeo o enlace externo, y croquis y fotos de
  accidentes, cuyas URLs vienen dentro de los datos.
