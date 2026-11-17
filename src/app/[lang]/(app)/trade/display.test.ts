import { describe, it, expect } from "vitest";
import { en } from "@/i18n/messages/en";
import { it as itMessages } from "@/i18n/messages/it";
import { createTranslator } from "@/i18n/translate";
import {
  coinLabel,
  coinLogoUrl,
  formatExactNumber,
  formatExactPrice,
  formatLiquidation,
  formatRoe,
  fundPreviewRows,
  leverageTypeLabel,
  orderTypeLabel,
} from "./display";

const t = createTranslator(en, "en", "trade");
const tIt = createTranslator(itMessages, "it", "trade");

describe("formatRoe (Hyperliquid sends a fraction)", () => {
  it("shows 0.05 as +5%", () => {
    expect(formatRoe("0.05", "en")).toBe("+5%");
    expect(formatRoe("0.102", "en")).toBe("+10.2%");
    expect(formatRoe("-0.0123", "en")).toBe("-1.23%");
    expect(formatRoe("1.5", "en")).toBe("+150%");
    expect(formatRoe("0", "en")).toBe("0%");
  });

  it("never shows NaN", () => {
    expect(formatRoe(undefined, "en")).toBe("–");
    expect(formatRoe("", "en")).toBe("–");
    expect(formatRoe("abc", "en")).toBe("–");
  });

  it("uses the decimal comma in Italian", () => {
    expect(formatRoe("0.102", "it")).toBe("+10,2%");
    expect(formatRoe("-0.0123", "it")).toBe("-1,23%");
  });
});

describe("labels", () => {
  it("names leverage modes", () => {
    expect(leverageTypeLabel("cross", t)).toBe("Cross");
    expect(leverageTypeLabel("isolated", t)).toBe("Isolated");
    expect(leverageTypeLabel(undefined, t)).toBe("");
    expect(leverageTypeLabel("weird", t)).toBe("");
  });

  it("names order types; open orders without a type are limits", () => {
    expect(orderTypeLabel({}, t)).toBe("Limit");
    expect(orderTypeLabel({ type: "limit" }, t)).toBe("Limit");
    expect(orderTypeLabel({ reduceOnly: false }, t)).toBe("Limit");
    expect(orderTypeLabel({ reduceOnly: true }, t)).toBe("Limit · close only");
    expect(orderTypeLabel({ type: "Take Profit Market", reduceOnly: true }, t)).toBe("Take-profit · close only");
    expect(orderTypeLabel({ type: "Stop Market" }, t)).toBe("Stop-loss");
  });

  it("names them in Italian", () => {
    expect(leverageTypeLabel("isolated", tIt)).toBe("Isolato");
    expect(orderTypeLabel({ reduceOnly: true }, tIt)).toBe("Limite · solo chiusura");
    expect(orderTypeLabel({ type: "market" }, tIt)).toBe("A mercato");
    expect(orderTypeLabel({ type: "Stop Market" }, tIt)).toBe("Stop loss");
  });

  it("names coins", () => {
    expect(coinLabel("BTC")).toBe("Bitcoin");
    expect(coinLabel("HYPE")).toBe("Hyperliquid");
    expect(coinLabel("kPEPE")).toBeNull();
  });

  it("builds a logo address only for plain tickers", () => {
    expect(coinLogoUrl("HYPE")).toBe("https://app.hyperliquid.xyz/coins/HYPE.svg");
    expect(coinLogoUrl("@1")).toBeNull();
    expect(coinLogoUrl("../x")).toBeNull();
  });
});

