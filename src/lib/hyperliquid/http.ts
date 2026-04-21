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
// The onchainos wallet IS the HL master in this deployment.
interface OnchainosAddressRecord {
  address: string;
  chainIndex?: string;
  chainName?: string;
}

let _cachedAddress: `0x${string}` | null = null;

export async function getOnchainosAddress(): Promise<`0x${string}`> {
  if (_cachedAddress) return _cachedAddress;
  if (process.env.HL_MASTER_ADDRESS) {
    _cachedAddress = process.env.HL_MASTER_ADDRESS.toLowerCase() as `0x${string}`;
    return _cachedAddress;
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
  _cachedAddress = arb.address.toLowerCase() as `0x${string}`;
  return _cachedAddress;
}

// ── Exchange client (write) ─────────────────────────────────────────────────
let _exchangeClient: hl.ExchangeClient | null = null;

export async function getExchangeClient(): Promise<hl.ExchangeClient> {
  if (_exchangeClient) return _exchangeClient;
  const address = await getOnchainosAddress();
  const wallet = new OnchainosWallet(address);
  _exchangeClient = new hl.ExchangeClient({
    transport: getTransport(),
    wallet,
    isTestnet: IS_TESTNET,
  });
  return _exchangeClient;
}

export function isTestnet(): boolean {
  return IS_TESTNET;
}
