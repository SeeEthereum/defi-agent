import type * as en from "../en/swap";

export const swap: typeof en.swap = {
  title: "Scambia",
  lede: "Il percorso migliore tra oltre 500 exchange. albicocca non aggiunge commissioni.",
  signInTitle: "Prima accedi",
  signInText: "Accedi per scambiare i tuoi token.",
  network: "Rete",

  slippageAutoChip: "Slippage auto",
  slippageChip: "Slippage {value}%",
  mevOn: "Protezione MEV attiva",
  slippage: "Slippage",
  slippageHelp: "Quanto può muoversi il prezzo prima che lo scambio venga annullato",
  auto: "Auto",
  customPlaceholder: "Altro %",
  customLabel: "Slippage personalizzato, in percentuale",
  gasPriority: "Priorità del gas",
  gasSlowHelp: "Commissione più bassa, conferma più lenta (circa 5 minuti)",
  gasFastHelp: "Commissione più alta, conferma più veloce (circa 15 secondi)",
  gasAverageHelp: "Equilibrio tra commissione e velocità (circa 1 minuto)",
  gasSlow: "Lenta",
  gasAverage: "Media",
  gasFast: "Veloce",
  mev: "Protezione MEV",
  mevHelp: "Protegge gli scambi grandi dai bot di front-running",
  mevUnavailable: "Non disponibile su {chain}. Funziona su Ethereum, BNB Chain e Base.",

  youPay: "Paghi",
  available: "Disponibile: <num>{amount}</num>",
  max: "Max",
  checkingBalance: "Controllo il saldo…",
  noneInWallet: "Non ne hai nel wallet",
  invalidAmount: "Inserisci un importo valido",
  flip: "Inverti i token da pagare e da ricevere",
  youReceive: "Ricevi",
  held: "Nel wallet: <num>{amount}</num>",
  quoteLoading: "Preventivo in arrivo",

  rate: "Tasso",
  minReceived: "Minimo ricevuto",
  priceImpact: "Impatto sul prezzo",
  networkFee: "Commissione di rete",
  route: "Percorso",

  dismiss: "Chiudi",
  txPending: "Transazione in attesa",
  txSent: "Transazione inviata",
  mevWasOn: "La protezione MEV era attiva.",
  viewExplorer: "Vedi nell'explorer",
  impactTooHigh: "L'impatto sul prezzo supera il 10%. Prova con un importo più basso.",
  impactAck:
    "Impatto sul prezzo di questo scambio: {impact}. Ricevi sensibilmente meno del tasso di mercato. Tocca per accettare e continuare.",
  result: {
    confirming: "Firmata e inviata. In attesa della conferma della rete…",
    broadcast: "Transazione trasmessa alla rete.",
    submitted: "Transazione inviata. Può volerci un momento prima che compaia on-chain.",
  },
  approvalNotConfirmed: {
    title: "Approvazione non confermata",
    message: "Approvazione non confermata, riprova",
  },
  priceMoved: {
    title: "Il prezzo si è mosso",
    message: "Il preventivo è scaduto o il prezzo è cambiato. Ne chiedo uno nuovo…",
  },

  gettingQuote: "Preventivo in arrivo…",
  refreshQuote: "Aggiorna preventivo",
  getQuote: "Chiedi un preventivo",
  quoteExpired: "Preventivo scaduto, aggiorna",
  approving: "Approvazione in corso…",
  confirmingApproval: "Approvazione in conferma…",
  swapping: "Scambio in corso…",
  swap: "Scambia",
  approveAndSwap: "Approva e scambia",
  notEnough: "{symbol} insufficiente",
  notEnoughBalance: "Saldo insufficiente",

  trendingTitle: "Di tendenza su {chain}",
  trendingSub: "Toccane uno per riceverlo",
  tokenUnusable: "Al momento questo token non si può usare. Provane un altro.",
  marketCap: "Cap. {value}",

  picker: {
    payingWith: "Paghi con {symbol}. Cambia token",
    receiving: "Ricevi {symbol}. Cambia token",
    choosePay: "Scegli il token con cui pagare",
    chooseReceive: "Scegli il token da ricevere",
    selectToken: "Scegli un token",
    payWith: "Paga con",
    receive: "Ricevi",
    search: "Cerca un nome o incolla un indirizzo",
    inWallet: "Nel tuo wallet",
    hint: "Scrivi il nome di un token, un simbolo o l'indirizzo di un contratto.",
    searching: "Ricerca in corso…",
    noResults: "Nessun token trovato su questa rete.",
  },

  errors: {
    insufficient: {
      title: "Saldo insufficiente",
      message:
        "Non hai abbastanza fondi per completare questo scambio. Prova con un importo più basso o aggiungi fondi al wallet.",
    },
    priceChanged: {
      title: "Il prezzo è cambiato",
      message: "Il prezzo si è mosso troppo mentre arrivava il preventivo. Riprova o usa un importo più basso.",
    },
    noLiquidity: {
      title: "Liquidità insufficiente",
      message: "Non c'è abbastanza liquidità per questa coppia. Prova con un importo più basso o con un altro token.",
    },
    approval: {
      title: "Approvazione necessaria",
      message: "Devi approvare questo token prima di scambiarlo. Basta farlo una volta per ogni token.",
    },
    timeout: {
      title: "Tempo scaduto",
      message: "La richiesta ha impiegato troppo tempo. Controlla la connessione e riprova.",
    },
    rateLimit: {
      title: "Troppe richieste",
      message: "Aspetta qualche secondo e riprova.",
    },
    extremeImpact: {
      title: "Impatto sul prezzo estremo",
      message:
        "Con questo scambio perderesti più del 90% del valore, perché sul mercato non c'è abbastanza liquidità. Prova con un importo molto più basso.",
    },
    simulation: {
      title: "Transazione non riuscita",
      message:
        "La simulazione mostra che la transazione fallirebbe on-chain. Di solito vuol dire che non hai abbastanza token per completare lo scambio. Controlla il saldo del wallet e riprova.",
    },
    region: {
      title: "Non disponibile nella tua zona",
      message: "Questo servizio non è disponibile nella tua zona.",
    },
    network: {
      title: "Errore di connessione",
      message: "Il server non è raggiungibile. Controlla la connessione a internet.",
    },
    service: {
      title: "Errore del servizio",
      message:
        "Il servizio di scambio ha dato un errore inatteso. La causa può essere un importo o una coppia di token non supportati, oppure un problema temporaneo. Riprova con valori diversi.",
    },
    generic: {
      title: "Scambio non riuscito",
      message: "Scambio non riuscito, riprova",
    },
  },

  sendState: {
    duplicate_in_flight: "Già in corso",
    duplicate_recent: "Già inviato",
    outcome_unknown: "Esito non ancora noto",
    risk_declined: "Annullato",
  },
};