describe("prices", () => {
  it("shows no liquidation price as a dash", () => {
    expect(formatLiquidation("0", "en")).toBe("–");
    expect(formatLiquidation(null, "en")).toBe("–");
    expect(formatLiquidation("52000.0", "en")).toBe("$52,000.00");
    expect(formatLiquidation("52000.0", "it")).toBe("52.000,00 $");
  });

  it("keeps entered prices exact, with $ and separators", () => {
    expect(formatExactPrice("64000.5", "en")).toBe("$64,000.5");
    expect(formatExactPrice("0.12345", "en")).toBe("$0.12345");
    expect(formatExactPrice("1234567", "en")).toBe("$1,234,567");
    expect(formatExactPrice("007.5", "en")).toBe("$7.5");
    expect(formatExactPrice(undefined, "en")).toBe("–");
    expect(formatExactPrice("abc", "en")).toBe("–");
  });

  it("keeps them exact in Italian too, with Italian separators", () => {
    expect(formatExactPrice("64000.5", "it")).toBe("64.000,5 $");
    expect(formatExactPrice("0.12345", "it")).toBe("0,12345 $");
    expect(formatExactPrice("1234567", "it")).toBe("1.234.567 $");
  });

  it("shows sizes as sent, with the language's decimal mark", () => {
    expect(formatExactNumber("0.12345678", "en")).toBe("0.12345678");
    expect(formatExactNumber("0,5", "en")).toBe("0,5");
    expect(formatExactNumber("0.12345678", "it")).toBe("0,12345678");
    expect(formatExactNumber("3", "it")).toBe("3");
  });
});

describe("fundPreviewRows", () => {
  // Payloads as lib/hyperliquid/cli builds them.
  const deposit = {
    preview: true,
    amount: "50",
    from: "0x1234567890abcdef1234567890abcdef12345678",
    to: "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7",
    chain: "42161",
    est_arrival_seconds: 60,
    message: "Preview: deposit 50 USDC from Arbitrum to Hyperliquid (bridge 0x2Df1…). Resend with confirm:true.",
  };
  const withdraw = {
    preview: true,
    amount: "50",
    destination: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    fee_usdc: 1,
    net_usdc: "50",
    total_debited: "51.00",
    message: "Preview: withdraw 50 USDC received, 51.00 debited (fee $1) → 0xabc…. Resend with confirm:true.",
  };

  it("summarises a deposit", () => {
    expect(fundPreviewRows("deposit", deposit, t, "en")).toEqual([
      ["You deposit", "50 USDC"],
      ["Fee", "No Hyperliquid fee"],
      ["You receive", "50 USDC"],
      ["Arrives in", "About 1 min"],
      ["From your wallet", "0x1234…5678"],
    ]);
  });

  it("summarises a withdrawal", () => {
    expect(fundPreviewRows("withdraw", withdraw, t, "en")).toEqual([
      ["You withdraw", "50 USDC"],
      ["Fee", "1 USDC"],
      ["Total debited", "51 USDC"],
      ["You receive", "50 USDC"],
      ["Arrives in", "2 to 5 min"],
      ["To your wallet", "0xabcd…abcd"],
    ]);
  });

  it("summarises them in Italian", () => {
    expect(fundPreviewRows("deposit", { ...deposit, amount: "1234.5", est_arrival_seconds: 30 }, tIt, "it")).toEqual([
      ["Depositi", "1.234,5 USDC"],
      ["Commissione", "Nessuna commissione Hyperliquid"],
      ["Ricevi", "1.234,5 USDC"],
      ["Tempo di arrivo", "Meno di un minuto"],
      ["Dal tuo wallet", "0x1234…5678"],
    ]);
    expect(fundPreviewRows("withdraw", withdraw, tIt, "it")).toEqual([
      ["Prelevi", "50 USDC"],
      ["Commissione", "1 USDC"],
      ["Totale addebitato", "51 USDC"],
      ["Ricevi", "50 USDC"],
      ["Tempo di arrivo", "Da 2 a 5 min"],
      ["Al tuo wallet", "0xabcd…abcd"],
    ]);
  });

  it("never shows flags, chain ids, the bridge or the API message", () => {
    for (const [mode, payload] of [
      ["deposit", deposit],
      ["withdraw", withdraw],
    ] as const) {
      const text = fundPreviewRows(mode, payload, t, "en").flat().join(" ");
      expect(text).not.toMatch(/true|42161|confirm|Preview|0x2Df1|seconds|NaN|undefined/);
    }
  });

  it("drops rows it cannot read", () => {
    expect(fundPreviewRows("withdraw", { amount: "abc" }, t, "en")).toEqual([["Arrives in", "2 to 5 min"]]);
  });
});
