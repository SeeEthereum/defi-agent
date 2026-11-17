import type * as en from "../en/widgets";

export const riskConfirm: typeof en.riskConfirm = {
  title: "Il wallet ha segnalato questa transazione",
  intro: "Non è stato ancora firmato nulla. Qui sotto trovi l'avviso di OKX, parola per parola. Invia solo se lo capisci e vuoi comunque andare avanti.",
  noReason: "Il wallet non ha detto il motivo.",
  sendAnyway: "Invia comunque",
};

export const approvalCode: typeof en.approvalCode = {
  title: "Inserisci il codice di OKX",
  defaultMessage: "OKX ha inviato un codice di 6 cifre all'email del tuo account.",
  note: "Non viene inviato nulla finché il codice non è giusto. Questo controllo c'è perché hai attivato la verifica delle approvazioni su OKX.",
  codeLabel: "Codice di 6 cifre",
  sending: "Invio in corso…",
  sendNew: "Invia un nuovo codice",
  newCodeSent: "Il nuovo codice è in arrivo.",
  sendFailed: "Non è stato possibile inviare il codice.",
};

export const gasStation: typeof en.gasStation = {
  titleUnavailable: "Gas Station non disponibile",
  titleAsk: "Vuoi pagare il gas con una stablecoin?",
  insufficientAll: "Nessuna delle tue stablecoin su questa rete basta a coprire la commissione. Aggiungi fondi, poi riprova.",
  hasPendingTx: "Un'altra transazione del tuo wallet è ancora in sospeso su questa rete. Aspetta che finisca, poi riprova.",
  notSupportIntention:
    "Questo tipo di transazione non può pagare la commissione con una stablecoin. Aggiungi un po' della moneta nativa della rete per la commissione, poi riprova.",
  unavailableDefault: "Gas Station non può pagare la commissione di questa transazione. Riprova più tardi.",
  explain:
    "Non hai abbastanza {nativeCoin} per pagare la commissione di rete (gas) su {network}. Gas Station può pagarla al posto tuo e addebitarti la commissione in una stablecoin. C'è una commissione di servizio nel token scelto: non è gratis. <link>Scopri di più</link>",
  thisNetwork: "questa rete",
  nativeCoin: "moneta nativa",
  details: "Dettagli dal servizio del wallet",
  unknownToken: "Token sconosciuto",
  balance: "Saldo {amount}",
  noneEnough: "Nessuna stablecoin su questa rete ha un saldo sufficiente a coprire la commissione. Ricarica il wallet e riprova.",
  activationNote:
    "L'attivazione fa partire una configurazione una tantum su questa rete (il costo è compreso in questa transazione). Dopo, quando il saldo della moneta nativa è basso, il gas viene pagato in automatico con la stablecoin scelta, senza altre richieste.",
  setupFailed: "Configurazione di Gas Station non riuscita. Riprova.",
  settingUp: "Configurazione in corso…",
  enableRetry: "Attiva e riprova",
  useTokenRetry: "Usa il token e riprova",
};

export const protections: typeof en.protections = {
  title: "Protezioni impostate su OKX",
  subSince: "Aggiornate al tuo accesso del {date}. Solo tu puoi cambiarle, su OKX.",
  sub: "Solo tu puoi cambiarle, su OKX.",
  change: "Cambia su OKX",
  afterSignIn: "Le vedrai dopo il prossimo accesso.",
  unavailable: "OKX non le ha comunicate all'accesso. Controllale su OKX.",
  perTransaction: "Per transazione",
  transfers: "Trasferimenti",
  trades: "Scambi",
  approvalCode: "Codice di approvazione via email",
  allowedOnly: "Solo indirizzi consentiti",
  notSet: "Non impostato",
  notReported: "Non comunicato",
  on: "Attivo",
  off: "Disattivato",
  perDay: "{limit} al giorno",
  perDayUsed: "{limit} al giorno, {used} usati oggi",
  whitelistOn: { one: "Attivo, {count} indirizzo", other: "Attivo, {count} indirizzi" },
  serverNote:
    "Questo server firma per te finché il tuo accesso è attivo. Un limite su OKX fissa un tetto a quanto può spostare una singola transazione, qualunque cosa succeda qui; il codice di approvazione copre le approvazioni dei token, che i limiti non coprono.",
};

export const picker: typeof en.picker = {
  search: "Cerca",
};

export const ui: typeof en.ui = {
  notAvailable: "n/d",
};
