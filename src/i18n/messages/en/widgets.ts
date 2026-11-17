/**
 * Shared widgets: the wallet's risk warning, OKX's approval code prompt,
 * the Gas Station picker, the OKX protections panel, and the built-in
 * words of the generic building blocks (picker, premium, ui). Close,
 * Cancel and Confirm come from `common`.
 */

/** components/risk-confirm: the wallet flagged a transaction before signing. */
export const riskConfirm = {
  title: "The wallet flagged this transaction",
  intro: "Nothing has been signed yet. This is OKX's warning, word for word. Send only if you understand it and still want to go ahead.",
  noReason: "The wallet did not say why.",
  sendAnyway: "Send anyway",
};

/** components/approval-code-prompt: OKX holds a token approval until the emailed code is typed. */
export const approvalCode = {
  title: "Enter the code from OKX",
  defaultMessage: "OKX sent a 6-digit code to the email of your account.",
  note: "Nothing is sent until the code is right. This check is on because you turned on approval verification in OKX.",
  codeLabel: "6-digit code",
  sending: "Sending…",
  sendNew: "Send a new code",
  newCodeSent: "A new code is on its way.",
  sendFailed: "The code could not be sent.",
};

/** components/gas-station-modal: pay gas with a stablecoin when native gas is missing. */
export const gasStation = {
  titleUnavailable: "Gas Station unavailable",
  titleAsk: "Pay gas with a stablecoin?",
  insufficientAll: "None of your stablecoins on this network has enough to cover the fee. Add some funds, then try again.",
  hasPendingTx: "Another transaction from your wallet is still pending on this network. Wait for it to finish, then try again.",
  notSupportIntention:
    "This kind of transaction can't pay its fee with a stablecoin. Add some of the network's own coin for the fee, then try again.",
  unavailableDefault: "Gas Station can't pay the fee for this transaction. Try again later.",
  explain:
    "You don't have enough {nativeCoin} to pay the network fee (gas) on {network}. Gas Station can pay it for you and charge the fee in a stablecoin instead. A service fee in the selected token applies: it is not free. <link>Learn more</link>",
  thisNetwork: "this network",
  nativeCoin: "native coin",
  details: "Details from the wallet service",
  unknownToken: "Unknown token",
  balance: "Balance {amount}",
  noneEnough: "No stablecoin on this chain has enough balance to cover the fee. Top up your wallet and try again.",
  activationNote:
    "Enabling runs a one-time setup on this chain (its cost is bundled into this transaction). Afterwards, when your native balance is low, gas is paid with the chosen stablecoin automatically, with no further prompts.",
  setupFailed: "Gas Station setup failed. Please try again.",
  settingUp: "Setting up…",
  enableRetry: "Enable & retry",
  useTokenRetry: "Use token & retry",
};

/** components/okx-protections: limits, whitelist and approval verification as OKX reported them. */
export const protections = {
  title: "Protection set at OKX",
  subSince: "As of your sign-in on {date}. Only you can change it, on OKX.",
  sub: "Only you can change it, on OKX.",
  change: "Change at OKX",
  afterSignIn: "Shown after your next sign-in.",
  unavailable: "OKX did not report it at sign-in. Check it at OKX.",
  perTransaction: "Per transaction",
  transfers: "Transfers",
  trades: "Trades",
  approvalCode: "Approval code by email",
  allowedOnly: "Allowed addresses only",
  notSet: "Not set",
  notReported: "Not reported",
  on: "On",
  off: "Off",
  perDay: "{limit} a day",
  perDayUsed: "{limit} a day, {used} used today",
  whitelistOn: { one: "On, {count} address", other: "On, {count} addresses" },
  serverNote:
    "This server signs for you while you are signed in. A limit at OKX caps what any single transaction can move, whatever happens here; the approval code covers token approvals, which limits do not.",
};

/** components/premium/picker: the searchable chooser's own words. */
export const picker = {
  search: "Search",
};

/** components/premium and components/ui: the generic blocks' own words. */
export const ui = {
  notAvailable: "n/a",
};
