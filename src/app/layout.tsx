import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground voxr-grain">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
