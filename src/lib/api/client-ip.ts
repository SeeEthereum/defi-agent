/**
 * The address of the person making a request, for rate limits.
 *
 * Render runs every public web service behind Cloudflare, which sets
 * CF-Connecting-IP on each request and overwrites any value the caller sent.
 * X-Forwarded-For is not safe the same way: Render's proxy appends to what
 * the caller sent, so its first entry can be anything the caller likes.
 * Without Cloudflare (local development) the last X-Forwarded-For entry,
 * the one the nearest proxy added, is the fallback.
 */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return last || "local";
}
