/** The wallet page: account, balances, activity, receive and send. */

export const wallet = {
  // Accounts sheet
  yourAccounts: "Your accounts",
  accountsLoadFailed: "Could not load your accounts",
  serverUnreachable: "Could not reach the server",
  renameFailed: "Could not rename the account",
  renamedTo: "Renamed to {name}",
  nameReset: "Name reset",
  networkError: "Network error",
  newNameFor: "New name for {name}",
  save: "Save",
  useOriginalName: "Use the original name, {name}",
  inUse: "In use",
  addressPending: "Address appears once you use it",
  renameNamed: "Rename {name}",
  use: "Use",
  namesHint: "Names are only visible to you in albicocca. Addresses and funds do not change.",

  // Account actions
  accountCreated: "New wallet account created!",
  addAccountFailed: "Failed to add account",
  accountSwitched: "Switched account!",
  switchAccountFailed: "Failed to switch account",
  balancesRefreshed: "Balances refreshed",
  refreshFailed: "Refresh failed",
  copyBlocked: "Copy blocked by the browser. Select the address instead.",

  // Signed out
  signInTitle: "Sign in first",
  signInText: "Connect your wallet to see balances and send funds.",

  // Sending
  txSent: "Transaction sent! Hash: {hash}",
  hashPending: "pending",
  transferFailed: "Transfer failed",
  notEnoughAfterFee: "Not enough {symbol} left after the network fee.",
  keptForFee: "Kept {amount} {symbol} for the network fee.",

  /** "Ethereum, Base and Arbitrum": the last two joined by the word for "and". */
  list: "{items} and {last}",

  // Confirm dialog
  confirmTitle: "Confirm transfer",
  chain: "Chain",
  token: "Token",
  amount: "Amount",
  recipient: "Recipient",
  sendNow: "Send now",

  // Header
  title: "Wallet",
  lede: "One address for {chains}.",
  receive: "Receive",
  send: "Send",
  defaultAccountName: "Wallet 1",
  renameAccount: "Rename this account",
  copyWalletAddress: "Copy wallet address",
  accounts: "Accounts",
  addAccount: "Add account",

  // Tabs
  views: "Wallet views",
  balances: "Balances",
  activity: "Activity",

  // Balances
  loading: "Loading…",
  chainsFunded: { one: "{count} of {total} chains hold funds", other: "{count} of {total} chains hold funds" },
  refreshing: "Refreshing…",
  refresh: "Refresh",
  totalValue: "Total value",
  noFundsTitle: "No funds yet",
  noFundsText: "Send crypto to your address on {chains}.",
  showAddress: "Show my address",
  noLending: "No lending",
  noPrice: "No price yet",
  nothingOn: "Nothing on {chains}.",

  // Activity
  recentActivity: "Recent activity",
  lastTxs: "Last 20 transactions",
  lastTxsSpam: { one: "Last 20 transactions, {count} look like spam", other: "Last 20 transactions, {count} look like spam" },
  noTxTitle: "No transactions yet",
  noTxText: "Transfers, swaps and approvals from this wallet will show up here.",
  spamShown: "Likely spam is shown. Never visit the sites in these token names.",
  spamHidden: {
    one: "{count} unsolicited token hidden. Their names advertise websites, a common phishing trick.",
    other: "{count} unsolicited tokens hidden. Their names advertise websites, a common phishing trick.",
  },
  hide: "Hide",
  show: "Show",
  statusDone: "Done",
  statusFailed: "Failed",
  statusPending: "Pending",
  unknownDate: "Unknown date",
  approveToken: "Approve {symbol}",
  receivedToken: "Received {symbol}",
  sentToken: "Sent {symbol}",
  contractNamed: "Contract · {name}",
  contractCall: "Contract call",
  networkFee: "Network fee {amount} {symbol}",
  likelySpam: "Likely spam",
  unknownNetwork: "Unknown network",

  // Receive
  yourAddress: "Your address",
  yourAddressSub: "The same on every supported chain",
  copyAddress: "Copy address",
  sendOnlyOn: "Send only on {chains}. Funds sent on another network may not reach this wallet.",
  scanTitle: "Scan to send",
  scanSub: "From a phone wallet",
  qrAlt: "QR code of your wallet address",

  // Send
  sendTitle: "Send tokens",
  sendSub: "You review everything before it leaves",
  noTokens: "No tokens found on this chain",
  available: "Available <num>{amount}</num> {symbol}",
  amountPlaceholder: "0.00",
  useMax: "Use maximum balance",
  max: "Max",
  invalidAmount: "Enter a valid amount",
  recipientAddress: "Recipient address",
  invalidAddress: "This is not a valid address",
  sending: "Sending…",
  reviewTransfer: "Review transfer",
  summary: "Summary",
  youSend: "You send",
  on: "On",
  to: "To",
  notSet: "Not set",
  irreversible: "Transfers cannot be undone. Check the address before you confirm.",
};
