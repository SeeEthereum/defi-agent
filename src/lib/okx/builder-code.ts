/**
 * OKX Builder Codes — ERC-8021 Transaction Attribution
 *
 * Builder Code: 41xyws15je2yksso
 * Registered at: https://web3.okx.com/onchainos/dev-portal
 *
 * The suffix is pre-computed from the builder code using ox/erc8021:
 *   Attribution.toDataSuffix({ codes: ['41xyws15je2yksso'] })
 *   → 0x34317879777331356a6532796b73736f100080218021802180218021802180218021
 *
 * ERC-8021 format (schema 0, no registry):
 *   [codesHex 16B] [length 1B: 0x10] [schemaId 1B: 0x00] [magic 16B: 0x80218021...]
 *
 * The EVM ignores bytes appended after valid calldata — zero execution impact.
 * Offchain OKX indexers read the suffix to attribute transactions to this app.
 */

/** Pre-computed ERC-8021 data suffix for builder code "41xyws15je2yksso" */
const BUILDER_CODE_SUFFIX =
  "34317879777331356a6532796b73736f100080218021802180218021802180218021";

/**
 * Append the ERC-8021 Builder Code suffix to transaction calldata.
 *
 * - If inputData is undefined or empty, returns it unchanged (e.g. pure ETH transfers)
 * - Zero-cost feature flag: set OKX_BUILDER_CODE_DISABLED=true to skip injection
 */
export function appendBuilderCode(inputData: string | undefined): string | undefined {
  if (!inputData) return inputData;

  // Feature flag — disable without code changes if needed
  if (process.env.OKX_BUILDER_CODE_DISABLED === "true") return inputData;

  // Strip 0x prefix from input, append suffix, re-add prefix
  const base = inputData.startsWith("0x") ? inputData : "0x" + inputData;
  return base + BUILDER_CODE_SUFFIX;
}
