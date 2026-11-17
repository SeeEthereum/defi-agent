/**
 * Nothing a person reads may be written straight into a page: it belongs in
 * the dictionaries (i18n/messages), or the Italian app shows English.
 *
 * Reads every page and component with the TypeScript parser and flags JSX
 * text with words in it, and words in the attributes people read (aria-label,
 * title, placeholder, alt, and the label/sub/text/title props the app's own
 * components show). Brand names, symbols and units are allowed.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["src/app/[lang]", "src/components"];

const VISIBLE_ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt", "label", "sub", "text", "summary"]);

/** Words that read the same in every language: names, symbols, units. */
const ALLOWED = new Set([
  "albicocca",
  "albic",
  "cca",
  "OKX",
  "USDC",
  "USDT",
  "ETH",
  "BTC",
  "BNB",
  "POL",
  "Max",
  "MAX",
  "EN",
  "IT",
  "Long",
  "Short",
  "PnL",
  "APR",
  "APY",
  "TVL",
  "LI.FI",
  "Fluid",
  "Hyperliquid",
  "Gas Station",
  "Arbitrum",
  "Ethereum",
  "Base",
  "Polygon",
  "Optimism",
  "BNB Chain",
  "Stargate",
  "NEAR Intents",
  "Bridge",
  "Wallet",
  "Slippage",
  "MEV",
  "Auto",
  "Cross",
  "QR",
  "DEX",
  "KOL",
  "Swap",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [full] : [];
  });
}

/** Text with letters that is not just an allowed name. */
function readable(text: string): boolean {
  // HTML entities (&ldquo; &nbsp;) are punctuation, not words.
  const clean = text.replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  if (!/[A-Za-z]{2,}/.test(clean)) return false;
  if (ALLOWED.has(clean)) return false;
  // Only allowed words, symbols and punctuation (e.g. "USDC → Base").
  const words = clean.match(/[A-Za-z][A-Za-z.]*/g) ?? [];
  return !words.every((w) => ALLOWED.has(w) || ALLOWED.has(w.replace(/\.$/, "")));
}

/**
 * The string literals an expression can put on screen as they are: the
 * expression itself, both arms of a ternary, either side of || and ??, the
 * right of &&, the text parts of a template. Not arguments of calls: those
 * are keys (t("key")) or values handed to formatters.
 */
function shownLiterals(expr: ts.Expression): Array<{ node: ts.Node; text: string }> {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [{ node: expr, text: expr.text }];
  if (ts.isParenthesizedExpression(expr)) return shownLiterals(expr.expression);
  if (ts.isConditionalExpression(expr)) return [...shownLiterals(expr.whenTrue), ...shownLiterals(expr.whenFalse)];
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return [...shownLiterals(expr.left), ...shownLiterals(expr.right)];
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return shownLiterals(expr.right);
    if (op === ts.SyntaxKind.PlusToken) return [...shownLiterals(expr.left), ...shownLiterals(expr.right)];
  }
  if (ts.isTemplateExpression(expr)) {
    const parts = [expr.head.text, ...expr.templateSpans.map((span) => span.literal.text)].join(" ");
    return [{ node: expr, text: parts }, ...expr.templateSpans.flatMap((span) => shownLiterals(span.expression))];
  }
  return [];
}

/** Calls whose first argument is shown to the person. */
function isShowingCall(call: ts.CallExpression, source: ts.SourceFile): boolean {
  const callee = call.expression.getText(source);
  return /^toast(\.\w+)?$/.test(callee) || /^set\w*(Error|Message|Notice|Note|Success|Status)$/.test(callee) || callee === "alert" || callee === "window.confirm" || callee === "confirm";
}

function findings(file: string, text = readFileSync(file, "utf8")): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const where = (node: ts.Node) => `${path.relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && readable(node.text)) out.push(`${where(node)} text "${node.text.trim().slice(0, 60)}"`);
    // {expression} children of an element: what they can show as is.
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const lit of shownLiterals(node.expression)) if (readable(lit.text)) out.push(`${where(lit.node)} {"${lit.text.slice(0, 60)}"}`);
    }
    if (ts.isCallExpression(node) && node.arguments[0] && isShowingCall(node, source)) {
      for (const lit of shownLiterals(node.arguments[0])) if (readable(lit.text)) out.push(`${where(lit.node)} ${node.expression.getText(source)}("${lit.text.slice(0, 60)}")`);
    }
    if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.getText(source))) {
      const init = node.initializer;
      const literals = !init ? [] : ts.isStringLiteral(init) ? [{ node: init, text: init.text }] : ts.isJsxExpression(init) && init.expression ? shownLiterals(init.expression) : [];
      for (const lit of literals) if (readable(lit.text)) out.push(`${where(lit.node)} ${node.name.getText(source)}="${lit.text.slice(0, 60)}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

describe("the scanner", () => {
  it("catches English written straight into a component, and lets names and keys through", () => {
    const sample = `
      export function Sample({ busy, error }) {
        toast.error("Copy failed");
        setError(busy ? "Try later" : null);
        return (
          <div aria-label="Close the menu" title={t("ok")}>
            <p>Send it now</p>
            <p>{busy ? "Sending…" : t("send")}</p>
            <p>{error || "Something went wrong"}</p>
            <p>{\`Sent \${n} tokens\`}</p>
            <span>USDC → Base</span>
            <span>{t("key")}</span>
            <Picker side="From" />
          </div>
        );
      }`;
    const found = findings(path.join(ROOT, "sample.tsx"), sample);
    expect(found.map((f) => f.replace(/^sample\.tsx:\d+ /, ""))).toEqual([
      'toast.error("Copy failed")',
      'setError("Try later")',
      'aria-label="Close the menu"',
      'text "Send it now"',
      '{"Sending…"}',
      '{"Something went wrong"}',
      '{"Sent   tokens"}',
    ]);
  });
});

describe("pages and components", () => {
  it("take every visible word from the dictionaries", () => {
    const all = DIRS.flatMap((d) => files(path.join(ROOT, d))).flatMap((f) => findings(f));
    expect(all).toEqual([]);
  });
});
