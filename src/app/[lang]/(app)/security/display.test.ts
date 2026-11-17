import { describe, it, expect } from "vitest";
import { en } from "@/i18n/messages/en";
import { it as itMessages } from "@/i18n/messages/it";
import { createTranslator } from "@/i18n/translate";
import { formatAmount, formatPercent } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import {
  EVM_ADDRESS,
  allowanceLabel,
  approvalRisk,
  isUnlimitedAllowance,
  networkName,
  parseAddresses,
  riskLabels,
  riskTier,
  taxIsHigh,
  taxLabel,
  tokenRisk,
  tokenTitle,
  tokensParam,
  type SecurityFormat,
  type SecurityT,
} from "./display";

// The page's translators and number formats, in English and in Italian.
const t: SecurityT = createTranslator(en, "en", "security");
const tIt: SecurityT = createTranslator(itMessages, "it", "security");
const format = (locale: Locale): SecurityFormat => ({
  percent: (value, opts) => formatPercent(value, { ...opts, locale }),
  amount: (value) => formatAmount(value, { locale }),
});
const fEn = format("en");
const fIt = format("it");

describe("risk levels", () => {
  it("reads OKX's words and the older numbers", () => {
    expect(riskTier("CRITICAL")).toBe("critical");
    expect(riskTier("HIGH")).toBe("high");
    expect(riskTier("medium")).toBe("medium");
    expect(riskTier("LOW")).toBe("low");
    expect(riskTier("1")).toBe("low");
    expect(riskTier("2")).toBe("medium");
    expect(riskTier(3)).toBe("high");
    expect(riskTier("??")).toBeNull();
    expect(riskTier(undefined)).toBeNull();
  });

  it("labels a token's risk without raw codes", () => {
    expect(tokenRisk("CRITICAL", t)).toEqual({ label: "Dangerous", tone: "bad" });
    expect(tokenRisk("HIGH", t)).toEqual({ label: "High risk", tone: "bad" });
    expect(tokenRisk("MEDIUM", t)).toEqual({ label: "Medium risk", tone: "warn" });
    expect(tokenRisk("LOW", t)).toEqual({ label: "Looks safe", tone: "ok" });
    expect(tokenRisk("SOMETHING_NEW", t)).toEqual({ label: "Not rated", tone: "flat" });
  });

  it("labels risks in Italian", () => {
    expect(tokenRisk("CRITICAL", tIt)).toEqual({ label: "Pericoloso", tone: "bad" });
    expect(tokenRisk("LOW", tIt).label).toBe("Sembra sicuro");
    expect(tokenRisk("SOMETHING_NEW", tIt).label).toBe("Senza valutazione");
    expect(approvalRisk("CRITICAL", tIt)?.label).toBe("Pericolosa");
    expect(approvalRisk("1", tIt)?.label).toBe("Rischio basso");
  });

  it("labels an approval's risk in plain words, or not at all", () => {
    expect(approvalRisk("2", t)?.label).toBe("Medium risk");
    expect(approvalRisk("medium", t)?.label).toBe("Medium risk");
    expect(approvalRisk("1", t)?.label).toBe("Low risk");
    expect(approvalRisk("HIGH", t)?.label).toBe("High risk");
    expect(approvalRisk("x", t)).toBeNull();
    expect(approvalRisk(null, t)).toBeNull();
  });
});

describe("networkName", () => {
  it("names a chain and never prints its id", () => {
    expect(networkName("42161", t)).toBe("Arbitrum");
    expect(networkName(1, t)).toBe("Ethereum");
    expect(networkName("999999", t)).toBe("Unknown network");
    expect(networkName(undefined, t)).toBe("Unknown network");
    expect(networkName("999999", tIt)).toBe("Rete sconosciuta");
    expect(networkName("42161", tIt)).toBe("Arbitrum");
  });
});

describe("taxes (OKX sends percent)", () => {
  it("prints the percent as sent", () => {
    expect(taxLabel("5", fEn)).toBe("5%");
    expect(taxLabel("0", fEn)).toBe("0%");
    expect(taxLabel("12.5", fEn)).toBe("12.5%");
    expect(taxLabel(3, fEn)).toBe("3%");
    expect(taxLabel("12.5", fIt)).toBe("12,5%");
  });

  it("never prints NaN", () => {
    expect(taxLabel(null, fEn)).toBe("–");
    expect(taxLabel(undefined, fEn)).toBe("–");
    expect(taxLabel("", fEn)).toBe("–");
    expect(taxLabel("abc", fEn)).toBe("–");
  });

  it("flags taxes above 5%", () => {
    expect(taxIsHigh("10")).toBe(true);
    expect(taxIsHigh("5")).toBe(false);
    expect(taxIsHigh("abc")).toBe(false);
    expect(taxIsHigh(null)).toBe(false);
  });
});

