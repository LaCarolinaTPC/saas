/**
 * Portal de acceso al Supabase Studio autohosteado.
 *
 * Reemplaza la ventana de basic auth del navegador por una página de login
 * propia. Al autenticar, guarda una cookie de sesión firmada (HMAC) y hace
 * proxy de todo el tráfico hacia Kong inyectando la credencial del dashboard.
 *
 * Variables de entorno:
 *   UPSTREAM_URL      URL interna/pública de Kong (p. ej. https://supabasekong-....sslip.io)
 *   UPSTREAM_AUTH     Credencial del basic auth de Kong, formato "usuario:clave"
 *   PORTAL_USERS      Usuarios del portal, formato "victor:clave1,nestor:clave2"
 *   SESSION_SECRET    Secreto largo y aleatorio para firmar la cookie
 *   SESSION_HOURS     Horas de vida de la sesión (por defecto 12)
 *   PORT              Puerto de escucha (por defecto 3000)
 */
const http = require("http");
const crypto = require("crypto");
const httpProxy = require("http-proxy");
const fs = require("fs");
const path = require("path");

const UPSTREAM_URL = process.env.UPSTREAM_URL;
const UPSTREAM_AUTH = process.env.UPSTREAM_AUTH;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const PORT = Number(process.env.PORT || 3000);

if (!UPSTREAM_URL || !UPSTREAM_AUTH || !SESSION_SECRET || !process.env.PORTAL_USERS) {
  console.error("Faltan variables: UPSTREAM_URL, UPSTREAM_AUTH, SESSION_SECRET y/o PORTAL_USERS");
  process.exit(1);
}

const USERS = new Map(
  process.env.PORTAL_USERS.split(",").map((pair) => {
    const i = pair.indexOf(":");
    return [pair.slice(0, i).trim(), pair.slice(i + 1)];
  })
);

const COOKIE = "studio_session";
const loginPage = fs.readFileSync(path.join(__dirname, "login.html"), "utf8");

function sign(payload) {
  const mac = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${mac}`;
}

function verify(token) {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const payload = Buffer.from(body, "base64url").toString();
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const { u, exp } = JSON.parse(payload);
  if (Date.now() > exp) return null;
  return u;
}

function getCookie(req) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Antifuerza bruta simple: 8 intentos fallidos por IP cada 15 minutos.
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, reset: now + 15 * 60_000 };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + 15 * 60_000;
  }
  attempts.set(ip, rec);
  return rec.count >= 8;
}

const proxy = httpProxy.createProxyServer({
  target: UPSTREAM_URL,
  changeOrigin: true,
  secure: true,
  ws: true,
  headers: {
    Authorization: `Basic ${Buffer.from(UPSTREAM_AUTH).toString("base64")}`,
  },
});
proxy.on("error", (err, _req, res) => {
  console.error("[proxy]", err.message);
  if (res && !res.headersSent && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Error de conexión con el Studio.");
  }
});

const server = http.createServer((req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  const url = new URL(req.url, "http://portal");

  if (url.pathname === "/portal/salir") {
    res.writeHead(302, {
      "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      Location: "/",
    });
    return res.end();
  }

  if (url.pathname === "/portal/entrar" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const user = (params.get("usuario") || "").trim();
      const pass = params.get("clave") || "";
      if (throttled(ip)) {
        console.warn(`[login] bloqueado por intentos: ip=${ip}`);
        res.writeHead(302, { Location: "/?error=bloqueado" });
        return res.end();
      }
      const stored = USERS.get(user);
      if (stored && safeEqual(pass, stored)) {
        const exp = Date.now() + SESSION_HOURS * 3600_000;
        const token = sign(JSON.stringify({ u: user, exp }));
        console.log(`[login] ok: usuario=${user} ip=${ip}`);
        res.writeHead(302, {
          "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`,
          Location: "/",
        });
        return res.end();
      }
      const rec = attempts.get(ip);
      rec.count += 1;
      console.warn(`[login] fallido: usuario=${user} ip=${ip} intento=${rec.count}`);
      res.writeHead(302, { Location: "/?error=credenciales" });
      res.end();
    });
    return;
  }

  const sessionUser = verify(getCookie(req));
  if (!sessionUser) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(
      loginPage.replace(
        "{{ERROR}}",
        url.searchParams.get("error") === "credenciales"
          ? "Usuario o contraseña incorrectos."
          : url.searchParams.get("error") === "bloqueado"
            ? "Demasiados intentos. Espera 15 minutos."
            : ""
      )
    );
  }

  // Log de actividad: quién tocó qué (las mutaciones son las líneas con POST/PATCH/DELETE).
  if (req.method !== "GET" && req.method !== "HEAD") {
    console.log(`[actividad] usuario=${sessionUser} ${req.method} ${url.pathname}`);
  }
  proxy.web(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (!verify(getCookie(req))) return socket.destroy();
  proxy.ws(req, socket, head);
});

server.listen(PORT, () => console.log(`Portal del Studio escuchando en :${PORT} → ${UPSTREAM_URL}`));
