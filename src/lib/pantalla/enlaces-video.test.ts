import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enlacePublico,
  interpretarEnlace,
  miniaturaDe,
  urlReproductorVimeo,
  validarMiniaturaWeb,
  validarRefVideoWeb,
} from "./enlaces-video";

const YT = { proveedor: "youtube", id: "dQw4w9WgXcQ" };

test("YouTube en todas sus formas", () => {
  for (const e of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123",
    "youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ]) {
    assert.deepEqual(interpretarEnlace(e), YT, e);
  }
  assert.equal(interpretarEnlace("https://www.youtube.com/watch?v=corto"), null);
  assert.equal(interpretarEnlace("https://www.youtube.com/@canal"), null);
});

test("Vimeo público, no listado y del reproductor", () => {
  assert.deepEqual(interpretarEnlace("https://vimeo.com/76979871"), { proveedor: "vimeo", id: "76979871", hash: null });
  assert.deepEqual(interpretarEnlace("https://vimeo.com/76979871/8272103f6e"), { proveedor: "vimeo", id: "76979871", hash: "8272103f6e" });
  assert.deepEqual(interpretarEnlace("https://player.vimeo.com/video/76979871?h=8272103f6e&badge=0"), {
    proveedor: "vimeo",
    id: "76979871",
    hash: "8272103f6e",
  });
  assert.deepEqual(interpretarEnlace("https://vimeo.com/channels/staffpicks/76979871"), { proveedor: "vimeo", id: "76979871", hash: null });
  assert.equal(interpretarEnlace("https://vimeo.com/usuario"), null);
});

test("archivo directo: solo https, .mp4 o .webm", () => {
  assert.deepEqual(interpretarEnlace("https://cdn.ejemplo.com/videos/seguridad.mp4"), { proveedor: "mp4", url: "https://cdn.ejemplo.com/videos/seguridad.mp4" });
  assert.deepEqual(interpretarEnlace("https://cdn.ejemplo.com/a.webm?x=1")?.proveedor, "mp4");
  assert.equal(interpretarEnlace("http://cdn.ejemplo.com/a.mp4"), null);
  assert.equal(interpretarEnlace("https://cdn.ejemplo.com/a.mov"), null);
  assert.equal(interpretarEnlace("https://usuario:clave@cdn.ejemplo.com/a.mp4"), null);
});

test("sitios que no se pueden reproducir solos se rechazan", () => {
  for (const e of [
    "https://www.tiktok.com/@x/video/123",
    "https://www.instagram.com/reel/abc/",
    "https://www.facebook.com/watch/?v=123",
    "https://drive.google.com/file/d/abc/view",
    "javascript:alert(1)",
    "texto cualquiera",
    "",
  ]) {
    assert.equal(interpretarEnlace(e), null, e);
  }
});

test("validarRefVideoWeb solo acepta referencias limpias", () => {
  assert.deepEqual(validarRefVideoWeb(YT), YT);
  assert.equal(validarRefVideoWeb({ proveedor: "youtube", id: "x" }), null);
  assert.deepEqual(validarRefVideoWeb({ proveedor: "vimeo", id: "123", hash: "<script>" }), { proveedor: "vimeo", id: "123", hash: null });
  assert.equal(validarRefVideoWeb({ proveedor: "mp4", url: "https://x.com/a.mp4\" onerror=\"" }), null);
  assert.equal(validarRefVideoWeb({ proveedor: "dailymotion", id: "x" }), null);
});

test("miniaturas y enlaces", () => {
  assert.equal(miniaturaDe(YT as never, null), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(validarMiniaturaWeb("https://i.vimeocdn.com/video/123-abc_640"), "https://i.vimeocdn.com/video/123-abc_640");
  assert.equal(validarMiniaturaWeb("https://otro.com/x.jpg"), null);
  assert.equal(enlacePublico({ proveedor: "vimeo", id: "1", hash: "abcdef" }), "https://vimeo.com/1/abcdef");
  const u = new URL(urlReproductorVimeo({ proveedor: "vimeo", id: "1", hash: "abcdef" }, { bucle: false }));
  assert.equal(u.searchParams.get("h"), "abcdef");
  assert.equal(u.searchParams.get("muted"), "1");
  assert.equal(u.searchParams.get("loop"), "0");
});
