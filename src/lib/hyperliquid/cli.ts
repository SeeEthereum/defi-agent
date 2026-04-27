/**
 * Hyperliquid API wrapper (native HTTP, not a CLI anymore).
 *
 * Previously this wrapped a `hyperliquid-plugin` binary via execFile; that has
 * been ripped out in favour of Hyperliquid's native HTTP API via
 * @nktkas/hyperliquid. The file is still called `cli.ts` to avoid churning the
 * many callers in src/app/api/perp/*; nothing here shells out.
 *
 * All functions return the same { ok, data } / { ok:false, error } shape the
 * rest of the app expects. Domain errors (bad params, insufficient margin,
 * min-notional, etc.) surface as HlErr; transport/signing failures throw
 * HyperliquidApiError (HyperliquidBinError's successor).
 *
 * Signing goes through the TEE-backed onchainos wallet (see ./signer.ts).
 * The onchainos wallet address IS the HL master in this deployment, so the
 * "register" concept is a no-op beyond confirming we know the address.
 */
import { getInfoClient, getExchangeClient, getOnchainosAddress } from "./http";
import { walletBalance, walletSend } from "@/lib/okx/cli";

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

export class HyperliquidApiError extends Error {
  constructor(public command: string, public detail: string) {
    super(`hyperliquid ${command} failed: ${detail || "unknown error"}`);
    this.name = "HyperliquidApiError";
  }
}

function ok<T>(data: T): HlOk<T> {
  return { ok: true, data, raw: JSON.stringify(data) };
}
function err(error: string, opts?: { errorCode?: string; suggestion?: string; raw?: string }): HlErr {
  return {
    ok: false,
    error,
    errorCode: opts?.errorCode,
    suggestion: opts?.suggestion,
    raw: opts?.raw ?? JSON.stringify({ ok: false, error }),
  };
}

function mapSdkError(e: unknown): HlErr {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  let code: string | undefined;
  if (lower.includes("insufficient margin")) code = "INSUFFICIENT_MARGIN";
  else if (lower.includes("insufficient") && lower.includes("balance")) code = "INSUFFICIENT_BALANCE";
  else if (lower.includes("min") && lower.includes("notional")) code = "MIN_NOTIONAL";
  else if (lower.includes("reduce") && lower.includes("only")) code = "REDUCE_ONLY_VIOLATION";
  else if (lower.includes("price") && (lower.includes("band") || lower.includes("far"))) code = "PRICE_OUT_OF_BAND";
  else if (lower.includes("sign")) code = "SIGNING_FAILED";
  return err(msg, { errorCode: code });
}

// ── Meta cache (asset id + szDecimals) ──────────────────────────────────────
interface MetaCache {
  at: number;
  byName: Map<string, { assetId: number; szDecimals: number; maxLeverage: number }>;
}
let metaCache: MetaCache | null = null;
const META_TTL_MS = 10 * 60 * 1000;

async function getMeta(): Promise<MetaCache> {
  if (metaCache && Date.now() - metaCache.at < META_TTL_MS) return metaCache;
  const meta = await getInfoClient().meta();
  const byName = new Map<string, { assetId: number; szDecimals: number; maxLeverage: number }>();
  meta.universe.forEach((u, idx) => {
    byName.set(u.name, {
      assetId: idx,
      szDecimals: u.szDecimals,
      maxLeverage: u.maxLeverage,
    });
  });
  metaCache = { at: Date.now(), byName };
  return metaCache;
}

async function resolveAsset(coin: string): Promise<{ assetId: number; szDecimals: number; maxLeverage: number }> {
  const cache = await getMeta();
  const entry = cache.byName.get(coin);
  if (!entry) throw new HyperliquidApiError("resolveAsset", `unknown coin: ${coin}`);
  return entry;
}

// Round size down to the max allowed decimals for an asset.
function roundSize(size: number, szDecimals: number): string {
  const factor = Math.pow(10, szDecimals);
  const rounded = Math.floor(size * factor) / factor;
  return rounded.toFixed(szDecimals);
}

// HL price tick rules: perps allow up to 5 significant figures and at most
// (6 - szDecimals) decimal places.
function roundPrice(price: number, szDecimals: number): string {
  if (!Number.isFinite(price) || price <= 0) return price.toString();
  const maxDecimals = Math.max(0, 6 - szDecimals);
  // Limit to 5 significant figures.
  const sig = 5;
  const magnitude = Math.floor(Math.log10(price));
  const decimalsForSig = Math.max(0, sig - 1 - magnitude);
  const decimals = Math.min(maxDecimals, decimalsForSig);
  const factor = Math.pow(10, decimals);
  return (Math.round(price * factor) / factor).toFixed(decimals);
}

