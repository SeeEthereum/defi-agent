"use client";

/**
 * Modal — envelope for full-screen overlays (fund modal, order confirm,
 * swap preview). Handles backdrop fade + content scale-in spring.
 *
 * Usage is drop-in for the existing pattern:
 *   Before: {show && <div className="fixed inset-0 ..."> ... </div>}
 *   After:  <Modal open={show} onClose={...}>{...}</Modal>
 *
 * The envelope is positioning-neutral: it provides fixed inset-0 +
 * backdrop + centering. Children receive the content surface only.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  /** Called when the user clicks the backdrop. Defaults to onClose. */
  onBackdropClick?: () => void;
  /** If true, pressing Escape triggers onClose. Default: true. */
  closeOnEscape?: boolean;
  /** Max width class for the content surface. Default: "max-w-md". */
  contentClassName?: string;
  children: ReactNode;
}

const BACKDROP_TRANSITION = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };
const CONTENT_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30,
  mass: 0.7,
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function Modal({
  open,
  onClose,
  onBackdropClick,
  closeOnEscape = true,
  contentClassName = "max-w-md",
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;

    const nodes = focusablesIn(panel);
    (nodes[0] ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (closeOnEscape && onClose) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const tabbable = focusablesIn(panel);
      if (tabbable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !panel.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, closeOnEscape, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={BACKDROP_TRANSITION}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onBackdropClick ?? onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
          />
          {/* Content */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={`relative w-full ${contentClassName}`}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={CONTENT_SPRING}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
