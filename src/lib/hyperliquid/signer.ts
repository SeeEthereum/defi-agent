/**
 * onchainos-backed EIP-712 signer for Hyperliquid.
 *
 * Bridges the onchainos TEE wallet ("onchainos wallet sign-message --type eip712")
 * to the viem-local-account shape expected by @nktkas/hyperliquid's
 * ExchangeClient (AbstractViemLocalAccount).
 *
 * The onchainos keystore is single-threaded and isolated per session; every
 * invocation goes through the unified `withOnchainosLock` mutex in
 * src/lib/okx/lock.ts, which also serializes the okx/cli.ts runCli path —
 * otherwise a signTypedData could race a walletBalance and corrupt keystore
 * state.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { withOnchainosLock } from "@/lib/okx/lock";
import { onchainosEnv, sessionHomeExists } from "@/lib/session/session";

const execFileAsync = promisify(execFile);

function resolveBin(): string {
  if (process.env.ONCHAINOS_PATH) return process.env.ONCHAINOS_PATH;
  const projectBin = path.join(process.cwd(), "bin", "onchainos");
  if (fs.existsSync(projectBin)) return projectBin;
  return path.join(process.env.HOME ?? "~", ".local", "bin", "onchainos");
}

const ONCHAINOS_BIN = resolveBin();

/**
 * Map an EIP-712 `domain.chainId` to the `--chain` flag onchainos expects.
 * HL's phantom chainId 1337 isn't a real chain — signing just needs a valid
 * onchainos key selector, and the HL account settles on Arbitrum, so fallback
 * there. Unknown chainIds fall back to arbitrum too since our keystore uses
 * the same address across all EVM chains.
 */
function chainIdToOnchainosChain(chainId: number): string {
  switch (chainId) {
    case 1: return "ethereum";
    case 42161: return "arbitrum";
    case 8453: return "base";
    case 10: return "optimism";
    case 137: return "polygon";
    case 56: return "bsc";
    case 43114: return "avalanche";
    // HL phantom-agent for L1 trading actions (signL1Action). chainId 1337
    // never settles on-chain — HL just embeds it in the EIP-712 domain so the
    // recovered EOA is unambiguous. Settlement happens on Arbitrum.
    case 1337: return "arbitrum";
    // HL user-signed actions (withdraw3, usdClassTransfer, approveAgent) use
    // signatureChainId = 0x66eee (= 421614). Same story: it's an embedded
    // domain id, not a real settlement chain. Route to arbitrum for the
    // keystore selector.
    case 421614: return "arbitrum";
    default: return "arbitrum";
  }
}

export class OnchainosSignerError extends Error {
  constructor(message: string, public stderr?: string) {
    super(message);
    this.name = "OnchainosSignerError";
  }
}

interface TypedDataDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}

interface TypedDataTypes {
  [key: string]: { name: string; type: string }[];
}

interface ViemTypedDataParams {
  domain: TypedDataDomain;
  types: TypedDataTypes;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Viem local-account-shaped wallet backed by onchainos.
 *
 * @nktkas/hyperliquid's AbstractViemLocalAccount requires:
 *   - `address: 0x...`
 *   - `signTypedData(params): Promise<0x...>`
 */
export class OnchainosWallet {
  readonly address: `0x${string}`;

  constructor(address: `0x${string}`) {
    this.address = address.toLowerCase() as `0x${string}`;
  }

  async signTypedData(params: ViemTypedDataParams): Promise<`0x${string}`> {
    // The HL SDK passes the full EIP-712 struct (domain + types + primaryType + message).
    // onchainos wallet sign-message --type eip712 accepts that JSON string as-is, plus
    // it also expects the top-level "EIP712Domain" entry in `types`. Add it defensively.
    const typesWithDomain: TypedDataTypes = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...params.types,
    };

    const payload = JSON.stringify({
      domain: params.domain,
      types: typesWithDomain,
      primaryType: params.primaryType,
      message: params.message,
    });

    // onchainos `--chain` selects which address/key in the keystore will sign.
    // It is NOT required to match `domain.chainId` inside the typed data (which
    // is part of what we're signing — HL's phantom-agent uses 1337 for L1
    // actions, 42161 for user-signed withdraw3/usdClassTransfer).
    //
    // We derive the CLI chain from `domain.chainId` so that if the keystore
    // is ever reconfigured with separate keys per chain, signing still routes
    // to the right key. For HL's phantom chainId 1337 (not a real chain) we
    // fall back to arbitrum, which is where HL settles.
    const chain = chainIdToOnchainosChain(params.domain.chainId);

    return withOnchainosLock(async () => {
      if (!sessionHomeExists()) {
        throw new OnchainosSignerError("Not logged in. Please sign in first.");
      }
      let stdout = "";
      let stderr = "";
      try {
        const result = await execFileAsync(
          ONCHAINOS_BIN,
          [
            "wallet",
            "sign-message",
            "--type",
            "eip712",
            "--message",
            payload,
            "--chain",
            chain,
            "--from",
            this.address,
            "--force",
          ],
          {
            timeout: 60_000,
            maxBuffer: 4 * 1024 * 1024,
            env: onchainosEnv(),
          }
        );
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        stdout = e.stdout ?? "";
        stderr = e.stderr ?? e.message ?? "";
      }

      let parsed: { ok?: boolean; data?: { signature?: string }; error?: string };
      try {
        parsed = JSON.parse(stdout);
      } catch {
        throw new OnchainosSignerError(
          `onchainos returned non-JSON output for sign-message (stderr: ${stderr.slice(0, 200)})`,
          stderr
        );
      }

      if (!parsed.ok || !parsed.data?.signature) {
        throw new OnchainosSignerError(
          parsed.error ?? `onchainos sign-message failed: ${stderr || "unknown"}`,
          stderr
        );
      }

      const sig = parsed.data.signature;
      if (!sig.startsWith("0x") || sig.length !== 132) {
        throw new OnchainosSignerError(
          `onchainos returned malformed signature: ${sig.slice(0, 10)}… (len=${sig.length})`
        );
      }
      return sig as `0x${string}`;
    });
  }
}
