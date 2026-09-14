import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// No web fonts: the design system uses the Apple system stack, defined as
// --font-system / --font-system-mono in globals.css.

export const metadata: Metadata = {
  title: "albicocca — ask your wallet",
  description:
    "An onchain agent with a wallet built in. Swap, bridge, earn and trade across six chains by asking for it — sign in with Google, Apple or email, keys held in OKX's secure enclave, no seed phrase.",
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
