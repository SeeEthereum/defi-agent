/**
 * Hyperliquid CLI wrapper
 *
 * Wraps the `hyperliquid-plugin` binary (OKX Plugin Store).
 * Read ops return immediately; write ops require --confirm.
 * Uses the same wallet keys as onchainos (OKX TEE).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);

function resolveBin(): string {
  if (process.env.HYPERLIQUID_BIN) return process.env.HYPERLIQUID_BIN;
  const home = process.env.HOME ?? "~";
  const localBin = path.join(home, ".local", "bin", "hyperliquid-plugin");
  if (fs.existsSync(localBin)) return localBin;
  return "hyperliquid-plugin";
}

const HL_BIN = resolveBin();

export class HyperliquidCliError extends Error {
  constructor(
    public command: string,
    public exitCode: number | null,
    public stderr: string
  ) {
    super(`hyperliquid-plugin ${command} failed: ${stderr || "unknown error"}`);
    this.name = "HyperliquidCliError";
  }
}

export async function runHl<T = unknown>(
  subcommand: string,
  flags: Record<string, string | boolean> = {}
): Promise<T> {
  const args: string[] = [subcommand];

  for (const [key, value] of Object.entries(flags)) {
    if (value === true) {
      args.push(`--${key}`);
    } else if (value !== false && value !== "") {
      args.push(`--${key}`, String(value));
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(HL_BIN, args, {
      timeout: 60_000,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
      },
    });

    // Warn about stderr (not errors — binary may log there)
    if (stderr && process.env.NODE_ENV !== "production") {
      console.warn(`[hyperliquid] ${subcommand} stderr:`, stderr.trim());
    }

    try {
      const json = JSON.parse(stdout);
      if (json.ok === false) {
        throw new HyperliquidCliError(subcommand, 0, json.error ?? JSON.stringify(json));
      }
      return json as T;
    } catch (parseErr) {
      if (parseErr instanceof HyperliquidCliError) throw parseErr;
      // stdout is not JSON — return raw string
      return stdout.trim() as unknown as T;
    }
  } catch (err: unknown) {
    if (err instanceof HyperliquidCliError) throw err;
    const e = err as { code?: number; stderr?: string; message?: string };
    const stderr = e.stderr ?? e.message ?? "unknown error";
    const code = e.code ?? null;
    throw new HyperliquidCliError(subcommand, code, stderr);
  }
}

// ── Read operations ──────────────────────────────────────────────────────────

export async function hlQuickstart(address?: string) {
  return runHl("quickstart", address ? { address } : {});
}

export async function hlPositions(address?: string, showOrders = false) {
  const flags: Record<string, string | boolean> = {};
  if (address) flags.address = address;
  if (showOrders) flags["show-orders"] = true;
  return runHl("positions", flags);
}

export async function hlPrices(coin?: string) {
  return runHl("prices", coin ? { coin } : {});
}

export async function hlOrders(coin?: string) {
  return runHl("orders", coin ? { coin } : {});
}

export async function hlRegister(dryRun = false) {
  return runHl("register", dryRun ? { "dry-run": true } : {});
}

export async function hlAddress(mode?: "hyp-evm" | "all") {
  const flags: Record<string, string | boolean> = {};
  if (mode === "hyp-evm") flags["hyp-evm"] = true;
  if (mode === "all") flags.all = true;
  return runHl("address", flags);
}

export async function hlSpotBalances(showZero = false) {
  return runHl("spot-balances", showZero ? { "show-zero": true } : {});
}

export async function hlSpotPrices(token?: string, canonicalOnly = false) {
  const flags: Record<string, string | boolean> = {};
  if (token) flags.token = token;
  if (canonicalOnly) flags["canonical-only"] = true;
  return runHl("spot-prices", flags);
}

// ── Write operations (require confirm=true to broadcast) ─────────────────────

export interface HlOrderParams {
  coin: string;
  side: "buy" | "sell";
  size: string;
  type?: "market" | "limit";
  price?: string;
  leverage?: number;
  isolated?: boolean;
  slPx?: string;
  tpPx?: string;
  confirm?: boolean;
}

export async function hlOrder(params: HlOrderParams) {
  const flags: Record<string, string | boolean> = {
    coin: params.coin,
    side: params.side,
    size: params.size,
  };
  if (params.type) flags.type = params.type;
  if (params.price) flags.price = params.price;
  if (params.leverage !== undefined) flags.leverage = String(params.leverage);
  if (params.isolated) flags.isolated = true;
  if (params.slPx) flags["sl-px"] = params.slPx;
  if (params.tpPx) flags["tp-px"] = params.tpPx;
  if (params.confirm) flags.confirm = true;
  return runHl("order", flags);
}

export interface HlCloseParams {
  coin: string;
  size?: string;
  confirm?: boolean;
}

export async function hlClose(params: HlCloseParams) {
  const flags: Record<string, string | boolean> = { coin: params.coin };
  if (params.size) flags.size = params.size;
  if (params.confirm) flags.confirm = true;
  return runHl("close", flags);
}

export interface HlTpSlParams {
  coin: string;
  slPx?: string;
  tpPx?: string;
  size?: string;
  confirm?: boolean;
}

export async function hlTpSl(params: HlTpSlParams) {
  const flags: Record<string, string | boolean> = { coin: params.coin };
  if (params.slPx) flags["sl-px"] = params.slPx;
  if (params.tpPx) flags["tp-px"] = params.tpPx;
  if (params.size) flags.size = params.size;
  if (params.confirm) flags.confirm = true;
  return runHl("tpsl", flags);
}

export interface HlCancelParams {
  coin: string;
  orderId: string;
  confirm?: boolean;
}

export async function hlCancel(params: HlCancelParams) {
  const flags: Record<string, string | boolean> = {
    coin: params.coin,
    "order-id": params.orderId,
  };
  if (params.confirm) flags.confirm = true;
  return runHl("cancel", flags);
}

export interface HlDepositParams {
  amount: string;
  confirm?: boolean;
}

export async function hlDeposit(params: HlDepositParams) {
  const flags: Record<string, string | boolean> = { amount: params.amount };
  if (params.confirm) flags.confirm = true;
  return runHl("deposit", flags);
}

export interface HlWithdrawParams {
  amount: string;
  destination?: string;
  confirm?: boolean;
}

export async function hlWithdraw(params: HlWithdrawParams) {
  const flags: Record<string, string | boolean> = { amount: params.amount };
  if (params.destination) flags.destination = params.destination;
  if (params.confirm) flags.confirm = true;
  return runHl("withdraw", flags);
}

export interface HlTransferParams {
  amount: string;
  direction: "perp-to-spot" | "spot-to-perp";
  confirm?: boolean;
}

export async function hlTransfer(params: HlTransferParams) {
  const flags: Record<string, string | boolean> = {
    amount: params.amount,
    direction: params.direction,
  };
  if (params.confirm) flags.confirm = true;
  return runHl("transfer", flags);
}

export interface HlSpotOrderParams {
  coin: string;
  side: "buy" | "sell";
  size: string;
  type?: "market" | "limit";
  price?: string;
  confirm?: boolean;
}

export async function hlSpotOrder(params: HlSpotOrderParams) {
  const flags: Record<string, string | boolean> = {
    coin: params.coin,
    side: params.side,
    size: params.size,
  };
  if (params.type) flags.type = params.type;
  if (params.price) flags.price = params.price;
  if (params.confirm) flags.confirm = true;
  return runHl("spot-order", flags);
}
