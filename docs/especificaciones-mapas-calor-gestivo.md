# Mapas de calor de Gestivo: herramientas y especificaciones

**Verificación:** 25 de septiembre de 2026, sobre el código del repositorio. Este documento describe la implementación; no es una medición de disponibilidad de los servicios externos ni una prueba visual de producción.

## Alcance

Gestivo tiene **una implementación de mapa de calor de pasajeros**, presentada en dos pantallas:

| Pantalla | Ruta | Implementación |
|---|---|---|
| Rotación → Mapa de calor | `/rotacion/mapa-calor` | [Página de Rotación](<../src/app/(dashboard)/rotacion/mapa-calor/page.tsx>) |
| Tesorería → Revisión cartulina | `/tesoreria/revision-cartulina` | [Página de Tesorería](<../src/app/(dashboard)/tesoreria/revision-cartulina/page.tsx>), que reutiliza el mismo cliente y cambia el título |

La interfaz compartida está en [MapaCalorClient.tsx](<../src/app/(dashboard)/rotacion/mapa-calor/MapaCalorClient.tsx>). El mapa se dibuja en [HeatMap.tsx](<../src/app/(dashboard)/rotacion/mapa-calor/HeatMap.tsx>).

## Herramientas utilizadas

| Capa | Herramienta | Uso verificado |
|---|---|---|
| Aplicación web | Next.js 16.2.1, React 19.2.4, TypeScript | Página de servidor que carga los datos y componente interactivo de navegador. `HeatMap` se importa con `next/dynamic` y `ssr: false` porque Leaflet usa `window`. |
| Mapa interactivo | Leaflet 1.9.4 | Vista, teselas, controles de zoom, marcadores, líneas, globos y encuadre. |
| Intensidad | `leaflet.heat` 0.2.0 | Capa de calor con pesos por celda sobre Leaflet. Los tipos que faltan en el paquete se declararon en [src/types/leaflet.heat.d.ts](../src/types/leaflet.heat.d.ts). |
| Mapa base | Teselas raster de OpenStreetMap | URL `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, con atribución a OpenStreetMap y zoom máximo 19. El código no usa Google Maps ni Mapbox para el mapa base. |
| Datos y agregación | Supabase/PostgreSQL | Tablas `puntos_virtuales`, `pv_deltas`, `viajes_recaudados` y funciones SQL consultadas mediante `@supabase/supabase-js`. |
| Direcciones de zonas sin nombre | Nominatim, OpenStreetMap | Geocodificación inversa desde el servidor; caché en `geo_direcciones`. |
| Trazado sobre calles | OSRM público | Servicio `route/v1/driving` para ajustar el rastro GPS; caché en `geo_trazados`. Si falla, se usa el rastro GPS sin ajustar. |

Las versiones anteriores son las instaladas y verificadas en `node_modules`; las dependencias declaradas están en [package.json](../package.json). Nominatim y OSRM son llamadas HTTP del código, no paquetes npm.

## Origen y preparación de los datos

1. La sincronización llama el procedimiento de GEMA `pa_ext_get_PuntosVirtualesByFecha` por día y guarda los eventos en `puntos_virtuales`. Un día sincronizado ejecuta `refrescar_pv_deltas` y actualiza el marcador `gema_sync_state`. El arranque sin marcador toma hasta siete días; después se reprocesa el día del marcador. Ver [sync.ts](../src/lib/gema/sync.ts).
2. `refrescar_pv_deltas` obtiene subidas y bajadas como la diferencia positiva entre lecturas consecutivas de cada despacho. Descarta contadores fuera de 0–2000, cambios mayores a 60 pasajeros por evento, coordenadas ausentes o `(0, 0)` y horas fuera de 0–23. Incluye viajes sin recaudo mediante `LEFT JOIN` con `viajes_recaudados`. Guarda solo eventos con movimiento en `pv_deltas`, con latitud y longitud redondeadas a cuatro decimales (aproximadamente 11 m en latitud). Ver [070_viajes_vehiculo.sql](../supabase/migrations/070_viajes_vehiculo.sql) y [063_mapa_calor_despacho.sql](../supabase/migrations/063_mapa_calor_despacho.sql).
3. La función `get_mapa_calor` agrupa `pv_deltas` por coordenada y devuelve un JSON compacto: `celdas = [lat, lng, suben, bajan, punto_virtual, velocidad_promedio]`, distribución por hora y los diez grupos de ubicaciones con más movimiento. El SQL admite filtros por fechas, ruta, horas, código de punto virtual, código de vehículo y número de despacho. Ver [063_mapa_calor_despacho.sql](../supabase/migrations/063_mapa_calor_despacho.sql).
4. La [carga de datos del mapa](../src/lib/rotacion/data/mapa-calor.ts) consulta también rutas, puntos virtuales, alarmas, vehículos y timbradas. El rango inicial son los **últimos siete días con telemetría sincronizada**, o hasta hoy si no hay marcador. El despacho solo se acepta cuando se eligió un vehículo y un único día. Las consultas principales se hacen en paralelo.

La autenticación y los permisos de las rutas dependen del marco general de Gestivo. La página carga los datos desde el servidor con la clave `SUPABASE_SERVICE_ROLE_KEY`; esa clave no se envía como parte de las propiedades del mapa al navegador.

## Cálculo y configuración visual

| Parámetro | Valor implementado |
|---|---|
| Medida seleccionable | **Suben**, **Bajan** o **Ambos** (`suben + bajan`); arranca en Suben. |
| Peso de una celda | `min(1, valor_celda / max(1, P95))`, donde `P95` se toma de los valores positivos ordenados en el navegador. Así, un pico aislado no reduce visualmente todas las demás zonas. |
| Punto enviado a `leaflet.heat` | `[latitud, longitud, peso]`, con `peso` entre 0 y 1. |
| `radius` / `blur` | 14 / 18 píxeles. |
| `maxZoom` / `max` / `minOpacity` | 17 / 1 / 0,25. |
| Gradiente | 0,2 `#93c5fd` (azul); 0,45 `#fbbf24` (amarillo); 0,7 `#f97316` (naranja); 1 `#dc2626` (rojo). |
| Vista sin puntos | Centro `[10.94, -74.8]` (Barranquilla/Soledad), zoom 12. |
| Encuadre con puntos | `fitBounds` con margen de 24 píxeles y zoom máximo 15 al cambiar fechas/ruta/punto/vehículo/despacho. |
| Tamaño del mapa | Alto 540 px; 620 px en pantallas grandes. |
| Globo al hacer clic | Suma subidas y bajadas de las celdas dentro de unos 24 píxeles del clic, según el zoom. Muestra nombre de zona y velocidad si existen. La velocidad del globo se pondera por pasajeros movidos; la velocidad de cada celda procede de un promedio SQL de eventos válidos. |

