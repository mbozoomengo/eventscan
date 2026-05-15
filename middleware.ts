import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  // getSession() lit le cookie local — suffisant pour le middleware
  // getUser() ferait un appel réseau Supabase à chaque requête
  const { data: { session } } = await supabase.auth.getSession();

  const path = request.nextUrl.pathname;

  const isProtected = ["/dashboard", "/admin", "/organizer", "/scanner"].some(
    (p) => path.startsWith(p)
  );

  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", path);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return response;
  }

  supabaseResponse.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  supabaseResponse.headers.set("Pragma", "no-cache");
  supabaseResponse.headers.set("Expires", "0");

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|invite|login).*)",
  ],
};
