"use client";

/**
 * A searchable chooser (tokens, chains): a centred panel on a computer, a
 * bottom sheet on a phone. It is portalled to the .app root, so no transformed
 * ancestor can trap its fixed position, and it still gets the app styles.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { LineIcon } from "@/components/line-icon";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.8 };

export function Picker({
  open,
  onClose,
  title,
  query,
  onQuery,
  placeholder = "Search",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  query?: string;
  onQuery?: (q: string) => void;
  placeholder?: string;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => (inputRef.current ?? panelRef.current)?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  const host = document.querySelector<HTMLElement>(".app") ?? document.body;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="picker-layer">
          <motion.div
            className="picker-backdrop"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className="picker"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={SPRING}
          >
            <div className="picker-head">
              <h2>{title}</h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
                <LineIcon name="x" size={18} />
              </button>
            </div>
            {onQuery && (
              <div className="picker-search">
                <LineIcon name="search" size={17} />
                <input
                  ref={inputRef}
                  className="input"
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={placeholder}
                  aria-label={placeholder}
                  value={query ?? ""}
                  onChange={(e) => onQuery(e.target.value)}
                />
              </div>
            )}
            <div className="picker-list">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    host
  );
}

/** One choice in a Picker list. */
export function PickRow({
  icon,
  title,
  sub,
  end,
  selected = false,
  onPick,
}: {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  selected?: boolean;
  onPick: () => void;
}) {
  return (
    <button type="button" className="pick-row" aria-pressed={selected} onClick={onPick}>
      {icon}
      <span className="pick-main">
        <span className="t">{title}</span>
        {sub && <span className="sub">{sub}</span>}
      </span>
      {end && <span className="end">{end}</span>}
    </button>
  );
}
