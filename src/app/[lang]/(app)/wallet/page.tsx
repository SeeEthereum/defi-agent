"use client";

/**
 * Wallet: the account, then one view at a time (balances, activity, receive,
 * send). Balances are a single list grouped by chain instead of one card per
 * chain, so empty chains no longer take as much room as funded ones.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAllChainBalances } from "@/hooks/use-balances";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CHAINS, getChainByIndex } from "@/lib/chains";
import { CHAIN_COLORS } from "@/lib/chain-colors";
import { GasStationModal } from "@/components/gas-station-modal";
import { OkxProtections } from "@/components/okx-protections";
import { chainName, cleanSymbol, displayToken } from "@/lib/tokens/display";
import { TokenIcon } from "@/components/token-icon";
import { LineIcon, type LineIconName } from "@/components/line-icon";
import { CountUp, Empty, PageHead, Panel, PillTabs, Sheet, Skeleton } from "@/components/premium";
import type { GasStationConfirming } from "@/lib/okx/types";
import { toast } from "sonner";
import { userFacingError } from "@/lib/api/send-state";
import { maxSpendable } from "@/lib/wallet/amount-guards";
import { rememberRecipient } from "@/lib/wallet/recipients";
import { useFormat, useT } from "@/i18n/client";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_AMOUNT_RE = /^\d+(\.\d+)?$/;

function normalizeAmount(raw: string): string {
  return raw.trim().replace(",", ".");
}

function isValidAmount(raw: string): boolean {
  const normalized = normalizeAmount(raw);
  return DECIMAL_AMOUNT_RE.test(normalized) && Number(normalized) > 0;
}

interface TxEntry {
  txHash: string;
  txTime: string;
  direction?: string;
  txStatus?: string;
  chainIndex?: string | number;
  chainSymbol?: string;
  symbol?: string;
  amount?: string;
  isApprove?: boolean;
  gasFeeEth?: string;
  from?: string;
  to?: string;
  failReason?: string;
  contractName?: string;
}


type WalletTab = "balances" | "activity" | "receive" | "send";

/** Activity dates: day, month, 24-hour time ("Mar 05, 14:30" / "05 mar, 14:30"). */
const TX_DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

/**
 * ?tab=receive or ?tab=send opens that view (pages here render only in the
 * browser). Activity is left out: it loads its list on the tab click.
 */
function initialTab(): WalletTab {
  if (typeof window === "undefined") return "balances";
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "receive" || t === "send" ? t : "balances";
}

/**
 * Airdropped "tokens" whose name is a website or a call to action are almost
 * always phishing bait. They are hidden by default and never shown as gains.
 */
const SPAM_RE = /(www\.|https?:|\.(top|xyz|club|sbs|site|online|io|com|net|org|app|live|pro|vip|fun)\b|claim|reward|airdrop|visit|voucher|\p{Extended_Pictographic})/iu;

function isLikelySpam(tx: TxEntry): boolean {
  return tx.direction === "IN" && !tx.isApprove && SPAM_RE.test(`${tx.symbol ?? ""} ${tx.contractName ?? ""}`);
}

/** Address QR, dark modules on an ivory tile so every camera reads it. */
function AddressQr({ address }: { address: string }) {
  const t = useT("wallet");
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(address, { width: 360, margin: 0, color: { dark: "#0e0e0d", light: "#f2f1ec" } }))
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);
  return (
    <div className="qr">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      {src ? <img src={src} alt={t("qrAlt")} width={180} height={180} /> : <Skeleton height={180} width={180} />}
    </div>
  );
}

interface AccountRow {
  accountId: string;
  okxName: string;
  name: string;
  renamed: boolean;
  evmAddress: string | null;
  totalValueUsd: string | null;
  isActive: boolean;
}

/**
 * Every account of this login: rename it (the name is kept by albicocca,
 * OKX has no rename) or make it the active one.
 */
