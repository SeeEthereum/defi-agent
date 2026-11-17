import { NextResponse } from "next/server";
import { markActive } from "@/lib/session/activity";
import { currentSession, withSession } from "@/lib/session/session";

/**
 * Heartbeat from the page: the person clicked, typed or scrolled. Keeps a
 * signed-in session from being signed out for inactivity (lib/session/
 * activity). Background polling never calls this.
 */
export const POST = withSession(async () => {
  markActive(currentSession());
  return NextResponse.json({ success: true });
});
