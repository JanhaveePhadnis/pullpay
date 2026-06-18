"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "../../hooks/useWallet";
import { useSubscriptionVault } from "../../hooks/useSubscriptionVault";
import { useSorobanEvents } from "../../hooks/useSorobanEvents";

interface Subscription {
  merchant: string;
  amount: string;
  interval: number;
  contractId?: string;
}

export default function Manage() {
  const { publicKey, isConnected, checking, error: walletError, connectWallet, disconnectWallet, isSandbox, toggleSandbox } = useWallet();
  const { subscribe, charge, cancel, loading: txLoading, error: txError, successMessage, txStep } = useSubscriptionVault(publicKey, isSandbox);

  const [activeSubscriptions, setActiveSubscriptions] = useState<Subscription[]>([]);

  useEffect(() => {
    const loadSubscriptions = () => {
      if (typeof window !== "undefined" && publicKey) {
        const stored = localStorage.getItem(`pullpay_subs_${publicKey}`) || "[]";
        try {
          setActiveSubscriptions(JSON.parse(stored) as Subscription[]);
        } catch (e) {
          console.error(e);
        }
      } else {
        setActiveSubscriptions([]);
      }
    };

    loadSubscriptions();
    window.addEventListener("pullpay_subs_updated", loadSubscriptions);
    // Custom clean-up
    return () => {
      window.removeEventListener("pullpay_subs_updated", loadSubscriptions);
    };
  }, [publicKey]);

  const [contractId, setContractId] = useState(process.env.NEXT_PUBLIC_VAULT_ID || "CA75FG2KTXN6EAG7GBFOGXRYPN3TJSNQCPISI2MRBUCNVNHTIZ2EY6XX");
  const [merchantAddress, setMerchantAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setIntervalVal] = useState("");
  const [chargeUserAddress, setChargeUserAddress] = useState("");

  // Validation errors
  const [contractError, setContractError] = useState("");
  const [merchantError, setMerchantError] = useState("");
  const [chargeUserError, setChargeUserError] = useState("");

  const { events, clearEvents } = useSorobanEvents(contractId || null, isSandbox);

  const validateAddress = (address: string, prefix: "G" | "C"): boolean => {
    if (!address) return false;
    const regex = new RegExp(`^${prefix}[A-Z2-7]{55}$`);
    return regex.test(address);
  };

  const handleSubscribeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMerchantError("");
    setContractError("");

    let valid = true;
    if (!isSandbox) {
      if (!validateAddress(contractId, "C")) {
        setContractError("Invalid Contract ID. Must start with 'C' and be 56 characters.");
        valid = false;
      }
    }
    if (!validateAddress(merchantAddress, "G")) {
      setMerchantError("Invalid Merchant Address. Must start with 'G' and be 56 characters.");
      valid = false;
    }

    if (valid) {
      subscribe(contractId, merchantAddress, amount, parseInt(interval));
    }
  };

  const handleChargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setChargeUserError("");
    setContractError("");

    if (!publicKey) {
      alert("Connect your wallet, buddy!");
      return;
    }

    let valid = true;
    if (!isSandbox) {
      if (!validateAddress(contractId, "C")) {
        setContractError("Invalid Contract ID. Must start with 'C' and be 56 characters.");
        valid = false;
      }
    }
    if (!validateAddress(chargeUserAddress, "G")) {
      setChargeUserError("Invalid Subscriber Address. Must start with 'G' and be 56 characters.");
      valid = false;
    }

    if (valid) {
      charge(contractId, publicKey, chargeUserAddress);
    }
  };

  // Step tracker rendering
  const renderTxProgress = () => {
    if (txStep === 'idle') return null;

    const steps = [
      { name: 'Preparing', key: 'preparing' },
      { name: 'Signing', key: 'signing' },
      { name: 'Submitting', key: 'submitting' },
      { name: 'Polling Ledger', key: 'polling' },
      { name: 'Completed', key: 'success' }
    ];

    const currentStepIndex = steps.findIndex(s => s.key === txStep);
    
    return (
      <section className="card-elevated" style={{ borderColor: txStep === 'error' ? 'var(--color-error)' : 'var(--color-black)', marginTop: '24px' }}>
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Tx Progress</span>
          {txStep === 'error' && <span className="chip-status error">Failed</span>}
          {txStep === 'success' && <span className="chip-status active">Success</span>}
          {txStep !== 'error' && txStep !== 'success' && <span className="chip-status warning">Processing</span>}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
          {steps.map((step, idx) => {
            let status = 'pending'; // pending, active, completed, error
            if (txStep === 'error' && idx === currentStepIndex) {
              status = 'error';
            } else if (idx < currentStepIndex || txStep === 'success') {
              status = 'completed';
            } else if (idx === currentStepIndex) {
              status = 'active';
            }

            return (
              <div key={step.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className={`chip-status ${status === 'completed' ? 'active' : status === 'active' ? 'warning' : status === 'error' ? 'error' : 'default'}`} style={{ width: '130px', textAlign: 'center' }}>
                  {step.name}
                </span>
                <span className="font-mono" style={{ fontSize: '14px' }}>
                  {status === 'completed' && "✓ DONE"}
                  {status === 'active' && "⚡ CURRENT STATE..."}
                  {status === 'error' && "❌ FAILED"}
                  {status === 'pending' && "○ WAITING"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="container">
      {/* Header Band */}
      <header className="header-band">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "16px" }}>
          <h1>Manage Subscriptions</h1>
          <Link href="/" id="link-back-home" className="btn btn-ghost btn-sm">
            ← Back to Home
          </Link>
        </div>
        <div className="sub-header">Dashboard</div>
        <p className="font-mono" style={{ marginTop: "16px" }}>
          {isSandbox
            ? "SANDBOX TEST MODE: Real transactions are bypassed. Simulated events will be logged locally."
            : "LIVE NETWORK MODE: Transactions will require signoff using the Freighter browser extension."}
        </p>
      </header>

      {/* Main Grid Layout */}
      <main className="grid-2col">
        {/* Left Column: Connection & Setup */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Section 1: Wallet Connection */}
          <section className="card-default">
            <h3>1. Wallet Connection</h3>
            <div style={{ marginTop: "16px" }}>
              {checking && <p className="font-mono">Checking connection status...</p>}
              {isConnected ? (
                <div>
                  <p className="font-mono" style={{ wordBreak: "break-all", marginBottom: "12px" }}>
                    Wallet: <strong>{publicKey}</strong>
                  </p>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px" }}>
                    <span className={isSandbox ? "chip-status warning" : "chip-status active"}>
                      {isSandbox ? "Sandbox Active" : "Connected"}
                    </span>
                    <span className="font-mono" style={{ fontSize: "13px" }}>
                      {isSandbox ? "Local Mock Wallet" : "Stellar Testnet"}
                    </span>
                  </div>
                  <button
                    id="btn-disconnect-wallet"
                    className="btn btn-secondary btn-sm"
                    onClick={disconnectWallet}
                    style={{ width: "100%" }}
                  >
                    Disconnect Wallet
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: "16px" }}>
                    <span className="chip-status default">Disconnected</span>
                  </div>
                  <button
                    id="btn-connect-wallet"
                    className="btn btn-primary btn-md"
                    onClick={connectWallet}
                  >
                    Connect Freighter Wallet
                  </button>
                </div>
              )}
              {walletError && (
                <p style={{ color: "var(--color-error)", marginTop: "12px" }} className="font-mono">
                  Error: {walletError}
                </p>
              )}

              {/* Sandbox mode toggle */}
              <div style={{ marginTop: "24px", borderTop: "2px solid black", paddingTop: "16px" }}>
                <span className="input-label">Local Testing Sandbox</span>
                <div style={{ display: "flex", gap: "12px", marginTop: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    id="btn-sandbox-toggle"
                    type="button"
                    className={isSandbox ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                    onClick={() => toggleSandbox(!isSandbox)}
                  >
                    {isSandbox ? "Disable Sandbox Mode" : "Enable Sandbox Mode"}
                  </button>
                  <span className="font-mono" style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                    {isSandbox ? "Sandbox active (Freighter bypass)" : "Freighter required"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Contract Configuration */}
          <section className="card-default">
            <h3>2. Contract Config</h3>
            <div className="input-group" style={{ marginTop: "16px" }}>
              <label className="input-label" htmlFor="input-vault-contract-id">
                Vault Contract ID
              </label>
              <input
                id="input-vault-contract-id"
                type="text"
                className={`input-field ${contractError ? 'error' : ''}`}
                placeholder={isSandbox ? "Optional in Sandbox mode (e.g. C...)" : "e.g. C..."}
                value={contractId}
                onChange={(e) => {
                  setContractId(e.target.value);
                  setContractError("");
                }}
                disabled={isSandbox}
              />
              {contractError ? (
                <p className="helper-text error">{contractError}</p>
              ) : (
                <p className="helper-text">
                  {isSandbox
                    ? "Bypassed in Sandbox mode. Turn off Sandbox to target a live contract address."
                    : "Enter the deployed vault contract ID (starting with C) to begin."}
                </p>
              )}
            </div>
          </section>

          {/* Live step progress rendering */}
          {renderTxProgress()}

          {/* Section 5: Transaction Notifications */}
          {(txError || successMessage) && (
            <section className="card-default">
              <h3>5. Tx Status</h3>
              <div style={{ marginTop: "16px" }}>
                {txError && (
                  <div>
                    <span className="chip-status error" style={{ marginBottom: "8px" }}>Error</span>
                    <p style={{ color: "var(--color-error)" }} className="font-mono">
                      {txError}
                    </p>
                  </div>
                )}
                {successMessage && (
                  <div>
                    <span className="chip-status active" style={{ marginBottom: "8px" }}>Success</span>
                    <p style={{ color: "var(--color-success)" }} className="font-mono">
                      {successMessage}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Section 6: Event Logs */}
          <section className="card-default">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" }}>
              <h3>6. Event Logs</h3>
              <button
                id="btn-clear-logs"
                className="btn btn-ghost btn-sm"
                onClick={clearEvents}
              >
                Clear Logs
              </button>
            </div>
            <div>
              {events.length === 0 ? (
                <p className="font-mono" style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                  No charge events captured yet. Go ahead and trigger a charge!
                </p>
              ) : (
                <ul className="list-raw">
                  {events.map((e) => (
                    <li key={e.id} className="list-item-raw font-mono">
                      <strong>Ledger #{e.ledger}</strong> - Tx: {e.id.substring(0, 12)}...
                      <br />
                      <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                        Charged: {String(e.value)} tokens
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Interaction Forms */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Section 3: Create a Subscription (As User) */}
          <section className="card-elevated">
            <h3>3. Create Subscription</h3>
            <p className="font-mono" style={{ fontSize: "14px", marginTop: "8px", marginBottom: "16px", color: "var(--color-text-secondary)" }}>
              Authorize a merchant to pull repeating payments.
            </p>
            <form onSubmit={handleSubscribeSubmit}>
              <div className="input-group">
                <label className="input-label" htmlFor="input-merchant-address">
                  Merchant Address
                </label>
                <input
                  id="input-merchant-address"
                  type="text"
                  className={`input-field ${merchantError ? 'error' : ''}`}
                  placeholder="G..."
                  value={merchantAddress}
                  onChange={(e) => {
                    setMerchantAddress(e.target.value);
                    setMerchantError("");
                  }}
                  required
                />
                {merchantError ? (
                  <p className="helper-text error">{merchantError}</p>
                ) : (
                  <p className="helper-text">The public key address of the merchant.</p>
                )}
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="input-amount">
                  Amount (Stroops/USDC)
                </label>
                <input
                  id="input-amount"
                  type="number"
                  className="input-field"
                  placeholder="10000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                <p className="helper-text">Amount to authorize per billing interval.</p>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="input-interval">
                  Interval (Ledgers)
                </label>
                <input
                  id="input-interval"
                  type="number"
                  className="input-field"
                  placeholder="30"
                  value={interval}
                  onChange={(e) => setIntervalVal(e.target.value)}
                  required
                />
                <p className="helper-text">Frequency of billing, in Stellar ledger count.</p>
              </div>

              <button
                id="btn-subscribe-submit"
                className="btn btn-primary btn-md"
                type="submit"
                disabled={txLoading}
                style={{ marginTop: "16px" }}
              >
                {txLoading ? "Signing/Submitting..." : "Subscribe"}
              </button>
            </form>
          </section>

          {/* Section 3.1: Active Subscriptions */}
          {isConnected && (
            <section className="card-default">
              <h3>Active Subscriptions</h3>
              <p className="font-mono" style={{ fontSize: "14px", marginTop: "8px", marginBottom: "16px", color: "var(--color-text-secondary)" }}>
                Ongoing payment authorizations.
              </p>
              <div>
                {activeSubscriptions.length === 0 ? (
                  <p className="font-mono" style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                    No active subscriptions found for this wallet.
                  </p>
                ) : (
                  <ul className="list-raw">
                    {activeSubscriptions.map((sub: Subscription, index: number) => (
                      <li key={index} className="list-item-raw" style={{ display: "flex", flexDirection: "column", gap: "12px", borderBottom: "3px solid black", padding: "16px 0" }}>
                        <div className="font-mono" style={{ fontSize: "14px", wordBreak: "break-all" }}>
                          <strong>Merchant:</strong> {sub.merchant}
                          <br />
                          <strong>Amount:</strong> {sub.amount} Stroops
                          <br />
                          <strong>Interval:</strong> {sub.interval} ledgers
                        </div>
                        <button
                          id={`btn-cancel-sub-${index}`}
                          className="btn btn-destructive btn-sm"
                          onClick={() => cancel(sub.contractId || contractId, sub.merchant)}
                          disabled={txLoading}
                          style={{ alignSelf: "flex-start" }}
                        >
                          {txLoading ? "Cancelling..." : "Cancel Authorization"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* Section 4: Pull Funds (As Merchant) */}
          <section className="card-default">
            <h3>4. Merchant Area</h3>
            <p className="font-mono" style={{ fontSize: "14px", marginTop: "8px", marginBottom: "16px", color: "var(--color-text-secondary)" }}>
              Connected wallet triggers a charge pull from the subscriber.
            </p>
            <form onSubmit={handleChargeSubmit}>
              <div className="input-group">
                <label className="input-label" htmlFor="input-charge-user-address">
                  Subscriber Address to Charge
                </label>
                <input
                  id="input-charge-user-address"
                  type="text"
                  className={`input-field ${chargeUserError ? 'error' : ''}`}
                  placeholder="G..."
                  value={chargeUserAddress}
                  onChange={(e) => {
                    setChargeUserAddress(e.target.value);
                    setChargeUserError("");
                  }}
                  required
                />
                {chargeUserError ? (
                  <p className="helper-text error">{chargeUserError}</p>
                ) : (
                  <p className="helper-text">Subscriber address who has active subscription.</p>
                )}
              </div>

              <button
                id="btn-pull-funds"
                className="btn btn-secondary btn-md"
                type="submit"
                disabled={txLoading}
                style={{ marginTop: "16px" }}
              >
                {txLoading ? "Pulling funds..." : "Pull Payment"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