Estos valores están definidos en [HeatMap.tsx](<../src/app/(dashboard)/rotacion/mapa-calor/HeatMap.tsx>) y la normalización P95 en [MapaCalorClient.tsx](<../src/app/(dashboard)/rotacion/mapa-calor/MapaCalorClient.tsx>).

## Filtros y capas adicionales

- Filtros de la pantalla: rango de fechas, ruta, punto virtual (`cod_pv`), vehículo, viaje o despacho, y hora inicial/final. Las opciones de día/semana y la gráfica horaria actualizan la URL mediante el router de Next.js sin llevar el scroll al inicio.
- **Puntos virtuales:** marcadores circulares que pueden ocultarse. El punto activo se resalta; con una ruta seleccionada se muestran las geocercas a unos 150 m del trazado. Un clic abre el globo de la zona; la lista de puntos destacados aplica el filtro.
- **Trazado:** polilínea índigo `#4f46e5`, grosor 3 y opacidad 0,7. `get_trazado_ruta` usa el GPS del despacho elegido o un viaje representativo reciente de la ruta. OSRM toma una muestra de alrededor de 25 coordenadas y devuelve la geometría vial. Ver [066_trazado_ruta.sql](../supabase/migrations/066_trazado_ruta.sql) y [mapa-calor.ts](../src/lib/rotacion/data/mapa-calor.ts).
- **Alarmas:** círculos para bloqueo (rojo `#dc2626`), puerta (ámbar `#d97706`) y falla (violeta `#7c3aed`). La consulta devuelve como máximo 500 eventos recientes; solo se dibujan los que tienen coordenadas. Ver [068_alarmas_por_viaje.sql](../supabase/migrations/068_alarmas_por_viaje.sql).
- **Revisión de timbradas:** muestra la cifra neta liquidada por GEMA y, si hay reinicios de la registradora dentro de un viaje, una alerta con la reconstrucción del contador para verificación manual. La reconstrucción no reemplaza automáticamente la cifra oficial.

## Servicios externos, caché y límites

- **OpenStreetMap:** el navegador solicita teselas directamente al servidor de teselas configurado; el mapa base necesita conexión a ese servicio.
- **Nominatim:** el servidor consulta `/reverse` con `format=jsonv2`, `zoom=17`, idioma español, `User-Agent: gestivo-mapa-calor/1.0` y tiempo límite de 4 segundos. Consulta primero `geo_direcciones` con coordenadas a tres decimales (celdas de aproximadamente 110 m); si no obtiene dirección, se muestran las coordenadas como último recurso. Las zonas destacadas se procesan secuencialmente. Ver [mapa-calor.ts](../src/lib/rotacion/data/mapa-calor.ts) y [056_mapa_calor_geocodificacion.sql](../supabase/migrations/056_mapa_calor_geocodificacion.sql).
- **OSRM:** el servidor consulta `router.project-osrm.org` con tiempo límite de 6 segundos. Busca primero `geo_trazados` por despacho; si OSRM falla, conserva el rastro GPS original. Ver [mapa-calor.ts](../src/lib/rotacion/data/mapa-calor.ts) y [067_geo_trazados.sql](../supabase/migrations/067_geo_trazados.sql).
- **Volumen:** `pv_deltas` evita recalcular los deltas desde todos los eventos en cada carga. La función de calor devuelve un solo JSON compacto; el SQL limita el top de ubicaciones a 10 y la interfaz presenta 8. La capa de alarmas limita la lista a 500.

**Alcance de la verificación:** se contrastaron componentes, consultas, sincronización, migraciones y versiones instaladas. No se consultó la base de datos de producción ni se midieron tiempos o disponibilidad actuales.
