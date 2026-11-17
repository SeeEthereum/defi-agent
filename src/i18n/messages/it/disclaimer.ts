import type * as en from "../en/disclaimer";

// Translation of the approved English terms. To be reviewed by a lawyer
// before relying on it: the English text stays the reference.
export const disclaimer: typeof en.disclaimer = {
  point1Title: "Chi può firmare per te",
  point1Body:
    "La tua chiave resta nell'enclave sicura di OKX. Finché hai fatto l'accesso, il nostro server tiene una sessione che può chiederle di firmare, usata solo per quello che confermi. Viene cancellata quando esci o dopo 30 minuti di inattività.",
  point2Title: "Puoi perdere soldi",
  point2Body:
    "I prezzi cambiano in fretta, e scambi, bridge e prestiti possono andare storti. Niente di quello che trovi qui è consulenza finanziaria, nemmeno i suggerimenti dell'assistente.",
  point3Title: "Le tue protezioni OKX",
  point3Body: "Limiti di spesa e codici di approvazione sono protezioni di OKX. Le imposti nel tuo account OKX e solo tu puoi cambiarle.",
  readFull: "Leggi i termini completi",

  acceptTitle: "Cosa accetti",
  acceptIntro:
    "<b>albicocca</b> dà accesso a protocolli di finanza decentralizzata su più blockchain, tra cui aggregazione di swap, bridge tra reti, prestiti, strumenti di sicurezza e un assistente basato sull'IA. Usando questa applicazione riconosci e accetti i rischi seguenti.",

  marketsTitle: "Mercati e contratti",
  marketLabel: "Rischio di mercato",
  market: "Il valore delle criptovalute è molto volatile e può causare perdite economiche significative.",
  contractsLabel: "Rischio degli smart contract",
  contracts:
    "I protocolli DeFi si basano su smart contract che possono contenere bug, vulnerabilità o problemi di governance, compresi quelli degli aggregatori di percorso, dei protocolli di bridge e dei mercati di prestito usati da questa app.",
  approvalsLabel: "Autorizzazioni dei token",
  approvals:
    "Scambi, bridge e prestiti richiedono di dare a contratti di terze parti il diritto di spendere i tuoi token ERC-20. Le autorizzazioni illimitate lasciate attive sono un rischio nel tempo: usa la sezione Sicurezza per controllare e revocare quelle che non ti servono più.",

  lendingTitle: "Prestiti e bridge",
  lendingLabel: "Rischio dei protocolli di prestito",
  lending:
    "Depositare asset in mercati di prestito (per esempio Fluid Protocol) ti espone a guasti degli oracoli, mancanza di liquidità, riserve congelate e insolvenza del protocollo. Gli APR passati non garantiscono i rendimenti futuri, che possono variare o azzerarsi.",
  bridgeLabel: "Rischio dei bridge tra reti",
  bridge:
    "Le transazioni di bridge passano da protocolli di terze parti (Stargate, Across, Hop e altri tramite LI.FI) e possono bloccarsi, durare più del previsto o richiedere un recupero manuale dall'interfaccia del bridge stesso. I fondi possono restare in transito a lungo.",

  tradingTitle: "Trading",
  perpsLabel: "Futures perpetual con leva",
  perps:
    "I futures perpetual usano margine preso in prestito e possono essere liquidati. Una liquidazione può azzerare tutto il margine versato su una posizione. Il funding viene addebitato di continuo finché la posizione resta aperta. Una leva più alta aumenta sia i possibili guadagni sia il rischio di perdere in fretta tutto il margine. Non usare mai più leva di quanta puoi permetterti di perdere.",
  slippageLabel: "Slippage e MEV",
  slippage:
    "Swap e bridge possono essere eseguiti a un prezzo diverso da quello del preventivo, per la volatilità o per il MEV. La protezione dal MEV, sulle reti che la offrono, è fatta al meglio delle possibilità e non è una garanzia.",

  assistantTitle: "L'assistente e i suoi dati",
  aiLabel: "Avvertenza sull'assistente IA",
  ai: "Le proposte dell'assistente IA dell'app sono generate da un modello linguistico e possono essere imprecise, non aggiornate o non sicure. L'IA non esegue mai nulla senza la tua conferma esplicita. <b>Controlla sempre la rete, l'indirizzo del token e l'importo prima di approvare qualsiasi azione.</b>",
  dataLabel: "Dati solo informativi",
  data: "Segnali smart money, attività di KOL e whale, classifiche, controlli di sicurezza dei token e verifiche anti phishing delle DApp hanno scopo <em>educativo</em> e non sono consulenza finanziaria. I controlli di sicurezza riducono il rischio ma non possono rilevare ogni attacco; quelli nuovi possono superare i controlli.",

  custodyTitle: "Custodia delle chiavi",
  custodyIntro:
    "Il tuo wallet funziona con <b>OKX Agentic Wallet</b>. Le chiavi private vengono generate e conservate in un <b>Trusted Execution Environment (TEE)</b>, un'enclave sicura isolata a livello hardware. Questo significa:",
  custody1:
    "<b>Non puoi esportare, estrarre o fare il backup delle tue chiavi private.</b> Non c'è seed phrase, non c'è frase mnemonica e non c'è file di recupero. È una scelta voluta.",
  custody2: "Nessuno (né tu, né OKX, né questa applicazione) può accedere alla chiave privata in chiaro. Tutte le firme delle transazioni avvengono dentro il TEE.",
  custody3:
    "<b>Finché hai fatto l'accesso, il server di questa applicazione conserva una credenziale di sessione rilasciata da OKX.</b> Permette al server di chiedere all'enclave di firmare, e l'applicazione la usa solo per le transazioni che confermi. Chi prendesse il controllo di quel server potrebbe usarla in modo improprio. Uscire la cancella dal server, e lo stesso succede dopo 30 minuti senza attività.",
  custody4:
    "<b>Dipendi dall'infrastruttura di OKX</b> per accedere al tuo wallet e usarlo. Se OKX interrompe il servizio Agentic Wallet, non potrai recuperare le tue chiavi in autonomia.",
  custody5:
    "Il tuo wallet è collegato all'account con cui accedi (Google, Apple o email). Perdere l'accesso a quell'account può farti perdere per sempre l'accesso al wallet.",

  responsibilityTitle: "La tua responsabilità",
  regulatoryLabel: "Rischio normativo",
  regulatory:
    "Le norme sulle criptovalute cambiano da un paese all'altro e possono cambiare in qualsiasi momento. Sei responsabile del rispetto delle leggi che si applicano al tuo caso.",
  outro:
    "Questa applicazione non offre consulenza finanziaria. Le decisioni di investimento e la loro responsabilità sono solo tue. Non investire mai più di quanto puoi permetterti di perdere.",
};
