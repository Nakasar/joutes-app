import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const allowedOrigins = ["https://tools.joutes.app", "https://beta.joutes.app", "http://localhost:5173"];

// This function can be marked `async` if using `await` inside
export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const res = NextResponse.next();

  if (origin && allowedOrigins.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
  } else if (origin && request.nextUrl.pathname.startsWith("/api/")) {
    res.headers.set("Access-Control-Allow-Origin", origin);
  }
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return res;
}

export const config = {
  matcher: '/api/:path*',
};
