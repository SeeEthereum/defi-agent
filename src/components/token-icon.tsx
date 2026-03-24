/** Inline SVG token icons for common crypto assets */
export function TokenIcon({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const s = size;
  const colors: Record<string, { bg: string; fg: string }> = {
    ETH: { bg: "#627EEA", fg: "#fff" },
    WETH: { bg: "#627EEA", fg: "#fff" },
    USDC: { bg: "#2775CA", fg: "#fff" },
    USDT: { bg: "#26A17B", fg: "#fff" },
  };
  const c = colors[symbol] ?? { bg: "#8B5CF6", fg: "#fff" };

  if (symbol === "ETH" || symbol === "WETH") {
    return (
      <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="18" fill={c.bg} />
        <path d="M18 6l-0.18 0.61V22.28l0.18 0.18 7.5-4.43L18 6z" fill="#fff" fillOpacity={0.6} />
        <path d="M18 6l-7.5 12.03 7.5 4.43V6z" fill="#fff" />
        <path d="M18 24.38l-0.1 0.12v5.75L18 30.75l7.5-10.56L18 24.38z" fill="#fff" fillOpacity={0.6} />
        <path d="M18 30.75v-6.37l-7.5-4.19L18 30.75z" fill="#fff" />
      </svg>
    );
  }

  if (symbol === "USDC") {
    return (
      <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="18" fill={c.bg} />
        <text x="18" y="22" textAnchor="middle" fontSize="13" fontWeight="700" fontFamily="system-ui" fill="#fff">$</text>
      </svg>
    );
  }

  if (symbol === "USDT") {
    return (
      <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="18" fill={c.bg} />
        <path d="M20.4 16.6v-1.8h4.8V11.4H10.8v3.4h4.8v1.8c-4.2 0.2-7.4 1.1-7.4 2.2s3.2 2 7.4 2.2v6.4h4.8V20.8c4.2-0.2 7.4-1.1 7.4-2.2s-3.2-2-7.4-2.2v0.2zm0 3.6v0c-0.1 0-0.6 0-2.4 0s-2.2 0-2.4 0v0c-3.7-0.2-6.5-0.9-6.5-1.8s2.8-1.6 6.5-1.8v2.8c0.2 0 0.8 0 2.4 0s2.2 0 2.4 0v-2.8c3.7 0.2 6.5 0.9 6.5 1.8s-2.8 1.6-6.5 1.8z" fill="#fff" />
      </svg>
    );
  }

  // Fallback
  return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="18" fill={c.bg} />
      <text x="18" y="22" textAnchor="middle" fontSize="12" fontWeight="600" fontFamily="system-ui" fill={c.fg}>{symbol.slice(0, 3)}</text>
    </svg>
  );
}
