import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Staff are signed out after 30 minutes without a request (shared reception PCs).
const IDLE_MINUTES = 30;
const LAST_SEEN = "crm_last_seen";

const PUBLIC_PATHS = ["/login", "/setup", "/auth", "/f/", "/api/jobs", "/api/webhooks", "/forgot-password"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Refreshes the session cookie when needed. Authorization happens in pages,
  // actions and RLS; this is only the optimistic redirect.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (signedIn) {
    const lastSeen = Number(request.cookies.get(LAST_SEEN)?.value ?? 0);
    if (lastSeen && Date.now() - lastSeen > IDLE_MINUTES * 60_000) {
      await supabase.auth.signOut();
      const redirect = NextResponse.redirect(new URL("/login?reason=idle", request.url));
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
      redirect.cookies.delete(LAST_SEEN);
      return redirect;
    }
    response.cookies.set(LAST_SEEN, String(Date.now()), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
    });
  } else if (!isPublic) {
    const login = new URL("/login", request.url);
    if (path !== "/") login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
