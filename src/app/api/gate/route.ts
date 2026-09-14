import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  isGateConfigured,
  verifyPassword,
} from "@/lib/auth/app-gate";

/**
 * Unlock (POST) and lock (DELETE) the app gate.
 *
 * Deliberately not in proxy.ts: the proxy is documented as unable to rely
 * on shared module state, and throttling needs exactly that. A single
 * Render instance serves this app, so an in-memory counter is sufficient
 * to make the shared password impractical to brute-force; it resets on
 * restart, which is an acceptable trade for having no datastore.
 */

const schema = z.object({ password: z.string().min(1).max(512) });

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest): string {
  // Render sits behind a proxy, so the socket address is useless here.
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export async function POST(request: NextRequest) {
  try {
    if (!isGateConfigured()) {
      return NextResponse.json(
        { success: false, error: "No password is configured for this deployment." },
        { status: 503 }
      );
    }

    const key = clientKey(request);
    if (throttled(key)) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    const { password } = schema.parse(await request.json());

    if (!verifyPassword(password)) {
      recordFailure(key);
      // Same message either way — don't tell a prober which part was wrong.
      return NextResponse.json(
        { success: false, error: "Incorrect password." },
        { status: 401 }
      );
    }

    const token = createSessionToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Could not create a session." },
        { status: 500 }
      );
    }

    attempts.delete(key);

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unlock failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

/** Lock this browser again. */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
