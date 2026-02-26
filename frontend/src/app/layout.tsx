import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
