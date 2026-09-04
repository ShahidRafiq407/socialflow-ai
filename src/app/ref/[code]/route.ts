// ============================================================================
// /ref/<code> — THE SHORT AFFILIATE LINK
//
// The affiliate tab hands out `/?ref=CODE`, which middleware turns into the
// attribution cookie. This route exists because a path someone types by hand or
// pastes into a caption reads better than a query string: it drops the same
// cookie, sends the visitor to the landing page, and nothing else. The code
// itself is not looked up here — attribution validates it when the signup
// happens, which is the only moment it matters.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/media/urls";
import { AFFILIATE } from "@/lib/affiliate/config";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const home = getAppBaseUrl().replace(/\/$/, "");
  const code = ((await params).code || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{4,24}$/.test(code)) {
    return NextResponse.redirect(home, { status: 302 });
  }

  const res = NextResponse.redirect(`${home}/?ref=${code}`, { status: 302 });
  res.cookies.set({
    name: AFFILIATE.cookieName,
    value: code,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AFFILIATE.cookieDays * 24 * 60 * 60,
  });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
