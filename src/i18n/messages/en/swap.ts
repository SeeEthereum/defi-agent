/** swap: the swap ticket, its settings, the token picker and the trending list. */

export const swap = {
  title: "Swap",
  lede: "The best route across 500+ exchanges. albicocca adds no commission.",
  signInTitle: "Sign in first",
  signInText: "Connect your wallet to swap tokens.",
  network: "Network",

  // Settings (behind the slippage chip)
  slippageAutoChip: "Auto slippage",
  slippageChip: "{value}% slippage",
  mevOn: "MEV protection on",
  slippage: "Slippage",
  slippageHelp: "How far the price may move before the swap is cancelled",
  auto: "Auto",
  customPlaceholder: "Custom %",
  customLabel: "Custom slippage in percent",
  gasPriority: "Gas priority",
  gasSlowHelp: "Lower fee, slower (about 5 minutes)",
  gasFastHelp: "Higher fee, faster (about 15 seconds)",
  gasAverageHelp: "Balanced fee and speed (about 1 minute)",
  gasSlow: "Slow",
  gasAverage: "Average",
  gasFast: "Fast",
  mev: "MEV protection",
  mevHelp: "Shields large swaps from front-running bots",
  mevUnavailable: "Not available on {chain}. Works on Ethereum, BNB Chain and Base.",

  // Pay and receive
  youPay: "You pay",
  available: "<num>{amount}</num> available",
  max: "Max",
  checkingBalance: "Checking balance…",
  noneInWallet: "None in wallet",
  invalidAmount: "Enter a valid amount",
  flip: "Swap pay and receive tokens",
  youReceive: "You receive",
  held: "<num>{amount}</num> held",
  quoteLoading: "Getting a quote",

  // Quote summary
  rate: "Rate",
  minReceived: "Minimum received",
  priceImpact: "Price impact",
  networkFee: "Network fee",
  route: "Route",

  // Messages
  dismiss: "Dismiss",
  txPending: "Transaction pending",
  txSent: "Transaction sent",
  mevWasOn: "MEV protection was on.",
  viewExplorer: "View on the explorer",
  impactTooHigh: "The price impact is above 10%. Try a smaller amount.",
  impactAck:
    "This swap moves the price by {impact}. You get noticeably less than the market rate. Tap to accept and continue.",
  result: {
    confirming: "Signed and sent. Waiting for the network to confirm…",
    broadcast: "Transaction broadcast successfully!",
    submitted: "Transaction submitted. It may take a moment to appear on-chain.",
  },
  approvalNotConfirmed: {
    title: "Approval not confirmed",
    message: "Approval not confirmed, try again",
  },
  priceMoved: {
    title: "The price moved",
    message: "The quote expired or the price changed. Getting a fresh one…",
  },

  // Buttons
  gettingQuote: "Getting quote…",
  refreshQuote: "Refresh quote",
  getQuote: "Get quote",
  quoteExpired: "Quote expired, refresh",
  approving: "Approving…",
  confirmingApproval: "Confirming approval…",
  swapping: "Swapping…",
  swap: "Swap",
  approveAndSwap: "Approve and swap",
  notEnough: "Not enough {symbol}",
  notEnoughBalance: "Not enough balance",

  // Trending
  trendingTitle: "Trending on {chain}",
  trendingSub: "Tap one to receive it",
  tokenUnusable: "This token can’t be used right now. Try another one.",
  marketCap: "{value} market cap",

  // Token picker
  picker: {
    payingWith: "Paying with {symbol}. Change token",
    receiving: "Receiving {symbol}. Change token",
    choosePay: "Choose the token to pay with",
    chooseReceive: "Choose the token to receive",
    selectToken: "Select token",
    payWith: "Pay with",
    receive: "Receive",
    search: "Search a name or paste an address",
    inWallet: "In your wallet",
    hint: "Type a token name, a symbol or a contract address.",
    searching: "Searching…",
    noResults: "No tokens found on this network.",
  },

  // Errors the page explains itself (friendlyError)
  errors: {
    insufficient: {
      title: "Insufficient balance",
      message: "You don't have enough funds to complete this swap. Try reducing the amount or adding funds to your wallet.",
    },
    priceChanged: {
      title: "Price changed",
      message: "The price moved too much while getting your quote. Try again or use a smaller amount.",
    },
    noLiquidity: {
      title: "No liquidity",
      message: "There isn't enough liquidity for this trading pair. Try a smaller amount or a different token.",
    },
    approval: {
      title: "Approval required",
      message: "You need to approve this token before swapping. This is a one-time action per token.",
    },
    timeout: {
      title: "Request timeout",
      message: "The request took too long. Please check your connection and try again.",
    },
    rateLimit: {
      title: "Too many requests",
      message: "Please wait a few seconds and try again.",
    },
    extremeImpact: {
      title: "Extreme price impact",
      message:
        "This swap would lose more than 90% of your value due to insufficient market liquidity. Try a much smaller amount.",
    },
    simulation: {
      title: "Transaction failed",
      message:
        "The transaction was simulated and would fail on-chain. This usually means you don't have enough tokens to complete the swap. Check your wallet balance and try again.",
    },
    region: {
      title: "Region restricted",
      message: "This service is not available in your region.",
    },
    network: {
      title: "Network error",
      message: "Could not connect to the server. Please check your internet connection.",
    },
    service: {
      title: "Service error",
      message:
        "The swap service returned an unexpected error. This may be caused by an unsupported amount, token pair, or a temporary issue. Please try again with different parameters.",
    },
    generic: {
      title: "Swap failed",
      message: "Swap failed, please try again",
    },
  },

  // Titles for answers that say whether money may already have moved (lib/api/send-state)
  sendState: {
    duplicate_in_flight: "Already in progress",
    duplicate_recent: "Already sent",
    outcome_unknown: "Result not known yet",
    risk_declined: "Cancelled",
  },
};
