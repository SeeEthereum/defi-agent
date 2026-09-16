import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";
import { AI_TOOLS } from "./tools";
import { SYSTEM_PROMPT } from "./system-prompt";
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

const MAX_TOOL_ROUNDS = 8;
const OPENAI_TIMEOUT_MS = 60_000;

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

// ── OpenAI-format tools (converted from Anthropic-style tool definitions) ────
const openaiTools = AI_TOOLS.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description ?? "",
    parameters: t.input_schema,
  },
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

async function completeChat(
  messages: ChatCompletionMessageParam[],
  withTools: boolean
) {
  return getOpenAI().chat.completions.create(
    {
      model: "gpt-4.1",
      max_tokens: 4096,
      messages,
      ...(withTools ? { tools: openaiTools } : {}),
    },
    { signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS) }
  );
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

  const openaiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  let response = await completeChat(openaiMessages, true);

  const proposedActions: AiResponse["proposedActions"] = [];

  // Agentic loop: keep going while the model wants to use tools
  let toolRounds = 0;
  while (response.choices[0]?.finish_reason === "tool_calls") {
    if (toolRounds >= MAX_TOOL_ROUNDS) {
      openaiMessages.push({
        role: "system",
        content:
          "Tool budget exhausted. Answer with the information you already have; do not call more tools.",
      });
      response = await completeChat(openaiMessages, false);
      break;
    }
    toolRounds += 1;

    const choice = response.choices[0];
    const toolCalls = (choice.message.tool_calls ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tc): tc is any => tc.type === "function"
    );

    // Add the assistant message with tool calls
    openaiMessages.push(choice.message);

    for (const toolCall of toolCalls) {
      let args: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(toolCall.function.arguments || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          openaiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: "invalid tool arguments" }),
          });
          continue;
        }
        args = parsed as Record<string, unknown>;
      } catch {
        openaiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: "invalid tool arguments" }),
        });
        continue;
      }

      let result: unknown;
      try {
        result = await executeToolCall(
          toolCall.function.name,
          args,
          userAddress
        );
      } catch (error) {
        console.error("[ai/tool]", toolCall.function.name, error);
        result = { error: "tool failed" };
      }

      // Collect proposed actions
      if (
        result &&
        typeof result === "object" &&
        "action" in (result as Record<string, unknown>)
      ) {
        const actionResult = result as {
          action: string;
          params: Record<string, unknown>;
        };
        proposedActions.push({
          action: actionResult.action,
          params: actionResult.params,
        });
      }

      // Add tool result
      openaiMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    response = await completeChat(openaiMessages, true);
  }

  // Extract text from final response
  const text = response.choices[0]?.message?.content ?? "";

  return { text, proposedActions };
}
