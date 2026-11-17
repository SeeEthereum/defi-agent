import type * as en from "../en/wallet";

export const wallet: typeof en.wallet = {
  // Accounts sheet
  yourAccounts: "I tuoi account",
  accountsLoadFailed: "I tuoi account non si sono caricati",
  serverUnreachable: "Server non raggiungibile",
  renameFailed: "Impossibile rinominare l'account",
  renamedTo: "Nuovo nome: {name}",
  nameReset: "Nome originale ripristinato",
  networkError: "Errore di rete",
  newNameFor: "Nuovo nome per {name}",
  save: "Salva",
  useOriginalName: "Usa il nome originale, {name}",
  inUse: "In uso",
  addressPending: "L'indirizzo compare al primo uso",
  renameNamed: "Rinomina {name}",
  use: "Usa",
  namesHint: "Questi nomi li vedi solo tu, e solo in albicocca. Indirizzi e fondi non cambiano.",

  // Account actions
  accountCreated: "Nuovo account del wallet creato",
  addAccountFailed: "Impossibile aggiungere l'account",
  accountSwitched: "Account cambiato",
  switchAccountFailed: "Impossibile cambiare account",
  balancesRefreshed: "Saldi aggiornati",
  refreshFailed: "Aggiornamento non riuscito",
  copyBlocked: "Il browser ha bloccato la copia. Seleziona l'indirizzo a mano.",

  // Signed out
  signInTitle: "Prima accedi",
  signInText: "Dopo l'accesso qui vedi i saldi e puoi inviare fondi.",

  // Sending
  txSent: "Transazione inviata. Hash: {hash}",
  hashPending: "in attesa",
  transferFailed: "Trasferimento non riuscito",
  notEnoughAfterFee: "Dopo la commissione di rete non resta abbastanza {symbol}.",
  keptForFee: "{amount} {symbol} tenuti da parte per la commissione di rete.",

  list: "{items} e {last}",

  // Confirm dialog
  confirmTitle: "Conferma il trasferimento",
  chain: "Rete",
  token: "Token",
  amount: "Importo",
  recipient: "Destinatario",
  sendNow: "Invia ora",

  // Header
  title: "Wallet",
  lede: "Un solo indirizzo per {chains}.",
  receive: "Ricevi",
  send: "Invia",
  defaultAccountName: "Wallet 1",
  renameAccount: "Rinomina questo account",
  copyWalletAddress: "Copia l'indirizzo del wallet",
  accounts: "Account",
  addAccount: "Aggiungi account",

  // Tabs
  views: "Sezioni del wallet",
  balances: "Saldi",
  activity: "Attività",

  // Balances
  loading: "Caricamento…",
  chainsFunded: { one: "{count} rete su {total} ha fondi", other: "{count} reti su {total} hanno fondi" },
  refreshing: "Aggiornamento…",
  refresh: "Aggiorna",
  totalValue: "Valore totale",
  noFundsTitle: "Ancora nessun fondo",
  noFundsText: "Invia crypto al tuo indirizzo su {chains}.",
  showAddress: "Mostra il mio indirizzo",
  noLending: "Senza rendimenti",
  noPrice: "Nessun prezzo per ora",
  nothingOn: "Nessun fondo su {chains}.",

  // Activity
  recentActivity: "Attività recente",
  lastTxs: "Ultime 20 transazioni",
  lastTxsSpam: { one: "Ultime 20 transazioni, {count} sembra spam", other: "Ultime 20 transazioni, {count} sembrano spam" },
  noTxTitle: "Ancora nessuna transazione",
  noTxText: "Qui vedrai trasferimenti, scambi e approvazioni di questo wallet.",
  spamShown: "Ora vedi anche il probabile spam. Non visitare mai i siti scritti nei nomi di questi token.",
  spamHidden: {
    one: "Nascosto {count} token non richiesto: il suo nome pubblicizza un sito web, un classico trucco di phishing.",
    other: "Nascosti {count} token non richiesti: i loro nomi pubblicizzano siti web, un classico trucco di phishing.",
  },
  hide: "Nascondi",
  show: "Mostra",
  statusDone: "Completata",
  statusFailed: "Non riuscita",
  statusPending: "In attesa",
  unknownDate: "Data sconosciuta",
  approveToken: "Approvazione {symbol}",
  receivedToken: "Ricevuto {symbol}",
  sentToken: "Inviato {symbol}",
  contractNamed: "Contratto · {name}",
  contractCall: "Chiamata a contratto",
  networkFee: "Commissione di rete {amount} {symbol}",
  likelySpam: "Probabile spam",
  unknownNetwork: "Rete sconosciuta",

  // Receive
  yourAddress: "Il tuo indirizzo",
  yourAddressSub: "Lo stesso su tutte le reti supportate",
  copyAddress: "Copia l'indirizzo",
  sendOnlyOn: "Invia solo su {chains}. I fondi inviati su un'altra rete potrebbero non arrivare a questo wallet.",
  scanTitle: "Scansiona per inviare",
  scanSub: "Da un wallet sul telefono",
  qrAlt: "Codice QR dell'indirizzo del tuo wallet",

  // Send
  sendTitle: "Invia token",
  sendSub: "Controlli tutto prima che parta",
  noTokens: "Nessun token trovato su questa rete",
  available: "Disponibile: <num>{amount}</num> {symbol}",
  amountPlaceholder: "0,00",
  useMax: "Usa il massimo disponibile",
  max: "Max",
  invalidAmount: "Inserisci un importo valido",
  recipientAddress: "Indirizzo del destinatario",
  invalidAddress: "Questo indirizzo non è valido",
  sending: "Invio in corso…",
  reviewTransfer: "Controlla il trasferimento",
  summary: "Riepilogo",
  youSend: "Importo",
  on: "Rete",
  to: "Destinatario",
  notSet: "Da inserire",
  irreversible: "I trasferimenti sono irreversibili. Controlla l'indirizzo prima di confermare.",
};
