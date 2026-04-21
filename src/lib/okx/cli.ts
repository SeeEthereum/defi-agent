import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import type { CliResult } from "./types";
import { appendBuilderCode } from "./builder-code";

const execFileAsync = promisify(execFile);

function resolveBin(): string {
  if (process.env.ONCHAINOS_PATH) return process.env.ONCHAINOS_PATH;
  // Project-local bin — installed here during Render build
  const projectBin = path.join(process.cwd(), "bin", "onchainos");
  if (fs.existsSync(projectBin)) return projectBin;
  // Local dev fallback
  return path.join(process.env.HOME ?? "~", ".local", "bin", "onchainos");
}

const ONCHAINOS_BIN = resolveBin();

// Mutex to serialize CLI calls (prevents keyring conflicts)
let lock: Promise<void> = Promise.resolve();

function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let resolve: () => void;
  lock = new Promise((r) => {
    resolve = r;
  });
  return prev.then(fn).finally(() => resolve!());
}

export class OkxCliError extends Error {
  constructor(
    public command: string,
    public exitCode: number | null,
    public stderr: string
  ) {
    super(`onchainos ${command} failed: ${stderr || "unknown error"}`);
    this.name = "OkxCliError";
  }
}

export async function runCli<T = unknown>(
  subcommands: string[],
  args: Record<string, string> = {}
): Promise<CliResult<T>> {
  return withMutex(async () => {
    const cmdArgs = [...subcommands];
    for (const [key, value] of Object.entries(args)) {
      if (value === "true") {
        cmdArgs.push(`--${key}`);
      } else if (value !== "" && value !== "false") {
        cmdArgs.push(`--${key}`, value);
      }
    }

    try {
      const { stdout, stderr } = await execFileAsync(ONCHAINOS_BIN, cmdArgs, {
        timeout: 30_000,
        env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
      });

      let parsed: T | undefined;
      try {
        const json = JSON.parse(stdout);
        if (json.ok !== undefined) {
          return { ok: json.ok, data: json.data as T, raw: stdout.trim() };
        }
        parsed = json as T;
      } catch {
        // stdout is not JSON
      }

      return {
        ok: true,
        data: (parsed ?? stdout.trim()) as T,
        raw: stdout.trim(),
      };
    } catch (error: unknown) {
      const err = error as {
        code?: string;
        exitCode?: number;
        stderr?: string;
        stdout?: string;
      };

      // Always log full details server-side for debugging
      console.error("[onchainos]", {
        cmd: subcommands.join(" "),
        bin: ONCHAINOS_BIN,
        home: process.env.HOME,
        exitCode: err.exitCode,
        code: err.code,
        stderr: err.stderr,
        stdout: err.stdout,
      });

      // Exit code 2 = confirming response (not an error)
      if (err.exitCode === 2 && err.stdout) {
        try {
          const json = JSON.parse(err.stdout);
          if (json.confirming) {
            return { ok: true, data: json as T, raw: err.stdout };
          }
        } catch {
          // not JSON confirming response
        }
      }

      // Region restriction
      if (
        err.stderr?.includes("50125") ||
        err.stderr?.includes("80001")
      ) {
        throw new OkxCliError(
          subcommands.join(" "),
          err.exitCode ?? null,
          "Service is not available in your region. Please switch to a supported region and try again."
        );
      }

      // Try to extract a meaningful message from stderr or stdout
      let detail = (err.stderr || "").trim();

      // Sometimes the CLI prints the error in stdout as JSON
      if (!detail && err.stdout) {
        try {
          const parsed = JSON.parse(err.stdout);
          detail =
            parsed.error?.message ??
            parsed.error ??
            parsed.msg ??
            parsed.message ??
            "";
        } catch {
          if (err.stdout.toLowerCase().includes("error") || err.stdout.toLowerCase().includes("fail")) {
            detail = err.stdout.trim();
          }
        }
      }

      // Include exit code in fallback message for easier diagnosis
      const fallback = err.code === "ENOENT"
        ? `Binary not found at: ${ONCHAINOS_BIN}`
        : `Command execution failed (exit ${err.exitCode ?? "?"}, code: ${err.code ?? "-"})`;

      throw new OkxCliError(
        subcommands.join(" "),
        err.exitCode ?? null,
        detail || fallback
      );
    }
  });
}

