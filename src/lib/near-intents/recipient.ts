/**
 * Recipient checks for confidential swaps.
 *
 * The recipient is the one value in this flow that comes from the user and
 * decides where funds end up, so it is validated on the server and bound to
 * the quote (see the confidential routes), never just checked in the UI.
 */

import { isAddress } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type RecipientCheck =
  | { ok: true; address: string }
  | { ok: false; error: string };

/**
 * Validate a destination address typed by the user.
 *
 * - must be a 20-byte EVM address; a mixed-case address must also pass the
 *   EIP-55 checksum, which catches most single-character typos;
 * - must not be the zero address;
 * - must not be the sending wallet: paying yourself through the confidential
 *   rail links deposit and payout, so there is nothing left to hide.
 */
export function checkRecipient(input: string, sender: string): RecipientCheck {
  const value = input.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return { ok: false, error: "Enter a valid address (0x followed by 40 hex characters)." };
  }
  const address = value.toLowerCase();
  if (address === ZERO_ADDRESS) {
    return { ok: false, error: "That is the zero address. Funds sent there are lost." };
  }
  if (address === sender.toLowerCase()) {
    return {
      ok: false,
      error: "This is the wallet you are sending from. Use a different address to keep the swap private.",
    };
  }
  // EIP-55: all-lowercase or all-uppercase hex carries no checksum; only a
  // mixed-case address must match it. viem's strict mode rejects all-caps.
  const hex = value.slice(2);
  const mixedCase = hex !== hex.toLowerCase() && hex !== hex.toUpperCase();
  if (mixedCase && !isAddress(value, { strict: true })) {
    return { ok: false, error: "This address fails its checksum. Check it for typos." };
  }
  return { ok: true, address };
}
