"use client";

import { useState } from "react";
import { chainName, cleanSymbol, iconKey } from "@/lib/tokens/display";

/** Logos of coins and common tokens (CoinGecko's CDN), by lowercase symbol. */
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
  sol: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  avax: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  okb: "https://assets.coingecko.com/coins/images/4463/small/WeChat_Image_20220118095654.png",
  wbnb: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",

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

const FALLBACK_COLORS: Record<string, string> = {
  A: "#EF4444", B: "#F59E0B", C: "#10B981", D: "#3B82F6",
  E: "#8B5CF6", F: "#EC4899", G: "#14B8A6", H: "#F97316",
  I: "#6366F1", J: "#84CC16", K: "#06B6D4", L: "#A855F7",
  M: "#F43F5E", N: "#22C55E", O: "#0EA5E9", P: "#D946EF",
  Q: "#EAB308", R: "#2DD4BF", S: "#7C3AED", T: "#FB923C",
  U: "#4ADE80", V: "#38BDF8", W: "#C084FC", X: "#FB7185",
  Y: "#34D399", Z: "#60A5FA",
};

/** The logo that stands for a chain in the corner badge. */
const CHAIN_BADGES: Record<number, string> = {
  1: TOKEN_LOGOS.eth,
  42161: TOKEN_LOGOS.arb,
  10: TOKEN_LOGOS.op,
  137: TOKEN_LOGOS.pol,
  56: TOKEN_LOGOS.bnb,
  43114: TOKEN_LOGOS.avax,
  501: TOKEN_LOGOS.sol,
  196: TOKEN_LOGOS.okb,
};

/** Base has no coin of its own: its logo is a blue disc. */
function BaseBadge({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="#0052FF" />
      <path d="M8 13A5 5 0 1 0 8 3a5 5 0 0 0-4.95 4.3h6.6v1.4h-6.6A5 5 0 0 0 8 13Z" fill="#fff" />
    </svg>
  );
}

function Letters({ text, size }: { text: string; size: number }) {
  const letter = text.charAt(0).toUpperCase();
  const bg = FALLBACK_COLORS[letter] ?? "#8B5CF6";
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="18" fill={bg} />
      <text x="18" y="22" textAnchor="middle" fontSize="12" fontWeight="600" fontFamily="system-ui" fill="#fff">
        {text.slice(0, 3).toUpperCase()}
      </text>
    </svg>
  );
}

/**
 * A token's logo, with the chain's logo in the corner when `chainIndex` is
 * given (so ETH on Arbitrum reads as ETH, on Arbitrum). OKX's odd symbols
 * ("ARB_ETH", "USD₮0") find the right logo through lib/tokens/display.
 * A logo URL from the API is used for tokens we do not know; otherwise the
 * first letters on a coloured disc.
 */
export function TokenIcon({
  symbol,
  size = 36,
  className = "",
  chainIndex,
  logoUrl,
}: {
  symbol: string;
  size?: number;
  className?: string;
  chainIndex?: number | string | null;
  logoUrl?: string | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const key = iconKey(symbol);
  const known = TOKEN_LOGOS[key];
  const remote = logoUrl && /^https:\/\//.test(logoUrl) ? logoUrl : undefined;
  const src = known ?? remote;
  const chain = chainIndex === null || chainIndex === undefined || chainIndex === "" ? null : Number(chainIndex);
  const badgeLogo = chain !== null ? CHAIN_BADGES[chain] : undefined;
  // No badge when it would repeat the token's own logo (ETH on Ethereum).
  const showBadge = chain !== null && (chain === 8453 || (badgeLogo !== undefined && badgeLogo !== known));
  const badge = Math.max(10, Math.round(size * 0.42));

  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src && failed !== src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="rounded-full object-cover"
          onError={() => setFailed(src)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <Letters text={cleanSymbol(symbol) || "?"} size={size} />
      )}
      {showBadge && (
        <span
          className="absolute rounded-full overflow-hidden"
          style={{ width: badge, height: badge, right: -2, bottom: -2, boxShadow: "0 0 0 2px var(--card, #fff)" }}
          title={chainName(chain) ?? undefined}
        >
          {chain === 8453 ? (
            <BaseBadge size={badge} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={badgeLogo} alt="" width={badge} height={badge} className="rounded-full" loading="lazy" referrerPolicy="no-referrer" />
          )}
        </span>
      )}
    </span>
  );
}
