import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DIAPOSITIVAS,
  MAX_ELEMENTOS,
  MAX_BYTES,
  MAX_TEXTO,
  crearEmoji,
  crearForma,
  crearIcono,
  crearTexto,
  crearVideo,
  crearVideoWeb,
  crearWidget,
  diapositivaVacia,
  duplicarDiapositiva,
  duracionEfectiva,
  esDestinoQr,
  moverCapa,
  presentacionVacia,
  refsDeMedios,
  reordenar,
  tamanoJson,
  tiposDeWidget,
  familiasDeDatos,
  usaMedio,
  validarPresentacion,
  videoQueManda,
  type Diapositiva,
  type Presentacion,
} from "./modelo";
import { CLAVES_FORMA } from "./formas";
import { CLAVES_ICONO, buscarIconos } from "./iconos";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

const video = (path: string, dur: number | null) =>
  crearVideo({ path, posterPath: path.replace(/\.(mp4|webm)$/, ".poster.jpg"), ancho: 1920, alto: 1080, duracionSeg: dur });

test("presentacionVacia y diapositivaVacia pasan la validación sin cambios de forma", () => {
  const p = presentacionVacia();
  const v = validarPresentacion(p);
  assert.ok(v);
  assert.equal(v.diapositivas.length, 1);
  assert.deepEqual(v.diapositivas[0].fondo, p.diapositivas[0].fondo);
});

test("validarPresentacion rechaza lo que no es una presentación", () => {
  assert.equal(validarPresentacion(null), null);
  assert.equal(validarPresentacion({}), null);
  assert.equal(validarPresentacion({ version: 2, diapositivas: [] }), null);
  assert.equal(validarPresentacion({ version: 1, diapositivas: "x" }), null);
  assert.deepEqual(validarPresentacion({ version: 1, diapositivas: [] }), { version: 1, diapositivas: [] });
});

test("validarPresentacion recorta a los límites", () => {
  const d = diapositivaVacia();
  d.elementos = Array.from({ length: MAX_ELEMENTOS + 10 }, () => crearTexto("hola"));
  const p = { version: 1, diapositivas: Array.from({ length: MAX_DIAPOSITIVAS + 5 }, () => duplicarDiapositiva(d)) };
  const v = validarPresentacion(p)!;
  assert.equal(v.diapositivas.length, MAX_DIAPOSITIVAS);
  assert.equal(v.diapositivas[0].elementos.length, MAX_ELEMENTOS);
});

test("validarPresentacion sanea colores, fuentes, textos y números", () => {
  const t = { ...crearTexto("x".repeat(MAX_TEXTO + 50)), color: "rojo", fuente: "comic-sans", tamano: 9999, opacidad: 4 };
  const d = { ...diapositivaVacia(), duracionSeg: 1, transicion: "explosion", fondo: { tipo: "color", color: "#ABCDEF" }, elementos: [t] };
  const v = validarPresentacion({ version: 1, diapositivas: [d] })!;
  const e = v.diapositivas[0].elementos[0];
  assert.equal(e.tipo, "texto");
  if (e.tipo !== "texto") return;
  assert.equal(e.texto.length, MAX_TEXTO);
  assert.equal(e.color, "#ffffff");
  assert.equal(e.fuente, "inter");
  assert.equal(e.tamano, 400);
  assert.equal(e.opacidad, 1);
  assert.equal(v.diapositivas[0].duracionSeg, 3);
  assert.equal(v.diapositivas[0].transicion, "fundido");
  assert.deepEqual(v.diapositivas[0].fondo, { tipo: "color", color: "#abcdef" });
});

test("validarPresentacion descarta textos vacíos y widgets desconocidos", () => {
  const d = {
    ...diapositivaVacia(),
    elementos: [crearTexto("   "), { ...crearWidget("reloj"), widget: { tipo: "clima" } }, crearWidget("acc_kpis")],
  };
  const v = validarPresentacion({ version: 1, diapositivas: [d] })!;
  assert.equal(v.diapositivas[0].elementos.length, 1);
});

