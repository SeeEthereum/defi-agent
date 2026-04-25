"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const slides = [
  {
    icon: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/logo.jpg" alt="DeFi Agent" width={64} height={64} className="rounded-2xl object-cover shadow-lg" />
    ),
    title: "Welcome to DeFi Agent",
    subtitle: "Your AI-powered gateway to decentralized finance",
    description:
      "Manage your crypto portfolio across multiple blockchains with the help of an intelligent assistant. No complexity, no seed phrases to worry about.",
  },
  {
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    title: "Secure Wallet",
    subtitle: "Enterprise-grade security with OKX TEE technology",
    description:
      "Your private keys are protected inside a Trusted Execution Environment (TEE). You control your assets with just your email \u2014 no extensions, no seed phrases, no hardware wallets needed.",
  },
  {
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    title: "Earn Yield",
    subtitle: "Supply assets to Fluid Protocol and earn passively",
    description:
      "Deposit stablecoins or ETH into Fluid lending markets on Ethereum, Arbitrum, and Base. Watch your assets grow with competitive APR rates, all managed from one place.",
  },
  {
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      </svg>
    ),
    title: "Swap Tokens",
    subtitle: "Access 500+ DEX sources across 4 chains",
    description:
      "Trade any token on Ethereum, Arbitrum, Base, or BNB Chain with the best rates aggregated from hundreds of decentralized exchanges. One click, best price.",
  },
  {
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: "AI Assistant",
    subtitle: "Claude helps you navigate DeFi intelligently",
    description:
      "Ask questions, get market analysis, or let the AI suggest strategies. Every transaction is proposed first \u2014 you always confirm before anything executes.",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const isLastSlide = currentSlide === slides.length - 1;
  const slide = slides[currentSlide];

  const handleNext = () => {
    if (isLastSlide) {
      setShowDisclaimer(true);
    } else {
      setCurrentSlide((s) => s + 1);
    }
  };

  const handleAccept = () => {
    localStorage.setItem("defi-agent-disclaimer-accepted", "true");
    router.push("/auth");
  };

  if (showDisclaimer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-accent/30 p-4">
        <div className="w-full max-w-lg">
          <div className="bg-card rounded-2xl shadow-lg border border-border/60 p-8">
            <div className="flex items-center justify-center mb-6">
              <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>

            <h2 className="text-xl font-semibold text-center mb-2 tracking-tight">
              Risk Disclaimer
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Please read carefully before proceeding
            </p>

            <div className="bg-accent/50 rounded-xl p-4 mb-6 max-h-64 overflow-y-auto text-[13px] leading-relaxed text-foreground/80 space-y-3">
              <p>
                <strong>DeFi Agent</strong> provides access to decentralized finance protocols.
                By using this application, you acknowledge and accept the following risks:
              </p>
              <ul className="list-disc pl-4 space-y-1.5">
                <li>
                  <strong>Market risk:</strong> Cryptocurrency values are highly volatile and can result in significant financial loss.
                </li>
                <li>
                  <strong>Smart contract risk:</strong> DeFi protocols interact with smart contracts that may contain bugs or vulnerabilities.
                </li>
                <li>
                  <strong>Impermanent loss:</strong> Providing liquidity or lending assets carries additional risks beyond price volatility.
                </li>
                <li>
                  <strong>Regulatory risk:</strong> Cryptocurrency regulations vary by jurisdiction and may change at any time.
                </li>
                <li>
                  <strong>No guarantees:</strong> Past yields and APR rates are not guaranteed. Returns can fluctuate or become negative.
                </li>
              </ul>

              <div className="bg-destructive/5 border border-destructive/15 rounded-lg p-3 mt-2">
                <p className="font-semibold text-destructive/90 mb-1.5">
                  Key Custody &mdash; Important
                </p>
                <p>
                  Your wallet is powered by <strong>OKX Agentic Wallet</strong>. Private keys are generated and stored inside a <strong>Trusted Execution Environment (TEE)</strong> &mdash; a hardware-isolated secure enclave. This means:
                </p>
                <ul className="list-disc pl-4 space-y-1 mt-1.5">
                  <li>
                    <strong>You cannot export, extract, or back up your private keys.</strong> There is no seed phrase, no mnemonic, and no recovery file. This is by design.
                  </li>
                  <li>
                    No one &mdash; not you, not OKX, not this application &mdash; can access the raw private key. All transaction signing happens inside the TEE.
                  </li>
                  <li>
                    <strong>You depend on OKX infrastructure</strong> to access and operate your wallet. If OKX discontinues the Agentic Wallet service, you will not be able to recover your keys independently.
                  </li>
                  <li>
                    Your account is linked to your email. Losing access to your email may result in permanent loss of wallet access.
                  </li>
                </ul>
              </div>

              <p>
                This application does not provide financial advice. You are solely responsible for your investment decisions.
                Never invest more than you can afford to lose.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer mb-6 group">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  checked={disclaimerAccepted}
                  onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-5 w-5 rounded-md border-2 border-border peer-checked:border-primary peer-checked:bg-primary transition-all duration-200 flex items-center justify-center">
                  {disclaimerAccepted && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-[13px] text-foreground/80 leading-snug">
                I understand and accept the risks associated with using decentralized finance protocols and cryptocurrency trading.
              </span>
            </label>

            <Button
              onClick={handleAccept}
              disabled={!disclaimerAccepted}
              className="w-full h-11 rounded-xl font-medium text-sm shadow-sm"
            >
              Accept & Continue
            </Button>

            <button
              onClick={() => setShowDisclaimer(false)}
              className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Go back to slides
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="voxr-halo relative min-h-screen flex flex-col items-center justify-center bg-background p-6">
      {/* Soft halo behind the active slide, mirrors the auth hero. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/4 mx-auto h-[420px] max-w-2xl rounded-full opacity-50 blur-[110px]"
        style={{ background: "radial-gradient(closest-side, oklch(0.55 0.3 295 / 0.45), transparent)" }}
      />

      <div className="relative w-full max-w-lg">
        {/* Slide content */}
        <div
          key={currentSlide}
          className="text-center mb-12 animate-kinetic-in"
        >
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl border border-border bg-card mb-7 shadow-[0_0_40px_-10px_oklch(0.62_0.27_295/0.5)]">
            {slide.icon}
          </div>
          <p className="text-eyebrow mb-4">{slide.subtitle}</p>
          <h1 className="text-display-lg tracking-tight text-foreground mb-5">
            {slide.title}
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed max-w-md mx-auto">
            {slide.description}
          </p>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-2 mb-9">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentSlide
                  ? "w-8 bg-primary shadow-[0_0_8px_oklch(0.62_0.27_295/0.7)]"
                  : "w-1.5 bg-border hover:bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          {currentSlide > 0 && (
            <button
              onClick={() => setCurrentSlide((s) => s - 1)}
              className="btn-pill-ghost"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="btn-pill-primary"
          >
            {isLastSlide ? "Get Started →" : "Continue →"}
          </button>
        </div>

        {/* Skip */}
        {!isLastSlide && (
          <button
            onClick={() => setShowDisclaimer(true)}
            className="w-full mt-6 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors text-center"
          >
            Skip introduction
          </button>
        )}
      </div>
    </div>
  );
}
