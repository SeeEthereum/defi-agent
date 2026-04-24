"use client";

/**
 * Swap — crossfade for content that changes identity: tab panels, step
 * wizards, route transitions. Uses AnimatePresence mode="wait" so the
 * outgoing content finishes before the incoming one starts, preventing
 * layout overlap.
 *
 *   <Swap tokenKey={tab}>
 *     {tab === "positions" ? <Positions/> : <Orders/>}
 *   </Swap>
 *
 * The `tokenKey` prop drives re-mounting — change it and the crossfade
 * fires.
 */

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

interface SwapProps {
  /** Any primitive — changing it triggers the swap. */
  tokenKey: string | number;
  children: ReactNode;
  className?: string;
  /** Horizontal travel in px. Default: 8. */
  distance?: number;
}

const SWAP_TRANSITION = {
  duration: 0.18,
  ease: [0.32, 0.72, 0, 1] as const,
};

export function Swap({
  tokenKey,
  children,
  className,
  distance = 8,
}: SwapProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tokenKey}
        className={className}
        initial={{ opacity: 0, x: distance }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -distance }}
        transition={SWAP_TRANSITION}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