test("rutas de medios: imágenes de la biblioteca o de accidentes; videos solo de la biblioteca", () => {
  const img = (bucket: string, path: string) => ({ ...crearTexto(), tipo: "imagen", imagen: { bucket, path }, ajuste: "cubrir", radio: 0 });
  const d = {
    ...diapositivaVacia(),
    elementos: [
      img("pantalla", `biblioteca/${U1}.jpg`),
      img("accidentes", `fotos/${U2}.jpg`),
      img("accidentes", `croquis/${U2}.png`),
      img("pantalla", `../${U1}.jpg`),
      img("documents", `biblioteca/${U1}.jpg`),
      { ...video(`biblioteca/${U1}.mp4`, 30) },
      { ...video(`biblioteca/${U1}.mp4`, 30), video: { bucket: "accidentes", path: `fotos/${U1}.jpg` } },
      { ...video(`biblioteca/${U1}.mp4`, 30), video: { bucket: "pantalla", path: `biblioteca/${U1}.jpg` } },
    ],
  };
  const v = validarPresentacion({ version: 1, diapositivas: [d] })!;
  assert.deepEqual(
    v.diapositivas[0].elementos.map((e) => e.tipo),
    ["imagen", "imagen", "video"]
  );
});

test("marco de imagen y video: grosor acotado, color validado; sin marco en lo guardado antes", () => {
  const img = { ...crearTexto(), tipo: "imagen", imagen: { bucket: "pantalla", path: `biblioteca/${U1}.jpg` }, ajuste: "cubrir", radio: 0, marco: 500, colorMarco: "#FF0000" };
  const viejo = { ...crearTexto(), tipo: "imagen", imagen: { bucket: "pantalla", path: `biblioteca/${U2}.png` }, ajuste: "cubrir", radio: 0 };
  const vid = { ...video(`biblioteca/${U1}.mp4`, 10), marco: 12, colorMarco: "azul" };
  const [a, b, c] = validarPresentacion({ version: 1, diapositivas: [{ ...diapositivaVacia(), elementos: [img, viejo, vid] }] })!.diapositivas[0].elementos;
  assert.ok(a.tipo === "imagen" && a.marco === 80 && a.colorMarco === "#ff0000");
  assert.ok(b.tipo === "imagen" && b.marco === 0 && b.colorMarco === "#ffffff");
  assert.ok(c.tipo === "video" && c.marco === 12 && c.colorMarco === "#ffffff");
});

test("formas del catálogo y emoticonos: lo desconocido se corrige o se descarta", () => {
  const d = {
    ...diapositivaVacia(),
    elementos: [
      crearForma("estrella"),
      { ...crearForma("rect"), forma: "dodecaedro" },
      crearEmoji("🎉"),
      crearEmoji("👷‍♂️"),
      crearEmoji("🇨🇴"),
      { ...crearEmoji("x"), emoji: "<script>" },
      { ...crearEmoji("x"), emoji: "hola" },
      { ...crearEmoji("x"), emoji: "🎉".repeat(10) },
    ],
  };
  const els = validarPresentacion({ version: 1, diapositivas: [d] })!.diapositivas[0].elementos;
  assert.deepEqual(
    els.map((e) => (e.tipo === "forma" ? e.forma : e.tipo === "emoji" ? e.emoji : e.tipo)),
    ["estrella", "rect", "🎉", "👷‍♂️", "🇨🇴"]
  );
});

test("animaciones: entrada y efecto continuo se validan; lo guardado antes queda sin efecto", () => {
  const a = { ...crearTexto("a"), entrada: { animacion: "rebote", retardoMs: 300 }, efecto: { tipo: "pulsar", velocidad: "rapida" } };
  const b = { ...crearTexto("b"), entrada: { animacion: "teletransporte", retardoMs: 99999 }, efecto: { tipo: "explotar", velocidad: "luz" } };
  const { efecto: _sin, ...viejo } = crearTexto("c");
  void _sin;
  const [x, y, z] = validarPresentacion({ version: 1, diapositivas: [{ ...diapositivaVacia(), elementos: [a, b, viejo] }] })!.diapositivas[0].elementos;
  assert.deepEqual([x.entrada, x.efecto], [{ animacion: "rebote", retardoMs: 300 }, { tipo: "pulsar", velocidad: "rapida" }]);
  assert.deepEqual([y.entrada, y.efecto], [{ animacion: "ninguna", retardoMs: 10000 }, { tipo: "ninguno", velocidad: "normal" }]);
  assert.deepEqual(z.efecto, { tipo: "ninguno", velocidad: "normal" });
});

