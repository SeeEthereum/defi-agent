/**
 * Hyperliquid CLI wrapper
 *
 * Wraps the `hyperliquid-plugin` binary (OKX Plugin Store).
 * Read ops return immediately; write ops require --confirm.
 * Uses the same wallet keys as onchainos (OKX TEE).
 *
 * Error convention: the binary emits JSON to stdout, including {ok:false,...}
 * on domain errors. We always return the parsed JSON and let the caller decide
 * how to surface it. A throw only happens for binary invocation failures
 * (ENOENT, timeout, crash).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);

function resolveBin(): string {
  if (process.env.HYPERLIQUID_BIN) return process.env.HYPERLIQUID_BIN;
  const projectBin = path.join(process.cwd(), "bin", "hyperliquid-plugin");
  if (fs.existsSync(projectBin)) return projectBin;
  const home = process.env.HOME ?? "~";
  const localBin = path.join(home, ".local", "bin", "hyperliquid-plugin");
  if (fs.existsSync(localBin)) return localBin;
  return "hyperliquid-plugin";
}

const HL_BIN = resolveBin();

// ── Mutex: serialize all calls (plugin shares onchainos keyring with okx/cli) ─
let lock: Promise<void> = Promise.resolve();
function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let resolve: () => void;
  lock = new Promise((r) => {
    resolve = r;
  });
  return prev.then(fn).finally(() => resolve!());
}

// ── Structured responses ─────────────────────────────────────────────────────
export interface HlOk<T = unknown> {
  ok: true;
  data: T;
  raw: string;
}
export interface HlErr {
  ok: false;
  error: string;
  errorCode?: string;
  suggestion?: string;
  raw: string;
}
export type HlResult<T = unknown> = HlOk<T> | HlErr;

export class HyperliquidBinError extends Error {
  constructor(
    public command: string,
    public exitCode: number | null,
    public stderr: string,
    public stdout: string
  ) {
    super(`hyperliquid-plugin ${command} invocation failed: ${stderr || "unknown error"}`);
    this.name = "HyperliquidBinError";
  }
}

/**
 * Run a subcommand. Returns a structured HlResult — binary's {ok:false,...}
 * payloads become HlErr, and real invocation failures throw HyperliquidBinError.
 */
export async function runHl<T = unknown>(
  subcommand: string,
  flags: Record<string, string | boolean | undefined> = {}
): Promise<HlResult<T>> {
  const args: string[] = [subcommand];
  for (const [key, value] of Object.entries(flags)) {
    if (value === undefined || value === false || value === "") continue;
    if (value === true) {
      args.push(`--${key}`);
    } else {
      args.push(`--${key}`, String(value));
    }
  }

  return withMutex(async () => {
    let stdout = "";
    let stderr = "";
    try {
      const result = await execFileAsync(HL_BIN, args, {
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
        },
      });
      stdout = result.stdout;
      stderr = result.stderr;

      if (stderr && process.env.NODE_ENV !== "production") {
        console.warn(`[hyperliquid] ${subcommand} stderr:`, stderr.trim());
      }
    } catch (err: unknown) {
      const e = err as { code?: string; stdout?: string; stderr?: string; message?: string };
      stdout = e.stdout ?? "";
      stderr = e.stderr ?? e.message ?? "";

      // Try to parse stdout as the error JSON (plugin emits {ok:false} on domain errors)
      const parsedFromStdout = tryParseJson(stdout);
      if (parsedFromStdout && parsedFromStdout.ok === false) {
        return {
          ok: false,
          error: String(parsedFromStdout.error ?? stderr ?? "unknown error"),
          errorCode: typeof parsedFromStdout.error_code === "string" ? parsedFromStdout.error_code : undefined,
          suggestion: typeof parsedFromStdout.suggestion === "string" ? parsedFromStdout.suggestion : undefined,
          raw: stdout,
        };
      }

      console.error("[hyperliquid] bin failure", {
        cmd: subcommand,
        bin: HL_BIN,
        code: e.code,
        stderr: stderr.slice(0, 500),
      });
      throw new HyperliquidBinError(subcommand, null, stderr, stdout);
    }

    // Some commands emit informational lines before the JSON payload
    const jsonStart = stdout.indexOf("{");
    const jsonPayload = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
    const parsed = tryParseJson(jsonPayload);

    if (!parsed) {
      return { ok: true, data: stdout.trim() as unknown as T, raw: stdout };
    }
    if (parsed.ok === false) {
      return {
        ok: false,
        error: String(parsed.error ?? "unknown error"),
        errorCode: typeof parsed.error_code === "string" ? parsed.error_code : undefined,
        suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : undefined,
        raw: stdout,
      };
    }
    // Success — strip {ok:true} wrapper if present; expose the payload directly.
    if (parsed.ok === true) {
      const { ok: _ok, ...rest } = parsed;
      void _ok;
      return { ok: true, data: rest as T, raw: stdout };
    }
    return { ok: true, data: parsed as T, raw: stdout };
  });
}

function tryParseJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ── Read operations ──────────────────────────────────────────────────────────

export interface HlQuickstart {
  about?: string;
  wallet: string;
  assets: {
    arb_usdc_balance: number;
    hl_account_value_usd: number;
    hl_withdrawable_usd: number;
    hl_open_positions: number;
  };
  positions?: unknown[];
  status: "active" | "ready" | "needs_deposit" | "low_balance" | "no_funds";
  suggestion?: string;
  next_command?: string;
  onboarding_steps?: string[];
}

export async function hlQuickstart(address?: string) {
  return runHl<HlQuickstart>("quickstart", address ? { address } : {});
}

export interface HlPosition {
  coin: string;
  side: "long" | "short";
  size: string;
  entryPrice: string;
  markPrice?: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPrice: string;
  marginUsed: string;
  positionValue: string;
  leverage: { type: "cross" | "isolated"; value: number };
  cumulativeFunding?: string;
}

export interface HlPositionsResult {
  address: string;
  accountValue: string;
  totalMarginUsed: string;
  totalNotionalPosition: string;
  withdrawable: string;
  positions: HlPosition[];
}

export async function hlPositions(address?: string, showOrders = false) {
  const flags: Record<string, string | boolean> = {};
  if (address) flags.address = address;
  if (showOrders) flags["show-orders"] = true;
  return runHl<HlPositionsResult>("positions", flags);
}

export interface HlPricesResult {
  count: number;
  prices: Record<string, string>;
  coin?: string;
  midPrice?: string;
}

export async function hlPrices(coin?: string) {
  return runHl<HlPricesResult>("prices", coin ? { coin } : {});
}

export interface HlOrdersResult {
  orders: Array<{
    oid: number;
    coin: string;
    side: string;
    limitPrice: string;
    size: string;
    origSize: string;
    type?: string;
    reduceOnly?: boolean;
    timestamp: number;
  }>;
}

export async function hlOrders(coin?: string) {
  return runHl<HlOrdersResult>("orders", coin ? { coin } : {});
}

export interface HlRegisterResult {
  status: "ready" | "needs_agent" | "registered";
  hl_address: string;
  hl_signing_address?: string;
  message?: string;
}

export async function hlRegister(dryRun = false) {
  return runHl<HlRegisterResult>("register", dryRun ? { "dry-run": true } : {});
}

// ── In-memory registration cache ─────────────────────────────────────────────
// Re-registers automatically on cold start; subsequent requests reuse the cache.
// Cleared if >24h old or on explicit invalidation.
const REGISTER_TTL_MS = 24 * 60 * 60 * 1000;
let registerCache: { at: number; result: HlResult<HlRegisterResult> } | null = null;

export async function hlRegisterCached(force = false) {
  const now = Date.now();
  if (!force && registerCache && now - registerCache.at < REGISTER_TTL_MS) {
    return registerCache.result;
  }
  const result = await hlRegister();
  registerCache = { at: now, result };
  return result;
}

export function invalidateRegisterCache() {
  registerCache = null;
}

// ── Write operations ─────────────────────────────────────────────────────────

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
  reduceOnly?: boolean;
  slippage?: number;
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
  if (params.reduceOnly) flags["reduce-only"] = true;
  if (params.slippage !== undefined) flags.slippage = String(params.slippage);
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
