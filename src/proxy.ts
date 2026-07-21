import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { hrefToModule, MODULE_HOME, type ModuleKey } from "@/lib/permissions-shared";

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
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/docs") ||
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

    // Bloqueo por módulo según el tipo de usuario. Fail-closed, alineado con
    // getCurrentPermissions: las lecturas de perfil/tipo se hacen con service
    // role (el cliente anon está sujeto a RLS y devolvía null, dejando el
    // control inservible). Los sub-permisos los aplican los guards de cada
    // página; aquí solo se bloquea a nivel de módulo.
    const mod = hrefToModule(pathname);
    if (mod) {
      const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (svcUrl && svcKey) {
        const admin = createClient(svcUrl, svcKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: profile } = await admin
          .from("profiles")
          .select("user_type")
          .eq("id", user.id)
          .maybeSingle();
        const userType = profile?.user_type ?? null;

        // Sin tipo asignado: denegar (fail-closed). El admin siempre pasa.
        if (!userType) {
          const url = request.nextUrl.clone();
          url.pathname = "/login";
          return NextResponse.redirect(url);
        }
        // El rol Tesorería inicia directamente en la Caja de Otros
        // Devengados: nunca ve el dashboard de conductores inicial.
        if (userType === "tesoreria" && pathname === "/") {
          const url = request.nextUrl.clone();
          url.pathname = MODULE_HOME.tesoreria;
          return NextResponse.redirect(url);
        }
        if (userType !== "admin") {
          const { data: type } = await admin
            .from("user_types")
            .select("modulos")
            .eq("key", userType)
            .maybeSingle();
          const modules = (Array.isArray(type?.modulos)
            ? type.modulos
            : []) as ModuleKey[];
          if (!modules.includes(mod)) {
            const url = request.nextUrl.clone();
            // Destino seguro: home del primer módulo permitido, o login si
            // el tipo no tiene ningún módulo.
            url.pathname = modules[0] ? (MODULE_HOME[modules[0]] ?? "/") : "/login";
            return NextResponse.redirect(url);
          }
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
