"use client";

/**
 * Fade — drop-in replacement for `{show && <X/>}` patterns.
 *
 * Wraps children in an AnimatePresence + motion.div so enter/exit get a
 * minimal spring. Tuned for error banners, success toasts, inline hints —
 * anything that flips visibility based on a boolean.
 *
 * For modals / overlays use <Modal> (separate envelope with backdrop).
 * For routing / tab swaps use <Swap> (mode="wait" crossfade).
 */

import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

type Direction = "down" | "up" | "none";

interface FadeProps extends Omit<HTMLMotionProps<"div">, "children"> {
  /** When true, children are mounted and animated in. */
  in: boolean;
  /** Slide direction on enter/exit. Default: "down" (good for banners). */
  from?: Direction;
  /** Travel distance in px. Default: 8. */
  distance?: number;
  children: ReactNode;
}

const SPRING = { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.6 };

export function Fade({
  in: show,
  from = "down",
  distance = 8,
  children,
  ...rest
}: FadeProps) {
  const offset =
    from === "down" ? -distance : from === "up" ? distance : 0;

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: offset }}
          transition={SPRING}
          {...rest}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
