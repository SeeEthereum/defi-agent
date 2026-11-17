/**
 * Italian for the messages the API sends.
 *
 * The server keeps working in English: its logs, its checks on upstream
 * text (lib/api/validation SAFE_MESSAGE_PATTERNS) and its tests stay as
 * they are. Translation happens on the way out: withSession runs every
 * JSON answer through localizeResponse, which swaps the English of its
 * message fields (error, suggestion, message) for the visitor's language.
 * A message this table does not know goes out in English, unchanged.
 *
 * Exact strings first, then patterns for messages with a number, a name or
 * an upstream reason inside. The pages recognise some of these by their
 * words (lib/api/send-state): send-state.test.ts checks that the Italian
 * ones are recognised too.
 *
 * Plain module: the browser uses it too, for the "Cancelled" answers it
 * makes up itself (lib/api/risk-retry, approval-code-retry).
 */

import type { Locale } from "./config";

const EXACT: Record<string, string> = {
  // Session, sign-in, limits
  "Session expired. Reload the page.": "Sessione scaduta. Ricarica la pagina.",
  "Not logged in. Please sign in first.": "Non hai fatto l'accesso. Accedi prima di continuare.",
  "Sign in first.": "Prima accedi.",
  "Your session could not be opened. Please sign in again.": "Non è stato possibile aprire la tua sessione. Accedi di nuovo.",
  "Could not check your sign-in right now.": "In questo momento non riesco a verificare il tuo accesso.",
  "Sign-in could not start. Please try again.": "L'accesso non è partito. Riprova.",
  "Login service did not return a sign-in link.": "Il servizio di accesso non ha restituito il link. Riprova.",
  "Too many sign-ins are in progress right now. Try again in a minute.": "Ci sono troppi accessi in corso in questo momento. Riprova tra un minuto.",
  "Logout failed": "Uscita non riuscita",
  "Too many requests, slow down.": "Troppe richieste, rallenta un attimo.",
  "Too many quotes, slow down.": "Troppi preventivi, rallenta un attimo.",
  "Too many attempts, wait a minute.": "Troppi tentativi, aspetta un minuto.",
  "Too many wallet requests at once from this browser. Wait a few seconds and try again.":
    "Troppe richieste al wallet insieme da questo browser. Aspetta qualche secondo e riprova.",
  "Requests must come from the albicocca app.": "Le richieste devono arrivare dall'app albicocca.",
  "Service is not available in your region. Please switch to a supported region and try again.":
    "Il servizio non è disponibile nella tua zona. Passa a una zona supportata e riprova.",

  // Wallet backend and market data
  "The wallet backend did not answer in time. Please try again.": "Il servizio del wallet non ha risposto in tempo. Riprova.",
  "Unexpected output from the wallet backend. Please try again.": "Il servizio del wallet ha dato una risposta inattesa. Riprova.",
  "Market data quota exceeded. Please try again later.": "Quota dei dati di mercato esaurita. Riprova più tardi.",
  "Market data is not configured on this server.": "I dati di mercato non sono configurati su questo server.",
  "OKX did not answer. Please try again.": "OKX non ha risposto. Riprova.",
  "OKX is busy. Try again in a few seconds.": "OKX è sotto carico. Riprova tra qualche secondo.",
  "OKX sent an unreadable answer. Please try again.": "OKX ha mandato una risposta illeggibile. Riprova.",
  "OKX asks for a payment for this data.": "OKX chiede un pagamento per questi dati.",
  "No price data found for this token.": "Nessun prezzo trovato per questo token.",
  "A search query is required.": "Scrivi cosa cercare.",
  "A token address is required.": "Serve l'indirizzo del token.",
  "A wallet address is required for this tracker.": "Per questo tracker serve l'indirizzo di un wallet.",
  "Tokens or an address are required.": "Servono dei token o un indirizzo.",
  "Too many tokens (max 10 per scan).": "Troppi token (al massimo 10 per controllo).",

  // The browser could not reach the server, or got no JSON back
  "Could not reach the server. Try again.": "Non riesco a raggiungere il server. Riprova.",

  // Generic failures (route fallbacks)
  "Request failed": "Richiesta non riuscita",
  "Quote failed": "Preventivo non riuscito",
  "Swap failed": "Scambio non riuscito",
  "Approve failed": "Approvazione non riuscita",
  "Approval failed": "Approvazione non riuscita",
  "Supply failed": "Deposito non riuscito",
  "Withdraw failed": "Prelievo non riuscito",
  "Transfer failed": "Trasferimento non riuscito",
  "Bridge execution failed": "Bridge non riuscito",
  "Failed to get bridge quote": "Preventivo del bridge non riuscito",
  "Failed to get bridge status": "Non riesco a leggere lo stato del bridge",
  "Failed to get bridge tokens": "Non riesco a caricare i token del bridge",
  "Failed to fetch portfolio PnL": "Non riesco a caricare il PnL del portafoglio",
  "Failed to fetch trending tokens": "Non riesco a caricare i token di tendenza",
  "Fetch markets failed": "Non riesco a caricare i mercati",
  "Fetch positions failed": "Non riesco a caricare le posizioni",
  "Token search failed": "Ricerca dei token non riuscita",
  "Signal query failed": "Non riesco a caricare i segnali",
  "Leaderboard query failed": "Non riesco a caricare la classifica",
  "Tracker query failed": "Non riesco a caricare il tracker",
  "Price query failed": "Non riesco a caricare il prezzo",
  "Kline query failed": "Non riesco a caricare il grafico",
  "Hyperliquid request failed": "Richiesta a Hyperliquid non riuscita",
  "Could not load your accounts": "Non riesco a caricare i tuoi account",
  "Could not rename the account": "Non riesco a rinominare l'account",
  "Could not load your value history.": "Non riesco a caricare lo storico del valore.",
  "Could not read your allowance": "Non riesco a leggere le tue domande disponibili",
  "That account is not yours.": "Questo account non è tuo.",
  "Unknown range": "Periodo sconosciuto",
  "Unknown market": "Mercato sconosciuto",
  "Unknown swap.": "Scambio sconosciuto.",
  "Unknown gas token for this chain": "Token per il gas sconosciuto su questa rete",
  "No position to withdraw": "Nessuna posizione da prelevare",
  "Limit orders require a price": "Gli ordini limite hanno bisogno di un prezzo",
  "At least one of slPx or tpPx is required": "Indica almeno uno tra stop loss e take profit",

  // Quotes and signing
  "Missing quote. Refresh the quote and try again.": "Manca il preventivo. Aggiornalo e riprova.",
  "Unknown quote. Refresh the quote and try again.": "Preventivo sconosciuto. Aggiornalo e riprova.",
  "Quote expired. Refresh the quote and try again.": "Il preventivo è scaduto. Aggiornalo e riprova.",
  "Quote does not match this request. Refresh the quote.": "Il preventivo non corrisponde a questa richiesta. Aggiornalo.",
  "Price moved since the quote. Refresh and try again.": "Il prezzo è cambiato dal preventivo. Aggiorna e riprova.",
  "Security check unavailable, transaction not sent": "Controllo di sicurezza non disponibile, transazione non inviata",
  "The swap service did not return transaction data. The pair or amount may not be supported.":
    "Il servizio di scambio non ha restituito i dati della transazione. La coppia o l'importo potrebbero non essere supportati.",
  "Transaction was sent but reverted on-chain. You may have insufficient balance or the price moved too much.":
    "La transazione è partita ma è stata annullata on-chain. Forse il saldo non bastava o il prezzo si è mosso troppo.",
  "Transaction signed and broadcast. Waiting for on-chain confirmation.": "Transazione firmata e inviata. In attesa della conferma on-chain.",
  "The wallet flagged this transaction as risky. Confirm to send it anyway.":
    "Il wallet ha segnalato questa transazione come rischiosa. Conferma per inviarla comunque.",

  // Send state (lib/api/send-state): must keep their meaning exactly
  "This request is already being processed. Wait for it to finish.": "Questa richiesta è già in corso. Aspetta che finisca.",
  "The wallet backend did not answer in time. The transaction may still go through: check Wallet activity before trying again.":
    "Il servizio del wallet non ha risposto in tempo. La transazione potrebbe comunque andare a buon fine: controlla l'attività del wallet prima di riprovare.",
  "Cancelled. Nothing was sent.": "Annullato. Non è stato inviato nulla.",
  "Too many attempts. Nothing was sent. Start again.": "Troppi tentativi. Non è stato inviato nulla. Ricomincia da capo.",

  // Bridge
  "Bridge quote did not match the request": "Il preventivo del bridge non corrisponde alla richiesta",
  "Bridge service did not return transaction data. The route may not be supported.":
    "Il servizio di bridge non ha restituito i dati della transazione. Il percorso potrebbe non essere supportato.",
  "Bridge transaction reverted on-chain. The route may have changed — try again in a few seconds.":
    "La transazione di bridge è stata annullata on-chain. Il percorso potrebbe essere cambiato: riprova tra qualche secondo.",
  "Approval transaction reverted. You may have insufficient balance for gas.":
    "La transazione di approvazione è stata annullata. Forse il saldo non basta per il gas.",
  "Approval confirmation timed out after 40 s. Please retry — the approve may still be pending.":
    "La conferma dell'approvazione non è arrivata in 40 secondi. Riprova: l'approvazione potrebbe essere ancora in attesa.",
  "Unexpected bridge spender": "Contratto del bridge inatteso",
  "Bridging from this network is not available yet. Nothing was sent.": "Il bridge da questa rete non è ancora disponibile. Non è stato inviato nulla.",
  "The bridge asked to approve a contract we don't recognize, so nothing was sent.":
    "Il bridge ha chiesto di approvare un contratto che non riconosciamo, quindi non è stato inviato nulla.",
  "The bridge route points to a contract we don't recognize, so it was not sent.":
    "Il percorso del bridge porta a un contratto che non riconosciamo, quindi non è stato inviato.",
  "The bridge quote has no guaranteed minimum, so it was not sent. Get a new quote.":
    "Il preventivo del bridge non ha un minimo garantito, quindi non è stato inviato. Chiedi un nuovo preventivo.",
  "Bridge service request failed": "Richiesta al servizio di bridge non riuscita",
  "Bridge service returned an unexpected response": "Il servizio di bridge ha dato una risposta inattesa",

  // Confidential swaps (NEAR Intents)
  "Confidential swaps are not configured on this server.": "Gli scambi riservati non sono configurati su questo server.",
  "The confidential swap service did not respond.": "Il servizio di scambio riservato non ha risposto.",
  "The confidential swap service returned no quote.": "Il servizio di scambio riservato non ha dato un preventivo.",
  "Unknown swap status.": "Stato dello scambio sconosciuto.",
  "This token is not available for confidential swaps.": "Questo token non è disponibile per gli scambi riservati.",
  "Pick a different token or network to receive.": "Scegli un altro token o un'altra rete da ricevere.",
  "Enter a valid address (0x followed by 40 hex characters).": "Inserisci un indirizzo valido (0x seguito da 40 caratteri esadecimali).",
  "That is the zero address. Funds sent there are lost.": "Questo è l'indirizzo zero. I fondi inviati lì vanno persi.",
  "This address fails its checksum. Check it for typos.": "Il controllo di questo indirizzo non torna. Verifica che non ci siano errori di battitura.",
  "This is the wallet you are sending from. Use a different address to keep the swap private.":
    "Questo è il wallet da cui stai inviando. Usa un altro indirizzo per mantenere lo scambio riservato.",

  // Approval codes (lib/okx/approval-code)
  "OKX sent a 6-digit code to the email of your account. Enter it to send this approval.":
    "OKX ha inviato un codice di 6 cifre all'email del tuo account. Inseriscilo per inviare questa approvazione.",
  "This approval needs the code OKX sent to your email.": "Questa approvazione richiede il codice che OKX ha inviato alla tua email.",
  "The code has 6 digits": "Il codice ha 6 cifre",
  "That code is not right. Check the email from OKX and try again, or ask for a new code.":
    "Il codice non è giusto. Controlla l'email di OKX e riprova, oppure chiedi un nuovo codice.",
  "The code has expired. Ask for a new one.": "Il codice è scaduto. Chiedine uno nuovo.",
  "Too many wrong codes. Wait 10 minutes, then start again.": "Troppi codici sbagliati. Aspetta 10 minuti, poi ricomincia da capo.",
  "A code was sent a moment ago. Wait a minute before asking for another.": "Un codice è appena partito. Aspetta un minuto prima di chiederne un altro.",
  "OKX could not send the code. Nothing was sent. Try again.": "OKX non è riuscito a inviare il codice. Non è stato inviato nulla. Riprova.",
  "OKX could not check the code. Nothing was sent. Try again.": "OKX non è riuscito a verificare il codice. Non è stato inviato nulla. Riprova.",
  "This approval is no longer waiting for a code. Start again.": "Questa approvazione non aspetta più un codice. Ricomincia da capo.",
  "This approval waited too long and was dropped. Start again.": "Questa approvazione ha aspettato troppo ed è stata scartata. Ricomincia da capo.",
  "The account changed since the code was sent. Start again.": "L'account è cambiato da quando è partito il codice. Ricomincia da capo.",
  "Approval verification is not available right now. Nothing was sent. Try again.":
    "La verifica delle approvazioni non è disponibile in questo momento. Non è stato inviato nulla. Riprova.",
  "OKX flagged this approval after the code was checked, so it was not sent.":
    "OKX ha segnalato questa approvazione dopo aver verificato il codice, quindi non è stata inviata.",
  "The approval was not sent. Try again.": "L'approvazione non è stata inviata. Riprova.",
  "The approval was sent and is still confirming. Wait a minute, then start again.":
    "L'approvazione è partita ed è ancora in attesa di conferma. Aspetta un minuto, poi ricomincia da capo.",
  "The approval was sent but failed on chain. Nothing else was sent.":
    "L'approvazione è partita ma non è riuscita on-chain. Non è stato inviato nient'altro.",
  "The code could not be sent. Try again.": "Il codice non è partito. Riprova.",
  "Too many new codes. Wait a few minutes.": "Troppi codici nuovi. Aspetta qualche minuto.",

  // Assistant
  "Write a question first.": "Prima scrivi una domanda.",
  "You have used today's questions.": "Hai usato tutte le domande di oggi.",
  "Sign in to use the assistant.": "Accedi per usare l'assistente.",
  "The assistant is unavailable right now. This question was not counted.":
    "L'assistente non è disponibile in questo momento. Questa domanda non è stata contata.",
};

