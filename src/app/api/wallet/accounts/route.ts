import { NextRequest, NextResponse } from "next/server";
import { runCli, walletAddresses, walletBalance } from "@/lib/okx/cli";
import { withSession } from "@/lib/session/session";
import { currentIdentity, NotSignedInError } from "@/lib/session/identity";
import { getLabels, getSeenAccounts, LABEL_MAX, rememberAccount, setLabel } from "@/lib/accounts/labels";
import { z } from "zod";
import { apiError, badRequest } from "@/lib/api/validation";

// GET   /api/wallet/accounts — every account, with the name the user gave it
// POST  /api/wallet/accounts — add a new wallet account
// PATCH /api/wallet/accounts — switch to a different account
// PUT   /api/wallet/accounts — rename an account (stored by albicocca, not OKX)

const accountIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// OKX account ids are UUIDs in CLI v4 (older builds used numbers).
const patchSchema = z.object({
  accountId: accountIdSchema,
});

const putSchema = z.object({
  accountId: accountIdSchema,
  label: z.string().max(200),
});

function notSignedIn() {
  return NextResponse.json({ success: false, error: "Sign in first." }, { status: 401 });
}

interface AllBalances {
  details?: Record<string, { total_value_usd?: string }>;
}

interface ActiveAddresses {
  accountId?: string;
  accountName?: string;
  evm?: Array<{ address?: string }>;
}

/** Ids and values of every account of this login, from `wallet balance --all`. */
async function accountValues(): Promise<Record<string, string | null>> {
  const result = await walletBalance(undefined, undefined, true);
  const details = (result.data as AllBalances | null)?.details ?? {};
  return Object.fromEntries(Object.entries(details).map(([id, d]) => [id, d?.total_value_usd ?? null]));
}

export const GET = withSession(async () => {
  try {
    const { owner, accountId: activeId } = await currentIdentity();
    const [values, active] = await Promise.all([
      accountValues().catch(() => ({}) as Record<string, string | null>),
      walletAddresses().then((r) => r.data as ActiveAddresses | null).catch(() => null),
    ]);
    if (active?.accountId) {
      await rememberAccount(owner, active.accountId, {
        okxName: active.accountName ?? null,
        evmAddress: active.evm?.[0]?.address?.toLowerCase() ?? null,
      });
    }
    const [labels, seen] = await Promise.all([getLabels(owner), getSeenAccounts(owner)]);
    const ids = Object.keys(values);
    if (activeId && !ids.includes(activeId)) ids.unshift(activeId);
    const accounts = ids.map((id, i) => {
      const okxName = seen[id]?.okxName ?? null;
      return {
        accountId: id,
        okxName: okxName ?? `Account ${i + 1}`,
        name: labels[id] ?? okxName ?? `Account ${i + 1}`,
        renamed: id in labels,
        evmAddress: seen[id]?.evmAddress ?? null,
        totalValueUsd: values[id] ?? null,
        isActive: id === activeId,
      };
    });
    return NextResponse.json({ success: true, data: { accounts, maxNameLength: LABEL_MAX } });
  } catch (error) {
    if (error instanceof NotSignedInError) return notSignedIn();
    return apiError("wallet/accounts", error, "Could not load your accounts");
  }
});

export const POST = withSession(async () => {
  try {
    const result = await runCli(["wallet", "add"]);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/accounts", error, "Request failed");
  }
});

export const PATCH = withSession(async (request: NextRequest) => {
  try {
    const { accountId } = patchSchema.parse(await request.json());
    const result = await runCli(["wallet", "switch", accountId]);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    return apiError("wallet/accounts", error, "Request failed");
  }
});

export const PUT = withSession(async (request: NextRequest) => {
  try {
    const { accountId, label } = putSchema.parse(await request.json());
    const { owner, accountId: activeId } = await currentIdentity();
    // Only accounts of this login can be named.
    const owned = accountId === activeId || accountId in (await accountValues());
    if (!owned) return NextResponse.json({ success: false, error: "That account is not yours." }, { status: 404 });
    const name = await setLabel(owner, accountId, label);
    return NextResponse.json({ success: true, data: { accountId, name } });
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest(error);
    if (error instanceof NotSignedInError) return notSignedIn();
    return apiError("wallet/accounts", error, "Could not rename the account");
  }
});