// Auth commands
export async function walletLogin(email?: string, locale = "en-US") {
  const args: Record<string, string> = { locale };
  if (email) {
    return runCli(["wallet", "login", email], args);
  }
  return runCli(["wallet", "login"], args);
}

export async function walletVerify(otp: string) {
  return runCli(["wallet", "verify", otp]);
}

export async function walletStatus() {
  return runCli(["wallet", "status"]);
}

export async function walletLogout() {
  return runCli(["wallet", "logout"]);
}

export async function walletAddresses(chain?: string) {
  const args: Record<string, string> = {};
  if (chain) args.chain = chain;
  return runCli(["wallet", "addresses"], args);
}

// Balance commands
export async function walletBalance(
  chain?: string,
  tokenAddress?: string,
  all = false,
  force = false
) {
  const args: Record<string, string> = {};
  if (chain) args.chain = chain;
  if (tokenAddress) args["token-address"] = tokenAddress;
  if (all) args.all = "true";
  if (force) args.force = "true";
  return runCli(["wallet", "balance"], args);
}

// Send command
export async function walletSend(params: {
  amount: string;
  recipient: string;
  chain: string;
  from?: string;
  contractToken?: string;
  force?: boolean;
}) {
  const args: Record<string, string> = {
    amount: params.amount,
    receipt: params.recipient,
    chain: params.chain,
  };
  if (params.from) args.from = params.from;
  if (params.contractToken) args["contract-token"] = params.contractToken;
  if (params.force) args.force = "true";
  return runCli(["wallet", "send"], args);
}

// Contract call command
export async function walletContractCall(params: {
  to: string;
  chain: string;
  inputData?: string;
  unsignedTx?: string;
  /**
   * Native token amount in minimal units (wei for EVM) as a whole-number
   * decimal string. Maps to onchainos `--amt`. Pass `"0"` or omit for
   * calls that don't transfer native value.
   */
  amt?: string;
  gasLimit?: string;
  from?: string;
  mevProtection?: boolean;
  jitoUnsignedTx?: string;
  aaDexTokenAddr?: string;
  aaDexTokenAmount?: string;
  force?: boolean;
  /**
   * Skip the ERC-8021 Builder Code suffix. Use for third-party calldata
   * (e.g. LI.FI bridges) where the receiving contract may validate
   * calldata length or reject trailing bytes.
   */
  skipBuilderCode?: boolean;
}) {
  const args: Record<string, string> = {
    to: params.to,
    chain: params.chain,
  };
  if (params.inputData) {
    args["input-data"] = params.skipBuilderCode
      ? params.inputData
      : appendBuilderCode(params.inputData) ?? params.inputData;
  }
  if (params.unsignedTx) args["unsigned-tx"] = params.unsignedTx;
  if (params.amt && params.amt !== "0") args.amt = params.amt;
  if (params.gasLimit) args["gas-limit"] = params.gasLimit;
  if (params.from) args.from = params.from;
  if (params.mevProtection) args["mev-protection"] = "true";
  if (params.jitoUnsignedTx) args["jito-unsigned-tx"] = params.jitoUnsignedTx;
  if (params.aaDexTokenAddr) args["aa-dex-token-addr"] = params.aaDexTokenAddr;
  if (params.aaDexTokenAmount)
    args["aa-dex-token-amount"] = params.aaDexTokenAmount;
  if (params.force) args.force = "true";
  return runCli(["wallet", "contract-call"], args);
}

// History command
export async function walletHistory(params?: {
  txHash?: string;
  chain?: string;
  address?: string;
  limit?: string;
  pageNum?: string;
}) {
  const args: Record<string, string> = {};
  if (params?.txHash) args["tx-hash"] = params.txHash;
  if (params?.chain) args.chain = params.chain;
  if (params?.address) args.address = params.address;
  if (params?.limit) args.limit = params.limit;
  if (params?.pageNum) args["page-num"] = params.pageNum;
  return runCli(["wallet", "history"], args);
}