type Pattern = [RegExp, (m: RegExpMatchArray) => string];

/** What a security scan flagged, as the Italian sentence names it. */
const FLAGGED_IT: Record<string, string> = {
  swap: "questo scambio",
  bridge: "questo bridge",
  transaction: "questo invio",
  "destination token": "il token di destinazione",
};

const PATTERNS: Pattern[] = [
  [
    /^The same request went through (\d+) seconds? ago\. Check Wallet activity; to repeat it on purpose, wait a minute and try again\.$/,
    (m) => `La stessa richiesta è partita ${m[1]} secondi fa. Controlla l'attività del wallet; se vuoi ripeterla davvero, aspetta un minuto e riprova.`,
  ],
  [/^Too many sign-in attempts\. Try again in (\d+) minutes?\.$/, (m) => `Troppi tentativi di accesso. Riprova tra ${m[1]} ${m[1] === "1" ? "minuto" : "minuti"}.`],
  [/^Keep questions under (\d+) characters\.$/, (m) => `Scrivi domande sotto i ${m[1]} caratteri.`],
  [
    /^Security scan flagged this (swap|bridge|transaction|destination token) as high risk: (.+)\. Nothing was sent\.$/,
    (m) => `Il controllo di sicurezza ha segnalato ${FLAGGED_IT[m[1]]} come ad alto rischio: ${m[2]}. Non è stato inviato nulla.`,
  ],
  [
    /^The bridge quote could pay out more than (.+) below its estimate, so it was not sent\. Get a new quote\.$/,
    (m) => `Il preventivo del bridge potrebbe pagare più del ${m[1]} in meno della stima, quindi non è stato inviato. Chiedi un nuovo preventivo.`,
  ],
  [/^Failed to approve token for bridge: (.+)$/, (m) => `Approvazione del token per il bridge non riuscita: ${m[1]}`],
  [/^Unknown chain: (.+)$/, (m) => `Rete sconosciuta: ${m[1]}`],
  [/^Unsupported chain: (.+)$/, (m) => `Rete non supportata: ${m[1]}`],
  [/^Unknown source chain: (.+)$/, (m) => `Rete di partenza sconosciuta: ${m[1]}`],
  [
    /^Position opened but TP\/SL failed: (.+)\. Attach manually via the TP\/SL panel\.$/,
    (m) => `Posizione aperta, ma stop loss e take profit non sono stati impostati: ${m[1]}. Aggiungili a mano dal pannello TP/SL.`,
  ],
];