/**
 * Worst-fill limit price for a market trigger order (TP/SL).
 *
 * HL's `trigger.isMarket = true` orders still require a limit `p` field —
 * it's the worst-acceptable fill price. The HL UI default (and the
 * hyperliquid-plugin default) is 10% slippage tolerance: when the trigger
 * fires, the close should fill at any price within 10% of triggerPx in the
 * appropriate direction.
 *
 * - Closing a long → side=sell → fills at any price ≥ p → p = triggerPx * 0.9
 * - Closing a short → side=buy → fills at any price ≤ p → p = triggerPx * 1.1
 *
 * Without this buffer (`p = triggerPx`), a fast move past the trigger leaves
 * the market order unfillable and the position unprotected.
 */
function tpslWorstFillPx(triggerPx: number, isBuyToClose: boolean): number {
  return isBuyToClose ? triggerPx * 1.1 : triggerPx * 0.9;
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

const USDC_ARB = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

async function fetchArbUsdcBalance(address: string): Promise<number> {
  try {
    const bal = await walletBalance("42161", USDC_ARB);
    if (!bal.ok) return 0;
    const data = bal.data as { details?: Array<{ tokenAssets?: Array<{ balance?: string; tokenAddress?: string; symbol?: string }> }> } | null;
    const assets = data?.details?.[0]?.tokenAssets ?? [];
    const usdc = assets.find(
      (a) =>
        (a.tokenAddress ?? "").toLowerCase() === USDC_ARB.toLowerCase() ||
        (a.symbol ?? "").toUpperCase() === "USDC"
    );
    void address;
    return usdc?.balance ? Number(usdc.balance) : 0;
  } catch {
    return 0;
  }
}

export async function hlQuickstart(address?: string): Promise<HlResult<HlQuickstart>> {
  try {
    const user = ((address ?? (await getOnchainosAddress())) as `0x${string}`).toLowerCase() as `0x${string}`;
    const info = getInfoClient();
    const [state, arbBal] = await Promise.all([
      info.clearinghouseState({ user }),
      fetchArbUsdcBalance(user),
    ]);

    const accountValue = Number(state.marginSummary.accountValue);
    const withdrawable = Number(state.withdrawable);
    const openPositions = state.assetPositions.length;

    let status: HlQuickstart["status"];
    let suggestion: string | undefined;
    if (openPositions > 0) {
      status = "active";
    } else if (accountValue >= 10) {
      status = "ready";
      suggestion = "Account funded. Ready to trade.";
    } else if (accountValue > 0) {
      status = "low_balance";
      suggestion = "Account value is below $10. Deposit more USDC to trade.";
    } else if (arbBal >= 5) {
      status = "needs_deposit";
      suggestion = `You have ${arbBal.toFixed(2)} USDC on Arbitrum. Deposit into Hyperliquid to start trading.`;
    } else {
      status = "no_funds";
      suggestion = "No USDC on Arbitrum. Bridge or deposit USDC first (minimum $5 to deposit to HL).";
    }

    return ok<HlQuickstart>({
      wallet: user,
      assets: {
        arb_usdc_balance: arbBal,
        hl_account_value_usd: accountValue,
        hl_withdrawable_usd: withdrawable,
        hl_open_positions: openPositions,
      },
      positions: state.assetPositions,
      status,
      suggestion,
    });
  } catch (e) {
    return mapSdkError(e);
  }
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

export async function hlPositions(address?: string, _showOrders = false): Promise<HlResult<HlPositionsResult>> {
  void _showOrders;
  try {
    const user = ((address ?? (await getOnchainosAddress())) as `0x${string}`).toLowerCase() as `0x${string}`;
    const state = await getInfoClient().clearinghouseState({ user });
    const positions: HlPosition[] = state.assetPositions.map((ap) => {
      const p = ap.position;
      const szi = Number(p.szi);
      return {
        coin: p.coin,
        side: szi >= 0 ? "long" : "short",
        size: Math.abs(szi).toString(),
        entryPrice: p.entryPx,
        unrealizedPnl: p.unrealizedPnl,
        returnOnEquity: p.returnOnEquity,
        liquidationPrice: p.liquidationPx ?? "0",
        marginUsed: p.marginUsed,
        positionValue: p.positionValue,
        leverage: { type: p.leverage.type, value: p.leverage.value },
        cumulativeFunding: p.cumFunding.sinceOpen,
      };
    });
    return ok<HlPositionsResult>({
      address: user,
      accountValue: state.marginSummary.accountValue,
      totalMarginUsed: state.marginSummary.totalMarginUsed,
      totalNotionalPosition: state.marginSummary.totalNtlPos,
      withdrawable: state.withdrawable,
      positions,
    });
  } catch (e) {
    return mapSdkError(e);
  }
}

export interface HlPricesResult {
  count: number;
  prices: Record<string, string>;
  coin?: string;
  midPrice?: string;
}

export async function hlPrices(coin?: string): Promise<HlResult<HlPricesResult>> {
  try {
    const mids = (await getInfoClient().allMids()) as Record<string, string>;
    if (coin) {
      const midPrice = mids[coin];
      if (!midPrice) return err(`No mid price for coin: ${coin}`);
      return ok<HlPricesResult>({ count: 1, prices: { [coin]: midPrice }, coin, midPrice });
    }
    return ok<HlPricesResult>({ count: Object.keys(mids).length, prices: mids });
  } catch (e) {
    return mapSdkError(e);
  }
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

export async function hlOrders(coin?: string): Promise<HlResult<HlOrdersResult>> {
  try {
    const user = (await getOnchainosAddress()) as `0x${string}`;
    const raw = await getInfoClient().openOrders({ user });
    const orders = raw
      .filter((o) => !coin || o.coin === coin)
      .map((o) => ({
        oid: o.oid,
        coin: o.coin,
        side: o.side === "B" ? "buy" : "sell",
        limitPrice: o.limitPx,
        size: o.sz,
        origSize: o.origSz,
        reduceOnly: o.reduceOnly ?? false,
        timestamp: o.timestamp,
      }));
    return ok<HlOrdersResult>({ orders });
  } catch (e) {
    return mapSdkError(e);
  }
}

// ── Registration (no-op: onchainos address IS the master) ────────────────────

export interface HlRegisterResult {
  status: "ready" | "needs_agent" | "registered";
  hl_address: string;
  hl_signing_address?: string;
  message?: string;
}

export async function hlRegister(_dryRun = false): Promise<HlResult<HlRegisterResult>> {
  void _dryRun;
  try {
    const addr = await getOnchainosAddress();
    return ok<HlRegisterResult>({
      status: "ready",
      hl_address: addr,
      hl_signing_address: addr,
      message: "onchainos wallet is the HL master; no agent required.",
    });
  } catch (e) {
    return mapSdkError(e);
  }
}

// Historical note: an earlier version kept a 24h cache for register because
// it wrapped a heavy plugin-binary call. The new `hlRegister` is just a
// read of `getOnchainosAddress()` (which itself has a 5-min cache in http.ts),
// so a second cache layer only adds risk of serving a stale wallet after an
// account swap. The cached wrappers are kept as thin pass-throughs so the
// /api/perp/register route doesn't need to change.
export async function hlRegisterCached(_force = false): Promise<HlResult<HlRegisterResult>> {
  void _force;
  return hlRegister();
}

// Kept for API compatibility — callers use this when they detect a wallet
// swap. The heavy lifting is now done by `invalidateHlClients()` in http.ts,
// which clears the address cache that this function ultimately reads.
export function invalidateRegisterCache(): void {
  // no-op: no cache to invalidate here anymore.
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

interface OrderPreview {
  preview: true;
  coin: string;
  side: "buy" | "sell";
  size: string;
  type: "market" | "limit";
  price: string;
  est_notional_usd: number;
  mid_price: string;
  reduce_only: boolean;
  message: string;
}

export async function hlOrder(params: HlOrderParams): Promise<HlResult<unknown>> {
  try {
    const asset = await resolveAsset(params.coin);
    const mids = (await getInfoClient().allMids()) as Record<string, string>;
    const midPx = Number(mids[params.coin]);
    if (!Number.isFinite(midPx) || midPx <= 0) return err(`No mid price for ${params.coin}`);

    const sizeNum = Number(params.size);
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) return err(`Invalid size: ${params.size}`);

    const slippage = params.slippage ?? 1.0; // %
    const isMarket = (params.type ?? "market") === "market";
    let limitPxNum: number;
    if (isMarket) {
      const slip = slippage / 100;
      limitPxNum = params.side === "buy" ? midPx * (1 + slip) : midPx * (1 - slip);
    } else {
      if (!params.price) return err("Limit orders require a price");
      limitPxNum = Number(params.price);
      if (!Number.isFinite(limitPxNum) || limitPxNum <= 0) return err(`Invalid price: ${params.price}`);
    }

    const sizeStr = roundSize(sizeNum, asset.szDecimals);
    const pxStr = roundPrice(limitPxNum, asset.szDecimals);
    const notional = Number(sizeStr) * Number(pxStr);

    if (notional < 10) {
      return err(`Order notional $${notional.toFixed(2)} is below HL minimum of $10`, {
        errorCode: "MIN_NOTIONAL",
      });
    }

    if (!params.confirm) {
      const preview: OrderPreview = {
        preview: true,
        coin: params.coin,
        side: params.side,
        size: sizeStr,
        type: isMarket ? "market" : "limit",
        price: pxStr,
        est_notional_usd: Number(notional.toFixed(2)),
        mid_price: String(midPx),
        reduce_only: params.reduceOnly ?? false,
        message: `Preview: ${params.side.toUpperCase()} ${sizeStr} ${params.coin} @ ${pxStr} (~$${notional.toFixed(2)}). Resend with confirm:true to execute.`,
      };
      return ok(preview);
    }

    // Optional leverage update — must succeed before we place the order. If
    // this fails silently and the previous leverage is different, the user
    // gets a position sized for leverage X but opened at leverage Y, which
    // changes the notional exposure and margin requirements. Fail fast.
    if (params.leverage !== undefined) {
      try {
        const client = await getExchangeClient();
        await client.updateLeverage({
          asset: asset.assetId,
          isCross: !params.isolated,
          leverage: params.leverage,
        });
      } catch (e) {
        return err(
          `Leverage update to ${params.leverage}x failed: ${(e as Error).message}. Order not placed.`,
          { errorCode: "LEVERAGE_UPDATE_FAILED" }
        );
      }
    }

    // Atomic bracket: parent + optional TP/SL go in ONE order request.
    // Prior code submitted them as two separate `client.order()` calls, which
    // (a) breaks HL's `normalTpsl` semantics ("children activate only when
    // the entry fills" + "if entry partially fills, children activate
    // proportionally"), and (b) opens a window where the parent fills but
    // the second request fails, leaving the position unprotected. With the
    // unified request, HL atomically links the children to the entry.
    const wantsBracket = (params.slPx || params.tpPx) && !params.reduceOnly;
    const oppSide = params.side === "buy" ? false : true;

    type ParentOrder = { a: number; b: boolean; p: string; s: string; r: boolean; t: { limit: { tif: "Ioc" | "Gtc" | "Alo" | "FrontendMarket" } } };
    type TriggerOrder = { a: number; b: boolean; p: string; s: string; r: boolean; t: { trigger: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" } } };
    const orders: Array<ParentOrder | TriggerOrder> = [
      {
        a: asset.assetId,
        b: params.side === "buy",
        p: pxStr,
        s: sizeStr,
        r: params.reduceOnly ?? false,
        t: isMarket
          ? { limit: { tif: "Ioc" } }
          : { limit: { tif: "Gtc" } },
      },
    ];

    if (wantsBracket && params.tpPx) {
      const tpTrigger = roundPrice(Number(params.tpPx), asset.szDecimals);
      const tpLimit = roundPrice(tpslWorstFillPx(Number(tpTrigger), oppSide), asset.szDecimals);
      orders.push({
        a: asset.assetId, b: oppSide, p: tpLimit, s: sizeStr, r: true,
        t: { trigger: { isMarket: true, triggerPx: tpTrigger, tpsl: "tp" } },
      });
    }
    if (wantsBracket && params.slPx) {
      const slTrigger = roundPrice(Number(params.slPx), asset.szDecimals);
      const slLimit = roundPrice(tpslWorstFillPx(Number(slTrigger), oppSide), asset.szDecimals);
      orders.push({
        a: asset.assetId, b: oppSide, p: slLimit, s: sizeStr, r: true,
        t: { trigger: { isMarket: true, triggerPx: slTrigger, tpsl: "sl" } },
      });
    }

    const client = await getExchangeClient();
    const res = await client.order({
      orders,
      grouping: orders.length > 1 ? "normalTpsl" : "na",
    });

    const statuses = res.response.data.statuses;

    // Parent is statuses[0]. If it errored, the children (if any) are moot —
    // they're orphaned by HL anyway since `normalTpsl` ties them to the entry.
    const parentStatus = statuses[0];
    if (typeof parentStatus === "object" && parentStatus !== null && "error" in parentStatus) {
      return err((parentStatus as { error: string }).error);
    }

    // Children are statuses[1..]. If a child errored, the position IS open
    // (parent succeeded) but TP/SL didn't attach. We surface a warning rather
    // than unwinding — there's no atomic rollback in HL, and unwinding would
    // create a separate trade the user didn't ask for.
    let tpslAttached: true | false | "n/a" = "n/a";
    let tpslError: string | undefined;
    if (statuses.length > 1) {
      const childErr = statuses.slice(1).find(
        (s) => typeof s === "object" && s !== null && "error" in s
      );
      if (childErr && typeof childErr === "object" && "error" in childErr) {
        tpslAttached = false;
        tpslError = (childErr as { error: string }).error;
      } else {
        tpslAttached = true;
      }
    }

    return ok({
      statuses,
      preview: false,
      tpslAttached,
      ...(tpslError ? { tpslError, warning: `Position opened but TP/SL failed: ${tpslError}. Attach manually via the TP/SL panel.` } : {}),
    });
  } catch (e) {
    return mapSdkError(e);
  }
}

export interface HlCloseParams {
  coin: string;
  size?: string;
  confirm?: boolean;
}

export async function hlClose(params: HlCloseParams): Promise<HlResult<unknown>> {
  try {
    const user = (await getOnchainosAddress()) as `0x${string}`;
    const state = await getInfoClient().clearinghouseState({ user });
    const pos = state.assetPositions.find((ap) => ap.position.coin === params.coin);
    if (!pos) return err(`No open position on ${params.coin}`);
    const szi = Number(pos.position.szi);
    if (szi === 0) return err(`Position size is zero on ${params.coin}`);
    const closeSide: "buy" | "sell" = szi > 0 ? "sell" : "buy";
    const closeSize = params.size ?? Math.abs(szi).toString();
    return hlOrder({
      coin: params.coin,
      side: closeSide,
      size: closeSize,
      type: "market",
      reduceOnly: true,
      confirm: params.confirm,
    });
  } catch (e) {
    return mapSdkError(e);
  }
}

export interface HlTpSlParams {
  coin: string;
  slPx?: string;
  tpPx?: string;
  size?: string;
  confirm?: boolean;
}

export async function hlTpSl(params: HlTpSlParams): Promise<HlResult<unknown>> {
  try {
    if (!params.slPx && !params.tpPx) return err("At least one of slPx or tpPx is required");
    const user = (await getOnchainosAddress()) as `0x${string}`;
    const state = await getInfoClient().clearinghouseState({ user });
    const pos = state.assetPositions.find((ap) => ap.position.coin === params.coin);
    if (!pos) return err(`No open position on ${params.coin} — TP/SL needs an active position`);
    const szi = Number(pos.position.szi);
    const size = params.size ?? Math.abs(szi).toString();
    const oppSide = szi > 0 ? false : true; // close → opposite

    const asset = await resolveAsset(params.coin);
    const sizeStr = roundSize(Number(size), asset.szDecimals);

    if (!params.confirm) {
      return ok({
        preview: true,
        coin: params.coin,
        size: sizeStr,
        slPx: params.slPx,
        tpPx: params.tpPx,
        message: `Preview: attach TP=${params.tpPx ?? "-"} / SL=${params.slPx ?? "-"} on ${params.coin} size ${sizeStr}. Resend with confirm:true to execute.`,
      });
    }

    const client = await getExchangeClient();
    const orders: Array<{ a: number; b: boolean; p: string; s: string; r: boolean; t: { trigger: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" } } }> = [];
    // Trigger price is what the user asked for; the limit `p` field is the
    // worst-acceptable fill — set 10% off so the close actually fills when
    // the trigger fires (matches HL UI default and the hyperliquid-plugin
    // behavior).
    if (params.tpPx) {
      const trigger = roundPrice(Number(params.tpPx), asset.szDecimals);
      const limit = roundPrice(tpslWorstFillPx(Number(trigger), oppSide), asset.szDecimals);
      orders.push({
        a: asset.assetId, b: oppSide, p: limit, s: sizeStr, r: true,
        t: { trigger: { isMarket: true, triggerPx: trigger, tpsl: "tp" } },
      });
    }
    if (params.slPx) {
      const trigger = roundPrice(Number(params.slPx), asset.szDecimals);
      const limit = roundPrice(tpslWorstFillPx(Number(trigger), oppSide), asset.szDecimals);
      orders.push({
        a: asset.assetId, b: oppSide, p: limit, s: sizeStr, r: true,
        t: { trigger: { isMarket: true, triggerPx: trigger, tpsl: "sl" } },
      });
    }
    const res = await client.order({ orders, grouping: "normalTpsl" });
    return ok(res);
  } catch (e) {
    return mapSdkError(e);
  }
}

export interface HlCancelParams {
  coin: string;
  orderId: string;
  confirm?: boolean;
}

export async function hlCancel(params: HlCancelParams): Promise<HlResult<unknown>> {
  try {
    const asset = await resolveAsset(params.coin);
    const oid = Number(params.orderId);
    if (!Number.isFinite(oid)) return err(`Invalid orderId: ${params.orderId}`);
    if (!params.confirm) {
      return ok({
        preview: true,
        coin: params.coin,
        orderId: oid,
        message: `Preview: cancel order ${oid} on ${params.coin}. Resend with confirm:true.`,
      });
    }
    const client = await getExchangeClient();
    const res = await client.cancel({ cancels: [{ a: asset.assetId, o: oid }] });
    const status = res.response.data.statuses[0];
    if (typeof status === "object" && status !== null && "error" in status) {
      return err((status as { error: string }).error);
    }
    return ok(res);
  } catch (e) {
    return mapSdkError(e);
  }
}

// ── Deposit (spot Arbitrum → HL perp): ERC20 transfer of USDC to HL bridge ──
export interface HlDepositParams {
  amount: string;
  confirm?: boolean;
}

const HL_BRIDGE_ARBITRUM = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

export async function hlDeposit(params: HlDepositParams): Promise<HlResult<unknown>> {
  try {
    const n = Number(params.amount);
    if (!Number.isFinite(n) || n < 5) {
      return err("Minimum deposit is 5 USDC", { errorCode: "MIN_DEPOSIT" });
    }

    const address = await getOnchainosAddress();
    const arbBal = await fetchArbUsdcBalance(address);
    if (arbBal < n) {
      return err(
        `Insufficient Arbitrum USDC: have ${arbBal.toFixed(2)}, need ${n.toFixed(2)}.`,
        { errorCode: "INSUFFICIENT_BALANCE" }
      );
    }

    if (!params.confirm) {
      return ok({
        preview: true,
        amount: params.amount,
        from: address,
        to: HL_BRIDGE_ARBITRUM,
        chain: "arbitrum",
        est_arrival_seconds: 60,
        message: `Preview: deposit ${params.amount} USDC from Arbitrum to Hyperliquid (bridge ${HL_BRIDGE_ARBITRUM}). Resend with confirm:true.`,
      });
    }

    // ERC20 transfer of USDC on Arbitrum → HL bridge contract.
    const send = await walletSend({
      amount: params.amount,
      recipient: HL_BRIDGE_ARBITRUM,
      chain: "arbitrum",
      from: address,
      contractToken: USDC_ARB,
      force: true,
    });
    if (!send.ok) {
      return err(
        `Deposit transfer failed: ${(send.raw || "").slice(0, 400)}`,
        { errorCode: "DEPOSIT_FAILED" }
      );
    }
    return ok({
      tx: send.data,
      amount: params.amount,
      note: "USDC transfer submitted. HL credits the account after ~1 minute (Arbitrum finality).",
    });
  } catch (e) {
    return mapSdkError(e);
  }
}

// ── Withdraw (HL → Arbitrum) ─────────────────────────────────────────────────
export interface HlWithdrawParams {
  amount: string;
  destination?: string;
  confirm?: boolean;
}

export async function hlWithdraw(params: HlWithdrawParams): Promise<HlResult<unknown>> {
  try {
    const n = Number(params.amount);
    if (!Number.isFinite(n) || n <= 1) {
      return err("Withdraw amount must be > 1 USDC (covers $1 flat fee)");
    }
    const address = await getOnchainosAddress();
    const dest = (params.destination ?? address).toLowerCase() as `0x${string}`;
    if (!params.confirm) {
      return ok({
        preview: true,
        amount: params.amount,
        destination: dest,
        fee_usdc: 1,
        net_usdc: (n - 1).toFixed(2),
        message: `Preview: withdraw ${params.amount} USDC → ${dest} (fee $1). Resend with confirm:true.`,
      });
    }
    const client = await getExchangeClient();
    const res = await client.withdraw3({ destination: dest, amount: params.amount });
    return ok(res);
  } catch (e) {
    return mapSdkError(e);
  }
}