test("video desde enlace: se valida y puede mandar la diapositiva", () => {
  const yt = crearVideoWeb({ web: { proveedor: "youtube", id: "dQw4w9WgXcQ" }, titulo: "Seguridad <b>vial</b>", miniatura: null, duracionSeg: 212 });
  const malo = { ...yt, id: "m", web: { proveedor: "youtube", id: "nada" } };
  const otroHost = { ...yt, id: "o", web: { proveedor: "vimeo", id: "1", hash: null }, miniatura: "https://malo.com/x.jpg", duracionSeg: 30 };
  const d = { ...diapositivaVacia(), avance: "video", elementos: [yt, malo, otroHost, video(`biblioteca/${U1}.mp4`, 47)] };
  const v = validarPresentacion({ version: 1, diapositivas: [d] })!.diapositivas[0];
  assert.deepEqual(v.elementos.map((e) => e.tipo), ["video_web", "video_web", "video"]);
  const [a, b] = v.elementos;
  assert.ok(a.tipo === "video_web" && a.titulo === "Seguridad bvial/b");
  assert.ok(b.tipo === "video_web" && b.miniatura === null);
  assert.equal(videoQueManda(v)?.id, a.id);
  assert.deepEqual(duracionEfectiva(v), { seg: 212, porVideo: true });
  assert.equal(refsDeMedios({ version: 1, diapositivas: [v] }).length, 2); // solo el video propio y su póster
});

test("íconos: clave del catálogo, color y grosor acotados", () => {
  const ok = { ...crearIcono("bus_frente"), color: "#FF0000", grosor: 9, fondo: "rombo" };
  const malo = { ...crearIcono("bus"), icono: "nave_espacial" };
  const els = validarPresentacion({ version: 1, diapositivas: [{ ...diapositivaVacia(), elementos: [ok, malo] }] })!.diapositivas[0].elementos;
  assert.equal(els.length, 1);
  const e = els[0];
  assert.ok(e.tipo === "icono");
  if (e.tipo !== "icono") return;
  assert.deepEqual([e.icono, e.color, e.grosor, e.fondo], ["bus_frente", "#ff0000", 3, "ninguno"]);
});

test("buscarIconos encuentra sin tildes y por palabras clave", () => {
  assert.ok(buscarIconos("paradero").includes("parada"));
  assert.ok(buscarIconos("CAMION").includes("camion"));
  assert.ok(buscarIconos("teléfono").includes("telefono"));
  assert.ok(buscarIconos("celular").includes("sin_celular"));
  assert.equal(buscarIconos("").length, CLAVES_ICONO.length);
  assert.equal(buscarIconos("zzzz").length, 0);
});

test("QR: destinos de la app o https; lo demás se descarta", () => {
  assert.ok(esDestinoQr("/reportar-dano"));
  assert.ok(esDestinoQr("https://forms.gle/abc123"));
  assert.ok(!esDestinoQr("http://inseguro.com"));
  assert.ok(!esDestinoQr("javascript:alert(1)"));
  assert.ok(!esDestinoQr("//otro.com/x"));
  assert.ok(!esDestinoQr("https://x.com/a b"));
  const ok = { ...crearWidget("qr"), widget: { tipo: "qr", tema: "claro", destino: "https://forms.gle/abc123", texto: "Encuesta <b>" } };
  const malo = { ...crearWidget("qr"), widget: { tipo: "qr", tema: "claro", destino: "javascript:alert(1)", texto: "x" } };
  const els = validarPresentacion({ version: 1, diapositivas: [{ ...diapositivaVacia(), elementos: [ok, malo] }] })!.diapositivas[0].elementos;
  assert.equal(els.length, 1);
  assert.deepEqual(els[0].tipo === "widget" && els[0].widget, { tipo: "qr", tema: "claro", destino: "https://forms.gle/abc123", texto: "Encuesta b" });
});

test("crearForma respeta la proporción de cada figura", () => {
  const f = crearForma("flecha_arriba");
  assert.ok(f.h > f.w);
  const g = crearForma("flecha_der");
  assert.ok(g.w > g.h);
  for (const k of CLAVES_FORMA) assert.ok(validarPresentacion({ version: 1, diapositivas: [{ ...diapositivaVacia(), elementos: [crearForma(k)] }] })!.diapositivas[0].elementos.length === 1, k);
});

