import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { AI_TOOLS } from "./tools";
import { SYSTEM_PROMPT } from "./system-prompt";
import { walletBalance, tokenSearch, walletAddresses, walletHistory } from "@/lib/okx/cli";
import { getFluidMarkets, getUserPositions } from "@/lib/fluid/resolver";
import { dexQuote } from "@/lib/okx/dex-api";
import { normalizeAddress } from "@/lib/utils";
import { getChainBySwapName } from "@/lib/chains";

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
  switch (name) {
    case "get_balances": {
      const chain = input.chain as string | undefined;
      const result = await walletBalance(chain);
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
        params: input,
        message: "Supply proposal ready for your confirmation.",
      };
    case "propose_swap":
      return {
        action: "swap",
        params: input,
        message: "Swap proposal ready for your confirmation.",
      };
    case "propose_send":
      return {
        action: "send",
        params: input,
        message: "Transfer proposal ready for your confirmation.",
      };
    case "propose_withdraw":
      return {
        action: "withdraw",
        params: input,
        message: "Withdraw proposal ready for your confirmation.",
      };
    case "get_wallet_addresses": {
      const result = await walletAddresses();
      return result.data;
    }
    case "get_transaction_history": {
      const chain = input.chain as string | undefined;
      const limit = input.limit as number | undefined;
      const result = await walletHistory({
        chain,
        limit: String(limit ?? 10),
      });
      return result.data;
    }
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

export async function runAiChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  userAddress?: string
): Promise<AiResponse> {
  const openaiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  let response = await getOpenAI().chat.completions.create({
    model: "gpt-4.1",
    max_tokens: 4096,
    tools: openaiTools,
    messages: openaiMessages,
  });

  const proposedActions: AiResponse["proposedActions"] = [];

  // Agentic loop: keep going while the model wants to use tools
  while (response.choices[0]?.finish_reason === "tool_calls") {
    const choice = response.choices[0];
    const toolCalls = (choice.message.tool_calls ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tc): tc is any => tc.type === "function"
    );

    // Add the assistant message with tool calls
    openaiMessages.push(choice.message);

    for (const toolCall of toolCalls) {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      const result = await executeToolCall(
        toolCall.function.name,
        args,
        userAddress
      );

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

    response = await getOpenAI().chat.completions.create({
      model: "gpt-4.1",
      max_tokens: 4096,
      tools: openaiTools,
      messages: openaiMessages,
    });
  }

  // Extract text from final response
  const text = response.choices[0]?.message?.content ?? "";

  return { text, proposedActions };
}
