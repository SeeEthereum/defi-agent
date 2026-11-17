/** Page chrome: search metadata, navigation, menus, theme, language, errors. */

export const meta = {
  title: "albicocca: ask your wallet",
  description:
    "An onchain agent with a wallet built in. Swap, bridge, earn and trade across six chains by asking for it. Sign in with Google, Apple or email, keys held in OKX's secure enclave, no seed phrase.",
  manifestDescription: "Ask your wallet. Swap, bridge, earn and trade across six chains by asking for it.",
};

export const common = {
  skipToContent: "Skip to content",
  tryAgain: "Try again",
  cancel: "Cancel",
  confirm: "Confirm",
  done: "Done",
  close: "Close",
  copy: "Copy",
  copied: "Copied",
  loading: "Loading",
  dashboard: "Dashboard",
  home: "Home",
};

export const nav = {
  assistant: "Assistant",
  dashboard: "Dashboard",
  wallet: "Wallet",
  swap: "Swap",
  bridge: "Bridge",
  earn: "Earn",
  trade: "Trade",
  signals: "Intelligence",
  security: "Security",
  more: "More",
  sections: "Sections",
  moreSections: "More sections",
  homeLabel: "albicocca, dashboard",
};

export const shell = {
  wallet: "Wallet",
  signOut: "Sign out",
  theme: "Theme",
  language: "Language",
  idleSignedOut:
    "You were signed out after 30 minutes without activity, so the server no longer holds your session. <link>Sign in again</link> to continue.",
  cantReach: "Can't reach the wallet service right now. Trying again…",
  offline:
    "You're offline. Balances and prices on screen may be out of date, and nothing can be sent until the connection is back.",
};

export const theme = {
  label: "Theme",
  auto: "Match system",
  dark: "Dark",
  light: "Light",
};

export const language = {
  label: "Language",
};

export const appError = {
  title: "This page stopped working",
  text: "If you had just confirmed a transaction, check Wallet activity before trying again.",
};

export const notFound = {
  title: "This page does not exist",
  text: "The link may be old or mistyped. Everything is one tap away from the dashboard.",
  back: "Go to the dashboard",
  welcome: "Go to albicocca",
};

export const pwa = {
  install: "Install app",
  dockTitle: "Add albicocca to your Dock",
  dockStep1: "In the menu bar, choose File, then Add to Dock.",
  dockStep2: "Click Add. albicocca opens in its own window, from the Dock or Launchpad.",
  androidTitle: "Install albicocca",
  androidStep1: "Open the browser menu: the three dots next to the address bar.",
  androidStep2: "Choose Install app, or Add to Home screen.",
  androidStep3: "Confirm. albicocca opens from its own icon, without the browser bars.",
  iosTitle: "Add albicocca to your Home Screen",
  iosInApp:
    "The browser inside this app cannot add websites to the Home Screen. Open this page in Safari first: look for Open in Safari in its menu, often behind the three dots.",
  iosStep1: "Tap the Share button: in Safari's toolbar, or in the address bar in Chrome.",
  iosStep2: "Scroll down and choose Add to Home Screen.",
  iosStep3: "Tap Add. albicocca now opens from its own icon, without the browser bars.",
  iosNote:
    "If the app asks you to sign in again, that is expected: iPhone and iPad keep an installed app's data apart from the browser's.",
  shortcutAssistant: "Assistant",
  shortcutWallet: "Wallet",
  shortcutSwap: "Swap",
};

export const chart = {
  title: "Value over time",
  sub: "All six chains, in US dollars",
  range: "Time range",
  rangeDay: "1D",
  rangeWeek: "1W",
  rangeMonth: "1M",
  rangeAll: "All",
  now: "Now",
  since: "since {when}",
  unavailableTitle: "History unavailable",
  unavailableText: "Your value history could not be loaded. It will try again by itself.",
  startsTodayTitle: "Your chart starts today",
  startsTodayText: "albicocca saves your total about once an hour while you use the app. Come back later to see it move.",
  noReadingsTitle: "No readings in this period",
  noReadingsText:
    "albicocca saves your total about once an hour while you use the app. Your readings go back to {date}: choose a longer period to see them.",
  foot: "Recorded while you use albicocca, about once an hour; dotted stretches had no readings. Changes include money sent in or out, not only price moves.",
  table: "Show as a table",
  when: "When",
  value: "Total value",
  summary: "Value from {from}: {first}, now {last}.",
  keys: "Use the left and right arrow keys to read each point.",
};
