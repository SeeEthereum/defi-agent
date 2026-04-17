import { createPublicClient, http, type Chain } from "viem";
import { mainnet, arbitrum, base, polygon, optimism, bsc } from "viem/chains";
import { CHAINS } from "@/lib/chains";

const viemChains: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  137: polygon,
  10: optimism,
  56: bsc,
};

const clients = new Map<number, ReturnType<typeof createPublicClient>>();

export function getPublicClient(chainIndex: number) {
  if (!clients.has(chainIndex)) {
    const chain = viemChains[chainIndex];
    if (!chain) throw new Error(`No viem chain for chainIndex ${chainIndex}`);

    const chainConfig = Object.values(CHAINS).find(
      (c) => c.chainIndex === chainIndex
    );

    clients.set(
      chainIndex,
      createPublicClient({
        chain,
        transport: http(chainConfig?.rpcUrl),
      })
    );
  }
  return clients.get(chainIndex)!;
}
