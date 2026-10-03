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
import { TokenIcon } from "@/components/token-icon";
import { LineIcon, type LineIconName } from "@/components/line-icon";
import { CountUp, Empty, PageHead, Panel, PillTabs, Sheet, Skeleton } from "@/components/premium";
import type { GasStationConfirming } from "@/lib/okx/types";
import { toast } from "sonner";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_AMOUNT_RE = /^\d+(\.\d+)?$/;

function normalizeAmount(raw: string): string {
  return raw.trim().replace(",", ".");
}

function isValidAmount(raw: string): boolean {
  const normalized = normalizeAmount(raw);
  return DECIMAL_AMOUNT_RE.test(normalized) && Number(normalized) > 0;
}

function userFacingError(detail: unknown, fallback: string): string {
  const message =
    typeof detail === "string"
      ? detail
      : detail instanceof Error
        ? detail.message
        : "";
  if (/logged out/i.test(message) || /insufficient funds/i.test(message)) {
    return message;
  }
  return fallback;
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

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function amount(n: number, max = 6): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
}

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
      {src ? <img src={src} alt="QR code of your wallet address" width={180} height={180} /> : <Skeleton height={180} width={180} />}
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
        } else setError(res.error ?? "Could not load your accounts");
      })
      .catch(() => !cancelled && setError("Could not reach the server"));
    return () => {
      cancelled = true;
    };
  }, [open]);

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
        toast.error(data.error ?? "Could not rename the account");
        return;
      }
      setAccounts((prev) =>
        prev?.map((a) => (a.accountId === accountId ? { ...a, name: data.data.name ?? a.okxName, renamed: data.data.name != null } : a)) ?? prev
      );
      setEditing(null);
      onRenamed();
      toast.success(data.data.name ? `Renamed to ${data.data.name}` : "Name reset");
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Your accounts">
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
                        New name for {a.name}
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
                          Cancel
                        </button>
                        <button type="submit" className="btn btn--sm btn--primary" disabled={saving}>
                          {saving ? <span className="spin" aria-hidden="true" /> : "Save"}
                        </button>
                      </div>
                      {a.renamed && (
                        <button type="button" className="link-btn" onClick={() => void save(a.accountId, "")} disabled={saving}>
                          Use the original name, {a.okxName}
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
                          {a.name} {active && <span className="st ok">In use</span>}
                        </div>
                        <div className="sub num">
                          {a.evmAddress ? `${a.evmAddress.slice(0, 8)}…${a.evmAddress.slice(-6)}` : "Address appears once you use it"}
                          {a.totalValueUsd != null ? ` · $${Number(a.totalValueUsd).toFixed(2)}` : ""}
                        </div>
                      </div>
                      <div className="acct-acts">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Rename ${a.name}`}
                          onClick={() => {
                            setDraft(a.renamed ? a.name : "");
                            setEditing(a.accountId);
                          }}
                        >
                          <LineIcon name="pencil" size={15} />
                        </button>
                        {!active && (
                          <button type="button" className="btn btn--sm" disabled={switching} onClick={() => void onSwitch(a.accountId)}>
                            {switching ? <span className="spin" aria-hidden="true" /> : "Use"}
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
        <p className="hint">Names are only visible to you in albicocca. Addresses and funds do not change.</p>
      </div>
    </Sheet>
  );
}

export default function WalletPage() {
  const { authenticated, walletAddress, accountName, accountId, accountCount, mutate: mutateAuth } = useAuth();
  const { balancesByChain, isLoading, mutateAll } = useAllChainBalances();

  const [tab, setTab] = useState<WalletTab>(initialTab);
  const [sendForm, setSendForm] = useState({
    recipient: "",
    amount: "",
    chain: "1",
    // tokenKey = "native" or "CONTRACT_ADDRESS"
    tokenKey: "native",
  });
  const [sending, setSending] = useState(false);
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
        toast.success("New wallet account created!");
        mutateAuth();
        mutateAll();
      } else {
        toast.error(data.error || "Failed to add account");
      }
    } catch {
      toast.error("Network error");
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
        toast.success("Switched account!");
        mutateAuth();
        mutateAll();
      } else {
        toast.error(data.error || "Failed to switch account");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSwitchingAccount(false);
    }
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/wallet/balances?force=true");
      mutateAll();
      toast.success("Balances refreshed");
    } catch {
      toast.error("Refresh failed");
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
      toast.error("Copy blocked by the browser. Select the address instead.");
    }
  };

  if (!authenticated) {
    return (
      <div className="page">
        <Empty icon="wallet" title="Sign in first" text="Connect your wallet to see balances and send funds." />
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
  const selectedTokenSymbol =
    sendForm.tokenKey === "native"
      ? chainTokens.find((t) => t.isNative)?.symbol ?? selectedChain?.nativeSymbol ?? "ETH"
      : chainTokens.find((t) => t.tokenAddress === sendForm.tokenKey)?.symbol ?? sendForm.tokenKey;
  const normalizedAmount = normalizeAmount(sendForm.amount);
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
        toast.success(`Transaction sent! Hash: ${data.data?.txHash || "pending"}`);
        setSendForm({ recipient: "", amount: "", chain: "1", tokenKey: "native" });
      } else if (data.requiresGasStation) {
        // Insufficient native gas — offer stablecoin gas payment via modal.
        setGasStation(data.gasStation);
      } else {
        console.error(data.error);
        toast.error(userFacingError(data.error, "Transfer failed"));
      }
    } catch (e) {
      console.error(e);
      toast.error(userFacingError(e, "Transfer failed"));
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
  const chainNamesText = `${chainNames.slice(0, -1).join(", ")} and ${chainNames[chainNames.length - 1]}`;

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
            <DialogTitle>Confirm transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-[14px]">
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">Chain</span>
              <span className="font-medium text-right">{selectedChain?.name ?? sendForm.chain}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">Token</span>
              <span className="font-medium text-right">{selectedTokenSymbol}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium text-right font-mono tabular-nums">{normalizedAmount}</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Recipient</span>
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
              Cancel
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
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageHead
        title="Wallet"
        lede={`One address for ${chainNamesText}.`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => selectTab("receive")}>
              <LineIcon name="arrow-down" size={16} />
              Receive
            </button>
            <button type="button" className="btn btn--primary" onClick={() => selectTab("send")}>
              <LineIcon name="arrow-up" size={16} />
              Send
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
              {accountName ?? "Wallet 1"}
              <button type="button" className="icon-btn rename-btn" aria-label="Rename this account" onClick={() => setAccountsOpen(true)}>
                <LineIcon name="pencil" size={14} />
              </button>
            </div>
            {walletAddress && (
              <button type="button" className="addr" onClick={copyAddress} aria-label="Copy wallet address">
                <span className="num">{`${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`}</span>
                <LineIcon name={copied ? "check" : "copy"} size={14} />
              </button>
            )}
          </div>
          <div className="acts">
            <button type="button" className="btn btn--sm" onClick={() => setAccountsOpen(true)} disabled={switchingAccount}>
              {switchingAccount ? <span className="spin" aria-hidden="true" /> : <LineIcon name="wallet" size={15} />}
              Accounts{accountCount > 1 ? ` (${accountCount})` : ""}
            </button>
            <button type="button" className="btn btn--sm" onClick={handleAddAccount} disabled={addingAccount}>
              {addingAccount ? <span className="spin" aria-hidden="true" /> : <LineIcon name="plus" size={15} />}
              Add account
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
        label="Wallet views"
        value={tab}
        onChange={selectTab}
        options={[
          { value: "balances", label: "Balances" },
          { value: "activity", label: "Activity" },
          { value: "receive", label: "Receive" },
          { value: "send", label: "Send" },
        ]}
      />

      {tab === "balances" && (
        <Panel
          flush
          index={1}
          title="Balances"
          sub={isLoading ? "Loading…" : `${funded.length} of ${chainList.length} chains hold funds`}
          action={
            <button type="button" className="chip" onClick={handleForceRefresh} disabled={refreshing || isLoading}>
              <LineIcon name="refresh" size={13} className={refreshing ? "spinning" : undefined} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          }
        >
          <div className="wal-total">
            <span className="l">Total value</span>
            <span className="v num">{isLoading ? <Skeleton height={40} width={200} /> : <CountUp value={totalUsd} format={(n) => usd.format(n)} />}</span>
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
              title="No funds yet"
              text={`Send crypto to your address on ${chainNamesText}.`}
              action={
                <button type="button" className="btn btn--sm" onClick={() => selectTab("receive")}>
                  Show my address
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
                    {!chain.hasFluid && <span className="tag">No lending</span>}
                    <span className="num">{usd.format(total)}</span>
                  </header>
                  <ul className="rows">
                    {tokens.map((t, i) => (
                      <li key={`${t.tokenAddress}-${i}`}>
                        <div className="row">
                          <TokenIcon symbol={t.symbol} size={34} />
                          <div style={{ minWidth: 0 }}>
                            <div className="t">{t.symbol}</div>
                            <div className="sub num">{amount(t.qty)}</div>
                          </div>
                          <div className="end num">{t.hasPrice ? usd.format(t.value) : <span className="muted">No price</span>}</div>
                        </div>
                      </li>
                    ))}
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
                <p className="wal-empty">
                  Nothing on {emptyChains.length === 1 ? emptyChains[0] : `${emptyChains.slice(0, -1).join(", ")} and ${emptyChains[emptyChains.length - 1]}`}.
                </p>
              )}
            </div>
          )}
        </Panel>
      )}

      {tab === "activity" && (
        <Panel
          flush
          index={1}
          title="Recent activity"
          sub={spamCount > 0 ? `Last 20 transactions, ${spamCount} look like spam` : "Last 20 transactions"}
          action={
            <button type="button" className="chip" onClick={loadHistory} disabled={historyLoading}>
              <LineIcon name="refresh" size={13} className={historyLoading ? "spinning" : undefined} />
              Refresh
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
            <Empty icon="file" title="No transactions yet" text="Transfers, swaps and approvals from this wallet will show up here." />
          ) : (
            <>
              {spamCount > 0 && (
                <div className="spam-bar">
                  <LineIcon name="shield-check" size={16} />
                  <span>
                    {showSpam
                      ? "Likely spam is shown. Never visit the sites in these token names."
                      : `${spamCount} unsolicited ${spamCount === 1 ? "token" : "tokens"} hidden. Their names advertise websites, a common phishing trick.`}
                  </span>
                  <button type="button" className="link-btn" onClick={() => setShowSpam((v) => !v)}>
                    {showSpam ? "Hide" : "Show"}
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
                  const stateLabel = isSuccess ? "Done" : isError ? "Failed" : "Pending";
                  const dateStr = tx.txTime
                    ? new Date(parseInt(tx.txTime)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "Unknown date";

                  // Action label: Approve / Receive / Send / Contract
                  const hasAmount = tx.amount && parseFloat(tx.amount) > 0;
                  let actionLabel: string;
                  let kind: "approve" | "in" | "out" | "contract";
                  if (tx.isApprove) {
                    actionLabel = `Approve ${tx.symbol ?? ""}`.trim();
                    kind = "approve";
                  } else if (hasAmount && isReceive) {
                    actionLabel = `Received ${tx.symbol ?? ""}`.trim();
                    kind = "in";
                  } else if (hasAmount && !isReceive) {
                    actionLabel = `Sent ${tx.symbol ?? ""}`.trim();
                    kind = "out";
                  } else {
                    actionLabel = tx.contractName ? `Contract · ${tx.contractName}` : "Contract call";
                    kind = "contract";
                  }
                  const icon: LineIconName = kind === "in" ? "arrow-down" : kind === "out" ? "arrow-up" : kind === "approve" ? "shield-check" : "file";

                  const amountDisplay = hasAmount
                    ? `${isReceive ? "+" : "−"}${amount(parseFloat(tx.amount!), 4)} ${tx.symbol ?? ""}`
                    : tx.gasFeeEth
                    ? `Gas ${tx.gasFeeEth} ETH`
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
                            {spam ? <span className="st bad">Likely spam</span> : <span className={`st ${state}`}>{stateLabel}</span>}
                          </div>
                          <div className="sub">
                            {tx.chainSymbol ?? "Unknown chain"} · {dateStr}
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
          <Panel className="span-7" index={1} title="Your address" sub="The same on every supported chain">
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
                    {copied ? "Copied" : "Copy address"}
                  </button>
                </div>
                <p className="note">
                  <LineIcon name="alert" size={16} />
                  <span>Send only on {chainNamesText}. Funds sent on another network may not reach this&nbsp;wallet.</span>
                </p>
              </div>
            ) : (
              <Skeleton height={120} />
            )}
          </Panel>
          <Panel className="span-5" index={2} title="Scan to send" sub="From a phone wallet">
            {evmAddress ? <AddressQr address={evmAddress} /> : <Skeleton height={180} width={180} />}
          </Panel>
        </div>
      )}

      {tab === "send" && (
        <div className="bento">
          <Panel className="span-7" index={1} title="Send tokens" sub="You review everything before it leaves">
            <form onSubmit={handleSend} className="form">
              <div className="field">
                <label htmlFor="send-chain">Chain</label>
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
                  <label htmlFor="send-token">Token</label>
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
                    Refresh
                  </button>
                </div>
                <div className="select">
                  <select
                    id="send-token"
                    className="input"
                    value={sendForm.tokenKey}
                    onChange={(e) => setSendForm({ ...sendForm, tokenKey: e.target.value, amount: "" })}
                  >
                    <option value="native">{chainTokens.find((t) => t.isNative)?.symbol ?? selectedChain?.nativeSymbol ?? "ETH"} (native)</option>
                    {chainTokens
                      .filter((t) => !t.isNative && t.tokenAddress)
                      .map((t) => (
                        <option key={t.tokenAddress} value={t.tokenAddress!}>
                          {t.symbol} · {parseFloat(t.balance).toFixed(4)}
                        </option>
                      ))}
                    {chainTokens.length === 0 && (
                      <option disabled value="">
                        No tokens found on this chain
                      </option>
                    )}
                  </select>
                </div>
                {selectedBalance > 0 && (
                  <p className="hint">
                    Available <span className="num">{selectedBalance.toFixed(6)}</span> {selectedTokenSymbol}
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor="send-amount">Amount</label>
                <div className="input-wrap">
                  <input
                    id="send-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className="input num-in"
                    value={sendForm.amount}
                    onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                    aria-invalid={sendForm.amount.length > 0 && !amountValid}
                    required
                  />
                  <button
                    type="button"
                    className="max"
                    aria-label="Use maximum balance"
                    onClick={() => {
                      const bal = selectedToken?.balance;
                      if (bal) setSendForm({ ...sendForm, amount: bal });
                    }}
                  >
                    Max
                  </button>
                </div>
                {sendForm.amount.length > 0 && !amountValid && <p className="err">Enter a valid amount</p>}
              </div>

              <div className="field">
                <label htmlFor="recipient">Recipient address</label>
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
                {sendForm.recipient.length > 0 && !recipientValid && <p className="err">This is not a valid address</p>}
              </div>

              <button type="submit" disabled={sending || !amountValid || !recipientValid} className="btn btn--primary btn--well">
                {sending ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    Sending…
                  </>
                ) : (
                  <>
                    Review transfer
                    <span className="well" aria-hidden="true">
                      <LineIcon name="arrow-up-right" size={16} />
                    </span>
                  </>
                )}
              </button>
            </form>
          </Panel>

          <Panel className="span-5" index={2} title="Summary">
            <dl className="sum">
              <div>
                <dt>You send</dt>
                <dd className={amountValid ? "num" : undefined}>{amountValid ? `${normalizedAmount} ${selectedTokenSymbol}` : <span className="muted">Not set</span>}</dd>
              </div>
              <div>
                <dt>On</dt>
                <dd>{selectedChain?.name ?? sendForm.chain}</dd>
              </div>
              <div>
                <dt>To</dt>
                <dd className={recipientValid ? "num" : undefined}>{recipientValid ? `${sendForm.recipient.slice(0, 8)}…${sendForm.recipient.slice(-6)}` : <span className="muted">Not set</span>}</dd>
              </div>
            </dl>
            <p className="note" style={{ marginTop: 16 }}>
              <LineIcon name="shield-check" size={16} />
              <span>Transfers cannot be undone. Check the address before you&nbsp;confirm.</span>
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
