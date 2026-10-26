# 2026-10-26 · Pantalla informativa (TV)

Pedido: un televisor en la empresa que muestre la accidentabilidad y otra
información, configurable por **Recursos Humanos** con diapositivas tipo
PowerPoint/Canva: textos con fuentes, imágenes ya subidas, videos, color de
fondo, efectos. El TV no debe pedir usuario cada vez.

## Qué se puso

- **Recursos Humanos › Pantalla TV** (`/pantalla`, módulo nuevo `pantalla`):
  pestañas *Presentaciones*, *Televisores* e *Imágenes y videos*.
- **Editor** (`/pantalla/[id]`): miniaturas que se reordenan arrastrando, lienzo
  1920×1080 con mover / redimensionar / rotar y guías, panel de propiedades,
  deshacer y rehacer, autoguardado. Elementos: texto (8 fuentes), imagen,
  video, forma y «dato en vivo». Fondo de color, degradado o imagen. Transición
  por diapositiva y animación de entrada por elemento.
- **Datos en vivo**: accidentes del mes, accidentes por mes, días sin
  accidentes, ausentismo del año (cifras y barras), operación de hoy,
  cumpleaños y aniversarios del mes, reloj.
- **Vista previa** a pantalla completa con datos reales
  (`/pantalla/[id]/vista-previa`).
- **TV** en `/display`, público.

## Decisiones

1. **Vinculación por código, no por clave tecleada.** El TV muestra un código
   de 6 dígitos y alguien con el módulo lo teclea en Gestivo; el TV recoge su
   clave larga solo. Con un control remoto nadie teclea una clave de 36
   caracteres. La clave se **genera en el momento en que el TV la recoge**, con
   un `UPDATE … WHERE key_hash IS NULL` que garantiza una sola entrega: nunca
   queda en claro en la base. El código solo no da acceso a nada (10 minutos,
   y lo usa alguien con sesión).
2. **Revocar devuelve el TV a la pantalla del código.** Se pidió poder revocar
   cualquier TV y que, si fue un error, se pueda vincular de nuevo: el TV
   recibe 401 en su siguiente consulta, borra la clave y pide otro código.
3. **Tabla propia y no `api_keys`.** Esas claves dan acceso a datos por rol en
   la Data API y el MCP; esta solo identifica un televisor y su presentación.
   Se reutiliza `hashApiKey`.
4. **Borrador y publicada.** Se edita el borrador; los TV solo cambian al
   publicar, y lo aplican al terminar la diapositiva que estén mostrando, no a
   mitad.
5. **Sondeo cada minuto, no realtime.** No hay realtime en el proyecto. Los
   datos se calculan solo para los widgets presentes y con caché de 5 a 60
   minutos por familia: varios TV no multiplican las lecturas.
6. **Marcaciones sin efectos secundarios.** `getDatosMarcaciones` crea y limpia
   pendientes automáticos; un TV no debe disparar eso. Se añadió
   `getConteosMarcaciones` (solo lectura, solo cifras). El widget muestra
   programados, salieron, por salir y con novedad; **no** «sin despacho», que
   en un pasillo se leería como faltas.
7. **Privacidad.** Cumpleaños sin año ni edad; nombre corto (nombre y primer
   apellido). Las fotos de accidentes se pueden elegir, con aviso de que son
   siniestros reales.
8. **Subida directa a Storage.** Vercel corta el cuerpo en 4,5 MB, así que un
   video no puede pasar por una ruta de la app. El servidor firma la subida
   (`createSignedUploadUrl`), el navegador sube, y al registrar se toman el
   tamaño y el tipo **reales** de Storage. Imágenes y videos usan el mismo
   camino. La compresión de imágenes salió de `FotosAccidente.tsx` a
   `src/lib/imagenes/comprimir.ts`, con el mismo resultado para accidentes.
9. **Video.** El navegador mide duración y dimensiones y guarda el primer
   fotograma como póster: es lo que pinta el editor y lo que queda en el TV si
   no puede reproducir el códec. Una diapositiva puede avanzar «al terminar el
   video», con temporizador de seguridad por si `ended` no llega. Sin un clic en
   el TV, Chrome solo reproduce en silencio: aparece «Activar sonido».
10. **URLs firmadas estables.** Se cachean en memoria (imágenes 2 h, videos
    12 h) para que el TV no vuelva a descargar todo en cada consulta.
11. **Un solo renderizador** (`LienzoDiapositiva`) para editor, miniaturas,
    vista previa y TV: lo que se edita es lo que sale.

## Ajustes del mismo día (revisión visual)

