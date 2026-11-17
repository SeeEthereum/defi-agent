/**
 * Local token search, ranked the way people read a list: the exact symbol
 * (or a pasted contract address) first, then symbols that start with the
 * query, then names, then anything else that contains it. Within a rank the
 * list keeps its own order, so the provider's popularity order still counts.
 */

export interface SearchableToken {
  symbol: string;
  name: string;
  address: string;
}

export function searchTokens<T extends SearchableToken>(tokens: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return tokens;

  const ranked: { token: T; rank: number; index: number }[] = [];
  tokens.forEach((token, index) => {
    const symbol = token.symbol.toLowerCase();
    const name = token.name.toLowerCase();
    let rank: number;
    if (symbol === q || token.address.toLowerCase() === q) rank = 0;
    else if (symbol.startsWith(q)) rank = 1;
    else if (name.startsWith(q)) rank = 2;
    else if (symbol.includes(q)) rank = 3;
    else if (name.includes(q)) rank = 4;
    else return;
    ranked.push({ token, rank, index });
  });

  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map((r) => r.token);
}