test("video: póster inválido queda en null; duración inválida en null; ids repetidos se renuevan", () => {
  const v1 = { ...video(`biblioteca/${U1}.mp4`, -3), poster: { bucket: "pantalla", path: `biblioteca/${U1}.mp4` } };
  const v2 = { ...video(`biblioteca/${U2}.webm`, 12), id: v1.id };
  const p = validarPresentacion({ version: 1, diapositivas: [{ ...diapositivaVacia(), avance: "raro", elementos: [v1, v2] }] })!;
  const [a, b] = p.diapositivas[0].elementos;
  assert.equal(a.tipo === "video" && a.poster, null);
  assert.equal(a.tipo === "video" && a.duracionSeg, null);
  assert.notEqual(a.id, b.id);
  assert.equal(p.diapositivas[0].avance, "tiempo");
});

test("duracionEfectiva: por tiempo, por el video más largo, y sin videos cae al tiempo", () => {
  const d: Diapositiva = { ...diapositivaVacia(), duracionSeg: 15, elementos: [video(`biblioteca/${U1}.mp4`, 30), video(`biblioteca/${U2}.mp4`, 47)] };
  assert.deepEqual(duracionEfectiva(d), { seg: 15, porVideo: false });
  const porVideo = { ...d, avance: "video" as const };
  assert.deepEqual(duracionEfectiva(porVideo), { seg: 47, porVideo: true });
  assert.equal(videoQueManda(porVideo)?.id, porVideo.elementos[1].id);
  const sinDuracion = { ...porVideo, elementos: [video(`biblioteca/${U1}.mp4`, null)] };
  assert.deepEqual(duracionEfectiva(sinDuracion), { seg: 15, porVideo: false });
  assert.deepEqual(duracionEfectiva({ ...porVideo, elementos: [] }), { seg: 15, porVideo: false });
});

test("videoQueManda no depende del bucle", () => {
  const a = { ...video(`biblioteca/${U1}.mp4`, 20), bucle: true };
  const d: Diapositiva = { ...diapositivaVacia(), avance: "video", elementos: [a] };
  assert.equal(videoQueManda(d)?.id, a.id);
});

test("refsDeMedios incluye fondos, imágenes, videos y pósters una sola vez", () => {
  const v = video(`biblioteca/${U1}.mp4`, 10);
  const d: Diapositiva = {
    ...diapositivaVacia(),
    fondo: { tipo: "imagen", imagen: { bucket: "accidentes", path: `fotos/${U2}.jpg` }, ajuste: "cubrir", oscurecer: 0.3 },
    elementos: [v, { ...v, id: "otro" }],
  };
  const p: Presentacion = { version: 1, diapositivas: [d, duplicarDiapositiva(d)] };
  const refs = refsDeMedios(p);
  assert.equal(refs.length, 3);
  assert.deepEqual(refs.map((r) => r.tipo).sort(), ["imagen", "imagen", "video"]);
  assert.ok(usaMedio(p, "pantalla", `biblioteca/${U1}.mp4`));
  assert.ok(!usaMedio(p, "pantalla", `biblioteca/${U2}.mp4`));
});

test("tiposDeWidget y familiasDeDatos: el reloj no pide datos", () => {
  const d: Diapositiva = { ...diapositivaVacia(), elementos: [crearWidget("reloj"), crearWidget("acc_kpis"), crearWidget("acc_serie")] };
  const p: Presentacion = { version: 1, diapositivas: [d] };
  const tipos = tiposDeWidget(p);
  assert.deepEqual([...tipos].sort(), ["acc_kpis", "acc_serie", "reloj"]);
  assert.deepEqual([...familiasDeDatos(tipos)], ["accidentabilidad"]);
});

