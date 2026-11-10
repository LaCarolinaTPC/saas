# Correo saliente de GESTIVO (SMTP de Microsoft 365)

Los correos de recuperación de contraseña salen desde `@lacarolina.com.co` a
través del SMTP de Microsoft 365. Este documento tiene los pasos de
configuración; el código de la aplicación ya está listo y no requiere cambios.

> **Fecha de caducidad.** Supabase se autentica contra el SMTP con usuario y
> contraseña (Basic Auth). Microsoft está retirando ese mecanismo en Exchange
> Online: se deshabilita por defecto **después de diciembre de 2026** (un
> administrador puede volver a habilitarlo) y la eliminación definitiva se
> anuncia para la segunda mitad de 2027. Cuando llegue esa fecha habrá que
> migrar a un relay con dominio verificado (Resend, Brevo, SendGrid) o a
> Azure Communication Services. El remitente seguiría siendo
> `@lacarolina.com.co`; solo cambian los datos del SMTP en Supabase.

---

## 1. Buzón remitente

Decidido el 2026-11-10: los correos salen desde `soporte@lacarolina.com.co`.

- **Dirección:** `soporte@lacarolina.com.co`
- **Licencia:** requiere una licencia con Exchange Online (Plan 1 basta).
  No sirve un *buzón compartido*: SMTP AUTH exige un buzón con inicio de
  sesión habilitado.
- **Contraseña:** el servidor usa una *contraseña de aplicación* (paso 3), no
  la contraseña con que entra la persona que atiende el buzón. Si esa persona
  cambia su contraseña, la de aplicación sigue sirviendo.
- **Respuestas:** si alguien responde el correo de recuperación, la respuesta
  llega a soporte.

## 2. Habilitar SMTP AUTH

Microsoft lo trae **deshabilitado por defecto**. Hay que habilitarlo en dos
niveles: la organización y el buzón.

Por interfaz: *Centro de administración M365 → Configuración → Configuración de
la organización → Autenticación moderna →* desmarcar **"Desactivar el protocolo
SMTP AUTH para la organización"**.

Por PowerShell (más confiable, y el segundo comando solo se puede hacer así):

```powershell
Install-Module -Name ExchangeOnlineManagement -Scope CurrentUser
Connect-ExchangeOnline -UserPrincipalName admin@lacarolina.com.co

# Nivel organización
Set-TransportConfig -SmtpClientAuthenticationDisabled $false

# Nivel buzón
Set-CASMailbox -Identity soporte@lacarolina.com.co -SmtpClientAuthenticationDisabled $false

# Verificar: debe decir False
Get-CASMailbox -Identity soporte@lacarolina.com.co | Format-List SmtpClientAuthenticationDisabled
```

## 3. MFA: el punto delicado

Basic Auth y MFA son incompatibles. Si el tenant tiene **Valores
predeterminados de seguridad** (*Security Defaults*) activados, el SMTP AUTH
queda bloqueado y **no** se pueden generar contraseñas de aplicación.

Dos caminos, ambos requieren decisión del área de TI:

**Opción 3a — Contraseña de aplicación (más simple)**
1. Desactivar *Security Defaults*: *Entra ID → Propiedades → Administrar valores
   predeterminados de seguridad → Deshabilitado*.
2. Activar MFA por usuario solo para la cuenta `soporte`.
3. Iniciar sesión con esa cuenta en <https://mysignins.microsoft.com/security-info>
   y generar una **contraseña de aplicación**. Esa es la que va en Supabase.

**Opción 3b — Acceso condicional (más seguro, requiere Entra ID P1)**
1. Desactivar *Security Defaults*.
2. Crear una directiva de Acceso Condicional que exija MFA a todo el mundo,
   **excluyendo** la cuenta `soporte`.
3. Usar la contraseña normal del buzón en Supabase.

En ambos casos se pierde la protección de *Security Defaults* a nivel de tenant,
así que hay que reemplazarla con Acceso Condicional. Conviene que lo revise
quien administre el tenant.

## 4. SPF

Al enviar por los servidores de Microsoft, el SPF del dominio ya debería
cubrirlo. Confirmar que el registro TXT de `lacarolina.com.co` incluye:

```
v=spf1 include:spf.protection.outlook.com -all
```

## 5. Configurar Supabase

Panel del proyecto → **Authentication → Emails → SMTP Settings** → *Enable
Custom SMTP*:

| Campo | Valor |
|---|---|
| Sender email | `soporte@lacarolina.com.co` |
| Sender name | `GESTIVO — La Carolina` |
| Host | `smtp.office365.com` |
| Port | `587` |
| Username | `soporte@lacarolina.com.co` |
| Password | la contraseña de aplicación del paso 3 |

> El *Sender email* debe coincidir con el buzón autenticado, o ser una
> dirección sobre la que ese buzón tenga permiso **Enviar como**. Si no
> coincide, Microsoft rechaza con `550 5.7.60 SendAsDenied`.

Luego, en **Authentication → Rate Limits**, subir el límite de envío de correos
(por defecto queda en 30/hora). Microsoft 365 admite hasta 30 mensajes por
minuto y 10.000 destinatarios al día — de sobra para el uso de GESTIVO.

## 6. URLs de retorno

**Authentication → URL Configuration**:

- **Site URL:** `https://saas-six-vert.vercel.app`
- **Redirect URLs** (agregar ambas):
  - `https://saas-six-vert.vercel.app/nueva-contrasena`
  - `http://localhost:3000/nueva-contrasena` *(para pruebas locales)*

Si más adelante se le pone dominio propio a la aplicación, hay que agregar aquí
la URL nueva o los enlaces del correo dejarán de funcionar.

## 7. Plantilla del correo

**Authentication → Emails → Templates → Reset Password**:

*Asunto:* `GESTIVO — Recuperar tu contraseña`

```html
<h2>Recuperar tu contraseña</h2>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en GESTIVO.</p>
<p><a href="{{ .ConfirmationURL }}">Crear una nueva contraseña</a></p>
<p>El enlace vence en una hora y solo se puede usar una vez.</p>
<p>Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue vigente.</p>
<hr>
<p><small>Transportes La Carolina — mensaje automático, no responder.</small></p>
```

## 8. Prueba

1. Entrar a `https://saas-six-vert.vercel.app/login` → **¿Olvidaste tu contraseña?**
2. Escribir un correo real de un usuario registrado.
3. Debe llegar el correo desde `soporte@lacarolina.com.co`.
4. El enlace lleva a `/nueva-contrasena`, se define la clave y se entra con ella.
5. Verificar el registro en *Tesorería → Devengados → Auditoría*: debe aparecer
   `password_recuperacion_solicitada` y luego `cambio_password`.

Si el correo no llega, revisar los logs en *Supabase → Logs → Auth*. Los errores
más comunes son `535 5.7.139` (SMTP AUTH deshabilitado — volver al paso 2) y
`550 5.7.60 SendAsDenied` (el *Sender email* no coincide con el buzón).

---

## Supabase autoalojado (la instalación actual)

Desde que la base está en el servidor propio (`*.sslip.io`), los pasos 5 a 7 no
se hacen en un panel: son variables de entorno del contenedor de Auth (GoTrue),
en el `.env` del `docker compose` de Supabase. Después de cambiarlas hay que
recrear el contenedor (`docker compose up -d auth`).

| Variable (`.env` de Supabase) | Valor |
|---|---|
| `SMTP_HOST` | `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `soporte@lacarolina.com.co` |
| `SMTP_PASS` | la contraseña de aplicación del paso 3 |
| `SMTP_ADMIN_EMAIL` | `soporte@lacarolina.com.co` (el remitente) |
| `SMTP_SENDER_NAME` | `GESTIVO — La Carolina` |
| `SITE_URL` | la URL de la aplicación en producción |
| `ADDITIONAL_REDIRECT_URLS` | `<URL de producción>/nueva-contrasena,http://localhost:3000/nueva-contrasena` |

El `.env` de ejemplo de Supabase trae `SMTP_HOST=supabase-mail` (un buzón de
pruebas que no entrega nada): si quedó así, ningún correo sale.

**Diagnóstico.** Desde el 2026-11-10, si Supabase no envía el correo, la
pantalla lo dice y deja el error en *Tesorería → Devengados → Auditoría*
(`password_recuperacion_solicitada` con resultado fallido y `error_envio` en el
detalle). El detalle completo está en el log del contenedor:

```bash
docker logs supabase-auth --since 24h 2>&1 | grep -i -E "smtp|mail|recover"
```

Un envío que sí salió deja la fecha en `auth.users.recovery_sent_at` del usuario.

## Alternativa mientras tanto

Un administrador siempre puede restablecer la contraseña de cualquier usuario
desde *Configuración → Usuarios → **Restablecer clave***, sin depender del
correo. Ese camino no requiere nada de esta configuración y es el que conviene
usar si el correo falla justo cuando se necesita.