Los widgets se revisaron en capturas reales (Chrome sin interfaz) con datos
normales, cifras de cinco dígitos, nombres largos, 22 personas, listas vacías y
sin datos.

- **Medidas exactas.** El marco del widget calcula el área útil y se la pasa al
  contenido; cada texto grande se ajusta al ancho *y* al alto. Antes la cifra
  dependía solo del alto y «1.320» se salía de la ficha.
- **Fichas**: se prueba una fila de cuatro y dos de dos y queda la que deja la
  cifra más grande. Variaciones por encima de 999 % se muestran «+999%».
- **Títulos con icono** (cumpleaños, aniversarios): el icono va en la fila del
  título y su ancho se descuenta; antes se montaba sobre las últimas letras.
- **Gráficas**: relleno en el eje X para que el último mes no se corte y el
  primer valor no choque con el eje Y.
- **Reloj**: «Lunes, 26 de octubre» (antes «De Octubre»).
- **Cumpleaños y aniversarios: solo de hoy al fin de mes.** Los que ya pasaron
  no se muestran.
- **Colores**: paleta completa (12 tonos × 7 intensidades, grises), colores
  usados recientes y el selector del sistema para cualquier tono.
- **Marco** con grosor y color para imágenes y videos. Va por dentro de la
  caja, así que no mueve el elemento.
- **Borrar imágenes y videos**: botón siempre visible en cada archivo (antes
  solo al pasar el mouse) y confirmación dentro de la app, también desde el
  selector del editor. No deja borrar lo que esté en uso, ni siquiera si el
  cambio todavía no se ha guardado.

### Formas, emoticonos y fondo para todas

- **33 formas** en cuatro grupos (básicas, polígonos y estrellas, flechas,
  símbolos), en `src/lib/pantalla/formas.ts`. Son trazados SVG en 100×100 que
  se estiran con la caja; el borde usa `vector-effect: non-scaling-stroke`
  para medir lo mismo aunque la figura se alargue.
- **Emoticonos** como elemento propio (`tipo: "emoji"`): ~200 en ocho
  categorías pensadas para RRHH (celebración, seguridad vial, salud,
  trabajo…), y se puede pegar cualquier otro. Se pintan con **Noto Color
  Emoji servida por la app** (`next/font/google`): el TV puede ser Windows,
  Android o Linux y los vería distintos —o como cuadros vacíos— con los del
  sistema. El navegador solo baja los rangos que se usan.
- **«Aplicar este fondo a todas»** en el panel de la diapositiva: un solo paso
  de historial, así Ctrl+Z lo deshace entero.

### Animaciones y ajustes del panel

- **Dos tipos de animación por elemento.** «Al aparecer» (una vez): aparecer,
  subir, bajar, entrar por la izquierda o la derecha, zoom, rebote, girar,
  enfocar y voltear. «Mientras está en pantalla» (se repite): **pulsar**,
  latido, flotar, balancear, sacudir, girar sin parar, parpadear y brillar,
  con velocidad lenta, normal o rápida. El efecto va en una capa propia y
  arranca cuando termina la entrada, así las dos no se pisan.
- **Probar animación**: el elemento la reproduce unos segundos en el lienzo
  del editor, sin abrir la vista previa. Las presentaciones guardadas antes
  quedan «sin efecto».
- **Botón «Aplicar este fondo a todas»**: se cortaba el texto. Ahora puede
  partirse en dos líneas; se probó a 220 px de ancho y con barra de
  desplazamiento. En esa prueba también se arreglaron el selector Color /
  Degradado / Imagen, que se salía del panel, y «Más colores», que se partía.

### Videos desde enlace (YouTube, Vimeo, MP4)

- Pestaña **«Desde enlace»** en el selector de video. Reconoce YouTube (watch,
  youtu.be, shorts, embed, live), Vimeo (también no listados con su clave) y
  archivos MP4/WebM por https. TikTok, Instagram, Facebook y Drive se rechazan
  con explicación: no dejan reproducir solo en un TV.
- Se guarda solo la **referencia** (proveedor + id), nunca el enlace pegado: el
  TV arma direcciones de reproductores conocidos y no se puede colar otra página
  (`enlaces-video.ts`, con pruebas).
- **Se revisa antes de insertar**, con la API de cada sitio: título, duración y
  si el dueño permite insertarlo (YouTube errores 101/150; Vimeo 403/404). Así
  un video bloqueado o borrado se descubre en el editor y no en el TV.
- En el TV se usan las APIs oficiales (se cargan solo si hay un video de esos):
  saber cuándo termina para avanzar, detectar fallos (queda la miniatura y se
  pasa a la siguiente) y activar el sonido. YouTube va por
  `youtube-nocookie.com`. El margen de seguridad para avanzar es de 45 s porque
  un anuncio previo retrasa el final.
