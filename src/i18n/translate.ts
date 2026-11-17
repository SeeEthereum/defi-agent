/**
 * The translator: looks a key up in a dictionary and fills it in.
 *
 *   "Swap {from} for {to}"            {from: "ETH", to: "USDC"}
 *   { one: "{count} trade", other: "{count} trades" }   {count: 3}
 *   "<link>Sign in again</link> to continue."           rich(), tags → elements
 *
 * Plural forms follow Intl.PluralRules for the language (Italian and
 * English: one / other); a "zero" form, when given, wins for 0. Keys are
 * typed: a key that is not in the English dictionary does not compile, and
 * the Italian one must have exactly the same keys (messages/it.ts).
 *
 * No React here: the provider (./client) wraps rich() results in elements.
 */

import { INTL_LOCALE, type Locale } from "./config";

export interface PluralForms {
  zero?: string;
  one: string;
  other: string;
}

export type Leaf = string | PluralForms;
export interface MessageTree {
  [key: string]: Leaf | MessageTree;
}

/** "a.b.c" for every leaf of a dictionary. */
export type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends PluralForms ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

/** The subtree at a dotted path. */
export type At<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? At<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** Namespaces: paths that lead to a subtree, not a leaf. */
export type Namespaces<T> = {
  [K in keyof T & string]: T[K] extends string | PluralForms ? never : K | `${K}.${Namespaces<T[K]>}`;
}[keyof T & string];

export type Vars = Record<string, string | number>;

function isPlural(value: unknown): value is PluralForms {
  return typeof value === "object" && value !== null && typeof (value as PluralForms).other === "string";
}

function lookup(tree: MessageTree, path: string): Leaf | MessageTree | undefined {
  let node: Leaf | MessageTree | undefined = tree;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null || isPlural(node)) return undefined;
    node = (node as MessageTree)[part];
  }
  return node;
}

/** "{name}" → vars.name. A placeholder with no value is left as it is, so the gap shows. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
function pluralForm(locale: Locale, count: number): "one" | "other" {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALE[locale]);
    pluralRules.set(locale, rules);
  }
  return rules.select(count) === "one" ? "one" : "other";
}

export interface Translator<K extends string> {
  (key: K, vars?: Vars): string;
  /**
   * A message with tags, split into text and the elements `tags` makes:
   * rich("note", { link: (text) => <a>{text}</a> }). Tags do not nest.
   */
  rich<R>(key: K, tags: Record<string, (text: string) => R>, vars?: Vars): Array<string | R>;
  /** Does the key exist? For text that may or may not be translated (server messages). */
  has(key: string): boolean;
}

export function createTranslator<K extends string>(messages: MessageTree, locale: Locale, namespace?: string): Translator<K> {
  const prefix = namespace ? `${namespace}.` : "";

  const resolve = (key: string, vars?: Vars): string => {
    const value = lookup(messages, prefix + key);
    if (typeof value === "string") return interpolate(value, vars);
    if (isPlural(value)) {
      const count = Number(vars?.count ?? 0);
      const form = count === 0 && value.zero !== undefined ? value.zero : value[pluralForm(locale, count)];
      return interpolate(form, vars);
    }
    if (process.env.NODE_ENV !== "production") console.error(`[i18n] missing message "${prefix + key}" (${locale})`);
    return prefix + key;
  };

  const t = ((key: K, vars?: Vars) => resolve(key, vars)) as Translator<K>;

  t.rich = <R,>(key: K, tags: Record<string, (text: string) => R>, vars?: Vars) => {
    const text = resolve(key, vars);
    const out: Array<string | R> = [];
    const pattern = /<(\w+)>(.*?)<\/\1>/gs;
    let last = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (match.index > last) out.push(text.slice(last, match.index));
      const render = tags[match[1]];
      out.push(render ? render(match[2]) : match[2]);
      last = match.index + match[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };

  t.has = (key: string) => {
    const value = lookup(messages, prefix + key);
    return typeof value === "string" || isPlural(value);
  };

  return t;
}
