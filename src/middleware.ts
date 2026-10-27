import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if(process.env.BM_SINGLE_COMPANY_MODE==="true"&&request.method==="GET"&&!request.nextUrl.pathname.startsWith("/api/")&&process.env.APP_URL){
    const canonical=new URL(process.env.APP_URL);if(request.nextUrl.host!==canonical.host&&request.nextUrl.hostname.endsWith(".up.railway.app"))return NextResponse.redirect(new URL(request.nextUrl.pathname+request.nextUrl.search,canonical),308);
  }
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return NextResponse.next();
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL;
  if (origin && expected && origin !== expected) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*","/((?!api|_next/static|_next/image|favicon.ico|health|ready).*)"] };