/** The message in the visitor's language, or as it is when there is no translation. */
export function translateApiMessage(text: string, locale: Locale): string {
  if (locale === "en" || typeof text !== "string" || text === "") return text;
  const exact = EXACT[text.trim()];
  if (exact) return exact;
  for (const [pattern, render] of PATTERNS) {
    const match = text.trim().match(pattern);
    if (match) return render(match);
  }
  return text;
}

/** Every English message with a translation, for tests. */
export const TRANSLATED_MESSAGES = Object.keys(EXACT);

const BACK_TO_ENGLISH = new Map(Object.entries(EXACT).map(([english, italian]) => [italian, english]));

const PATTERNS_BACK: Pattern[] = [
  [
    /^La stessa richiesta è partita (\d+) secondi fa\. Controlla l'attività del wallet; se vuoi ripeterla davvero, aspetta un minuto e riprova\.$/,
    (m) => `The same request went through ${m[1]} seconds ago. Check Wallet activity; to repeat it on purpose, wait a minute and try again.`,
  ],
  [
    /^Il controllo di sicurezza ha segnalato (questo scambio|questo bridge|questo invio|il token di destinazione) come ad alto rischio: (.+)\. Non è stato inviato nulla\.$/,
    (m) => `Security scan flagged this ${Object.entries(FLAGGED_IT).find(([, it]) => it === m[1])![0]} as high risk: ${m[2]}. Nothing was sent.`,
  ],
];

