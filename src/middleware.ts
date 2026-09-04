import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextRequest, type NextFetchEvent, type NextResponse } from "next/server";
import { AFFILIATE } from "@/lib/affiliate/config";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/onboarding(.*)"]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const res = (await clerkHandler(req, event)) as NextResponse;

  // ── Affiliate attribution, step one ───────────────────────────────────────
  // A visitor arriving with ?ref=CODE gets a 30-day cookie, read exactly once
  // when their account is created. First touch wins: a code already present is
  // never overwritten, so a person who clicked two promoters' links is credited
  // to the one whose link they actually followed to sign up.
  try {
    const ref = req.nextUrl.searchParams.get("ref")?.trim().toUpperCase() || "";
    if (ref && /^[A-Z0-9]{4,24}$/.test(ref) && !req.cookies.get(AFFILIATE.cookieName)) {
      res.cookies.set({
        name: AFFILIATE.cookieName,
        value: ref,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: AFFILIATE.cookieDays * 24 * 60 * 60,
      });
    }
  } catch {
    // Never let a cookie problem take the page down with it.
  }

  return res;
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
