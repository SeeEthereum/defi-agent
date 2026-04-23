/**
 * onchainos-backed EIP-712 signer for Hyperliquid.
 *
 * Bridges the onchainos TEE wallet ("onchainos wallet sign-message --type eip712")
 * to the viem-local-account shape expected by @nktkas/hyperliquid's
 * ExchangeClient (AbstractViemLocalAccount).
 *
 * The onchainos keystore is single-threaded and shared process-wide; every
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

const execFileAsync = promisify(execFile);

function resolveBin(): string {
  if (process.env.ONCHAINOS_PATH) return process.env.ONCHAINOS_PATH;
  const projectBin = path.join(process.cwd(), "bin", "onchainos");
  if (fs.existsSync(projectBin)) return projectBin;
  return path.join(process.env.HOME ?? "~", ".local", "bin", "onchainos");
}

const ONCHAINOS_BIN = resolveBin();

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

    // HL requires Arbitrum for on-chain operations like usdClassTransfer/withdraw3
    // but phantom-agent (order/cancel) uses chainId 1337 over a user-chain signature.
    // onchainos needs a "chain" matching the `from` address key — arbitrum always works
    // for this account since the same address is registered across all EVM chains.
    const chain = "arbitrum";

    return withOnchainosLock(async () => {
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
            env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
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
