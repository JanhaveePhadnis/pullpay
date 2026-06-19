"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useWallet } from "../../hooks/useWallet";
import { useSubscriptionVault } from "../../hooks/useSubscriptionVault";
import { useSorobanEvents } from "../../hooks/useSorobanEvents";
import { rpc } from "@stellar/stellar-sdk";

interface Subscription {
  merchant: string;
  amount: string;
  interval: number;
  contractId?: string;
}

export default function Manage() {
  const { publicKey, isConnected, checking, error: walletError, connectWallet, disconnectWallet, isSandbox, toggleSandbox } = useWallet();
  
  const [contractId, setContractId] = useState(process.env.NEXT_PUBLIC_VAULT_ID || "CA75FG2KTXN6EAG7GBFOGXRYPN3TJSNQCPISI2MRBUCNVNHTIZ2EY6XX");
  
  const { 
    subscribe, 
    charge, 
    cancel, 
    deposit, 
    getVaultBalance, 
    getUsdcBalance, 
    loading: txLoading, 
    error: txError, 
    successMessage, 
    txStep,
    setTxStep,
    setError: setTxError,
    setSuccessMessage
  } = useSubscriptionVault(publicKey, isSandbox);

  const [activeSubscriptions, setActiveSubscriptions] = useState<Subscription[]>([]);
  const [activeTab, setActiveTab] = useState<"subscriber" | "merchant">("subscriber");

  // Balances
  const [usdcBalance, setUsdcBalance] = useState("0.00");
  const [vaultBalance, setVaultBalance] = useState("0.00");

  // Yield compounding ticker
  const [yieldTicker, setYieldTicker] = useState("0.00000000");

  // Forms
  const [merchantAddress, setMerchantAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setIntervalVal] = useState("");
  const [chargeUserAddress, setChargeUserAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  // Transaction simulation flow state
  const [activeTxType, setActiveTxType] = useState<"deposit" | "charge" | "subscribe" | "cancel" | "mint" | "idle">("idle");

  // Validation errors
  const [contractError, setContractError] = useState("");
  const [merchantError, setMerchantError] = useState("");
  const [chargeUserError, setChargeUserError] = useState("");

  const { events, clearEvents } = useSorobanEvents(contractId || null, isSandbox);

  const refreshBalances = useCallback(async () => {
    if (!publicKey) {
      setUsdcBalance("0.00");
      setVaultBalance("0.00");
      return;
    }
    const tokenContractId = process.env.NEXT_PUBLIC_TOKEN_ID || "CA3DVPHLVJ2O5ZZ7W3U2QDQVDJVHC7QZOEF5ZOXN23ZE5GUSHKLEAUEW";
    const uBal = await getUsdcBalance(tokenContractId, publicKey);
    const vBal = await getVaultBalance(contractId, publicKey);
    setUsdcBalance(uBal);
    setVaultBalance(vBal);
  }, [publicKey, contractId, getUsdcBalance, getVaultBalance]);

  useEffect(() => {
    refreshBalances();
    window.addEventListener("pullpay_balance_updated", refreshBalances);
    return () => {
      window.removeEventListener("pullpay_balance_updated", refreshBalances);
    };
  }, [refreshBalances]);

  // Handle yield ticking
  useEffect(() => {
    const yieldAllocation = parseFloat(vaultBalance) * 0.8;
    if (yieldAllocation <= 0) {
      setYieldTicker("0.00000000");
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const ratePerSec = 0.05 / 31536000; // 5% APY
      const compoundFactor = Math.pow(1 + ratePerSec, elapsedSec);
      const tickedVal = yieldAllocation * compoundFactor;
      setYieldTicker(tickedVal.toFixed(8));
    }, 100);

    return () => clearInterval(interval);
  }, [vaultBalance]);

  // Load subscriptions
  const loadSubscriptions = useCallback(() => {
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
  }, [publicKey]);

  useEffect(() => {
    loadSubscriptions();
    window.addEventListener("pullpay_subs_updated", loadSubscriptions);
    return () => {
      window.removeEventListener("pullpay_subs_updated", loadSubscriptions);
    };
  }, [loadSubscriptions]);

  // Merchant subscriber directory
  const [merchantSubscribers, setMerchantSubscribers] = useState<any[]>([]);

  const refreshMerchantSubscribers = useCallback(() => {
    if (!publicKey) {
      setMerchantSubscribers([]);
      return;
    }
    const list: any[] = [];
    if (typeof window !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("pullpay_subs_")) {
          const subscriber = key.replace("pullpay_subs_", "");
          try {
            const subs = JSON.parse(localStorage.getItem(key) || "[]");
            for (const sub of subs) {
              if (sub.merchant.toLowerCase() === publicKey.toLowerCase()) {
                list.push({
                  subscriber,
                  amount: sub.amount,
                  interval: sub.interval,
                  contractId: sub.contractId,
                });
              }
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
    setMerchantSubscribers(list);
  }, [publicKey]);

  useEffect(() => {
    refreshMerchantSubscribers();
    window.addEventListener("pullpay_subs_updated", refreshMerchantSubscribers);
    return () => {
      window.removeEventListener("pullpay_subs_updated", refreshMerchantSubscribers);
    };
  }, [refreshMerchantSubscribers]);

  const validateAddress = (address: string, prefix: "G" | "C"): boolean => {
    if (!address) return false;
    const regex = new RegExp(`^${prefix}[A-Z2-7]{55}$`);
    return regex.test(address);
  };

  const handleSubscribeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMerchantError("");
    setContractError("");
    setActiveTxType("subscribe");

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

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContractError("");
    setActiveTxType("deposit");

    let valid = true;
    if (!isSandbox) {
      if (!validateAddress(contractId, "C")) {
        setContractError("Invalid Contract ID. Must start with 'C' and be 56 characters.");
        valid = false;
      }
    }

    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      alert("Please enter a valid deposit amount.");
      valid = false;
    }

    if (valid) {
      deposit(contractId, depositAmount).then(() => {
        setDepositAmount("");
      });
    }
  };

  const handleChargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setChargeUserError("");
    setContractError("");
    setActiveTxType("charge");

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
      charge(contractId, publicKey, chargeUserAddress).then(() => {
        refreshMerchantSubscribers();
      });
    }
  };

  const handleDirectPull = (sub: any) => {
    setChargeUserError("");
    setContractError("");
    setActiveTxType("charge");

    if (!publicKey) {
      alert("Connect your wallet, buddy!");
      return;
    }

    charge(sub.contractId || contractId, publicKey, sub.subscriber).then(() => {
      refreshMerchantSubscribers();
    });
  };

  const handleMintTestnetUsdc = async () => {
    if (!publicKey) return;
    setActiveTxType("mint");
    setTxStep('preparing');
    setTxError(null);
    setSuccessMessage(null);

    if (isSandbox) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setTxStep('signing');
      await new Promise((resolve) => setTimeout(resolve, 500));
      setTxStep('submitting');
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (typeof window !== "undefined") {
        const walletBalKey = `pullpay_sandbox_wallet_balance_${publicKey}`;
        const currentBal = parseFloat(localStorage.getItem(walletBalKey) || "100.00");
        localStorage.setItem(walletBalKey, String(currentBal + 100));
        window.dispatchEvent(new CustomEvent("pullpay_balance_updated"));
        setSuccessMessage("Minted 100 Mock USDC successfully!");
        setTxStep('success');
      }
      return;
    }

    try {
      const serverInstance = new rpc.Server("https://soroban-testnet.stellar.org");
      const account = await serverInstance.getAccount(publicKey);
      const deployerAddr = "GC5HL2KXTCEXGZU4N6QIDQLIXW6HSFYEZV7ELAEEHDL4EHUMVSTZCPX6";
      
      const balances = (account as any).balances || [];
      const hasTrust = balances.some((b: any) => b.asset_code === "USDC" && b.asset_issuer === deployerAddr);

      if (!hasTrust) {
        setSuccessMessage("Establishing trustline for USDC...");
        setTxStep('signing');
        const { Asset, Operation, TransactionBuilder, Networks, signTransaction } = await import("@stellar/stellar-sdk");
        const { signTransaction: signTx } = await import("@stellar/freighter-api");
        const asset = new Asset("USDC", deployerAddr);
        const op = Operation.changeTrust({ asset });
        let tx = new TransactionBuilder(account, {
          fee: "100",
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(op)
          .setTimeout(30)
          .build();

        const signResult = await signTx(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
        if (signResult.error) {
          throw new Error(`Freighter trustline signing failed: ${signResult.error}`);
        }
        const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);
        
        setTxStep('submitting');
        const sendResponse = await serverInstance.sendTransaction(signedTx);
        if (sendResponse.status === "ERROR") {
          throw new Error("Failed to register trustline");
        }
        
        setTxStep('polling');
        let getResponse = await serverInstance.getTransaction(sendResponse.hash);
        let attempts = 0;
        while (
          ((getResponse.status as unknown as string) === "NOT_FOUND" || (getResponse.status as unknown as string) === "PENDING") &&
          attempts < 20
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          getResponse = await serverInstance.getTransaction(sendResponse.hash);
          attempts++;
        }
      }

      setSuccessMessage("Calling faucet server to mint USDC...");
      setTxStep('submitting');
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Faucet minting request failed");
      }

      setSuccessMessage("Minted 100 USDC on Stellar Testnet successfully!");
      setTxStep('success');
      window.dispatchEvent(new CustomEvent("pullpay_balance_updated"));
    } catch (err: any) {
      setTxError(err.message || "Minting failed");
      setTxStep('error');
    }
  };

  // Convert block time helper
  const getLedgerTimeTranslation = (ledgerCount: number) => {
    if (!ledgerCount || isNaN(ledgerCount) || ledgerCount <= 0) return "";
    const totalSeconds = ledgerCount * 5;
    if (totalSeconds < 60) {
      return `approx. ${totalSeconds} seconds (based on 5s block times)`;
    }
    const minutes = totalSeconds / 60;
    if (minutes < 60) {
      return `approx. ${minutes.toFixed(1)} minutes (based on 5s block times)`;
    }
    const hours = minutes / 60;
    if (hours < 24) {
      return `approx. ${hours.toFixed(1)} hours (based on 5s block times)`;
    }
    const days = hours / 24;
    if (days < 30) {
      return `approx. ${days.toFixed(1)} days (based on 5s block times)`;
    }
    const months = days / 30.4;
    return `approx. ${months.toFixed(1)} months (based on 5s block times)`;
  };

  const presetIntervals = [
    { label: "1 Minute", value: "12" },
    { label: "1 Hour", value: "720" },
    { label: "1 Day", value: "17280" },
    { label: "1 Month", value: "518400" },
  ];

  // Merchant Analytics Calculations
  const merchantEvents = events.filter(
    (e) => e.topics[0] === "charge_successful" && String(e.topics[1]).toLowerCase() === publicKey?.toLowerCase()
  );
  
  const totalRevenue = merchantEvents.reduce((acc, curr) => {
    return acc + parseFloat(String(curr.value)) / 10000000;
  }, 0);

  // SVG Chart Render Data
  const chartData = merchantEvents.length > 0 
    ? merchantEvents.slice(-6).map((e, idx) => ({ label: `Pull #${idx + 1}`, value: parseFloat(String(e.value)) / 10000000 }))
    : [
        { label: "Jan", value: 10 },
        { label: "Feb", value: 25 },
        { label: "Mar", value: 45 },
        { label: "Apr", value: 80 },
        { label: "May", value: 110 },
        { label: "Jun", value: 150 },
      ];

  // Transaction Simulator Steps
  const renderTxSimulator = () => {
    if (txStep === 'idle' || activeTxType === 'idle') return null;

    let steps: string[] = [];
    if (activeTxType === 'charge') {
      steps = ["Authorize Checks", "Deduct Vault Bal", "Recall 80% Yield Pool", "Transfer Merchant"];
    } else if (activeTxType === 'deposit') {
      steps = ["Transfer 100% USDC", "Credit Subscriber", "Route 80% Yield Pool"];
    } else if (activeTxType === 'subscribe') {
      steps = ["Verify Input Details", "Register Rule On-Chain", "Emit Subscribed Event"];
    } else if (activeTxType === 'cancel') {
      steps = ["Auth Identity", "Clear Rule On-Chain", "Emit Cancelled Event"];
    } else if (activeTxType === 'mint') {
      steps = ["Check/Register Trustline", "Call Faucet Mint", "Deposit in Mock Wallet"];
    }

    const currentStepIndex = (() => {
      if (txStep === 'preparing') return 0;
      if (txStep === 'signing') return 1;
      if (txStep === 'submitting') return 2;
      if (txStep === 'polling') return steps.length - 2 >= 0 ? steps.length - 2 : 0;
      if (txStep === 'success') return steps.length;
      return -1; // error or other
    })();

    return (
      <section className="card-elevated" style={{ marginTop: "24px", borderColor: txStep === 'error' ? 'var(--color-error)' : 'var(--color-black)' }}>
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "20px" }}>
          <span>Soroban Execution Flow Simulator</span>
          <span className="font-mono" style={{ fontSize: "12px", background: "black", color: "white", padding: "2px 8px" }}>
            {activeTxType.toUpperCase()}
          </span>
        </h3>
        <p className="font-mono" style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "8px 0 var(--sp-3) 0" }}>
          Interactive schematic showing internal contract execution stages:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStepIndex || txStep === 'success';
            const isActive = idx === currentStepIndex && txStep !== 'error';
            const isError = idx === currentStepIndex && txStep === 'error';
            
            let bg = "var(--color-surface-sunken)";
            let text = "var(--color-black)";
            let border = "2px solid var(--color-black)";

            if (isCompleted) {
              bg = "var(--color-success)";
              text = "var(--color-white)";
              border = "2px solid var(--color-success)";
            } else if (isActive) {
              bg = "var(--color-warning)";
              text = "var(--color-black)";
              border = "2px solid var(--color-warning)";
            } else if (isError) {
              bg = "var(--color-error)";
              text = "var(--color-white)";
              border = "2px solid var(--color-error)";
            }

            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontWeight: "bold",
                  background: bg,
                  color: text,
                  border: border,
                  fontSize: "14px"
                }}>
                  {idx + 1}
                </div>
                <div className="font-mono" style={{ 
                  flexGrow: 1, 
                  padding: "8px 12px", 
                  background: bg, 
                  color: text, 
                  border: border,
                  fontWeight: isActive || isError ? "bold" : "normal",
                  fontSize: "14px"
                }}>
                  {step} {isCompleted && "✓"} {isActive && "⚡"} {isError && "❌ FAILED"}
                </div>
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
          <h1>PullPay Subscription Protocol</h1>
          <Link href="/" id="link-back-home" className="btn btn-ghost btn-sm">
            ← Back to Home
          </Link>
        </div>
        <div className="sub-header">Protocol Control Room</div>
        <p className="font-mono" style={{ marginTop: "16px" }}>
          {isSandbox
            ? "SANDBOX TEST MODE: Real transactions are bypassed. Simulated events will be logged locally."
            : "LIVE NETWORK MODE: Transactions will require signoff using the Freighter browser extension."}
        </p>
      </header>

      {/* Main Grid Layout */}
      <main className="grid-2col">
        {/* Left Column: Connection, Config & Transaction status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Card 1: Wallet Connection & Faucet */}
          <section className="card-default">
            <h3>1. Wallet & Faucet</h3>
            <div style={{ marginTop: "16px" }}>
              {checking && <p className="font-mono">Checking connection status...</p>}
              {isConnected ? (
                <div>
                  <p className="font-mono" style={{ wordBreak: "break-all", marginBottom: "12px", fontSize: "14px" }}>
                    Wallet: <strong>{publicKey}</strong>
                  </p>
                  
                  {/* Balances Display */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", margin: "16px 0", borderTop: "2px solid black", borderBottom: "2px solid black", padding: "12px 0" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span className="input-label" style={{ fontSize: "11px" }}>Stellar USDC</span>
                      <span className="font-mono" style={{ fontSize: "18px", fontWeight: "bold" }}>{usdcBalance} USDC</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span className="input-label" style={{ fontSize: "11px" }}>Vault Balance</span>
                      <span className="font-mono" style={{ fontSize: "18px", fontWeight: "bold" }}>{vaultBalance} USDC</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px" }}>
                    <span className={isSandbox ? "chip-status warning" : "chip-status active"}>
                      {isSandbox ? "Sandbox Active" : "Connected"}
                    </span>
                    <span className="font-mono" style={{ fontSize: "13px" }}>
                      {isSandbox ? "Local Mock Wallet" : "Stellar Testnet"}
                    </span>
                  </div>

                  {/* Mint testnet USDC */}
                  <button
                    id="btn-mint-usdc"
                    className="btn btn-primary btn-md"
                    onClick={handleMintTestnetUsdc}
                    disabled={txLoading}
                    style={{ marginBottom: "12px", letterSpacing: "1px" }}
                  >
                    {txLoading && activeTxType === 'mint' ? "MINTING..." : "MINT TESTNET USDC (100)"}
                  </button>

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

          {/* Card 2: Contract Config */}
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
                placeholder={isSandbox ? "Optional in Sandbox mode" : "e.g. C..."}
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

          {/* Interactive Tx simulator flowchart */}
          {renderTxSimulator()}

          {/* Card 3: Tx Status messages */}
          {(txError || successMessage) && (
            <section className="card-default">
              <h3>Tx Status</h3>
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

          {/* Card 4: Event Logs */}
          <section className="card-default">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" }}>
              <h3>Event Logs</h3>
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
                    <li key={e.id} className="list-item-raw font-mono" style={{ fontSize: "13px" }}>
                      <strong>Ledger #{e.ledger}</strong> - Tx: {e.id.substring(0, 12)}...
                      <br />
                      <span style={{ color: "var(--color-text-secondary)" }}>
                        Charged: {(parseFloat(String(e.value)) / 10000000).toFixed(2)} USDC
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Interaction tabbed views */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Brutalist Tab Selection */}
          <div style={{ display: "flex", gap: "12px", borderBottom: "5px solid black", paddingBottom: "12px" }}>
            <button
              onClick={() => setActiveTab("subscriber")}
              className={`chip-filter ${activeTab === "subscriber" ? "active" : ""}`}
              style={{ fontSize: "14px", padding: "8px 16px" }}
            >
              Subscriber Dashboard
            </button>
            <button
              onClick={() => setActiveTab("merchant")}
              className={`chip-filter ${activeTab === "merchant" ? "active" : ""}`}
              style={{ fontSize: "14px", padding: "8px 16px" }}
            >
              Merchant Dashboard
            </button>
          </div>

          {/* ================================= SUBSCRIBER VIEW ================================= */}
          {activeTab === "subscriber" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              
              {/* Vault balance & Yield Ticker Card */}
              <section className="card-elevated">
                <h3>Vault & Yield Allocation</h3>
                <p className="font-mono" style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                  80% of customer deposits are auto-routed to a mock yield-generating pool.
                </p>

                <div style={{ margin: "16px 0", padding: "16px", background: "var(--color-surface-sunken)", border: "2px solid black" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span className="font-mono" style={{ fontWeight: "bold" }}>Vault Balance:</span>
                    <span className="font-mono">{vaultBalance} USDC</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span className="font-mono" style={{ fontWeight: "bold" }}>Active in Yield Pool (80%):</span>
                    <span className="font-mono">{(parseFloat(vaultBalance) * 0.8).toFixed(2)} USDC</span>
                  </div>
                  
                  {/* APY Ticker */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px", borderTop: "2px dashed black", paddingTop: "12px", alignItems: "baseline" }}>
                    <span className="font-mono" style={{ fontWeight: "bold", textTransform: "uppercase", fontSize: "12px" }}>Compounding Yield (5% APY):</span>
                    <span className="font-mono" style={{ color: "var(--color-success)", fontWeight: "bold", fontSize: "20px" }}>
                      {yieldTicker} USDC
                    </span>
                  </div>
                </div>

                {/* Flow Animation representation */}
                <div style={{ padding: "8px 12px", border: "2px solid var(--color-black)", fontSize: "11px", background: "white" }}>
                  <div className="font-mono" style={{ fontWeight: "bold", marginBottom: "4px", textTransform: "uppercase" }}>Yield Pool Recall Flow:</div>
                  <div className="font-mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>[Deposits]</span>
                    <span>──▶</span>
                    <span>[Vault (20%)]</span>
                    <span>◀── recalling ──▶</span>
                    <span>[Yield Pool (80%)]</span>
                  </div>
                </div>
              </section>

              {/* Deposit USDC Form */}
              <section className="card-default">
                <h3>Deposit USDC into Vault</h3>
                <p className="font-mono" style={{ fontSize: "14px", marginTop: "8px", marginBottom: "16px", color: "var(--color-text-secondary)" }}>
                  Fund your subscription vault with USDC.
                </p>
                <form onSubmit={handleDepositSubmit}>
                  <div className="input-group">
                    <label className="input-label" htmlFor="input-deposit-amount">
                      Amount to Deposit (USDC)
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        id="input-deposit-amount"
                        type="number"
                        step="0.01"
                        className="input-field"
                        placeholder="10.00"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        required
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        type="submit"
                        disabled={txLoading}
                        style={{ height: "46px", width: "120px" }}
                      >
                        {txLoading && activeTxType === 'deposit' ? "PENDING" : "DEPOSIT"}
                      </button>
                    </div>
                    <p className="helper-text">This will call the vault's on-chain deposit method.</p>
                  </div>
                </form>
              </section>

              {/* Create Subscription Form */}
              <section className="card-elevated">
                <h3>Create Subscription</h3>
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
                      Amount (Stroops)
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
                    <p className="helper-text">
                      Amount in Stroops (e.g. 10000000 = 1.00 USDC).
                      {amount && !isNaN(parseFloat(amount)) && ` Equivalent to ${(parseFloat(amount) / 10000000).toFixed(2)} USDC.`}
                    </p>
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
                    
                    {/* Time translation note */}
                    {interval && (
                      <p className="font-mono" style={{ fontSize: "12px", color: "var(--color-success)", marginTop: "4px", fontWeight: "bold" }}>
                        {getLedgerTimeTranslation(parseInt(interval))}
                      </p>
                    )}

                    {/* Presets */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                      {presetIntervals.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className="chip-filter"
                          onClick={() => setIntervalVal(preset.value)}
                          style={{ textTransform: "none", fontSize: "11px" }}
                        >
                          {preset.label} ({preset.value})
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    id="btn-subscribe-submit"
                    className="btn btn-primary btn-md"
                    type="submit"
                    disabled={txLoading}
                    style={{ marginTop: "16px" }}
                  >
                    {txLoading && activeTxType === 'subscribe' ? "Signing/Submitting..." : "Subscribe"}
                  </button>
                </form>
              </section>

              {/* Active Subscriptions Card */}
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
                            <div className="font-mono" style={{ fontSize: "13px", wordBreak: "break-all" }}>
                              <strong>Merchant:</strong> {sub.merchant}
                              <br />
                              <strong>Amount:</strong> {(parseFloat(sub.amount) / 10000000).toFixed(2)} USDC ({sub.amount} Stroops)
                              <br />
                              <strong>Interval:</strong> {sub.interval} ledgers ({getLedgerTimeTranslation(sub.interval).replace("approx. ", "")})
                            </div>
                            <button
                              id={`btn-cancel-sub-${index}`}
                              className="btn btn-destructive btn-sm"
                              onClick={() => {
                                setActiveTxType("cancel");
                                cancel(sub.contractId || contractId, sub.merchant);
                              }}
                              disabled={txLoading}
                              style={{ alignSelf: "flex-start" }}
                            >
                              {txLoading && activeTxType === 'cancel' ? "Cancelling..." : "Cancel Authorization"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}

            </div>
          )}

          {/* ================================= MERCHANT VIEW ================================= */}
          {activeTab === "merchant" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              
              {/* Revenue Analytics Card */}
              <section className="card-elevated">
                <h3>Revenue Analytics</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", margin: "16px 0" }}>
                  <div style={{ border: "2px solid black", padding: "12px", background: "var(--color-surface-sunken)" }}>
                    <span className="input-label" style={{ fontSize: "10px" }}>Total Pulled Revenue</span>
                    <span className="font-mono" style={{ fontSize: "24px", fontWeight: "bold" }}>{totalRevenue.toFixed(2)} USDC</span>
                  </div>
                  <div style={{ border: "2px solid black", padding: "12px", background: "var(--color-surface-sunken)" }}>
                    <span className="input-label" style={{ fontSize: "10px" }}>Active Subscribers</span>
                    <span className="font-mono" style={{ fontSize: "24px", fontWeight: "bold" }}>{merchantSubscribers.length} Users</span>
                  </div>
                </div>

                {/* SVG Revenue Chart */}
                <div style={{ marginTop: "16px", border: "2px solid black", padding: "12px", background: "white" }}>
                  <div className="font-mono" style={{ fontSize: "11px", fontWeight: "bold", marginBottom: "8px", textTransform: "uppercase" }}>Recurring Revenue over Time:</div>
                  <svg width="100%" height="150" style={{ overflow: "visible" }}>
                    {/* Gridlines */}
                    <line x1="30" y1="20" x2="100%" y2="20" stroke="#DDD" strokeWidth="1" />
                    <line x1="30" y1="60" x2="100%" y2="60" stroke="#DDD" strokeWidth="1" />
                    <line x1="30" y1="100" x2="100%" y2="100" stroke="#DDD" strokeWidth="1" />
                    <line x1="30" y1="120" x2="100%" y2="120" stroke="black" strokeWidth="2" />

                    {/* Left Axis ticks */}
                    <text x="5" y="24" className="font-mono" style={{ fontSize: "9px" }}>150</text>
                    <text x="5" y="64" className="font-mono" style={{ fontSize: "9px" }}>80</text>
                    <text x="5" y="104" className="font-mono" style={{ fontSize: "9px" }}>20</text>
                    <text x="5" y="124" className="font-mono" style={{ fontSize: "9px" }}>0</text>

                    {/* Chart Bars */}
                    {chartData.map((data, idx) => {
                      const totalWidth = 300; // approximation
                      const barWidth = 35;
                      const xPos = 45 + idx * 50;
                      // Height scale: 120 is y-axis base, max value is 150 = height of 100px
                      const height = Math.max(5, (data.value / 150) * 100);
                      const yPos = 120 - height;

                      return (
                        <g key={idx}>
                          <rect
                            x={xPos}
                            y={yPos}
                            width={barWidth}
                            height={height}
                            fill="black"
                            stroke="black"
                            strokeWidth="1"
                          />
                          <text
                            x={xPos + 5}
                            y="140"
                            className="font-mono"
                            style={{ fontSize: "10px", fontWeight: "bold" }}
                          >
                            {data.label}
                          </text>
                          <text
                            x={xPos}
                            y={yPos - 5}
                            className="font-mono"
                            style={{ fontSize: "9px", fill: "var(--color-text-secondary)" }}
                          >
                            ${data.value.toFixed(0)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </section>

              {/* Subscribers Address Directory */}
              <section className="card-default">
                <h3>Subscribers Address Directory</h3>
                <p className="font-mono" style={{ fontSize: "14px", marginTop: "8px", marginBottom: "16px", color: "var(--color-text-secondary)" }}>
                  Listing all subscribers who have authorized your merchant key in this browser context.
                </p>
                <div>
                  {merchantSubscribers.length === 0 ? (
                    <p className="font-mono" style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                      No active authorizations found targeting your public key.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {merchantSubscribers.map((sub, index) => (
                        <div key={index} style={{ border: "3px solid black", padding: "16px", background: "white" }}>
                          <div className="font-mono" style={{ fontSize: "13px", wordBreak: "break-all", marginBottom: "12px" }}>
                            <strong>Subscriber Address:</strong>
                            <div style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>{sub.subscriber}</div>
                            <div style={{ marginTop: "8px" }}>
                              <strong>Auth Limit:</strong> {(parseFloat(sub.amount) / 10000000).toFixed(2)} USDC
                            </div>
                            <div>
                              <strong>Frequency:</strong> {sub.interval} ledgers ({getLedgerTimeTranslation(sub.interval).replace("approx. ", "")})
                            </div>
                          </div>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ width: "100%" }}
                            onClick={() => handleDirectPull(sub)}
                            disabled={txLoading}
                          >
                            {txLoading && activeTxType === 'charge' ? "PULLING..." : "PULL PAYMENT NOW"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Pull Funds Form (Manual Fallback) */}
              <section className="card-default">
                <h3>Manual Pull Payment Form</h3>
                <p className="font-mono" style={{ fontSize: "14px", marginTop: "8px", marginBottom: "16px", color: "var(--color-text-secondary)" }}>
                  Manually trigger a charge pull from a subscriber.
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
                    {txLoading && activeTxType === 'charge' ? "Pulling funds..." : "Pull Payment"}
                  </button>
                </form>
              </section>

            </div>
          )}

        </div>
      </main>
    </div>
  );
}