- Un MP4 desde enlace usa el mismo reproductor que los videos propios.
- «Cambiar video» cambia entre archivo y enlace conservando posición, tamaño,
  animaciones, marco y sonido.
- Probado en Chrome sin interfaz, con internet real: YouTube («Big Buck
  Bunny», 635 s), Vimeo (597 s) y un MP4 público se revisan y se reproducen
  dentro de la diapositiva; un Vimeo borrado se rechaza. Vimeo bloquea Chrome
  si se identifica como «HeadlessChrome»: para la prueba se usó el
  identificador normal (un TV con Chrome no tiene ese problema).
- Límites que no controla Gestivo y que el editor avisa: anuncios de YouTube si
  el video está monetizado; el TV descarga el video cada vez que lo muestra.

### Widgets para los conductores

Seis datos nuevos, pensados para un TV en un pasillo: colectivos, positivos o
útiles; nunca nombres de infractores.

- **Factor de riesgo del mes**: la causa más frecuente de la Política de
  Correctivos (celular, velocidad, distancia, fatiga) con un consejo. Si el mes
  no tiene accidentes con factor, usa los últimos tres meses; si tampoco, felicita.
- **Velocidad de la flota**: excesos de la semana contra la anterior y el % de
  conductores activos sin excesos. Solo totales. El GPS llega con un día de
  atraso: un lunes la semana en curso no tiene datos y «0 excesos» sería falso,
  así que se muestra la última semana con datos y se dice cuál
  (`baseVelocidad`, con prueba). Detectado al probar con la base real.
- **Huella de hoy**: de los conductores que **ya salieron a rodar**, cuántos
  pasaron la huella y cuántos no, con «¡recuerde marcar al llegar!». La base es
  quien rodó y no todos los programados, que incluyen descansos y novedades.
- **Vacantes y Plan Padrino**: cargos abiertos y lo máximo que gana un padrino
  según la política vigente, más los referidos del mes.
- **Bienvenida a nuevos**: ingresos del mes hasta hoy (conductores y empleados).
- **Código QR**: «Reportar un daño del bus» (la ruta pública que ya existe) o
  cualquier dirección https, con su texto. Las rutas de la app se completan con
  la dirección del TV. Se generan con la librería `qrcode` (nueva dependencia,
  MIT, sin vulnerabilidades conocidas) y se dibujan en SVG.

Probado contra la base real (26/10): factor «No guardar la distancia» (9 de 40
accidentes del mes); velocidad 3.035 excesos la semana del 19 al 25/10 (+8 %),
147 de 171 conductores con alguno; huella 71 de 123 que rodaron; 1 vacante y
Plan Padrino hasta $700.000 con 4 referidos; 15 ingresos del mes. Primera carga
completa: 4,5 s; luego, caché.

### Cambiar el orden de las diapositivas

Arrastrar ya estaba, pero casi no funcionaba: `@hello-pangea/dnd` no deja
empezar un arrastre sobre un `<button>`, y la miniatura era un botón; solo se
podía arrastrar desde el titulito de arriba. Ahora la miniatura es un `div` con
`role="button"` (se arrastra desde la imagen), hay un asa ⋮⋮ visible y botones
«Subir» / «Bajar», que en la diapositiva actual se ven siempre. Probado con
eventos reales de mouse en Chrome: «Bajar» pasa A B C D a B A C D, y arrastrar
la miniatura de D hasta arriba deja D B A C. Se deshace con Ctrl+Z.

### Íconos de transporte

Elemento nuevo `icono`: 90 íconos vectoriales de lucide-react (ya instalada) en
seis grupos —transporte público, rutas y paradas, vehículos, seguridad vial,
taller y energía, avisos— con buscador sin tildes por nombre o palabras clave
(«paradero» encuentra Parada). A diferencia de los emoticonos son de un solo
color: se pintan del color que se elija, con grosor de trazo y fondo opcional
(círculo o cuadrado) para que parezcan señalética. Por defecto, blanco sobre
círculo azul. El catálogo (`iconos.ts`) es puro y probado; la tabla clave →
componente (`components/pantalla/iconos-lucide.tsx`) obliga, por tipos, a que
cada clave tenga su dibujo. «Pare» usa un octágono: el círculo con cuadrado se
confundía con el botón de un reproductor.

## Para ponerlo en marcha

1. Aplicar `supabase/migrations/20261026140836_pantalla_informativa_presentaciones_dispositivos_medios_y_vinculaciones.sql`
   en el SQL Editor. Solo el admin recibe el módulo: a RRHH se le concede en
   Configuración › Usuarios.
