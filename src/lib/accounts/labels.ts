/**
 * Names people give their wallet accounts. OKX has no rename command, so the
 * name lives here, keyed by the person (see session/identity.ts) and the OKX
 * account id. Clearing a name brings back the OKX default.
 *
 * The CLI lists every account id but gives the OKX name and address only for
 * the active one, so those are remembered here each time an account is in use.
 */

import { db, ensureSchema } from "@/lib/db/client";

export const LABEL_MAX = 32;

const memory = new Map<string, Map<string, string>>();

/** Trim, collapse spaces, drop control characters; empty means "clear". */
export function cleanLabel(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_MAX);
}

export async function getLabels(owner: string): Promise<Record<string, string>> {
  const q = db();
  if (!q) return Object.fromEntries(memory.get(owner) ?? []);
  await ensureSchema();
  const rows = (await q`SELECT account_id, label FROM account_labels WHERE owner = ${owner}`) as Array<{ account_id: string; label: string }>;
  return Object.fromEntries(rows.map((r) => [r.account_id, r.label]));
}

export async function setLabel(owner: string, accountId: string, raw: string): Promise<string | null> {
  const label = cleanLabel(raw);
  const q = db();
  if (!q) {
    const m = memory.get(owner) ?? new Map<string, string>();
    if (label) m.set(accountId, label);
    else m.delete(accountId);
    memory.set(owner, m);
    return label || null;
  }
  await ensureSchema();
  if (!label) {
    await q`DELETE FROM account_labels WHERE owner = ${owner} AND account_id = ${accountId}`;
    return null;
  }
  await q`
    INSERT INTO account_labels (owner, account_id, label, updated_at)
    VALUES (${owner}, ${accountId}, ${label}, now())
    ON CONFLICT (owner, account_id) DO UPDATE SET label = EXCLUDED.label, updated_at = now()`;
  return label;
}

// ── what OKX told us about each account while it was active ────────────────

export interface SeenAccount {
  okxName: string | null;
  evmAddress: string | null;
}

const seenMemory = new Map<string, Map<string, SeenAccount>>();

export async function rememberAccount(owner: string, accountId: string, seen: SeenAccount): Promise<void> {
  const q = db();
  if (!q) {
    const m = seenMemory.get(owner) ?? new Map<string, SeenAccount>();
    m.set(accountId, seen);
    seenMemory.set(owner, m);
    return;
  }
  await ensureSchema();
  await q`
    INSERT INTO account_seen (owner, account_id, okx_name, evm_address, seen_at)
    VALUES (${owner}, ${accountId}, ${seen.okxName}, ${seen.evmAddress}, now())
    ON CONFLICT (owner, account_id) DO UPDATE SET
      okx_name = COALESCE(EXCLUDED.okx_name, account_seen.okx_name),
      evm_address = COALESCE(EXCLUDED.evm_address, account_seen.evm_address),
      seen_at = now()`;
}

export async function getSeenAccounts(owner: string): Promise<Record<string, SeenAccount>> {
  const q = db();
  if (!q) return Object.fromEntries(seenMemory.get(owner) ?? []);
  await ensureSchema();
  const rows = (await q`SELECT account_id, okx_name, evm_address FROM account_seen WHERE owner = ${owner}`) as Array<{
    account_id: string;
    okx_name: string | null;
    evm_address: string | null;
  }>;
  return Object.fromEntries(rows.map((r) => [r.account_id, { okxName: r.okx_name, evmAddress: r.evm_address }]));
}
