import type * as en from "../en/shell";

export const meta: typeof en.meta = {
  title: "albicocca: chiedi al tuo wallet",
  description:
    "Un agente onchain con il wallet incluso. Scambi, bridge, rendimenti e trading su sei blockchain, chiedendolo a parole. Accedi con Google, Apple o email: le chiavi restano nell'enclave sicura di OKX, senza seed phrase.",
  manifestDescription: "Chiedi al tuo wallet. Scambi, bridge, rendimenti e trading su sei blockchain, chiedendolo a parole.",
};

export const common: typeof en.common = {
  skipToContent: "Vai al contenuto",
  tryAgain: "Riprova",
  cancel: "Annulla",
  confirm: "Conferma",
  done: "Fatto",
  close: "Chiudi",
  copy: "Copia",
  copied: "Copiato",
  loading: "Caricamento",
  dashboard: "Panoramica",
  home: "Home",
};

export const nav: typeof en.nav = {
  assistant: "Assistente",
  dashboard: "Panoramica",
  wallet: "Wallet",
  swap: "Scambia",
  bridge: "Bridge",
  earn: "Rendimenti",
  trade: "Trading",
  signals: "Segnali",
  security: "Sicurezza",
  more: "Altro",
  sections: "Sezioni",
  moreSections: "Altre sezioni",
  homeLabel: "albicocca, panoramica",
};

export const shell: typeof en.shell = {
  wallet: "Wallet",
  signOut: "Esci",
  theme: "Tema",
  language: "Lingua",
  idleSignedOut:
    "La sessione si è chiusa dopo 30 minuti di inattività e il server non la conserva più. <link>Accedi di nuovo</link> per continuare.",
  cantReach: "Il servizio del wallet non risponde. Riprovo…",
  offline:
    "Sei offline. Saldi e prezzi sullo schermo potrebbero non essere aggiornati, e non puoi inviare nulla finché la connessione non torna.",
};

export const theme: typeof en.theme = {
  label: "Tema",
  auto: "Come il sistema",
  dark: "Scuro",
  light: "Chiaro",
};

export const language: typeof en.language = {
  label: "Lingua",
};

export const appError: typeof en.appError = {
  title: "Questa pagina ha smesso di funzionare",
  text: "Se avevi appena confermato una transazione, controlla l'attività del wallet prima di riprovare.",
};

export const notFound: typeof en.notFound = {
  title: "Questa pagina non esiste",
  text: "Il link potrebbe essere vecchio o scritto male. Dalla panoramica trovi tutto.",
  back: "Vai alla panoramica",
  welcome: "Vai ad albicocca",
};

export const pwa: typeof en.pwa = {
  install: "Installa l'app",
  dockTitle: "Aggiungi albicocca al Dock",
  dockStep1: "Nella barra dei menu scegli Archivio, poi Aggiungi al Dock.",
  dockStep2: "Fai clic su Aggiungi. albicocca si apre in una finestra tutta sua, dal Dock o da Launchpad.",
  androidTitle: "Installa albicocca",
  androidStep1: "Apri il menu del browser: i tre puntini accanto alla barra degli indirizzi.",
  androidStep2: "Scegli Installa app, oppure Aggiungi a schermata Home.",
  androidStep3: "Conferma. albicocca si apre dalla sua icona, senza le barre del browser.",
  iosTitle: "Aggiungi albicocca alla schermata Home",
  iosInApp:
    "Il browser interno di questa app non può aggiungere siti alla schermata Home. Apri prima la pagina in Safari: cerca Apri in Safari nel suo menu, spesso dietro i tre puntini.",
  iosStep1: "Tocca il pulsante Condividi: nella barra di Safari, oppure nella barra degli indirizzi in Chrome.",
  iosStep2: "Scorri e scegli Aggiungi alla schermata Home.",
  iosStep3: "Tocca Aggiungi. Da ora albicocca si apre dalla sua icona, senza le barre del browser.",
  iosNote:
    "Se l'app ti chiede di accedere di nuovo, è normale: iPhone e iPad tengono i dati di un'app installata separati da quelli del browser.",
  shortcutAssistant: "Assistente",
  shortcutWallet: "Wallet",
  shortcutSwap: "Scambia",
};

export const chart: typeof en.chart = {
  title: "Valore nel tempo",
  sub: "Tutte e sei le reti, in dollari",
  range: "Periodo",
  rangeDay: "1G",
  rangeWeek: "1S",
  rangeMonth: "1M",
  rangeAll: "Tutto",
  now: "Adesso",
  since: "da {when}",
  unavailableTitle: "Storico non disponibile",
  unavailableText: "Lo storico del valore non si è caricato. L'app riprova da sola tra poco.",
  startsTodayTitle: "Il tuo grafico parte oggi",
  startsTodayText: "albicocca salva il tuo totale circa una volta all'ora mentre usi l'app. Torna più tardi per vederlo muoversi.",
  noReadingsTitle: "Nessuna lettura in questo periodo",
  noReadingsText:
    "albicocca salva il tuo totale circa una volta all'ora mentre usi l'app. Le tue letture partono dal {date}: scegli un periodo più lungo per vederle.",
  foot: "Registrato mentre usi albicocca, circa una volta all'ora; i tratti punteggiati non hanno letture. Le variazioni contano anche i soldi inviati o ricevuti, non solo i movimenti di prezzo.",
  table: "Mostra come tabella",
  when: "Quando",
  value: "Valore totale",
  summary: "Valore {from}: {first}. Adesso: {last}.",
  keys: "Usa le frecce sinistra e destra per leggere ogni punto.",
};
