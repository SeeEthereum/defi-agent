import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The card shown when a link to albicocca is shared. Generated at build time
// from the hero photo, in the dark theme, with the wordmark and the headline.

export const alt = "albicocca. Ask your wallet. It does the rest.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const photo = await readFile(join(process.cwd(), "src", "app", "welcome", "media", "light-room.jpg"));
  const src = `data:image/jpeg;base64,${photo.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0e0e0d" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={1200} height={630} style={{ position: "absolute", left: 300, top: 0, width: 1130, height: 630, objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1200,
            height: 630,
            display: "flex",
            backgroundImage: "linear-gradient(90deg, rgba(14,14,13,1) 0%, rgba(14,14,13,1) 26%, rgba(14,14,13,0.6) 46%, rgba(14,14,13,0) 66%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700, letterSpacing: -1.8, color: "#f2f1ec" }}>
            <span>albic</span>
            <span style={{ width: 26, height: 26, borderRadius: 26, margin: "4px 2px 0", background: "linear-gradient(135deg, #ff7a1a, #ff2d75)" }} />
            <span>cca</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 500, letterSpacing: -4.5, lineHeight: 0.98 }}>
            <span style={{ color: "#f2f1ec" }}>Ask your wallet.</span>
            <span style={{ color: "#9d9c95" }}>It does the rest.</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