2. Para videos de más de 50 MB: subir `FILE_SIZE_LIMIT` del contenedor
   storage-api y el tamaño máximo de cuerpo del proxy (Kong/nginx) a 150 MB.
3. En el TV: abrir `https://<dominio>/display` y teclear el código en Gestivo.
   Mejor un mini-PC o Android TV con Chrome en modo kiosco; para que suene sin
   clic: `--autoplay-policy=no-user-gesture-required`.

## Fuera de esta versión

YouTube/Vimeo, programación por horario, varias presentaciones en rotación por
TV, convertir videos HEVC/MOV en el servidor, selección múltiple, plantillas e
historial de versiones publicadas.

## Archivos

```
nuevos:  supabase/migrations/20261026140836_…sql
         src/lib/pantalla/  modelo · fuentes-catalogo · fuentes · editor-reglas · datos-reglas · datos
                            medios-reglas · subida-cliente · vinculacion-reglas · dispositivos
                            consultas · actions · acceso · tipos-display   (+ 5 archivos de prueba, 41 pruebas)
         src/lib/imagenes/comprimir.ts
         src/components/pantalla/  LienzoDiapositiva · Reproductor · widgets · BibliotecaMedios · editor/*
         src/app/(dashboard)/pantalla/ · src/app/(print)/pantalla/[id]/vista-previa/
         src/app/(publico)/display/ · src/app/api/display/ (+ vincular/iniciar, vincular/estado)
modificados: permissions-shared.ts · constants.ts · proxy.ts · biometrico/data.ts
             FotosAccidente.tsx · globals.css · package.json (test:pantalla)
```

## Textos que se ajustan a su caja (sin «…»)

Problema: en el TV varios textos se cortaban en una sola línea con «…»
(títulos de vacantes, recuadro de Plan Padrino, leyendas de las fichas,
nombres, consejo del factor de riesgo, texto del QR).

- Nuevo `src/components/pantalla/Ajustado.tsx`: mide el texto real en el
  navegador (búsqueda binaria del tamaño de letra entre `max` y `min`) hasta
  que cabe en ancho y alto; vuelve a medir al cargar las fuentes. Con
  `unaLinea` no parte (cifras, montos); si no, parte en varias líneas.
  `soloLoNecesario` hace que la caja mida lo que el texto, para que el ícono
  de un título quede pegado a él.
- `widgets.tsx`: se quitaron todos los `text-overflow: ellipsis` y
  line-clamps; títulos, fichas, listas, QR, factor, huella, vacantes + Plan
  Padrino, días sin accidentes y reloj usan `Ajustado`. Vacantes muestra
  «y N más» cuando hay más de las que caben. El emoji del factor va en una
  caja de ancho fijo (`EmojiFijo`) para no empujar el título.
- Verificado con una página temporal (ya borrada) con textos largos y tamaños
  chicos: 61 de 61 textos caben, ninguno recortado ni con «…».

## Felicitaciones a pantalla completa y estilo de los widgets

- Widgets nuevos `cumple_hoy` y `aniv_hoy` (1920×1080, nacen ocupando todo
  el lienzo). A la izquierda, en grande, quienes celebran hoy con un mensaje
  al azar; a la derecha, los próximos del mes. Si hoy nadie celebra, el
  protagonista es el próximo del mes. En aniversario, una persona lleva
  «¡N años con nosotros!» en su línea; varias, «Nombre (N años)».
- Mensajes en `src/lib/pantalla/mensajes-cumpleanos.ts` (12 de cumpleaños,
  10 de aniversario), escritos para servir a una o varias personas y sin
  género. `elegirMensaje` nunca repite el anterior; el azar se resuelve en el
  navegador (useLayoutEffect) para no chocar con el render del servidor.
  Cambia cada vez que la diapositiva vuelve a salir.
- Confeti con CSS (`@keyframes pantalla-confeti`), posiciones fijas.
- Estilo propio en TODOS los widgets (`EstiloWidget`, opcional): fuente,
  color de título, de texto, de acento, destacado, de fondo y opacidad del
  fondo. Lo que falta sale del tema, así lo guardado antes se ve igual.
  `widgets.tsx` lo reparte con un contexto (`usePaleta`); al cambiar la
  fuente el contenido se vuelve a montar para que `Ajustado` mida otra vez.
  En el editor: sección «Estilo del dato en vivo», con «Volver al color del
  tema» por color y «Quitar todo el estilo».
- Verificado con página temporal (ya borrada): 63 de 63 textos caben.