function AccountsSheet({
  open,
  onClose,
  activeId,
  switching,
  onSwitch,
  onRenamed,
}: {
  open: boolean;
  onClose: () => void;
  activeId: string | null;
  switching: boolean;
  onSwitch: (accountId: string) => Promise<void>;
  onRenamed: () => void;
}) {
  const t = useT("wallet");
  const tc = useT("common");
  const f = useFormat();
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [maxLen, setMaxLen] = useState(32);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/wallet/accounts")
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setAccounts(res.data.accounts);
          setMaxLen(res.data.maxNameLength ?? 32);
          setError(null);
        } else setError(res.error ?? t("accountsLoadFailed"));
      })
      .catch(() => !cancelled && setError(t("serverUnreachable")));
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const save = async (accountId: string, label: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/wallet/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, label }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? t("renameFailed"));
        return;
      }
      setAccounts((prev) =>
        prev?.map((a) => (a.accountId === accountId ? { ...a, name: data.data.name ?? a.okxName, renamed: data.data.name != null } : a)) ?? prev
      );
      setEditing(null);
      onRenamed();
      toast.success(data.data.name ? t("renamedTo", { name: data.data.name }) : t("nameReset"));
    } catch {
      toast.error(t("networkError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("yourAccounts")}>
      <div className="sheet-body">
        {error ? (
          <p className="note loss">
            <LineIcon name="alert" size={16} />
            <span>{error}</span>
          </p>
        ) : !accounts ? (
          <div style={{ display: "grid", gap: 10 }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : (
          <ul className="rows acct-list">
            {accounts.map((a) => {
              const active = a.isActive || a.accountId === activeId;
              return (
                <li key={a.accountId}>
                  {editing === a.accountId ? (
                    <form
                      className="acct-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save(a.accountId, draft);
                      }}
                    >
                      <label htmlFor={`acct-name-${a.accountId}`} className="sr-only">
                        {t("newNameFor", { name: a.name })}
                      </label>
                      <input
                        id={`acct-name-${a.accountId}`}
                        className="input"
                        value={draft}
                        maxLength={maxLen}
                        placeholder={a.okxName}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <div className="sheet-actions">
                        <button type="button" className="btn btn--sm" onClick={() => setEditing(null)} disabled={saving}>
                          {tc("cancel")}
                        </button>
                        <button type="submit" className="btn btn--sm btn--primary" disabled={saving}>
                          {saving ? <span className="spin" aria-hidden="true" /> : t("save")}
                        </button>
                      </div>
                      {a.renamed && (
                        <button type="button" className="link-btn" onClick={() => void save(a.accountId, "")} disabled={saving}>
                          {t("useOriginalName", { name: a.okxName })}
                        </button>
                      )}
                    </form>
                  ) : (
                    <div className="row acct-row">
                      <span className="avatar" aria-hidden="true">
                        {a.name.trim().charAt(0).toUpperCase() || "A"}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="t trunc">
                          {a.name} {active && <span className="st ok">{t("inUse")}</span>}
                        </div>
                        <div className="sub num">
                          {a.evmAddress ? `${a.evmAddress.slice(0, 8)}…${a.evmAddress.slice(-6)}` : t("addressPending")}
                          {a.totalValueUsd != null ? ` · ${f.usd(a.totalValueUsd)}` : ""}
                        </div>
                      </div>
                      <div className="acct-acts">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={t("renameNamed", { name: a.name })}
                          onClick={() => {
                            setDraft(a.renamed ? a.name : "");
                            setEditing(a.accountId);
                          }}
                        >
                          <LineIcon name="pencil" size={15} />
                        </button>
                        {!active && (
                          <button type="button" className="btn btn--sm" disabled={switching} onClick={() => void onSwitch(a.accountId)}>
                            {switching ? <span className="spin" aria-hidden="true" /> : t("use")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint">{t("namesHint")}</p>
      </div>
    </Sheet>
  );
}

export default function WalletPage() {
  const { authenticated, walletAddress, accountName, accountId, accountCount, mutate: mutateAuth } = useAuth();
  const { balancesByChain, isLoading, mutateAll } = useAllChainBalances();
  const t = useT("wallet");
  const tc = useT("common");
  const f = useFormat();

  const [tab, setTab] = useState<WalletTab>(initialTab);
  const [sendForm, setSendForm] = useState({
    recipient: "",
    amount: "",
    chain: "1",
    // tokenKey = "native" or "CONTRACT_ADDRESS"
    tokenKey: "native",
  });
  const [sending, setSending] = useState(false);
  // What "Max" kept back for the network fee, tied to the form it was made
  // for: once the chain, token or amount changes, the note no longer shows.
  const [maxNote, setMaxNote] = useState<{ form: string; text: string } | null>(null);
  const sendingRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [gasStation, setGasStation] = useState<GasStationConfirming | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);

  // History state
  const [history, setHistory] = useState<TxEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showSpam, setShowSpam] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/wallet/history?limit=20");
      const data = await res.json();
      if (data.success) {
        const entries = Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.data?.data)
          ? data.data.data
          : [];
        setHistory(entries);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
      setHistoryLoaded(true);
    }
  }, []);

  const handleAddAccount = async () => {
    setAddingAccount(true);
    try {
      const res = await fetch("/api/wallet/accounts", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(t("accountCreated"));
        mutateAuth();
        mutateAll();
      } else {
        toast.error(data.error || t("addAccountFailed"));
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setAddingAccount(false);
    }
  };

  const handleSwitchAccount = async (targetAccountId: string) => {
    setSwitchingAccount(true);
    try {
      const res = await fetch("/api/wallet/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: targetAccountId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t("accountSwitched"));
        mutateAuth();
        mutateAll();
      } else {
        toast.error(data.error || t("switchAccountFailed"));
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setSwitchingAccount(false);
    }
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/wallet/balances?force=true");
      mutateAll();
      toast.success(t("balancesRefreshed"));
    } catch {
      toast.error(t("refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  };

  const selectTab = (t: WalletTab) => {
    setTab(t);
    if (t === "activity" && !historyLoaded) void loadHistory();
  };

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(t("copyBlocked"));
    }
  };

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="wallet" title={t("signInTitle")} text={t("signInText")} />
      </div>
    );
  }

  // Extracted from the form handler so the Gas Station modal can re-run
  // the same send after the gas token is set up (form state is only reset
  // on success, so a retry reuses the user's input untouched).
  const selectedChain = Object.values(CHAINS).find(
    (c) => String(c.chainIndex) === sendForm.chain
  );
  const chainTokens = balancesByChain[parseInt(sendForm.chain)]?.tokens ?? [];
  const sendToken = chainTokens.find((t) => t.tokenAddress === sendForm.tokenKey);
  const selectedTokenSymbol =
    sendForm.tokenKey === "native"
      ? selectedChain?.nativeSymbol ?? "ETH"
      : sendToken
        ? displayToken(sendToken).symbol
        : "token";
  const normalizedAmount = normalizeAmount(sendForm.amount);
  // The exact amount that will be sent, only its decimal mark in the page's
  // language ("0.5" → "0,5"): no rounding, so the review shows every digit.
  const shownAmount = f.locale === "it" ? normalizedAmount.replace(".", ",") : normalizedAmount;
  const amountValid = isValidAmount(sendForm.amount);
  const recipientValid = EVM_ADDRESS_RE.test(sendForm.recipient);

  const submitSend = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const contractToken = sendForm.tokenKey !== "native" ? sendForm.tokenKey : undefined;
    try {
      const res = await fetch("/api/wallet/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: normalizeAmount(sendForm.amount),
          recipient: sendForm.recipient.toLowerCase(),
          chain: parseInt(sendForm.chain),
          contractToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // The assistant's send card warns about addresses this browser never sent to.
        rememberRecipient(sendForm.recipient);
        toast.success(t("txSent", { hash: data.data?.txHash || t("hashPending") }));
        setSendForm({ recipient: "", amount: "", chain: "1", tokenKey: "native" });
      } else if (data.requiresGasStation) {
        // Insufficient native gas — offer stablecoin gas payment via modal.
        setGasStation(data.gasStation);
      } else {
        console.error(data.error);
        toast.error(userFacingError(data.error, t("transferFailed")));
      }
    } catch (e) {
      console.error(e);
      toast.error(userFacingError(e, t("transferFailed")));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientValid || !amountValid) return;
    setConfirmOpen(true);
  };

  const evmAddress = walletAddress;
  const chainList = Object.values(CHAINS);
  const chainNames = chainList.map((c) => c.name);
  // "A, B and C" / "A, B e C".
  const joinNames = (names: string[]) =>
    names.length === 1 ? names[0] : t("list", { items: names.slice(0, -1).join(", "), last: names[names.length - 1] });
  const chainNamesText = joinNames(chainNames);

  const groups = chainList
    .map((chain) => {
      const bal = balancesByChain[chain.chainIndex];
      const tokens = (bal?.tokens ?? [])
        .map((t) => {
          const qty = parseFloat(t.balance || "0");
          const price = parseFloat(t.tokenPrice || "0");
          return { ...t, qty, value: qty * price, hasPrice: price > 0 };
        })
        .filter((t) => t.qty > 0)
        .sort((a, b) => b.value - a.value);
      return { chain, loading: Boolean(bal?.isLoading), total: parseFloat(bal?.totalValueUsd || "0"), tokens };
    });
  const funded = groups.filter((g) => g.tokens.length > 0).sort((a, b) => b.total - a.total);
  const emptyChains = groups.filter((g) => !g.loading && g.tokens.length === 0).map((g) => g.chain.name);
  const anyChainLoading = groups.some((g) => g.loading);
  const totalUsd = groups.reduce((sum, g) => sum + g.total, 0);

  const selectedToken = sendForm.tokenKey === "native"
    ? chainTokens.find((t) => t.isNative)
    : chainTokens.find((t) => t.tokenAddress === sendForm.tokenKey);
  const selectedBalance = parseFloat(selectedToken?.balance ?? "0");
  const formKey = (value: string) => `${sendForm.chain}|${sendForm.tokenKey}|${value}`;
  const maxNoteText = maxNote && maxNote.form === formKey(sendForm.amount) ? maxNote.text : null;

  // "Max" on the native coin keeps the gas reserve swap uses (0.002 on
  // Ethereum, 0.0005 elsewhere): sending the whole balance leaves nothing for
  // the fee and the transfer fails. A token can use its full balance.
  const fillMax = () => {
    const bal = selectedToken?.balance;
    if (!bal) return;
    if (sendForm.tokenKey !== "native") {
      setSendForm({ ...sendForm, amount: bal });
      setMaxNote(null);
      return;
    }
    if (!selectedChain) return;
    const { amount: max, reserved } = maxSpendable(bal, {
      native: true,
      chainIndex: selectedChain.chainIndex,
      decimals: selectedChain.nativeDecimals,
    });
    if (!reserved) return;
    if (max == null) {
      setMaxNote({ form: formKey(sendForm.amount), text: t("notEnoughAfterFee", { symbol: selectedTokenSymbol }) });
      return;
    }
    setSendForm({ ...sendForm, amount: max });
    setMaxNote({ form: formKey(max), text: t("keptForFee", { amount: f.amount(reserved), symbol: selectedTokenSymbol }) });
  };

  const spamCount = history.filter(isLikelySpam).length;
  const visibleHistory = showSpam ? history : history.filter((tx) => !isLikelySpam(tx));

  const initials = (accountName || "W").trim().charAt(0).toUpperCase();

  return (
    <div className="page">
      <GasStationModal
        open={gasStation !== null}
        chain={sendForm.chain}
        payload={gasStation}
        onClose={() => setGasStation(null)}
        onResolved={() => {
          setGasStation(null);
          void submitSend();
        }}
      />
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-[26px] sm:rounded-[26px] border-border shadow-lg">
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-[14px]">
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">{t("chain")}</span>
              <span className="font-medium text-right">{selectedChain?.name ?? sendForm.chain}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">{t("token")}</span>
              <span className="font-medium text-right">{selectedTokenSymbol}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">{t("amount")}</span>
              <span className="font-medium text-right font-mono tabular-nums">{shownAmount}</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">{t("recipient")}</span>
              <p className="font-mono text-[13px] break-all leading-relaxed">{sendForm.recipient}</p>
            </div>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full px-5"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              className="h-11 rounded-full px-6"
              disabled={sending}
              onClick={() => {
                setConfirmOpen(false);
                void submitSend();
              }}
            >
              {t("sendNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageHead
        title={t("title")}
        lede={t("lede", { chains: chainNamesText })}
        actions={
          <>
            <button type="button" className="btn" onClick={() => selectTab("receive")}>
              <LineIcon name="arrow-down" size={16} />
              {t("receive")}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => selectTab("send")}>
              <LineIcon name="arrow-up" size={16} />
              {t("send")}
            </button>
          </>
        }
      >
        <div className="acct-strip">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="who">
            <div className="t">
              {accountName ?? t("defaultAccountName")}
              <button type="button" className="icon-btn rename-btn" aria-label={t("renameAccount")} onClick={() => setAccountsOpen(true)}>
                <LineIcon name="pencil" size={14} />
              </button>
            </div>
            {walletAddress && (
              <button type="button" className="addr" onClick={copyAddress} aria-label={t("copyWalletAddress")}>
                <span className="num">{`${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`}</span>
                <LineIcon name={copied ? "check" : "copy"} size={14} />
              </button>
            )}
          </div>
          <div className="acts">
            <button type="button" className="btn btn--sm" onClick={() => setAccountsOpen(true)} disabled={switchingAccount}>
              {switchingAccount ? <span className="spin" aria-hidden="true" /> : <LineIcon name="wallet" size={15} />}
              {t("accounts")}
              {accountCount > 1 ? ` (${accountCount})` : ""}
            </button>
            <button type="button" className="btn btn--sm" onClick={handleAddAccount} disabled={addingAccount}>
              {addingAccount ? <span className="spin" aria-hidden="true" /> : <LineIcon name="plus" size={15} />}
              {t("addAccount")}
            </button>
          </div>
        </div>
      </PageHead>

      <AccountsSheet
        open={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        activeId={accountId}
        switching={switchingAccount}
        onSwitch={async (id) => {
          await handleSwitchAccount(id);
          setAccountsOpen(false);
        }}
        onRenamed={() => mutateAuth()}
      />

      <PillTabs
        id="wallet-tabs"
        label={t("views")}
        value={tab}
        onChange={selectTab}
        options={[
          { value: "balances", label: t("balances") },
          { value: "activity", label: t("activity") },
          { value: "receive", label: t("receive") },
          { value: "send", label: t("send") },
        ]}
      />

      {tab === "balances" && (
        <Panel
          flush
          index={1}
          title={t("balances")}
          sub={isLoading ? t("loading") : t("chainsFunded", { count: funded.length, total: chainList.length })}
          action={
            <button type="button" className="chip" onClick={handleForceRefresh} disabled={refreshing || isLoading}>
              <LineIcon name="refresh" size={13} className={refreshing ? "spinning" : undefined} />
              {refreshing ? t("refreshing") : t("refresh")}
            </button>
          }
        >
          <div className="wal-total">
            <span className="l">{t("totalValue")}</span>
            <span className="v num">{isLoading ? <Skeleton height={40} width={200} /> : <CountUp value={totalUsd} format={(n) => f.usd(n)} />}</span>
          </div>

          {isLoading ? (
            <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={52} />
              ))}
            </div>
          ) : funded.length === 0 && !anyChainLoading ? (
            <Empty
              icon="wallet"
              title={t("noFundsTitle")}
              text={t("noFundsText", { chains: chainNamesText })}
              action={
                <button type="button" className="btn btn--sm" onClick={() => selectTab("receive")}>
                  {t("showAddress")}
                </button>
              }
            />
          ) : (
            <div className="wal-groups">
              {funded.map(({ chain, total, tokens }) => (
                <section key={chain.chainIndex} className="wal-group" aria-label={chain.name}>
                  <header className="wal-group-head">
                    <span className="dot" style={{ background: CHAIN_COLORS[chain.chainIndex] }} aria-hidden="true" />
                    <h3>{chain.name}</h3>
                    {!chain.hasFluid && <span className="tag">{t("noLending")}</span>}
                    <span className="num">{f.usd(total)}</span>
                  </header>
                  <ul className="rows">
                    {tokens.map((tok, i) => {
                      const d = displayToken(tok);
                      return (
                        <li key={`${tok.tokenAddress}-${i}`}>
                          <div className="row">
                            <TokenIcon symbol={d.symbol} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <div className="t">
                                {d.symbol}
                                {d.name !== d.symbol && <span className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{d.name}</span>}
                              </div>
                              <div className="sub num">{f.amount(tok.qty)} {d.symbol}</div>
                            </div>
                            <div className="end num">{tok.hasPrice ? f.usd(tok.value) : <span className="muted">{t("noPrice")}</span>}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {groups
                .filter((g) => g.loading)
                .map((g) => (
                  <div key={g.chain.chainIndex} className="wal-pad">
                    <Skeleton height={44} />
                  </div>
                ))}
              {emptyChains.length > 0 && (
                <p className="wal-empty">{t("nothingOn", { chains: joinNames(emptyChains) })}</p>
              )}
            </div>
          )}
        </Panel>
      )}

      {tab === "balances" && <OkxProtections />}

      {tab === "activity" && (
        <Panel
          flush
          index={1}
          title={t("recentActivity")}
          sub={spamCount > 0 ? t("lastTxsSpam", { count: spamCount }) : t("lastTxs")}
          action={
            <button type="button" className="chip" onClick={loadHistory} disabled={historyLoading}>
              <LineIcon name="refresh" size={13} className={historyLoading ? "spinning" : undefined} />
              {t("refresh")}
            </button>
          }
        >
          {historyLoading ? (
            <div className="wal-pad" style={{ display: "grid", gap: 12 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={52} />
              ))}
            </div>
          ) : history.length === 0 ? (
            <Empty icon="file" title={t("noTxTitle")} text={t("noTxText")} />
          ) : (
            <>
              {spamCount > 0 && (
                <div className="spam-bar">
                  <LineIcon name="shield-check" size={16} />
                  <span>
                    {showSpam ? t("spamShown") : t("spamHidden", { count: spamCount })}
                  </span>
                  <button type="button" className="link-btn" onClick={() => setShowSpam((v) => !v)}>
                    {showSpam ? t("hide") : t("show")}
                  </button>
                </div>
              )}
              <ul className="rows wal-pad">
                {visibleHistory.map((tx, i) => {
                  const spam = isLikelySpam(tx);
                  const isReceive = tx.direction === "IN";
                  const isSuccess = tx.txStatus === "SUCCESS";
                  const isError = tx.txStatus === "ERROR";
                  const state = isSuccess ? "ok" : isError ? "bad" : "wait";
                  const stateLabel = isSuccess ? t("statusDone") : isError ? t("statusFailed") : t("statusPending");
                  const dateStr = tx.txTime ? f.date(parseInt(tx.txTime), TX_DATE) : t("unknownDate");

                  // Action label: Approve / Receive / Send / Contract
                  const hasAmount = tx.amount && parseFloat(tx.amount) > 0;
                  const sym = tx.symbol ? displayToken({ symbol: tx.symbol, chainIndex: tx.chainIndex }).symbol : "";
                  let actionLabel: string;
                  let kind: "approve" | "in" | "out" | "contract";
                  if (tx.isApprove) {
                    actionLabel = t("approveToken", { symbol: sym }).trim();
                    kind = "approve";
                  } else if (hasAmount && isReceive) {
                    actionLabel = t("receivedToken", { symbol: sym }).trim();
                    kind = "in";
                  } else if (hasAmount && !isReceive) {
                    actionLabel = t("sentToken", { symbol: sym }).trim();
                    kind = "out";
                  } else {
                    actionLabel = tx.contractName ? t("contractNamed", { name: tx.contractName }) : t("contractCall");
                    kind = "contract";
                  }
                  const icon: LineIconName = kind === "in" ? "arrow-down" : kind === "out" ? "arrow-up" : kind === "approve" ? "shield-check" : "file";

                  const amountDisplay = hasAmount
                    ? `${isReceive ? "+" : "−"}${f.amount(parseFloat(tx.amount!))} ${sym}`
                    : tx.gasFeeEth
                    ? t("networkFee", { amount: f.amount(tx.gasFeeEth), symbol: getChainByIndex(Number(tx.chainIndex))?.nativeSymbol ?? "" }).trim()
                    : "";

                  const explorerBase = getChainByIndex(Number(tx.chainIndex))?.explorer;

                  return (
                    <li key={`${tx.txHash}-${i}`} className={spam ? "is-spam" : undefined}>
                      <div className="row">
                        <span className={`tx-ico ${kind}`} aria-hidden="true">
                          <LineIcon name={icon} size={16} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="t tx-t">
                            <span>{actionLabel}</span>
                            {spam ? <span className="st bad">{t("likelySpam")}</span> : <span className={`st ${state}`}>{stateLabel}</span>}
                          </div>
                          <div className="sub">
                            {chainName(tx.chainIndex) ?? t("unknownNetwork")} · {dateStr}
                            {tx.failReason && <span className="fail"> · {tx.failReason}</span>}
                          </div>
                        </div>
                        <div className="end">
                          {amountDisplay && <div className={`num ${kind === "in" && !spam ? "text-gain-ink" : ""}`}>{amountDisplay}</div>}
                          {tx.txHash && explorerBase && (
                            <a className="sub num tx-link" href={`${explorerBase}/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer">
                              {tx.txHash.slice(0, 6)}…{tx.txHash.slice(-4)}
                              <LineIcon name="arrow-up-right" size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
      )}

      {tab === "receive" && (
        <div className="bento">
          <Panel className="span-7" index={1} title={t("yourAddress")} sub={t("yourAddressSub")}>
            {evmAddress ? (
              <div className="recv">
                <p className="recv-addr num">
                  <span className="sr-only">{evmAddress}</span>
                  {/* Groups of four, as people read and compare them; copying still gives one string. */}
                  {["0x", ...(evmAddress.slice(2).match(/.{1,4}/g) ?? [])].map((g, i) => (
                    <span key={i} aria-hidden="true">
                      {g}
                    </span>
                  ))}
                </p>
                <div className="page-actions">
                  <button type="button" className="btn btn--primary" onClick={copyAddress}>
                    <LineIcon name={copied ? "check" : "copy"} size={16} />
                    {copied ? tc("copied") : t("copyAddress")}
                  </button>
                </div>
                <p className="note">
                  <LineIcon name="alert" size={16} />
                  <span>{t("sendOnlyOn", { chains: chainNamesText })}</span>
                </p>
              </div>
            ) : (
              <Skeleton height={120} />
            )}
          </Panel>
          <Panel className="span-5" index={2} title={t("scanTitle")} sub={t("scanSub")}>
            {evmAddress ? <AddressQr address={evmAddress} /> : <Skeleton height={180} width={180} />}
          </Panel>
        </div>
      )}

      {tab === "send" && (
        <div className="bento">
          <Panel className="span-7" index={1} title={t("sendTitle")} sub={t("sendSub")}>
            <form onSubmit={handleSend} className="form">
              <div className="field">
                <label htmlFor="send-chain">{t("chain")}</label>
                <div className="select">
                  <select
                    id="send-chain"
                    className="input"
                    value={sendForm.chain}
                    onChange={(e) => setSendForm({ ...sendForm, chain: e.target.value, tokenKey: "native" })}
                  >
                    {chainList.map((c) => (
                      <option key={c.chainIndex} value={c.chainIndex}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <div className="lbl">
                  <label htmlFor="send-token">{t("token")}</label>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={async () => {
                      setRefreshing(true);
                      try {
                        await fetch(`/api/wallet/balances?chain=${sendForm.chain}&force=true`);
                        mutateAll();
                      } finally {
                        setRefreshing(false);
                      }
                    }}
                    disabled={refreshing || isLoading}
                  >
                    <LineIcon name="refresh" size={13} className={refreshing ? "spinning" : undefined} />
                    {t("refresh")}
                  </button>
                </div>
                <div className="select">
                  <select
                    id="send-token"
                    className="input"
                    value={sendForm.tokenKey}
                    onChange={(e) => setSendForm({ ...sendForm, tokenKey: e.target.value, amount: "" })}
                  >
                    <option value="native">{selectedChain?.nativeSymbol ?? cleanSymbol(chainTokens.find((t) => t.isNative)?.symbol) ?? "ETH"}</option>
                    {chainTokens
                      .filter((t) => !t.isNative && t.tokenAddress)
                      .map((t) => (
                        <option key={t.tokenAddress} value={t.tokenAddress!}>
                          {displayToken({ ...t, chainIndex: selectedChain?.chainIndex }).symbol} · {f.amount(t.balance)}
                        </option>
                      ))}
                    {chainTokens.length === 0 && (
                      <option disabled value="">
                        {t("noTokens")}
                      </option>
                    )}
                  </select>
                </div>
                {selectedBalance > 0 && (
                  <p className="hint">
                    {t.node(
                      "available",
                      { num: (s) => <span className="num">{s}</span> },
                      { amount: f.amount(selectedBalance), symbol: selectedTokenSymbol }
                    )}
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor="send-amount">{t("amount")}</label>
                <div className="input-wrap">
                  <input
                    id="send-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={t("amountPlaceholder")}
                    className="input num-in"
                    value={sendForm.amount}
                    onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                    aria-invalid={sendForm.amount.length > 0 && !amountValid}
                    required
                  />
                  <button
                    type="button"
                    className="max"
                    aria-label={t("useMax")}
                    onClick={fillMax}
                  >
                    {t("max")}
                  </button>
                </div>
                {sendForm.amount.length > 0 && !amountValid && <p className="err">{t("invalidAmount")}</p>}
                {maxNoteText && <p className="hint">{maxNoteText}</p>}
              </div>

              <div className="field">
                <label htmlFor="recipient">{t("recipientAddress")}</label>
                <input
                  id="recipient"
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  className="input mono"
                  value={sendForm.recipient}
                  onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })}
                  aria-invalid={sendForm.recipient.length > 0 && !recipientValid}
                  required
                />
                {sendForm.recipient.length > 0 && !recipientValid && <p className="err">{t("invalidAddress")}</p>}
              </div>

              <button type="submit" disabled={sending || !amountValid || !recipientValid} className="btn btn--primary btn--well">
                {sending ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    {t("sending")}
                  </>
                ) : (
                  <>
                    {t("reviewTransfer")}
                    <span className="well" aria-hidden="true">
                      <LineIcon name="arrow-up-right" size={16} />
                    </span>
                  </>
                )}
              </button>
            </form>
          </Panel>

          <Panel className="span-5" index={2} title={t("summary")}>
            <dl className="sum">
              <div>
                <dt>{t("youSend")}</dt>
                <dd className={amountValid ? "num" : undefined}>{amountValid ? `${shownAmount} ${selectedTokenSymbol}` : <span className="muted">{t("notSet")}</span>}</dd>
              </div>
              <div>
                <dt>{t("on")}</dt>
                <dd>{selectedChain?.name ?? sendForm.chain}</dd>
              </div>
              <div>
                <dt>{t("to")}</dt>
                <dd className={recipientValid ? "num" : undefined}>{recipientValid ? `${sendForm.recipient.slice(0, 8)}…${sendForm.recipient.slice(-6)}` : <span className="muted">{t("notSet")}</span>}</dd>
              </div>
            </dl>
            <p className="note" style={{ marginTop: 16 }}>
              <LineIcon name="shield-check" size={16} />
              <span>{t("irreversible")}</span>
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
