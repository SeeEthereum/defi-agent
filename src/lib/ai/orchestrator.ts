import OpenAI from "openai";
import type {
  FunctionTool,
  Response,
  ResponseFunctionToolCall,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import { z } from "zod";
import { AI_TOOLS } from "./tools";
import { SYSTEM_PROMPT } from "./system-prompt";
import { MAIN_EFFORT, MAIN_MODEL } from "./models";
import { walletBalance, tokenSearch, walletAddresses, walletHistory, securityTokenScan, securityApprovals, securityDappScan, marketPrice, signalList, gatewayGas, gasStationStatus, leaderboardList, addressTrackerActivities } from "@/lib/okx/cli";
import { getFluidMarkets, getUserPositions } from "@/lib/fluid/resolver";
import { dexQuote } from "@/lib/okx/dex-api";
import { bridgeQuote } from "@/lib/bridge/lifi";
import { hlPositions, hlPrices, hlOrders } from "@/lib/hyperliquid/cli";
import { normalizeAddress } from "@/lib/utils";
import { CHAINS, getChainBySwapName } from "@/lib/chains";
import {
  evmAddress,
  decimalAmount,
  baseUnitAmount,
  chainId,
  sessionEvmAddress,
} from "@/lib/api/validation";

const MAX_TOOL_ROUNDS = 6;
const OPENAI_TIMEOUT_MS = 90_000;
/** Per model call; reasoning tokens count toward it. */
const MAX_OUTPUT_TOKENS = 6000;
/** Tool payloads are third-party data; cap what goes back into the context. */
const MAX_TOOL_RESULT_CHARS = 24_000;

const hlCoin = z.string().regex(/^[A-Z0-9@_-]{1,16}$/);

const proposeSendSchema = z.object({
  recipient: evmAddress,
  amount: decimalAmount,
  chainIndex: chainId,
  contractToken: evmAddress.optional(),
});

const proposeSwapSchema = z.object({
  fromToken: evmAddress,
  toToken: evmAddress,
  amount: baseUnitAmount,
  chain: z.string().min(1),
  slippage: z.string().optional(),
  gasLevel: z.enum(["slow", "average", "fast"]).optional(),
  mevProtection: z.boolean().optional(),
});

const proposeBridgeSchema = z.object({
  fromChain: chainId,
  toChain: chainId,
  fromToken: evmAddress,
  toToken: evmAddress,
  fromAmount: baseUnitAmount,
  fromTokenSymbol: z.string().optional(),
  toTokenSymbol: z.string().optional(),
  estimatedOutput: z.string().optional(),
  bridge: z.string().optional(),
});

const proposeFluidSchema = z.object({
  fTokenSymbol: z.string().regex(/^[A-Za-z0-9]{1,12}$/),
  amount: z.union([decimalAmount, z.literal("all")]),
  chainIndex: chainId,
});

const proposeHlOrderSchema = z.object({
  coin: hlCoin,
  side: z.enum(["buy", "sell"]),
  size: decimalAmount,
  price: decimalAmount.optional(),
  leverage: z.coerce.number().int().min(1).max(50).optional(),
  slPx: decimalAmount.optional(),
  tpPx: decimalAmount.optional(),
});

const proposeHlCloseSchema = z.object({
  coin: hlCoin,
  size: decimalAmount.optional(),
});

const PROPOSE_SCHEMAS: Record<string, z.ZodType> = {
  propose_send: proposeSendSchema,
  propose_swap: proposeSwapSchema,
  propose_bridge: proposeBridgeSchema,
  propose_supply: proposeFluidSchema,
  propose_withdraw: proposeFluidSchema,
  propose_hl_order: proposeHlOrderSchema,
  propose_hl_close: proposeHlCloseSchema,
};

function rejectedParams(error: z.ZodError) {
  return {
    error: "parameters rejected",
    message: "The parameters were rejected and no action card was created.",
    reasons: error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "parameters";
      return `${path}: ${issue.message}`;
    }),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function validatePropose(
  name: string,
  input: Record<string, unknown>
): { ok: true; params: Record<string, unknown> } | { ok: false; result: ReturnType<typeof rejectedParams> } {
  const schema = PROPOSE_SCHEMAS[name];
  if (!schema) return { ok: true, params: input };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, result: rejectedParams(parsed.error) };
  const params = asRecord(parsed.data);
  if (name === "propose_bridge") {
    // Execute API expects chain ids as strings.
    params.fromChain = String(params.fromChain);
    params.toChain = String(params.toChain);
  }
  return { ok: true, params };
}

