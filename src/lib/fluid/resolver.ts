import { getPublicClient } from "./client";
import { lendingResolverAbi } from "./abis";
import { LENDING_RESOLVER, getFTokensForChain } from "./constants";
import { FLUID_CHAIN_IDS } from "@/lib/chains";
import { bpsToPercent, toUiUnits } from "@/lib/utils";

export interface FluidMarket {
  chainIndex: number;
  chainName: string;
  fTokenAddress: string;
  symbol: string;
  underlyingSymbol: string;
  underlyingDecimals: number;
  underlyingAddress: string;
  supplyRatePercent: number;
  rewardsRatePercent: number;
  totalAprPercent: number;
  totalAssetsUi: string;
}

export interface FluidUserPosition {
  chainIndex: number;
  fTokenAddress: string;
  symbol: string;
  underlyingSymbol: string;
  underlyingDecimals: number;
  shares: string;
  underlyingAssets: string;
  underlyingAssetsUi: string;
}

export async function getFluidMarkets(): Promise<FluidMarket[]> {
  const markets: FluidMarket[] = [];
  const chainNames: Record<number, string> = {
    1: "Ethereum",
    42161: "Arbitrum",
    8453: "Base",
  };

  // We only care about these underlying symbols
  const wantedSymbols = new Set(["fUSDC", "fUSDT", "fWETH"]);

  for (const chainIndex of FLUID_CHAIN_IDS) {
    const client = getPublicClient(chainIndex);

    try {
      // Call getFTokensEntireData() — returns ALL fTokens on this chain
      const allData = await client.readContract({
        address: LENDING_RESOLVER as `0x${string}`,
        abi: lendingResolverAbi,
        functionName: "getFTokensEntireData",
      });

      const dataArray = allData as Array<{
        tokenAddress: string;
        symbol: string;
        decimals: bigint;
        totalAssets: bigint;
        supplyRate: bigint;
        rewardsRate: bigint;
        asset: string;
        [key: string]: unknown;
      }>;

      for (const entry of dataArray) {
        const symbol = entry.symbol as string;
        if (!wantedSymbols.has(symbol)) continue;

        const decimals = Number(entry.decimals);
        // Derive underlying symbol from fToken symbol (fUSDC -> USDC)
        const underlyingSymbol = symbol.startsWith("f") ? symbol.slice(1) : symbol;

        const supplyRateBps = Number(entry.supplyRate);
        const rewardsRateBps = Number(entry.rewardsRate);
        const supplyRatePercent = bpsToPercent(supplyRateBps);
        const rewardsRatePercent = bpsToPercent(rewardsRateBps);

        markets.push({
          chainIndex,
          chainName: chainNames[chainIndex] ?? `Chain ${chainIndex}`,
          fTokenAddress: (entry.tokenAddress as string).toLowerCase(),
          symbol,
          underlyingSymbol,
          underlyingDecimals: decimals,
          underlyingAddress: (entry.asset as string ?? "").toLowerCase(),
          supplyRatePercent,
          rewardsRatePercent,
          totalAprPercent: supplyRatePercent + rewardsRatePercent,
          totalAssetsUi: toUiUnits(entry.totalAssets, decimals),
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[Fluid] getFTokensEntireData failed on chain ${chainIndex}: ${msg.slice(0, 200)}`
      );
    }
  }

  return markets;
}

export async function getUserPositions(
  userAddress: `0x${string}`
): Promise<FluidUserPosition[]> {
  const positions: FluidUserPosition[] = [];

  for (const chainIndex of FLUID_CHAIN_IDS) {
    const fTokens = getFTokensForChain(chainIndex);
    const client = getPublicClient(chainIndex);

    for (const ft of fTokens) {
      try {
        const result = await client.readContract({
          address: LENDING_RESOLVER as `0x${string}`,
          abi: lendingResolverAbi,
          functionName: "getUserPosition",
          args: [ft.address, userAddress],
        });

        const { fTokenShares, underlyingAssets } = result as {
          fTokenShares: bigint;
          underlyingAssets: bigint;
          underlyingBalance: bigint;
          allowance: bigint;
        };

        if (fTokenShares > 0n) {
          positions.push({
            chainIndex,
            fTokenAddress: ft.address,
            symbol: ft.symbol,
            underlyingSymbol: ft.underlyingSymbol,
            underlyingDecimals: ft.underlyingDecimals,
            shares: fTokenShares.toString(),
            underlyingAssets: underlyingAssets.toString(),
            underlyingAssetsUi: toUiUnits(
              underlyingAssets,
              ft.underlyingDecimals
            ),
          });
        }
      } catch (error) {
        console.error(
          `Error fetching position for ${ft.symbol} on chain ${chainIndex}:`,
          error
        );
      }
    }
  }

  return positions;
}
