import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
      // Persist subscriber in Upstash Redis (already used elsewhere in the app)
      const res = await fetch(`${url}/sadd/newsletter:subscribers/${encodeURIComponent(email.toLowerCase())}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error("[newsletter] Upstash error:", await res.text());
        return NextResponse.json({ error: "Could not save subscription." }, { status: 500 });
      }
    } else {
      // Fallback: log it so nothing breaks if Redis is not configured yet
      console.log("[newsletter] New subscriber:", email.toLowerCase());
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