// Security commands
export async function securityTxScan(params: {
  from: string;
  to: string;
  chain: string;
  data?: string;
  value?: string;
}) {
  const args: Record<string, string> = {
    from: params.from,
    to: params.to,
    chain: params.chain,
  };
  if (params.data) args.data = params.data;
  if (params.value) args.value = params.value;
  return runCli(["security", "tx-scan"], args);
}

// Token commands
export async function tokenSearch(query: string, chains?: string) {
  const args: Record<string, string> = { query };
  if (chains) args.chains = chains;
  return runCli(["token", "search"], args);
}

export async function tokenTrending(chain: string) {
  return runCli(["token", "trending"], { chain });
}

// Market / Portfolio PnL commands
export async function marketPortfolioOverview(chain: string, address: string) {
  return runCli(["market", "portfolio-overview"], { chain, address });
}

export async function marketPortfolioRecentPnl(chain: string, address: string, limit?: string) {
  const args: Record<string, string> = { chain, address };
  if (limit) args.limit = limit;
  return runCli(["market", "portfolio-recent-pnl"], args);
}

export async function marketPortfolioDexHistory(params: {
  chain: string;
  address: string;
  begin: string;
  end: string;
  limit?: string;
  txType?: string;
}) {
  const args: Record<string, string> = {
    chain: params.chain,
    address: params.address,
    begin: params.begin,
    end: params.end,
  };
  if (params.limit) args.limit = params.limit;
  if (params.txType) args["tx-type"] = params.txType;
  return runCli(["market", "portfolio-dex-history"], args);
}

export async function tokenHotTokens(params?: {
  chain?: string;
  rankBy?: string;
  timeFrame?: string;
  riskFilter?: string;
}) {
  const args: Record<string, string> = {};
  if (params?.chain) args.chain = params.chain;
  if (params?.rankBy) args["rank-by"] = params.rankBy;
  if (params?.timeFrame) args["time-frame"] = params.timeFrame;
  if (params?.riskFilter) args["risk-filter"] = params.riskFilter;
  return runCli(["token", "hot-tokens"], args);
}

// Swap commands
export async function swapQuote(params: {
  from: string;
  to: string;
  amount: string;
  chain: string;
}) {
  return runCli(["swap", "quote"], params);
}

export async function swapApprove(params: {
  token: string;
  amount: string;
  chain: string;
}) {
  return runCli(["swap", "approve"], params);
}

export async function swapExecute(params: {
  from: string;
  to: string;
  amount: string;
  chain: string;
  wallet: string;
  slippage?: string;
  gasLevel?: string;
}) {
  const args: Record<string, string> = {
    from: params.from,
    to: params.to,
    amount: params.amount,
    chain: params.chain,
    wallet: params.wallet,
  };
  if (params.slippage) args.slippage = params.slippage;
  if (params.gasLevel) args["gas-level"] = params.gasLevel;
  return runCli(["swap", "swap"], args);
}

// ── Security commands ────────────────────────────────────────────────────────

export async function securityTokenScan(params?: {
  tokens?: string;
  address?: string;
  chain?: string;
}) {
  const args: Record<string, string> = {};
  if (params?.tokens) args.tokens = params.tokens;
  if (params?.address) args.address = params.address;
  if (params?.chain) args.chain = params.chain;
  return runCli(["security", "token-scan"], args);
}

export async function securityApprovals(params: {
  address: string;
  chain?: string;
  limit?: string;
  cursor?: string;
}) {
  const args: Record<string, string> = { address: params.address };
  if (params.chain) args.chain = params.chain;
  if (params.limit) args.limit = params.limit;
  if (params.cursor) args.cursor = params.cursor;
  return runCli(["security", "approvals"], args);
}

export async function securityDappScan(domain: string) {
  return runCli(["security", "dapp-scan"], { domain });
}

// ── Market commands ──────────────────────────────────────────────────────────

export async function marketPrice(params: {
  address: string;
  chain: string;
}) {
  return runCli(["market", "price"], {
    address: params.address,
    chain: params.chain,
  });
}

