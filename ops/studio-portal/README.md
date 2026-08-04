# Portal de acceso al Supabase Studio

Página de login propia (en lugar de la ventana de basic auth del navegador)
delante del Studio del Supabase autohosteado. Cada persona tiene su propio
usuario del portal y queda log de quién entró y qué modificó.

## Cómo funciona

Néstor/Víctor → **portal** (login bonito, cookie de sesión, log por usuario)
→ Kong (el portal inyecta el basic auth del dashboard) → Studio.

La credencial real del dashboard solo la conoce el portal (variable de
entorno); no hay que compartirla con nadie.

## Despliegue en Coolify (mismo servidor 2.25.85.142)

1. Coolify → **+ New Resource → Application → Public/Private Repository**,
   repo `LaCarolinaTPC/saas`, rama `main`.
2. **Build Pack**: Dockerfile. **Base Directory**: `ops/studio-portal`.
3. **Variables de entorno**:
   - `UPSTREAM_URL` = `https://supabasekong-cdh4adqfxlte7mf509lnbw0t.2.25.85.142.sslip.io`
   - `UPSTREAM_AUTH` = `usuario:clave` del basic auth actual del dashboard
     (los valores de `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` del servicio Supabase en Coolify)
   - `PORTAL_USERS` = `victor:CLAVE_DE_VICTOR,nestor:CLAVE_DE_NESTOR`
   - `SESSION_SECRET` = cadena aleatoria larga (`openssl rand -hex 32`)
   - `SESSION_HOURS` = `12` (opcional)
4. **Domain**: p. ej. `https://studio-portal.2.25.85.142.sslip.io` (puerto 3000).
5. Deploy. Compartir a Néstor la URL del portal y su usuario/clave del portal.

## Logs de actividad

En Coolify → aplicación → Logs se ve:

- `[login] ok: usuario=nestor ip=…` — quién entró y cuándo.
- `[actividad] usuario=nestor POST /api/…` — cada modificación que hizo
  (las lecturas GET no se registran para no llenar el log).
- `[login] fallido/bloqueado` — intentos incorrectos (8 por IP cada 15 min).

## Notas de seguridad

- Todo el que entra al portal tiene el Studio completo (admin de la base):
  dar usuario solo a gente de plena confianza. Para permisos limitados por
  tabla, la opción correcta sigue siendo un rol de Postgres dedicado.
- Para quitar el acceso de alguien: quitarlo de `PORTAL_USERS` y redeploy.
- La URL directa de Kong sigue protegida por su basic auth original.
