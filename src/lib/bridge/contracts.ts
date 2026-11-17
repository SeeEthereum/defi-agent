/**
 * The LI.FI contracts a bridge transaction may be signed toward.
 *
 * The execute route signs whatever LI.FI's /quote returns as
 * `transactionRequest.to` and approves `estimate.approvalAddress`. A wrong or
 * tampered answer could make the user sign toward any contract, so both are
 * checked against this list first, per source chain. A chain without an
 * entry is refused, never trusted.
 *
 * Sources (checked 2026-11-17):
 * - https://github.com/lifinance/contracts/tree/main/deployments
 *   (mainnet.json, arbitrum.json, base.json, bsc.json, polygon.json,
 *   optimism.json: "LiFiDiamond" is 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE
 *   on all six)
 * - https://docs.li.fi/introduction/lifi-architecture/smart-contract-addresses
 *   ("LI.FI Diamond entryway contract", same address on most EVM networks)
 *
 * Only the Diamond is listed. It is the entry point LI.FI returns as both the
 * call target and the approval spender on these chains (live quotes checked
 * for Across, Relay, Mayan, Layerswap, Polymer and NEAR routes). The
 * periphery contracts are not: ERC20Proxy, Executor, FeeCollector and
 * LiFiDEXAggregator are called by the Diamond itself, and an approval to
 * ERC20Proxy would let the Executor, which runs arbitrary swap calldata, pull
 * the tokens; Permit2Proxy needs a signed permit this app never makes. A
 * quote naming one of them as target or spender is refused.
 */

const LIFI_DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";

/** Known LI.FI entry points by EVM chain id: call targets and approval spenders. */
export const LIFI_CONTRACTS: Readonly<Record<number, { targets: readonly string[]; spenders: readonly string[] }>> = {
  1: { targets: [LIFI_DIAMOND], spenders: [LIFI_DIAMOND] }, // Ethereum
  10: { targets: [LIFI_DIAMOND], spenders: [LIFI_DIAMOND] }, // Optimism
  56: { targets: [LIFI_DIAMOND], spenders: [LIFI_DIAMOND] }, // BNB Chain
  137: { targets: [LIFI_DIAMOND], spenders: [LIFI_DIAMOND] }, // Polygon
  8453: { targets: [LIFI_DIAMOND], spenders: [LIFI_DIAMOND] }, // Base
  42161: { targets: [LIFI_DIAMOND], spenders: [LIFI_DIAMOND] }, // Arbitrum
};

export type ContractCheck = { ok: true } | { ok: false; error: string; status: 400 | 502 };

function listed(list: readonly string[], address: string): boolean {
  const a = address.toLowerCase();
  return list.some((known) => known.toLowerCase() === a);
}

/**
 * Whether a LI.FI transaction may be signed on `chainId`: its target, and its
 * approval spender when there is one, must be known LI.FI contracts there.
 */
export function checkLifiContracts(
  chainId: number,
  target: string,
  approvalAddress?: string | null
): ContractCheck {
  const known = LIFI_CONTRACTS[chainId];
  if (!known) {
    return {
      ok: false,
      status: 400,
      error: "Bridging from this network is not available yet. Nothing was sent.",
    };
  }
  if (typeof target !== "string" || !listed(known.targets, target)) {
    return {
      ok: false,
      status: 502,
      error: "The bridge route points to a contract we don't recognize, so it was not sent.",
    };
  }
  if (approvalAddress != null && approvalAddress !== "" && !listed(known.spenders, approvalAddress)) {
    return {
      ok: false,
      status: 502,
      error: "The bridge asked to approve a contract we don't recognize, so nothing was sent.",
    };
  }
  return { ok: true };
}
