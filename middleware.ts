import { NextResponse, type NextRequest } from "next/server";

// Auth géré côté client dans chaque page
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
