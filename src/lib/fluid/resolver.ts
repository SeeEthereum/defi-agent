import { getPublicClient } from "./client";
import { lendingResolverAbi } from "./abis";
import { LENDING_RESOLVER, getFToken, getFTokensForChain } from "./constants";
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

function underlyingDecimalsFor(
  chainIndex: number,
  symbol: string,
  tokenAddress: string,
  fallback: number
): number {
  const bySymbol = getFToken(chainIndex, symbol);
  if (bySymbol) return bySymbol.underlyingDecimals;
  const byAddr = getFTokensForChain(chainIndex).find(
    (ft) => ft.address === tokenAddress.toLowerCase()
  );
  return byAddr?.underlyingDecimals ?? fallback;
}

export async function getFluidMarkets(): Promise<FluidMarket[]> {
  const markets: FluidMarket[] = [];
  const chainNames: Record<number, string> = {
    1: "Ethereum",
    42161: "Arbitrum",
    8453: "Base",
    137: "Polygon",
  };

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
        const tokenAddress = (entry.tokenAddress as string).toLowerCase();
        // fToken.decimals is the vault share decimals; asset amounts use the
        // underlying token's decimals from the FTOKENS table.
        const underlyingDecimals = underlyingDecimalsFor(
          chainIndex,
          symbol,
          tokenAddress,
          Number(entry.decimals)
        );
        // Derive underlying symbol from fToken symbol (fUSDC -> USDC)
        const underlyingSymbol = symbol.startsWith("f") ? symbol.slice(1) : symbol;

        const supplyRateBps = Number(entry.supplyRate);
        const rewardsRateBps = Number(entry.rewardsRate);
        const supplyRatePercent = bpsToPercent(supplyRateBps);
        const rewardsRatePercent = bpsToPercent(rewardsRateBps);

        markets.push({
          chainIndex,
          chainName: chainNames[chainIndex] ?? `Chain ${chainIndex}`,
          fTokenAddress: tokenAddress,
          symbol,
          underlyingSymbol,
          underlyingDecimals,
          underlyingAddress: (entry.asset as string ?? "").toLowerCase(),
          supplyRatePercent,
          rewardsRatePercent,
          totalAprPercent: supplyRatePercent + rewardsRatePercent,
          totalAssetsUi: toUiUnits(entry.totalAssets, underlyingDecimals),
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
    const client = getPublicClient(chainIndex);

    try {
      // Dynamically discover ALL fTokens on this chain via the resolver
      const allData = await client.readContract({
        address: LENDING_RESOLVER as `0x${string}`,
        abi: lendingResolverAbi,
        functionName: "getFTokensEntireData",
      });

      const dataArray = allData as Array<{
        tokenAddress: string;
        symbol: string;
        decimals: bigint;
        asset: string;
        [key: string]: unknown;
      }>;

      // Check user position for each fToken
      for (const entry of dataArray) {
        try {
          const fTokenAddr = entry.tokenAddress as `0x${string}`;
          const result = await client.readContract({
            address: LENDING_RESOLVER as `0x${string}`,
            abi: lendingResolverAbi,
            functionName: "getUserPosition",
            args: [fTokenAddr, userAddress],
          });

          const { fTokenShares, underlyingAssets } = result as {
            fTokenShares: bigint;
            underlyingAssets: bigint;
            underlyingBalance: bigint;
            allowance: bigint;
          };

          if (fTokenShares > 0n) {
            const symbol = entry.symbol as string;
            const tokenAddress = fTokenAddr.toLowerCase();
            const underlyingDecimals = underlyingDecimalsFor(
              chainIndex,
              symbol,
              tokenAddress,
              Number(entry.decimals)
            );
            const underlyingSymbol = symbol.startsWith("f") ? symbol.slice(1) : symbol;

            positions.push({
              chainIndex,
              fTokenAddress: tokenAddress,
              symbol,
              underlyingSymbol,
              underlyingDecimals,
              shares: fTokenShares.toString(),
              underlyingAssets: underlyingAssets.toString(),
              underlyingAssetsUi: toUiUnits(underlyingAssets, underlyingDecimals),
            });
          }
        } catch {
          // Skip individual fToken errors
        }
      }
    } catch {
      // Fallback to hardcoded list if getFTokensEntireData fails
      console.error(`[Fluid] getFTokensEntireData failed on chain ${chainIndex}, using hardcoded list`);
      const fTokens = getFTokensForChain(chainIndex);
      for (const ft of fTokens) {
        try {
          const result = await client.readContract({
            address: LENDING_RESOLVER as `0x${string}`,
            abi: lendingResolverAbi,
            functionName: "getUserPosition",
            args: [ft.address as `0x${string}`, userAddress],
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
              underlyingAssetsUi: toUiUnits(underlyingAssets, ft.underlyingDecimals),
            });
          }
        } catch {
          /* skip */
        }
      }
    }
  }

  return positions;
}
