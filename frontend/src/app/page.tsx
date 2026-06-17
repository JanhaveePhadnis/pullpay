"use client";

import { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { useSubscriptionVault } from "../hooks/useSubscriptionVault";
import { useSorobanEvents } from "../hooks/useSorobanEvents";

export default function Home() {
  const { publicKey, isConnected, checking, error: walletError, connectWallet } = useWallet();
  const { subscribe, charge, loading: txLoading, error: txError, successMessage } = useSubscriptionVault(publicKey);

  const [contractId, setContractId] = useState("");
  const [merchantAddress, setMerchantAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setIntervalVal] = useState("");
  const [chargeUserAddress, setChargeUserAddress] = useState("");

  const { events, clearEvents } = useSorobanEvents(contractId || null);

  const handleSubscribeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractId) {
      alert("Yo, input the contract ID first!");
      return;
    }
    subscribe(contractId, merchantAddress, amount, parseInt(interval));
  };

  const handleChargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractId) {
      alert("Yo, contract ID is empty!");
      return;
    }
    if (!publicKey) {
      alert("Connect your wallet, buddy!");
      return;
    }
    charge(contractId, publicKey, chargeUserAddress);
  };

  return (
    <div>
      <h1>PullPay Subscriptions (Unstyled Dashboard)</h1>
      <p>A simple, raw interface for subscription billing. No CSS allowed here!</p>

      {/* Wallet Connection */}
      <section>
        <h2>1. Wallet Connection</h2>
        {checking && <p>Checking wallet status...</p>}
        {isConnected ? (
          <div>
            <p>Wallet Address: <strong>{publicKey}</strong></p>
            <p>Status: Connected and ready on Testnet!</p>
          </div>
        ) : (
          <div>
            <p>Status: Not connected.</p>
            <button onClick={connectWallet}>Connect Freighter Wallet</button>
          </div>
        )}
        {walletError && <p>Error: {walletError}</p>}
      </section>

      <hr />

      {/* Contract Settings */}
      <section>
        <h2>2. Contract Configuration</h2>
        <label>
          Vault Contract ID:{" "}
          <input
            type="text"
            placeholder="e.g. C..."
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            size={60}
          />
        </label>
        <p>Make sure you paste the correct deployed contract ID above to test reads/writes.</p>
      </section>

      <hr />

      {/* Subscribe Form */}
      <section>
        <h2>3. Create a Subscription (As User)</h2>
        <form onSubmit={handleSubscribeSubmit}>
          <div>
            <label>
              Merchant Address:{" "}
              <input
                type="text"
                placeholder="G..."
                value={merchantAddress}
                onChange={(e) => setMerchantAddress(e.target.value)}
                required
                size={60}
              />
            </label>
          </div>
          <div>
            <label>
              Amount (Stroops/USDC):{" "}
              <input
                type="number"
                placeholder="10000000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
          </div>
          <div>
            <label>
              Interval (Ledgers):{" "}
              <input
                type="number"
                placeholder="30"
                value={interval}
                onChange={(e) => setIntervalVal(e.target.value)}
                required
              />
            </label>
          </div>
          <button type="submit" disabled={txLoading}>
            {txLoading ? "Signing/Submitting..." : "Subscribe Me!"}
          </button>
        </form>
      </section>

      <hr />

      {/* Charge Form */}
      <section>
        <h2>4. Merchant Area: Pull Funds (As Merchant)</h2>
        <p>Note: The connected wallet will be treated as the merchant for this charge invocation.</p>
        <form onSubmit={handleChargeSubmit}>
          <div>
            <label>
              User Address to Charge:{" "}
              <input
                type="text"
                placeholder="G..."
                value={chargeUserAddress}
                onChange={(e) => setChargeUserAddress(e.target.value)}
                required
                size={60}
              />
            </label>
          </div>
          <button type="submit" disabled={txLoading}>
            {txLoading ? "Pulling funds..." : "Pull Payment Now!"}
          </button>
        </form>
      </section>

      <hr />

      {/* Transaction Notifications */}
      {(txError || successMessage) && (
        <section>
          <h2>5. Tx Status</h2>
          {txError && <p>Ouch: {txError}</p>}
          {successMessage && <p>Nice: {successMessage}</p>}
        </section>
      )}

      <hr />

      {/* Event Logs */}
      <section>
        <h2>6. Dynamic Event Logs (charge_successful)</h2>
        <button onClick={clearEvents}>Clear Log Area</button>
        {events.length === 0 ? (
          <p>No charge events captured yet. Go ahead and trigger a charge!</p>
        ) : (
          <ul>
            {events.map((e) => (
              <li key={e.id}>
                <strong>Ledger #{e.ledger}</strong> - Transaction: {e.id.substring(0, 12)}...
                <br />
                Topics: {JSON.stringify(e.topics)}
                <br />
                Value: {JSON.stringify(e.value.toString())} tokens charged!
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
