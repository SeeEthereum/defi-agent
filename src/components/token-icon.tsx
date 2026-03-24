"use client";

import { useState } from "react";

/**
 * Token logo URLs from trustwallet/assets CDN.
 * Maps lowercase symbol → logo URL. For ERC-20 tokens we use the
 * Ethereum mainnet address on the TrustWallet assets CDN.
 */
const TOKEN_LOGOS: Record<string, string> = {
  // Native / Major
  eth: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  weth: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
  btc: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  wbtc: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
  bnb: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  matic: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",
  pol: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",
  wpol: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",

  // Stablecoins
  usdc: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  usdt: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
  dai: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png",
  frax: "https://assets.coingecko.com/coins/images/13422/small/FRAX_icon.png",
  pyusd: "https://assets.coingecko.com/coins/images/31212/small/PYUSD_Logo_%282%29.png",
  eurc: "https://assets.coingecko.com/coins/images/26045/small/euro-coin.png",
  susds: "https://assets.coingecko.com/coins/images/39926/small/sUSDS.png",
  usds: "https://assets.coingecko.com/coins/images/39925/small/USDS.png",
  gho: "https://assets.coingecko.com/coins/images/30663/small/gho-token-logo.png",
  lusd: "https://assets.coingecko.com/coins/images/14666/small/Group_3.png",

  // DeFi / L2 tokens
  arb: "https://assets.coingecko.com/coins/images/16547/small/arb.jpg",
  op: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",
  link: "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
  uni: "https://assets.coingecko.com/coins/images/12504/small/uni.jpg",
  aave: "https://assets.coingecko.com/coins/images/12645/small/aave-token-round.png",
  mkr: "https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png",
  crv: "https://assets.coingecko.com/coins/images/12124/small/Curve.png",
  comp: "https://assets.coingecko.com/coins/images/10775/small/COMP.png",
  snx: "https://assets.coingecko.com/coins/images/3406/small/SNX.png",
  ldo: "https://assets.coingecko.com/coins/images/13573/small/Lido_DAO.png",
  pendle: "https://assets.coingecko.com/coins/images/15069/small/Pendle_Logo_Normal-03.png",
  ena: "https://assets.coingecko.com/coins/images/36530/small/ethena.png",
  eigen: "https://assets.coingecko.com/coins/images/37441/small/eigen.png",

  // LSTs / LRTs
  steth: "https://assets.coingecko.com/coins/images/13442/small/steth_logo.png",
  wsteth: "https://assets.coingecko.com/coins/images/18834/small/wstETH.png",
  weeth: "https://assets.coingecko.com/coins/images/33033/small/weETH.png",
  reth: "https://assets.coingecko.com/coins/images/20764/small/reth.png",
  cbeth: "https://assets.coingecko.com/coins/images/27008/small/cbeth.png",
  ezeth: "https://assets.coingecko.com/coins/images/34753/small/Ezeth_logo_circle.png",
  rseth: "https://assets.coingecko.com/coins/images/35920/small/rsETH.png",

  // Memecoins
  pepe: "https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg",
  shib: "https://assets.coingecko.com/coins/images/11939/small/shiba.png",
  doge: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png",
  floki: "https://assets.coingecko.com/coins/images/16746/small/PNG_image.png",
};

/**
 * Fluid fToken symbol mapping → underlying token for logo lookup.
 * e.g. fUSDC → USDC, fWETH → WETH
 */
function resolveSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.startsWith("F") && s.length > 1) {
    const underlying = s.slice(1);
    // Only resolve if it matches a known fToken pattern
    if (TOKEN_LOGOS[underlying.toLowerCase()]) return underlying;
  }
  return s;
}

const FALLBACK_COLORS: Record<string, string> = {
  A: "#EF4444", B: "#F59E0B", C: "#10B981", D: "#3B82F6",
  E: "#8B5CF6", F: "#EC4899", G: "#14B8A6", H: "#F97316",
  I: "#6366F1", J: "#84CC16", K: "#06B6D4", L: "#A855F7",
  M: "#F43F5E", N: "#22C55E", O: "#0EA5E9", P: "#D946EF",
  Q: "#EAB308", R: "#2DD4BF", S: "#7C3AED", T: "#FB923C",
  U: "#4ADE80", V: "#38BDF8", W: "#C084FC", X: "#FB7185",
  Y: "#34D399", Z: "#60A5FA",
};

export function TokenIcon({
  symbol,
  size = 36,
  className = "",
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const resolved = resolveSymbol(symbol);
  const logoUrl = TOKEN_LOGOS[resolved.toLowerCase()];

  if (logoUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={symbol}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    );
  }

  // Fallback: colored circle with initials
  const letter = resolved.charAt(0).toUpperCase();
  const bg = FALLBACK_COLORS[letter] ?? "#8B5CF6";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className={className}
    >
      <circle cx="18" cy="18" r="18" fill={bg} />
      <text
        x="18"
        y="22"
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fontFamily="system-ui"
        fill="#fff"
      >
        {resolved.slice(0, 3)}
      </text>
    </svg>
  );
}