export async function marketKline(params: {
  address: string;
  chain: string;
  bar?: string;
  limit?: string;
}) {
  const args: Record<string, string> = {
    address: params.address,
    chain: params.chain,
  };
  if (params.bar) args.bar = params.bar;
  if (params.limit) args.limit = params.limit;
  return runCli(["market", "kline"], args);
}

export async function marketIndex(params: {
  address: string;
  chain: string;
}) {
  return runCli(["market", "index"], {
    address: params.address,
    chain: params.chain,
  });
}

// ── Signal commands ──────────────────────────────────────────────────────────

export async function signalList(params: {
  chain: string;
  walletType?: string;
  minAmountUsd?: string;
  maxAmountUsd?: string;
  minAddressCount?: string;
  tokenAddress?: string;
  minMarketCapUsd?: string;
  maxMarketCapUsd?: string;
  minLiquidityUsd?: string;
  maxLiquidityUsd?: string;
}) {
  const args: Record<string, string> = { chain: params.chain };
  if (params.walletType) args["wallet-type"] = params.walletType;
  if (params.minAmountUsd) args["min-amount-usd"] = params.minAmountUsd;
  if (params.maxAmountUsd) args["max-amount-usd"] = params.maxAmountUsd;
  if (params.minAddressCount) args["min-address-count"] = params.minAddressCount;
  if (params.tokenAddress) args["token-address"] = params.tokenAddress;
  if (params.minMarketCapUsd) args["min-market-cap-usd"] = params.minMarketCapUsd;
  if (params.maxMarketCapUsd) args["max-market-cap-usd"] = params.maxMarketCapUsd;
  if (params.minLiquidityUsd) args["min-liquidity-usd"] = params.minLiquidityUsd;
  if (params.maxLiquidityUsd) args["max-liquidity-usd"] = params.maxLiquidityUsd;
  return runCli(["signal", "list"], args);
}

export async function signalChains() {
  return runCli(["signal", "chains"]);
}

// ── Gateway commands ─────────────────────────────────────────────────────────

export async function gatewayGas(chain: string) {
  return runCli(["gateway", "gas"], { chain });
}

export async function gatewaySimulate(params: {
  from: string;
  to: string;
  data: string;
  chain: string;
  amount?: string;
}) {
  const args: Record<string, string> = {
    from: params.from,
    to: params.to,
    data: params.data,
    chain: params.chain,
  };
  if (params.amount) args.amount = params.amount;
  return runCli(["gateway", "simulate"], args);
}

// ── Address tracker commands ─────────────────────────────────────────────────

export async function addressTrackerActivities(params: {
  trackerType: string;
  walletAddress?: string;
  tradeType?: string;
  chain?: string;
  minVolume?: string;
  maxVolume?: string;
  minMarketCap?: string;
  maxMarketCap?: string;
}) {
  const args: Record<string, string> = {
    "tracker-type": params.trackerType,
  };
  if (params.walletAddress) args["wallet-address"] = params.walletAddress;
  if (params.tradeType) args["trade-type"] = params.tradeType;
  if (params.chain) args.chain = params.chain;
  if (params.minVolume) args["min-volume"] = params.minVolume;
  if (params.maxVolume) args["max-volume"] = params.maxVolume;
  if (params.minMarketCap) args["min-market-cap"] = params.minMarketCap;
  if (params.maxMarketCap) args["max-market-cap"] = params.maxMarketCap;
  return runCli(["market", "address-tracker-activities"], args);
}

// ── Leaderboard commands ─────────────────────────────────────────────────────

export async function leaderboardList(params: {
  chain: string;
  timeFrame: string;
  sortBy: string;
  walletType?: string;
}) {
  const args: Record<string, string> = {
    chain: params.chain,
    "time-frame": params.timeFrame,
    "sort-by": params.sortBy,
  };
  if (params.walletType) args["wallet-type"] = params.walletType;
  return runCli(["leaderboard", "list"], args);
}

export async function leaderboardSupportedChains() {
  return runCli(["leaderboard", "supported-chains"]);
}
