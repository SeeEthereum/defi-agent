import { describe, expect, it } from "vitest";
import { installRoute, type InstallEnvironment } from "./install";

// Real user agents (late 2025 / 2026 releases).
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.40.92 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 595183916)",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.109;FBBV/617150010;FBDV/iPhone14,5]",
  // iPadOS asks for desktop sites by default: a Mac user agent with touch.
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macSafari18:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macSafari16:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  macEdge:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 Instagram 355.0.0.37.103 Android",
};

function route(userAgent: string, extra: Partial<InstallEnvironment> = {}) {
  return installRoute({ standalone: false, hasPrompt: false, maxTouchPoints: 0, userAgent, ...extra });
}

describe("installRoute", () => {
  it("offers nothing inside the installed app", () => {
    for (const ua of Object.values(UA)) {
      expect(route(ua, { standalone: true, hasPrompt: true, maxTouchPoints: 5 })).toBe("installed");
    }
  });

  it("uses the browser's own dialog whenever it handed one over", () => {
    expect(route(UA.macChrome, { hasPrompt: true })).toBe("prompt");
    expect(route(UA.androidChrome, { hasPrompt: true, maxTouchPoints: 5 })).toBe("prompt");
    expect(route(UA.macEdge, { hasPrompt: true })).toBe("prompt");
  });

  it("shows the Share steps on iPhone and iPad, in any iOS browser", () => {
    expect(route(UA.iphoneSafari, { maxTouchPoints: 5 })).toBe("ios");
    expect(route(UA.iphoneChrome, { maxTouchPoints: 5 })).toBe("ios");
    expect(route(UA.ipadSafari, { maxTouchPoints: 5 })).toBe("ios");
  });

  it("sends people in an app's built-in browser to Safari first", () => {
    expect(route(UA.iphoneInstagram, { maxTouchPoints: 5 })).toBe("ios-in-app");
    expect(route(UA.iphoneFacebook, { maxTouchPoints: 5 })).toBe("ios-in-app");
  });

  it("knows Safari on a Mac from an iPad with the same user agent", () => {
    expect(route(UA.macSafari18, { maxTouchPoints: 0 })).toBe("safari-mac");
    expect(route(UA.ipadSafari, { maxTouchPoints: 5 })).toBe("ios");
  });

  it("leaves out Safari before 17, which has no Add to Dock", () => {
    expect(route(UA.macSafari16)).toBe("none");
  });

  it("points Android browsers at their menu when there is no dialog to open", () => {
    expect(route(UA.androidChrome, { maxTouchPoints: 5 })).toBe("android-menu");
    expect(route(UA.androidFirefox, { maxTouchPoints: 5 })).toBe("android-menu");
  });

  it("offers nothing where installing is not possible", () => {
    expect(route(UA.androidWebView, { maxTouchPoints: 5 })).toBe("none");
    expect(route(UA.androidInstagram, { maxTouchPoints: 5 })).toBe("none");
    expect(route(UA.macFirefox)).toBe("none");
    // Chrome on a computer without the event: installed already, or not
    // eligible; its own address-bar button covers the rest.
    expect(route(UA.macChrome)).toBe("none");
    expect(route(UA.macEdge)).toBe("none");
  });
});
