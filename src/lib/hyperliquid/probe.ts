/**
 * Detect the EOA address that backs the onchainos wallet's HL signing key.
 *
 * Why this exists
 * ---------------
 * onchainos can operate in two modes:
 *   1. EOA — the wallet address IS the underlying ECDSA signer. Signatures
 *      recover to the same address `wallet addresses` returns.
 *   2. AA (account abstraction) — the wallet address is a smart-contract
 *      address. Signatures still come from an underlying EOA, but that
 *      EOA's address ≠ the AA wallet's address.
 *
 * Hyperliquid does NOT support ERC-1271 (smart-contract signatures): every
 * write goes through ECDSA recovery on the API server side. The recovered
 * address IS the HL user. So:
 *   - In mode (1): AA == EOA, everything Just Works.
 *   - In mode (2): orders/positions/balances live at the EOA, NOT the AA
 *     reported by `wallet addresses`. Querying `clearinghouseState({ user:
 *     AA })` returns empty; depositing to the AA on Arbitrum credits an HL
 *     account whose key we don't control.
 *
 * The hyperliquid-plugin SKILL.md documents this and ships a `register`
 * command for exactly this purpose. We replicate that probe here.
 *
 * Method
 * ------
 * Sign a deterministic, never-broadcast EIP-712 payload via OnchainosWallet
 * (which routes to `onchainos wallet sign-message --type eip712`), then
 * recover the signer locally with viem's `recoverTypedDataAddress`. Compare
 * to the AA address from the keystore.
 *
 * Risk of signing a fake payload: the signature is for an `Agent` typed
 * object with `connectionId` = zero bytes32. To use this signature, an
 * attacker would have to submit it as part of an HL `{action, signature,
 * nonce}` payload — but `connectionId` is supposed to be the msgpack hash
 * of (action, nonce). Zero connectionId never matches any real action,
 * so HL would reject the submission. The signature is unusable as a real
 * action. Replay-safe.
 *
 * Cache: 24h. The signing key is keystore-level and only changes when the
 * operator switches accounts. We invalidate on `walletLogout` and on
 * explicit force-refresh.
 */
import { recoverTypedDataAddress } from "viem";
import { OnchainosWallet } from "./signer";
import { getOnchainosAddress } from "./http";
import { currentSession } from "@/lib/session/session";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as `0x${string}`;

// The exact EIP-712 typed data we sign + recover. Mirrors the shape
// `signL1Action` builds in @nktkas/hyperliquid (phantom chain 1337,
// domain="Exchange"). Using the same shape exercises the full keystore
// → CLI → signature → recovery path the real order flow uses, so a
// successful match here is strong evidence the order flow will work too.
const PROBE = {
  domain: {
    name: "Exchange" as const,
    version: "1" as const,
    chainId: 1337,
    verifyingContract: ZERO_ADDR,
  },
  types: {
    Agent: [
      { name: "source", type: "string" },
      { name: "connectionId", type: "bytes32" },
    ],
  } as const,
  primaryType: "Agent" as const,
  message: {
    source: "defi-app-probe-v1",
    connectionId: ZERO_BYTES32,
  },
} as const;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface ProbeResult {
  /** AA wallet address as reported by `onchainos wallet addresses`. */
  aa: `0x${string}`;
  /** EOA recovered from an ECDSA signature over the probe payload. */
  eoa: `0x${string}`;
  /** True iff aa and eoa are the same address (case-insensitive). */
  match: boolean;
}

const cachedBySession = new Map<string, { at: number; result: ProbeResult }>();

/**
 * Run the probe. Cached for 24h unless `force=true`.
 *
 * Throws if the onchainos session is expired or the CLI is otherwise
 * unable to sign. Callers should treat a thrown probe as "status unknown,
 * fall back to AA semantics" — i.e. behave as if the legacy assumption
 * (AA == EOA) holds, which is the pre-2026-05 default.
 */
export async function detectHlSigningAddress(force = false): Promise<ProbeResult> {
  const now = Date.now();
  const { sid } = currentSession();
  const cached = cachedBySession.get(sid);
  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }

  const aa = (await getOnchainosAddress()).toLowerCase() as `0x${string}`;

  const wallet = new OnchainosWallet(aa);
  const signature = await wallet.signTypedData({
    domain: PROBE.domain,
    types: PROBE.types as unknown as { [key: string]: { name: string; type: string }[] },
    primaryType: PROBE.primaryType,
    message: PROBE.message as unknown as Record<string, unknown>,
  });

  const eoa = (
    await recoverTypedDataAddress({
      domain: PROBE.domain,
      types: PROBE.types as unknown as { [key: string]: { name: string; type: string }[] },
      primaryType: PROBE.primaryType,
      message: PROBE.message as unknown as Record<string, unknown>,
      signature,
    })
  ).toLowerCase() as `0x${string}`;

  const result: ProbeResult = { aa, eoa, match: aa === eoa };
  if (!cachedBySession.has(sid) && cachedBySession.size >= 1000) {
    const oldest = cachedBySession.keys().next().value;
    if (oldest !== undefined) cachedBySession.delete(oldest);
  }
  cachedBySession.set(sid, { at: now, result });
  return result;
}

/**
 * The address HL info queries (clearinghouseState, openOrders,
 * userFills, etc.) should be keyed by.
 *
 * - If probe succeeded and AA == EOA → returns AA (== EOA, same thing).
 * - If probe succeeded and AA != EOA → returns EOA. This is the actual
 *   HL user for the keystore.
 * - If probe FAILED (e.g. session expired) → falls back to AA. Callers
 *   get a sensible default and the failure is logged; we don't want a
 *   session blip to take down `/wallet` etc.
 */
export async function getHlUserAddress(): Promise<`0x${string}`> {
  try {
    const { eoa } = await detectHlSigningAddress();
    return eoa;
  } catch (err) {
    console.warn("[hl/probe] detectHlSigningAddress failed, falling back to AA address", err);
    return (await getOnchainosAddress()).toLowerCase() as `0x${string}`;
  }
}

/** Drop the cache. Call from logout / account-switch paths. */
export function invalidateHlSigningAddressCache(): void {
  cachedBySession.delete(currentSession().sid);
}
