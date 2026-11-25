import { NextResponse, type NextRequest } from "next/server";
import { isLocalRuntime, LOCAL_ACCESS_COOKIE } from "@/lib/local-runtime";

export function middleware(request: NextRequest) {
  if (!isLocalRuntime()) return NextResponse.next();

  const allowedHost = process.env.STO_LOCAL_HOST;
  const token = process.env.STO_LOCAL_ACCESS;
  if (!allowedHost || !token || request.headers.get("host") !== allowedHost) {
    return new NextResponse(null, { status: 403 });
  }
  const path = request.nextUrl.pathname;
  if (path === "/register" || path.startsWith("/api/offline/")) {
    return new NextResponse(null, { status: 404 });
  }
  if (path === "/api/local/open" || request.cookies.get(LOCAL_ACCESS_COOKIE)?.value === token) {
    return NextResponse.next();
  }
  return new NextResponse(null, { status: 403 });
}
