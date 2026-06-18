"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="container">
      {/* Hero Header */}
      <header className="header-band" style={{ marginTop: "40px" }}>
        <h1>RawBlock PullPay</h1>
        <div className="sub-header">Unapologetic Subscription Protocol</div>
      </header>

      {/* Main Hero Content */}
      <main style={{ marginTop: "40px", marginBottom: "80px" }}>
        <div className="grid-2col">
          {/* Hero text card */}
          <div className="card-elevated">
            <h2 style={{ fontSize: "38px", letterSpacing: "-1px", marginBottom: "20px" }}>
              CONTROL YOUR REVENUE STREAM. NO POLISH. JUST CODE.
            </h2>
            <p className="font-mono" style={{ fontSize: "16px", marginBottom: "30px" }}>
              PullPay is an on-chain protocol that enables merchants to pull USDC/token subscriptions directly from customer wallets on Stellar Soroban. Stripped of bloat, styled in brutalism.
            </p>
            <div style={{ display: "flex", gap: "16px" }}>
              <Link href="/manage" style={{ textDecoration: "none", width: "100%" }} id="link-enter-dashboard">
                <button id="btn-enter-dashboard" className="btn btn-primary btn-md">
                  Enter Dashboard
                </button>
              </Link>
            </div>
          </div>

          {/* Quick Info card */}
          <div className="card-default" style={{ justifyContent: "center" }}>
            <h3 style={{ marginBottom: "16px" }}>Protocol Specs</h3>
            <ul className="list-raw">
              <li className="list-item-raw font-mono" style={{ borderBottomWidth: "2px" }}>
                <strong>CHAIN:</strong> Stellar Soroban Testnet
              </li>
              <li className="list-item-raw font-mono" style={{ borderBottomWidth: "2px" }}>
                <strong>TOKENS:</strong> USDC / Stellar Stroops
              </li>
              <li className="list-item-raw font-mono" style={{ borderBottomWidth: "2px" }}>
                <strong>DESIGN:</strong> RawBlock Brutalist Spec
              </li>
              <li className="list-item-raw font-mono" style={{ borderBottomWidth: "0px" }}>
                <strong>CUSTODY:</strong> Non-custodial Smart Contract
              </li>
            </ul>
          </div>
        </div>

        {/* Benefits Grid */}
        <section style={{ marginTop: "64px" }}>
          <h2 style={{ marginBottom: "32px", fontSize: "36px" }}>Why PullPay?</h2>
          <div className="grid-2col">
            <div className="card-default">
              <h4>Direct Pull Billing</h4>
              <p style={{ marginBottom: 0 }}>
                Eliminate manual monthly invoicing. Merchants initiate the pull request based on customer-approved limits and interval parameters.
              </p>
            </div>
            <div className="card-default">
              <h4>Gas Efficient</h4>
              <p style={{ marginBottom: 0 }}>
                Engineered from the ground up for low-cost transactions on Stellar, ensuring high performance even under heavy loads.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "3px solid black", paddingTop: "24px", paddingBottom: "40px" }} className="font-mono">
        <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: 0 }}>
          RAWBLOCK PULLPAY PROTOCOL // RUNNING ON STELLAR TESTNET // NO RIGHTS RESERVED.
        </p>
      </footer>
    </div>
  );
}
