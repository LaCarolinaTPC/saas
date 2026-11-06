/**
 * Service worker del televisor, con alcance /display. Permite abrir la pantalla
 * sin internet tras un reinicio: la presentación y sus medios están en IndexedDB
 * (src/lib/pantalla/copia-local.ts), pero sin esto la página y su JavaScript no
 * cargarían. Solo funciona con HTTPS; sin él, el TV sigue igual salvo ese caso.
 *
 * No toca /api ni Storage: nunca guarda respuestas con datos ni la clave del TV.
 */

const CACHE = "gestivo-display-v1";
// Los archivos llevan hash y cambian con cada despliegue: se conservan los últimos.
const MAX_ENTRADAS = 200;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function recortar(cache) {
  const claves = await cache.keys();
  const sobran = claves.length - MAX_ENTRADAS;
  for (let i = 0; i < sobran; i++) await cache.delete(claves[i]);
}

/** La página: primero la red, para tomar un despliegue nuevo en cuanto haya conexión. */
async function primeroRed(request) {
  const cache = await caches.open(CACHE);
  try {
    const r = await fetch(request);
    if (r.ok) await cache.put("/display", r.clone());
    return r;
  } catch (e) {
    const guardada = await cache.match("/display");
    if (guardada) return guardada;
    throw e;
  }
}

/** Los estáticos de Next: inmutables, primero la copia. */
async function primeroCache(request) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  const r = await fetch(request);
  if (r.ok) {
    await cache.put(request, r.clone());
    await recortar(cache);
  }
  return r;
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === "/display") {
    e.respondWith(primeroRed(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(primeroCache(request));
  }
});

/**
 * La primera visita carga antes de que este worker controle la página: ella le
 * manda lo que ya cargó para que quede guardado desde el primer día.
 */
self.addEventListener("message", (e) => {
  if (e.data?.tipo !== "precachear" || !Array.isArray(e.data.urls)) return;
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const u of ["/display", ...e.data.urls]) {
        try {
          const url = new URL(u, self.location.origin);
          if (url.origin !== self.location.origin) continue;
          if (url.pathname !== "/display" && !url.pathname.startsWith("/_next/static/")) continue;
          if (url.pathname !== "/display" && (await cache.match(url.href))) continue;
          const r = await fetch(url.href);
          if (r.ok) await cache.put(url.pathname === "/display" ? "/display" : url.href, r);
        } catch {
          /* sin red: se guarda la próxima vez */
        }
      }
      await recortar(cache);
    })()
  );
});
