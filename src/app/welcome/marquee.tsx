"use client";

import { useState } from "react";
import { LineIcon } from "@/components/line-icon";

/**
 * The one moving strip on the page. Autoplaying motion alongside other
 * content needs a way to stop it, hence the pause button. Under reduced
 * motion the CSS shows the list wrapped and still, without the button.
 */
export function Marquee({ items }: { items: string[] }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="marquee" data-paused={paused ? "true" : "false"} data-loop="on">
      <div className="marquee-view">
        <div className="marquee-track">
          {items.map((t) => (
            <span key={t}>{t}</span>
          ))}
          {items.map((t) => (
            <span key={`${t}-copy`} aria-hidden="true">
              {t}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="marquee-toggle"
        aria-pressed={paused}
        aria-label={paused ? "Play the moving list" : "Pause the moving list"}
        onClick={() => setPaused((p) => !p)}
      >
        <LineIcon name={paused ? "play" : "pause"} size={14} />
      </button>
    </div>
  );
}
