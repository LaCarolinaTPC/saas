import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { MODULO_POR_CLAVE } from "@/lib/permisos/catalogo";
import { destinoDeRuta, inicioDe, rutaPermitida, tieneModulo } from "@/lib/permisos/motor";
import { INICIO_POR_ROL, permisosDeUsuario } from "@/lib/permisos/fuente";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pantallas de autenticación: se entra sin sesión. /nueva-contrasena es el
  // destino del enlace de recuperación; la sesión la establece el navegador
  // desde la URL, así que aquí todavía no hay cookie que validar.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/recuperar-contrasena") ||
    pathname.startsWith("/nueva-contrasena")
  ) {
    return NextResponse.next({ request });
  }

  // Public routes
  //
  // /reportar-dano es el formulario con el que el conductor reporta un daño
  // desde su celular, sin cuenta de Gestivo: se identifica con la cédula y sus
  // Server Actions validan todo contra el servidor. Sin esta excepción la ruta
  // redirige a /login y el formulario no sirve para nada.
  //
  // /.well-known publica los metadatos OAuth del servidor MCP. /oauth/autorizar
  // exige sesión, pero la verifica la propia página para poder volver a ella
  // después del login con todos los parámetros de la solicitud.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/docs") ||
    pathname.startsWith("/.well-known") ||
    pathname.startsWith("/oauth") ||
    pathname.startsWith("/reportar-dano") ||
    // Portal de afiliados: sesión propia firmada por el servidor, sin Supabase
    // Auth (src/lib/portal-afiliados). Cada página la exige por su cuenta.
    pathname.startsWith("/portal-afiliados") ||
    // Pantalla informativa del televisor: sin usuario. Se vincula con un
    // código y luego se identifica con su clave en /api/display, que es el
    // único que entrega datos (src/lib/pantalla/dispositivos.ts).
    pathname === "/display" ||
    pathname.startsWith("/display/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || !supabaseUrl.startsWith("http")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Cambio obligatorio de contraseña (primer ingreso o clave provisional):
    // el usuario no navega a ninguna otra pantalla hasta cambiarla.
    const mustChange = !!user.user_metadata?.must_change_password;
    if (mustChange && pathname !== "/cambiar-contrasena") {
      const url = request.nextUrl.clone();
      url.pathname = "/cambiar-contrasena";
      return NextResponse.redirect(url);
    }
    if (pathname === "/cambiar-contrasena") {
      return supabaseResponse;
    }

    // Bloqueo por permiso de la ruta (src/lib/permisos): el mismo motor y la
    // misma fuente que el servidor y el menú, así que no pueden divergir. En
    // modo viejo/sombra la fuente traduce el sistema anterior sin cambiar a
    // quién deja pasar. Fail-closed: lecturas con service role (el cliente anon
    // está sujeto a RLS y devolvía null). Los guards de cada página siguen
    // siendo la segunda línea de defensa.
    const destino = destinoDeRuta(pathname);
    if (destino) {
      const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (svcUrl && svcKey) {
        const admin = createClient(svcUrl, svcKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { efectivos, roles } = await permisosDeUsuario(admin, user.id);
        const irA = (ruta: string | null) => {
          const url = request.nextUrl.clone();
          url.pathname = ruta ?? "/login";
          return NextResponse.redirect(url);
        };

        // Un rol con pantalla de inicio propia (Tesorería → Caja de
        // devengados) no ve el Dashboard al entrar. Solo si puede abrirla: si
        // no, sería un rebote infinito.
        if (pathname === "/" && !efectivos.super) {
          const propio = roles.map((r) => INICIO_POR_ROL[r]).find((r) => r && rutaPermitida(efectivos, r));
          if (propio) return irA(propio);
        }

        if (!rutaPermitida(efectivos, pathname)) {
          // Destino seguro: otra función permitida del mismo módulo (como
          // antes), o la primera pantalla que pueda abrir, o el login.
          const otraFuncion = (MODULO_POR_CLAVE.get(destino.modulo)?.funciones ?? [])
            .map((f) => f.inicio)
            .find((r) => r && tieneModulo(efectivos, destino.modulo) && rutaPermitida(efectivos, r));
          return irA(otraFuncion ?? inicioDe(efectivos));
        }
      }
    }
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
