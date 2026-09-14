import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// No web fonts: the design system uses the Apple system stack, defined as
// --font-system / --font-system-mono in globals.css.

export const metadata: Metadata = {
  title: "DeFi Agent - AI-Powered DeFi Management",
  description:
    "Non-custodial DeFi command center. Swap, bridge, earn yield, scan for risks, and track smart money across 6 chains — orchestrated by a conversational AI agent. Email login, OKX TEE custody, no seed phrases.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