// ── Responses-API tools (converted from the Anthropic-style definitions) ────
const responseTools: FunctionTool[] = AI_TOOLS.map((t) => ({
  type: "function" as const,
  name: t.name,
  description: t.description ?? "",
  parameters: t.input_schema as Record<string, unknown>,
  // The schemas have optional fields; strict mode would require all of them.
  strict: false,
}));

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  userAddress?: string
): Promise<unknown> {
  const validated = validatePropose(name, input);
  if (!validated.ok) return validated.result;

  switch (name) {
    case "get_balances": {
      const chainName = input.chain as string | undefined;
      // CLI expects chain ID (e.g. "1"), not name (e.g. "ethereum")
      let resolvedChain: string | undefined;
      if (chainName) {
        const cfg = getChainBySwapName(chainName) ?? Object.values(CHAINS).find(
          (c) => c.name.toLowerCase() === chainName.toLowerCase() || c.swapName === chainName
        );
        resolvedChain = cfg ? String(cfg.chainIndex) : chainName;
      }
      const result = await walletBalance(resolvedChain);
      return result.data;
    }
    case "get_fluid_markets": {
      const markets = await getFluidMarkets();
      const chainIndex = input.chainIndex as number | undefined;
      if (chainIndex) {
        return markets.filter((m) => m.chainIndex === chainIndex);
      }
      return markets;
    }
    case "get_fluid_positions": {
      if (!userAddress) return { error: "No wallet address available" };
      return getUserPositions(userAddress as `0x${string}`);
    }
    case "get_swap_quote": {
      const chain = input.chain as string;
      const chainCfg = getChainBySwapName(chain);
      if (!chainCfg) return { error: `Unsupported chain: ${chain}` };
      const quote = await dexQuote({
        chainIndex: String(chainCfg.chainIndex),
        fromTokenAddress: normalizeAddress(input.fromToken as string),
        toTokenAddress: normalizeAddress(input.toToken as string),
        amount: input.amount as string,
      });
      return quote;
    }
    case "search_token": {
      const query = input.query as string;
      const chain = input.chain as string | undefined;
      const result = await tokenSearch(query, chain);
      return result.data;
    }
    case "propose_supply":
      return {
        action: "supply",
        params: validated.params,
        message: "Supply proposal ready for your confirmation.",
      };
    case "propose_swap":
      return {
        action: "swap",
        params: validated.params,
        message: "Swap proposal ready for your confirmation.",
      };
    case "propose_send":
      return {
        action: "send",
        params: validated.params,
        message: "Transfer proposal ready for your confirmation.",
      };
    case "propose_withdraw":
      return {
        action: "withdraw",
        params: validated.params,
        message: "Withdraw proposal ready for your confirmation.",
      };
    case "get_wallet_addresses": {
      const result = await walletAddresses();
      return result.data;
    }
    case "get_transaction_history": {
      const chainName = input.chain as string | undefined;
      const limit = input.limit as number | undefined;
      // Convert chain name to chainIndex for the CLI
      let resolvedChain: string | undefined;
      if (chainName) {
        const cfg = getChainBySwapName(chainName) ?? Object.values(CHAINS).find(
          (c) => c.name.toLowerCase() === chainName.toLowerCase() || c.swapName === chainName
        );
        resolvedChain = cfg ? String(cfg.chainIndex) : chainName;
      }
      const result = await walletHistory({
        chain: resolvedChain,
        limit: String(limit ?? 10),
      });
      return result.data;
    }
    case "scan_token_safety": {
      const tokens = input.tokens as string | undefined;
      const address = input.address as string | undefined;
      const chain = input.chain as string | undefined;
      const result = await securityTokenScan({ tokens, address, chain });
      return result.data;
    }
    case "get_approvals": {
      if (!userAddress) return { error: "No wallet address available" };
      const chain = input.chain as string | undefined;
      const result = await securityApprovals({ address: userAddress, chain });
      return result.data;
    }
    case "get_token_price": {
      const address = input.address as string;
      const chainName = input.chain as string;
      const result = await marketPrice({ address, chain: chainName });
      return result.data;
    }
    case "get_smart_money_signals": {
      const chain = input.chain as string;
      const walletType = input.walletType as string | undefined;
      const minAmountUsd = input.minAmountUsd as string | undefined;
      const result = await signalList({ chain, walletType, minAmountUsd });
      return result.data;
    }
    case "get_gas_price": {
      const chain = input.chain as string;
      const result = await gatewayGas(chain);
      return result.data;
    }
    case "gas_station_status": {
      // CLI accepts chain name or numeric ID; the tool schema passes names.
      const chain = input.chain as string;
      const result = await gasStationStatus(chain);
      return result.data;
    }
    case "get_leaderboard": {
      const chain = input.chain as string;
      const timeFrame = (input.timeFrame as string) || "3";
      const sortBy = (input.sortBy as string) || "1";
      const result = await leaderboardList({ chain, timeFrame, sortBy });
      return result.data;
    }
    case "get_address_activities": {
      const trackerType = (input.trackerType as string) || "smart_money";
      const walletAddress = input.walletAddress as string | undefined;
      const chain = input.chain as string | undefined;
      const tradeType = input.tradeType as string | undefined;
      const result = await addressTrackerActivities({ trackerType, walletAddress, chain, tradeType });
      return result.data;
    }
    case "propose_bridge":
      return {
        action: "bridge",
        params: validated.params,
        message: "Bridge proposal ready for your confirmation.",
      };
    case "bridge_tokens": {
      if (!userAddress) return { error: "No wallet address available" };
      const fromChain = input.fromChain as string;
      const toChain = input.toChain as string;
      const fromToken = input.fromToken as string;
      const toToken = input.toToken as string;
      const amount = input.amount as string;
      try {
        const quote = await bridgeQuote({
          fromChain,
          toChain,
          fromToken,
          toToken,
          fromAmount: amount,
          fromAddress: userAddress,
        });
        return {
          bridge: quote.tool,
          fromToken: quote.action.fromToken,
          toToken: quote.action.toToken,
          fromAmount: quote.estimate.fromAmount,
          toAmount: quote.estimate.toAmount,
          toAmountMin: quote.estimate.toAmountMin,
          executionDuration: quote.estimate.executionDuration,
          feeCosts: quote.estimate.feeCosts,
          gasCosts: quote.estimate.gasCosts,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Bridge quote failed" };
      }
    }
    case "scan_dapp_safety": {
      const domain = input.domain as string;
      const result = await securityDappScan(domain);
      return result.data;
    }

    // ── Hyperliquid Perpetuals ───────────────────────────────────────────────
    case "get_hl_positions": {
      const address = input.address as string | undefined;
      const r = await hlPositions(address ?? userAddress);
      return r.ok ? r.data : { error: r.error, errorCode: r.errorCode, suggestion: r.suggestion };
    }
    case "get_hl_prices": {
      const coin = input.coin as string | undefined;
      const r = await hlPrices(coin);
      if (!r.ok) return { error: r.error, errorCode: r.errorCode, suggestion: r.suggestion };
      // Filter to curated markets so the LLM doesn't drown in 500+ entries
      if (!coin && r.data.prices) {
        const { filterFeaturedPrices } = await import("@/lib/hyperliquid/markets");
        return { prices: filterFeaturedPrices(r.data.prices) };
      }
      return r.data;
    }
    case "get_hl_orders": {
      const coin = input.coin as string | undefined;
      const r = await hlOrders(coin);
      return r.ok ? r.data : { error: r.error, errorCode: r.errorCode, suggestion: r.suggestion };
    }
    case "propose_hl_order":
      return {
        action: "hl_order",
        params: validated.params,
        message: "Hyperliquid perpetual order ready for your confirmation.",
      };
    case "propose_hl_close":
      return {
        action: "hl_close",
        params: validated.params,
        message: "Position close ready for your confirmation.",
      };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export interface AiResponse {
  text: string;
  proposedActions: Array<{
    action: string;
    params: Record<string, unknown>;
  }>;
}

function createResponse(input: ResponseInputItem[], withTools: boolean): Promise<Response> {
  return getOpenAI().responses.create(
    {
      model: MAIN_MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      reasoning: { effort: MAIN_EFFORT },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      // Nothing is kept on OpenAI's side; reasoning travels back encrypted
      // so tool rounds keep the model's train of thought.
      store: false,
      include: ["reasoning.encrypted_content"],
      ...(withTools ? { tools: responseTools, parallel_tool_calls: true } : {}),
    },
    { signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS) }
  );
}

function functionCalls(response: Response): ResponseFunctionToolCall[] {
  return response.output.filter((item): item is ResponseFunctionToolCall => item.type === "function_call");
}

function serializeToolResult(result: unknown): string {
  const json = JSON.stringify(result) ?? "null";
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return JSON.stringify({
    truncated: true,
    note: "Result was too large and was cut. Summarise what is here; ask the user to narrow the request if needed.",
    partial: json.slice(0, MAX_TOOL_RESULT_CHARS),
  });
}

export async function runAiChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<AiResponse> {
  let userAddress: string | undefined;
  try {
    userAddress = await sessionEvmAddress();
  } catch {
    userAddress = undefined;
  }

  const input: ResponseInputItem[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const proposedActions: AiResponse["proposedActions"] = [];

  let response = await createResponse(input, true);

  // Agentic loop: keep going while the model wants to use tools
  let toolRounds = 0;
  while (functionCalls(response).length > 0) {
    // Carry the model's own output (reasoning + calls) into the next turn.
    input.push(...toResponseInputItems(response.output));

    if (toolRounds >= MAX_TOOL_ROUNDS) {
      for (const call of functionCalls(response)) {
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: "tool budget exhausted" }) });
      }
      input.push({
        role: "developer",
        content: "Tool budget exhausted. Answer now with the information you already have; do not call more tools.",
      });
      response = await createResponse(input, false);
      break;
    }
    toolRounds += 1;

    for (const toolCall of functionCalls(response)) {
      let args: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(toolCall.arguments || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
        args = parsed as Record<string, unknown>;
      } catch {
        input.push({ type: "function_call_output", call_id: toolCall.call_id, output: JSON.stringify({ error: "invalid tool arguments" }) });
        continue;
      }

      let result: unknown;
      try {
        result = await executeToolCall(toolCall.name, args, userAddress);
      } catch (error) {
        console.error("[ai/tool]", toolCall.name, error);
        result = { error: "tool failed" };
      }

      // Collect proposed actions
      if (result && typeof result === "object" && "action" in (result as Record<string, unknown>)) {
        const actionResult = result as { action: string; params: Record<string, unknown> };
        proposedActions.push({ action: actionResult.action, params: actionResult.params });
      }

      input.push({ type: "function_call_output", call_id: toolCall.call_id, output: serializeToolResult(result) });
    }

    response = await createResponse(input, true);
  }

  let text = response.output_text ?? "";
  if (!text && response.status === "incomplete") {
    text = "I ran out of room for that answer. Ask a narrower question and I will try again.";
  }

  return { text, proposedActions };
}
