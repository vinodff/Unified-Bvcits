import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { can, isUserRole } from "@/lib/auth/roles";
import { requiredCapability } from "@/lib/auth/route-guards";

/**
 * Two jobs:
 *
 *  1. Refresh the auth token on every matched request and write the rotated
 *     cookies back. Server Components cannot set cookies, so without this the
 *     session would expire mid-visit and log the user out.
 *  2. Keep unauthenticated visitors out of /dashboard.
 *
 * The role check is deliberately NOT here. Middleware runs on the edge and
 * would need a database round trip per request to resolve a role; each
 * dashboard page resolves it once via getSessionUser() instead. Middleware
 * answers "signed in?", pages answer "allowed?".
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/admin",
  "/placement-portal/exams",
  "/placement-portal/exam",
  "/placement-portal/result",
  "/placement-portal/admin",
  "/placement-portal/review",
  "/placement-portal/analytics",
];
const AUTH_PAGES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Without Supabase configured there are no sessions to protect; letting the
  // request through keeps the public site working.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser(), not getSession(): this revalidates the token rather than
  // trusting the cookie's contents.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isProtected && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    // Bring them back where they were headed once they sign in.
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  /*
   * Capability gate for admin-only routes.
   *
   * This has to happen here rather than only in the page, because the dashboard
   * layout's shell starts streaming before the page component runs — the HTTP
   * status is already committed as 200 by the time a page-level notFound()
   * throws, so a denied route returned "200 + not-found UI". Deciding before
   * any rendering gives an honest status.
   *
   * The cost is one profile lookup, and only on these routes: the matcher below
   * keeps this middleware off the 269 public pages entirely.
   *
   * The page-level can() checks stay as defence in depth — they are what guard
   * the service-role reads, which bypass RLS.
   */
  const capability = user ? requiredCapability(pathname) : null;
  if (user && capability) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.is_active === true && isUserRole(profile.role) ? profile.role : null;

    if (!can(role, capability)) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/dashboard";
      redirect.search = "?denied=1";
      return NextResponse.redirect(redirect);
    }
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  /*
   * Scoped to the routes that actually involve a session, NOT to every page.
   *
   * The usual Supabase example matches the whole site to keep tokens fresh, but
   * this site is 269 mostly-static public pages served to anonymous visitors —
   * matching everything would add a getUser() network round trip to Supabase on
   * every department page, prospectus and portal view, for a session that is
   * only ever used under /dashboard and /admin.
   *
   * The trade-off: a signed-in user browsing only public pages for a long time
   * will not have their token refreshed. That is fine, because the moment they
   * return to /dashboard this runs and refreshes it.
   */
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/placement-portal/exams/:path*",
    "/placement-portal/exam/:path*",
    "/placement-portal/result/:path*",
    "/placement-portal/admin/:path*",
    "/placement-portal/review/:path*",
    "/placement-portal/analytics/:path*",
    "/login",
    "/signup",
  ],
};
