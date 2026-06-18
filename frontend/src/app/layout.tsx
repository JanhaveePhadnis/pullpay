import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PullPay Subscriptions - RawBlock Dashboard",
  description: "Raw, brutalist interface for managing PullPay subscription billing contracts on Stellar Soroban.",
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