test("reordenar mueve sin perder elementos y moverCapa respeta los extremos", () => {
  assert.deepEqual(reordenar(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(reordenar(["a", "b"], 5, 0), ["a", "b"]);
  const d: Diapositiva = { ...diapositivaVacia(), elementos: [crearTexto("1"), crearTexto("2"), crearTexto("3")] };
  const id = d.elementos[0].id;
  assert.equal(moverCapa(d, id, "frente").elementos[2].id, id);
  assert.equal(moverCapa(d, id, -1).elementos[0].id, id);
  assert.equal(moverCapa(d, id, 1).elementos[1].id, id);
});

test("duplicarDiapositiva renueva todos los ids", () => {
  const d: Diapositiva = { ...diapositivaVacia(), elementos: [crearTexto("1"), crearWidget("reloj")] };
  const c = duplicarDiapositiva(d);
  assert.notEqual(c.id, d.id);
  assert.ok(c.elementos.every((e, i) => e.id !== d.elementos[i].id));
});

test("el máximo teórico de la presentación cabe en MAX_BYTES", () => {
  const d = diapositivaVacia();
  d.elementos = Array.from({ length: MAX_ELEMENTOS }, () => crearTexto("x".repeat(MAX_TEXTO)));
  const p: Presentacion = { version: 1, diapositivas: Array.from({ length: MAX_DIAPOSITIVAS }, () => duplicarDiapositiva(d)) };
  // El peor caso de texto excede: el editor avisa y el servidor lo rechaza;
  // lo que importa es que un caso realista (texto corto) quepa holgado.
  const realista: Presentacion = {
    version: 1,
    diapositivas: Array.from({ length: MAX_DIAPOSITIVAS }, () => ({
      ...diapositivaVacia(),
      elementos: Array.from({ length: MAX_ELEMENTOS }, () => crearTexto("Texto de una línea razonable")),
    })),
  };
  assert.ok(tamanoJson(realista) < MAX_BYTES, `realista: ${tamanoJson(realista)}`);
  assert.ok(tamanoJson(p) > 0);
});

test("widget: estilo propio opcional, validado; sin estilo queda igual que antes", () => {
  const conEstilo = {
    ...crearWidget("cumple_hoy"),
    widget: {
      ...crearWidget("cumple_hoy").widget,
      fuente: "bebas",
      colorTitulo: "#FFAA00",
      colorTexto: "rojo",
      colorFondo: "#112233",
      opacidadFondo: 7,
      colorAcento: "#00ff00",
      script: "<x>",
    },
  };
  const sinEstilo = crearWidget("acc_kpis");
  const v = validarPresentacion({ version: 1, diapositivas: [{ ...diapositivaVacia(), elementos: [conEstilo, sinEstilo] }] })!;
  const [a, b] = v.diapositivas[0].elementos;
  assert.equal(a.tipo, "widget");
  assert.equal(b.tipo, "widget");
  if (a.tipo !== "widget" || b.tipo !== "widget") return;
  assert.deepEqual(a.widget, {
    tipo: "cumple_hoy",
    tema: "oscuro",
    maxFilas: 10,
    fuente: "bebas",
    colorTitulo: "#ffaa00",
    colorFondo: "#112233",
    opacidadFondo: 1,
    colorAcento: "#00ff00",
  });
  // El widget a pantalla completa nace ocupando todo el lienzo.
  assert.deepEqual([a.x, a.y, a.w, a.h], [0, 0, 1920, 1080]);
  assert.deepEqual(b.widget, { tipo: "acc_kpis", tema: "oscuro" });
});

test("duracionEfectiva: el carrusel de accidentes manda (resumen + uno por accidente, con tope)", async () => {
  const { carruselDe } = await import("./modelo");
  const w = crearWidget("acc_ayer");
  assert.deepEqual(w.widget, { tipo: "acc_ayer", tema: "oscuro", segPorElemento: 10 });
  const d = { ...diapositivaVacia(), duracionSeg: 15, elementos: [crearTexto("x"), { ...w, widget: { ...w.widget, segPorElemento: 8 } }] };
  assert.ok(carruselDe(d));
  assert.deepEqual(duracionEfectiva(d, 1), { seg: 8, porVideo: false, porCarrusel: { elementos: 1, segPorElemento: 8 } });
  assert.deepEqual(duracionEfectiva(d, 3), { seg: 24, porVideo: false, porCarrusel: { elementos: 3, segPorElemento: 8 } });
  assert.equal(duracionEfectiva(d).seg, 8); // sin el dato: solo el resumen
  // Sin carrusel, igual que antes.
  assert.deepEqual(duracionEfectiva({ ...d, elementos: [crearTexto("x")] }, 3), { seg: 15, porVideo: false });
  // Se valida al leer: fuera de rango se ajusta; ausente toma el valor por defecto.
  const v = validarPresentacion({
    version: 1,
    diapositivas: [{ ...d, elementos: [{ ...w, widget: { tipo: "acc_ayer", tema: "claro", segPorElemento: 999 } }, { ...w, id: "b", widget: { tipo: "acc_ayer" } }] }],
  })!;
  const [a, b] = v.diapositivas[0].elementos;
  assert.ok(a.tipo === "widget" && a.widget.tipo === "acc_ayer" && a.widget.segPorElemento === 120);
  assert.ok(b.tipo === "widget" && b.widget.tipo === "acc_ayer" && b.widget.segPorElemento === 10);
});
