import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/wallet/walletContext";

export const metadata: Metadata = {
  title: "Last Chair — ZK Musical Chairs",
  description: "PvP strategy game on Starknet. Pick your chair, set your traps, prove it with ZK.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
