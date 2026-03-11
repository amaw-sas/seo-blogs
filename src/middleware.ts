import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/(admin)", "/api"];
const PUBLIC_API_PREFIXES = ["/api/worker"];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isWorkerApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/worker");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Worker API routes use WORKER_API_KEY header auth
  if (isWorkerApiRoute(pathname)) {
    const apiKey = request.headers.get("x-worker-api-key");
    if (apiKey !== process.env.WORKER_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Skip non-protected routes
  if (!isProtectedRoute(pathname) || isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }

  // Supabase session check
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // API routes get 401, pages get redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/(admin)/:path*", "/api/:path*"],
};
