/**
 * Hyperliquid HTTP clients, lazily instantiated.
 *
 * Uses @nktkas/hyperliquid for transport + EIP-712 signing abstractions.
 * The write client is bound to an OnchainosWallet that proxies signing
 * to the TEE-backed onchainos keystore.
 */
import * as hl from "@nktkas/hyperliquid";
import { OnchainosWallet } from "./signer";
import { walletAddresses } from "@/lib/okx/cli";
import { currentSession } from "@/lib/session/session";

// Mainnet unless HL_TESTNET=true
const IS_TESTNET = process.env.HL_TESTNET === "true";

let _transport: hl.HttpTransport | null = null;
function getTransport(): hl.HttpTransport {
  if (!_transport) {
    _transport = new hl.HttpTransport({
      isTestnet: IS_TESTNET,
    });
  }
  return _transport;
}

let _infoClient: hl.InfoClient | null = null;
export function getInfoClient(): hl.InfoClient {
  if (!_infoClient) {
    _infoClient = new hl.InfoClient({ transport: getTransport() });
  }
  return _infoClient;
}

// ── Address resolution ──────────────────────────────────────────────────────
// The onchainos wallet IS the HL master for the current session. The address is
// cached per session with a short TTL so multi-account switches in the keystore
// are picked up without needing a process restart. An explicit
// invalidateHlClients() is also exposed for places that *know* the account just
// changed (e.g. after an auth swap) and want to force re-resolution immediately.
interface OnchainosAddressRecord {
  address: string;
  chainIndex?: string;
  chainName?: string;
}

const ADDRESS_TTL_MS = 5 * 60 * 1000;

const perSession = new Map<string, {
  address?: { at: number; value: `0x${string}` };
  exchangeClient?: hl.ExchangeClient;
  exchangeClientAddress?: `0x${string}`;
}>();

function sessionState() {
  const { sid } = currentSession();
  let entry = perSession.get(sid);
  if (!entry) {
    if (perSession.size >= 1000) {
      const oldest = perSession.keys().next().value;
      if (oldest !== undefined) perSession.delete(oldest);
    }
    entry = {};
    perSession.set(sid, entry);
  }
  return entry;
}

export async function getOnchainosAddress(): Promise<`0x${string}`> {
  const now = Date.now();
  const state = sessionState();
  if (state.address && now - state.address.at < ADDRESS_TTL_MS) {
    return state.address.value;
  }
  const result = await walletAddresses();
  if (!result.ok) {
    throw new Error(`Failed to get onchainos addresses: ${(result.raw || "").slice(0, 200)}`);
  }
  const data = result.data as { evm?: OnchainosAddressRecord[] } | null;
  const evm = data?.evm ?? [];
  // Any EVM address works — they're the same per account.
  const arb = evm.find((e) => e.chainIndex === "42161") ?? evm[0];
  if (!arb?.address) {
    throw new Error("No EVM address found in onchainos wallet addresses response");
  }
  const fresh = arb.address.toLowerCase() as `0x${string}`;

  // If the address changed under us, drop the exchange client — it's bound
  // to the previous wallet and must be rebuilt before any write.
  if (state.address && state.address.value !== fresh) {
    state.exchangeClient = undefined;
  }
  state.address = { at: now, value: fresh };
  return fresh;
}

// ── Exchange client (write) ─────────────────────────────────────────────────
export async function getExchangeClient(): Promise<hl.ExchangeClient> {
  const address = await getOnchainosAddress();
  const state = sessionState();
  // Defensive: if the address changed since last build, rebuild. getOnchainosAddress
  // already clears the session's exchange client on change, but this keeps the
  // invariant local.
  if (state.exchangeClient && state.exchangeClientAddress === address) return state.exchangeClient;
  const wallet = new OnchainosWallet(address);
  state.exchangeClient = new hl.ExchangeClient({
    transport: getTransport(),
    wallet,
    isTestnet: IS_TESTNET,
  });
  state.exchangeClientAddress = address;
  return state.exchangeClient;
}

/**
 * Drop the current session's HL cache (address + exchange client). Safe to call
 * at any time; next access rebuilds from the keystore. Route handlers should
 * call this after events that imply a wallet swap (future multi-account UI).
 */
export function invalidateHlClients(): void {
  perSession.delete(currentSession().sid);
}

export function isTestnet(): boolean {
  return IS_TESTNET;
}