describe("tokenTitle", () => {
  it("cleans the symbol", () => {
    expect(tokenTitle({ symbol: "USD₮0", chainIndex: "42161", address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" }, t).title).toBe("USDT");
    expect(tokenTitle({ symbol: "PEPE", chainIndex: 1, address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" }, t).title).toBe("PEPE");
  });

  it("names a token without symbol by its address, never by an id", () => {
    const title = tokenTitle({ address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" }, t);
    expect(title.title).toBe("Token 0x6982…1933");
    expect(title.iconSymbol).toBe("?");
    expect(title.named).toBe(false);
    expect(tokenTitle({}, t).title).toBe("Unknown token");
    expect(tokenTitle({}, tIt).title).toBe("Token sconosciuto");
    expect(tokenTitle({ address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" }, tIt).title).toBe("Token 0x6982…1933");
  });
});

describe("riskLabels", () => {
  it("turns OKX's flags into plain words", () => {
    expect(riskLabels({ isLowLiquidity: true, isNotOpenSource: true, isMintable: true }, t)).toEqual([
      "Low liquidity",
      "Code is not public",
    ]);
  });

  it("turns them into Italian words too", () => {
    expect(riskLabels({ isLowLiquidity: true, isNotOpenSource: true }, tIt)).toEqual(["Liquidità bassa", "Codice non pubblico"]);
    expect(riskLabels({ riskItems: ["APPROVE_EOA"] }, tIt)).toEqual(["L'autorizzazione va a un wallet, non a un'app"]);
    expect(riskLabels({ riskLevel: "HIGH" }, tIt)).toEqual(["Segnalato dai controlli di OKX"]);
  });

  it("does not repeat the same label", () => {
    expect(riskLabels({ isWash: true, isWash2: true }, t)).toEqual(["Fake trading volume"]);
  });

  it("only counts the asset-edit flag on Solana", () => {
    expect(riskLabels({ isHasAssetEditAuth: true, chainId: "1" }, t)).toEqual([]);
    expect(riskLabels({ isHasAssetEditAuth: true, chainId: "501" }, t)).toEqual(["Owner can change balances"]);
  });

  it("never shows JSON or internal codes from a risk list", () => {
    const labels = riskLabels({
      riskItems: [
        { name: "SPENDER_ADDRESS_BLACK", description: { en: "x" } },
        { foo: 1 },
        "isLowLiquidity",
        "SOME_UNKNOWN_CODE",
        "Liquidity is very thin",
      ],
    }, t);
    expect(labels).toEqual(["Spender is blacklisted", "Low liquidity", "Liquidity is very thin"]);
    for (const l of labels) expect(l).not.toMatch(/[{}_]/);
  });

  it("says when OKX flags a token without naming a reason", () => {
    expect(riskLabels({ riskLevel: "HIGH" }, t)).toEqual(["Flagged by OKX's checks"]);
    expect(riskLabels({ riskLevel: "LOW" }, t)).toEqual([]);
    expect(riskLabels({ riskLevel: "CRITICAL", isHoneypot: true }, t)).toEqual([]);
  });
});

describe("allowances", () => {
  it("spots unlimited allowances", () => {
    expect(isUnlimitedAllowance("unlimited")).toBe(true);
    expect(isUnlimitedAllowance("115792089237316195423570985008687907853269984665640564039457584007913129639935")).toBe(true);
    expect(isUnlimitedAllowance("1000000")).toBe(false);
    expect(isUnlimitedAllowance(undefined)).toBe(false);
  });

  it("never shows base units", () => {
    expect(allowanceLabel({ remainAmtPrecise: "1500.5" }, false, t, fEn)).toBe("1,500.5");
    expect(allowanceLabel({ remainAmtPrecise: "0.000123" }, false, t, fEn)).toBe("0.000123");
    expect(allowanceLabel({}, false, t, fEn)).toBe("Not known");
    expect(allowanceLabel({ remainAmtPrecise: "abc" }, false, t, fEn)).toBe("Not known");
    expect(allowanceLabel({ remainAmtPrecise: "5" }, true, t, fEn)).toBe("Unlimited");
  });

  it("speaks Italian", () => {
    expect(allowanceLabel({ remainAmtPrecise: "1500.5" }, false, tIt, fIt)).toBe("1.500,5");
    expect(allowanceLabel({}, false, tIt, fIt)).toBe("Non nota");
    expect(allowanceLabel({ remainAmtPrecise: "5" }, true, tIt, fIt)).toBe("Illimitata");
  });
});

describe("manual scan input", () => {
  it("splits pasted addresses", () => {
    expect(parseAddresses(" 0xa, 0xb\n0xc  ")).toEqual(["0xa", "0xb", "0xc"]);
    expect(parseAddresses("")).toEqual([]);
  });

  it("checks the address shape", () => {
    expect(EVM_ADDRESS.test("0xdac17f958d2ee523a2206206994597c13d831ec7")).toBe(true);
    expect(EVM_ADDRESS.test("1:0xdac17f958d2ee523a2206206994597c13d831ec7")).toBe(false);
    expect(EVM_ADDRESS.test("0x123")).toBe(false);
  });

  it("builds the API's chain:address list", () => {
    expect(tokensParam("1", ["0xa", "0xb"])).toBe("1:0xa,1:0xb");
    expect(tokensParam(42161, ["0xa"])).toBe("42161:0xa");
  });
});