/**
 * A translated message back in the API's English. The pages that choose
 * what to show by the words of a server message (lib/api/send-state, the
 * swap page's error explanations) read this, so they decide exactly as
 * before whatever the language. Unknown text comes back as it is.
 */
export function toEnglishApiMessage(text: string): string {
  if (typeof text !== "string") return text;
  const exact = BACK_TO_ENGLISH.get(text.trim());
  if (exact) return exact;
  for (const [pattern, render] of PATTERNS_BACK) {
    const match = text.trim().match(pattern);
    if (match) return render(match);
  }
  return text;
}

/** The page's language in the browser (<html lang>), for messages made outside React. */
export function documentLocale(): Locale {
  return typeof document !== "undefined" && document.documentElement.lang === "it" ? "it" : "en";
}

const MESSAGE_FIELDS = ["error", "suggestion", "message"] as const;
const MAX_LOCALIZED_BYTES = 256 * 1024;

/**
 * The same response with its message fields in the visitor's language:
 * error, suggestion and message at the top level and inside `data`.
 * Anything that is not a JSON object, or is large, or needs no change,
 * passes through untouched (status and headers kept).
 */
export async function localizeResponse(response: Response, locale: Locale): Promise<Response> {
  if (locale === "en") return response;
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) return response;
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > MAX_LOCALIZED_BYTES) return response;

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return response;

  let changed = false;
  const swap = (holder: Record<string, unknown>) => {
    for (const field of MESSAGE_FIELDS) {
      const value = holder[field];
      if (typeof value !== "string") continue;
      const translated = translateApiMessage(value, locale);
      if (translated !== value) {
        holder[field] = translated;
        changed = true;
      }
    }
  };
  const record = body as Record<string, unknown>;
  swap(record);
  if (typeof record.data === "object" && record.data !== null && !Array.isArray(record.data)) swap(record.data as Record<string, unknown>);
  if (!changed) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(record), { status: response.status, statusText: response.statusText, headers });
}
