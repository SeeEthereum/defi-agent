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
import { useT } from "@/i18n/client";
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
  const t = useT("pwa");
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
      {t("install")}
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
  const t = useT("pwa");
  if (route === "safari-mac") {
    return (
      <>
        <h2 className="text-base font-semibold text-foreground">{t("dockTitle")}</h2>
        <ol className="space-y-3">
          <Step icon="file">{t("dockStep1")}</Step>
          <Step icon="check">{t("dockStep2")}</Step>
        </ol>
      </>
    );
  }
  if (route === "android-menu") {
    return (
      <>
        <h2 className="text-base font-semibold text-foreground">{t("androidTitle")}</h2>
        <ol className="space-y-3">
          <Step icon="dots">{t("androidStep1")}</Step>
          <Step icon="install">{t("androidStep2")}</Step>
          <Step icon="check">{t("androidStep3")}</Step>
        </ol>
      </>
    );
  }
  return (
    <>
      <h2 className="text-base font-semibold text-foreground">{t("iosTitle")}</h2>
      {route === "ios-in-app" && <p className="text-[13px] text-muted-foreground">{t("iosInApp")}</p>}
      <ol className="space-y-3">
        <Step icon="share">{t("iosStep1")}</Step>
        <Step icon="add-square">{t("iosStep2")}</Step>
        <Step icon="check">{t("iosStep3")}</Step>
      </ol>
      <p className="text-[13px] text-muted-foreground">{t("iosNote")}</p>
    </>
  );
}

/** Mounted once by the app layout. */
export function InstallStepsHost() {
  const tc = useT("common");
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
            {tc("done")}
          </button>
        </div>
      )}
    </Modal>
  );
}
