"use client";

/**
 * "Install app": a menu entry that does what this browser allows (see
 * lib/pwa/install), and the steps for browsers that have no install dialog.
 *
 * The steps live in a host mounted once by the app layout, not inside the
 * menu: the menu closes on click, and would take the dialog with it.
 */

import { useSyncExternalStore, type ReactNode } from "react";
import { Modal } from "@/components/motion/modal";
import { LineIcon, type LineIconName } from "@/components/line-icon";
import {
  currentInstallRoute,
  heldInstallPrompt,
  releaseInstallPrompt,
  subscribeInstall,
  type InstallRoute,
} from "@/lib/pwa/install";

type StepsRoute = Extract<InstallRoute, "ios" | "ios-in-app" | "safari-mac" | "android-menu">;

let shown: StepsRoute | null = null;
const listeners = new Set<() => void>();

function setShown(route: StepsRoute | null): void {
  shown = route;
  for (const listener of listeners) listener();
}

function subscribeShown(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What this browser can do, kept current (prompt used, app installed). "none" on the server. */
export function useInstallRoute(): InstallRoute {
  return useSyncExternalStore(subscribeInstall, currentInstallRoute, () => "none");
}

async function install(route: InstallRoute): Promise<void> {
  if (route === "prompt") {
    const prompt = heldInstallPrompt();
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // Already used, or the browser withdrew it: the menu falls back.
    } finally {
      releaseInstallPrompt();
    }
    return;
  }
  if (route === "ios" || route === "ios-in-app" || route === "safari-mac" || route === "android-menu") setShown(route);
}

/** The menu entry. Renders nothing where installing is not possible or already done. */
export function InstallAppItem({
  className,
  iconSize,
  role,
  onSelect,
}: {
  className?: string;
  iconSize: number;
  role?: "menuitem";
  /** Close the surrounding menu. */
  onSelect?: () => void;
}) {
  const route = useInstallRoute();
  if (route === "installed" || route === "none") return null;
  return (
    <button
      type="button"
      role={role}
      className={className}
      onClick={() => {
        onSelect?.();
        void install(route);
      }}
    >
      <LineIcon name="install" size={iconSize} />
      Install app
    </button>
  );
}

function Step({ icon, children }: { icon: LineIconName; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground" aria-hidden="true">
        <LineIcon name={icon} size={16} />
      </span>
      <span className="pt-1 text-[14px] leading-snug text-foreground">{children}</span>
    </li>
  );
}

function Steps({ route }: { route: StepsRoute }) {
  if (route === "safari-mac") {
    return (
      <>
        <h2 className="text-base font-semibold text-foreground">Add albicocca to your Dock</h2>
        <ol className="space-y-3">
          <Step icon="file">In the menu bar, choose File, then Add to Dock.</Step>
          <Step icon="check">Click Add. albicocca opens in its own window, from the Dock or Launchpad.</Step>
        </ol>
      </>
    );
  }
  if (route === "android-menu") {
    return (
      <>
        <h2 className="text-base font-semibold text-foreground">Install albicocca</h2>
        <ol className="space-y-3">
          <Step icon="dots">Open the browser menu: the three dots next to the address bar.</Step>
          <Step icon="install">Choose Install app, or Add to Home screen.</Step>
          <Step icon="check">Confirm. albicocca opens from its own icon, without the browser bars.</Step>
        </ol>
      </>
    );
  }
  return (
    <>
      <h2 className="text-base font-semibold text-foreground">Add albicocca to your Home Screen</h2>
      {route === "ios-in-app" && (
        <p className="text-[13px] text-muted-foreground">
          The browser inside this app cannot add websites to the Home Screen. Open this page in Safari first: look
          for Open in Safari in its menu, often behind the three dots.
        </p>
      )}
      <ol className="space-y-3">
        <Step icon="share">Tap the Share button: in Safari&apos;s toolbar, or in the address bar in Chrome.</Step>
        <Step icon="add-square">Scroll down and choose Add to Home Screen.</Step>
        <Step icon="check">Tap Add. albicocca now opens from its own icon, without the browser bars.</Step>
      </ol>
      <p className="text-[13px] text-muted-foreground">
        If the app asks you to sign in again, that is expected: iPhone and iPad keep an installed app&apos;s data
        apart from the browser&apos;s.
      </p>
    </>
  );
}

/** Mounted once by the app layout. */
export function InstallStepsHost() {
  const route = useSyncExternalStore(
    subscribeShown,
    () => shown,
    () => null
  );
  return (
    <Modal open={route !== null} onClose={() => setShown(null)}>
      {route && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          <Steps route={route} />
          <button
            type="button"
            onClick={() => setShown(null)}
            className="h-11 w-full rounded-xl border border-border/60 bg-secondary/80 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
