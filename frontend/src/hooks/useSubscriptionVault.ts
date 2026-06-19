import { useState } from "react";
import { rpc, TransactionBuilder, Networks, Address, Contract, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";

const RPC_URL = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC_URL);

export type TxStep = 'idle' | 'preparing' | 'signing' | 'submitting' | 'polling' | 'success' | 'error';

export function useSubscriptionVault(publicKey: string | null, isSandbox: boolean = false) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [txStep, setTxStep] = useState<TxStep>('idle');

  const pollTransaction = async (txHash: string) => {
    let getResponse = await server.getTransaction(txHash);
    let attempts = 0;
    while (
      ((getResponse.status as unknown as string) === "NOT_FOUND" || (getResponse.status as unknown as string) === "PENDING") &&
      attempts < 30
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      getResponse = await server.getTransaction(txHash);
      attempts++;
    }
    if (getResponse.status === "SUCCESS") {
      return getResponse;
    } else {
      throw new Error(`Transaction failed: ${JSON.stringify(getResponse)}`);
    }
  };

  const mapTxError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("User declined") || msg.includes("declined") || msg.includes("reject")) {
      return "Transaction request was rejected in your Freighter wallet.";
    }
    if (msg.includes("insufficient balance") || msg.includes("insufficient user balance")) {
      return "Failed: Insufficient vault balance to cover the subscription charge.";
    }
    if (msg.includes("interval has not passed") || msg.includes("subscription interval has not passed")) {
      return "Failed: Billing interval has not elapsed yet.";
    }
    if (msg.includes("subscription does not exist")) {
      return "Failed: No active subscription record found for this subscriber and merchant.";
    }
    if (msg.includes("MissingValue") || msg.includes("missing")) {
      return "Failed: Storage key lookup returned empty (check if contracts are correctly deployed & initialized).";
    }
    return msg;
  };

  const subscribe = async (
    contractId: string,
    merchantAddress: string,
    amount: string,
    interval: number
  ) => {
    if (!publicKey) {
      setError("Please connect your wallet first!");
      setTxStep('error');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setTxStep('preparing');

    const saveLocalRecord = () => {
      if (typeof window !== "undefined") {
        const keyName = `pullpay_subs_${publicKey}`;
        const stored = localStorage.getItem(keyName) || "[]";
        try {
          const parsed = JSON.parse(stored);
          const filtered = parsed.filter((sub: { merchant: string }) => sub.merchant !== merchantAddress);
          filtered.push({ merchant: merchantAddress, amount, interval, contractId });
          localStorage.setItem(keyName, JSON.stringify(filtered));
          window.dispatchEvent(new CustomEvent("pullpay_subs_updated"));
        } catch (e: unknown) {
          console.error("Failed to save local subscription cache", e);
        }
      }
    };

    if (isSandbox) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTxStep('signing');
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTxStep('submitting');
        await new Promise((resolve) => setTimeout(resolve, 500));
        saveLocalRecord();
        setSuccessMessage("Hooray! Subscribed successfully (Sandbox Mock Tx)!");
        setTxStep('success');
      } catch (err: unknown) {
        setError(mapTxError(err));
        setTxStep('error');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // 1. Fetch account sequence
      const sourceAccount = await server.getAccount(publicKey);

      // 2. Build the contract call operation
      const contract = new Contract(contractId);
      const operation = contract.call(
        "subscribe",
        new Address(publicKey).toScVal(),
        new Address(merchantAddress).toScVal(),
        nativeToScVal(BigInt(amount), { type: "i128" }),
        nativeToScVal(interval, { type: "u32" })
      );

      // 3. Build the raw transaction
      let tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      // 4. Prepare transaction
      tx = await server.prepareTransaction(tx);

      // 5. Sign with Freighter wallet
      setTxStep('signing');
      const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
      if (signResult.error) {
        throw new Error(`Freighter signing failed: ${signResult.error}`);
      }
      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);

      // 6. Submit transaction
      setTxStep('submitting');
      const sendResponse = await server.sendTransaction(signedTx);
      if (sendResponse.status === "ERROR") {
        throw new Error(`Failed to send transaction: ${JSON.stringify(sendResponse.errorResult)}`);
      }

      // 7. Poll for results
      setTxStep('polling');
      await pollTransaction(sendResponse.hash);
      saveLocalRecord();
      setSuccessMessage("Hooray! Subscribed successfully!");
      setTxStep('success');
    } catch (err: unknown) {
      setError(mapTxError(err));
      setTxStep('error');
    } finally {
      setLoading(false);
    }
  };

  const charge = async (
    contractId: string,
    merchantAddress: string,
    userAddress: string
  ) => {
    if (!publicKey) {
      setError("Please connect your wallet first!");
      setTxStep('error');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setTxStep('preparing');

    if (isSandbox) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTxStep('signing');
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTxStep('submitting');
        await new Promise((resolve) => setTimeout(resolve, 500));

        const mockEvent = {
          id: `mock_tx_${Math.random().toString(36).substring(2, 11)}`,
          ledger: Math.floor(Math.random() * 1200) + 145000,
          topics: ["charge_successful", merchantAddress, userAddress],
          value: "10000000",
        };

        if (typeof window !== "undefined") {
          const stored = localStorage.getItem("pullpay_mock_events") || "[]";
          const parsed = JSON.parse(stored);
          parsed.unshift(mockEvent);
          localStorage.setItem("pullpay_mock_events", JSON.stringify(parsed));
          window.dispatchEvent(new CustomEvent("pullpay_mock_event_added"));
        }

        setSuccessMessage("Boom! Charged that customer successfully (Sandbox Mock Tx)!");
        setTxStep('success');
      } catch (err: unknown) {
        setError(mapTxError(err));
        setTxStep('error');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const sourceAccount = await server.getAccount(publicKey);

      const contract = new Contract(contractId);
      const operation = contract.call(
        "charge",
        new Address(merchantAddress).toScVal(),
        new Address(userAddress).toScVal()
      );

      let tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      tx = await server.prepareTransaction(tx);

      setTxStep('signing');
      const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
      if (signResult.error) {
        throw new Error(`Freighter signing failed: ${signResult.error}`);
      }
      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);

      setTxStep('submitting');
      const sendResponse = await server.sendTransaction(signedTx);
      if (sendResponse.status === "ERROR") {
        throw new Error(`Failed to send transaction: ${JSON.stringify(sendResponse.errorResult)}`);
      }

      setTxStep('polling');
      await pollTransaction(sendResponse.hash);
      setSuccessMessage("Boom! Charged that customer successfully!");
      setTxStep('success');
    } catch (err: unknown) {
      setError(mapTxError(err));
      setTxStep('error');
    } finally {
      setLoading(false);
    }
  };

  const cancel = async (
    contractId: string,
    merchantAddress: string
  ) => {
    if (!publicKey) {
      setError("Please connect your wallet first!");
      setTxStep('error');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setTxStep('preparing');

    const deleteLocalRecord = () => {
      if (typeof window !== "undefined") {
        const keyName = `pullpay_subs_${publicKey}`;
        const stored = localStorage.getItem(keyName) || "[]";
        try {
          const parsed = JSON.parse(stored);
          const filtered = parsed.filter((sub: { merchant: string }) => sub.merchant !== merchantAddress);
          localStorage.setItem(keyName, JSON.stringify(filtered));
          window.dispatchEvent(new CustomEvent("pullpay_subs_updated"));
        } catch (e: unknown) {
          console.error("Failed to delete local subscription cache", e);
        }
      }
    };

    if (isSandbox) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTxStep('signing');
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTxStep('submitting');
        await new Promise((resolve) => setTimeout(resolve, 500));
        deleteLocalRecord();
        setSuccessMessage("Cancelled subscription successfully (Sandbox Mock Tx)!");
        setTxStep('success');
      } catch (err: unknown) {
        setError(mapTxError(err));
        setTxStep('error');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const sourceAccount = await server.getAccount(publicKey);
      const contract = new Contract(contractId);
      const operation = contract.call(
        "cancel",
        new Address(publicKey).toScVal(),
        new Address(merchantAddress).toScVal()
      );

      let tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      tx = await server.prepareTransaction(tx);

      setTxStep('signing');
      const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
      if (signResult.error) {
        throw new Error(`Freighter signing failed: ${signResult.error}`);
      }
      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);

      setTxStep('submitting');
      const sendResponse = await server.sendTransaction(signedTx);
      if (sendResponse.status === "ERROR") {
        throw new Error(`Failed to send transaction: ${JSON.stringify(sendResponse.errorResult)}`);
      }

      setTxStep('polling');
      await pollTransaction(sendResponse.hash);
      deleteLocalRecord();
      setSuccessMessage("Cancelled subscription successfully!");
      setTxStep('success');
    } catch (err: unknown) {
      setError(mapTxError(err));
      setTxStep('error');
    } finally {
      setLoading(false);
    }
  };

  const deposit = async (
    contractId: string,
    amountUsdc: string
  ) => {
    if (!publicKey) {
      setError("Please connect your wallet first!");
      setTxStep('error');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setTxStep('preparing');

    const amountStroops = BigInt(Math.round(parseFloat(amountUsdc) * 10000000));

    if (isSandbox) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTxStep('signing');
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTxStep('submitting');
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Update sandbox mock balance
        if (typeof window !== "undefined") {
          const balanceKey = `pullpay_sandbox_balance_${publicKey}`;
          const currentBal = parseFloat(localStorage.getItem(balanceKey) || "0");
          const newBal = currentBal + parseFloat(amountUsdc);
          localStorage.setItem(balanceKey, String(newBal));

          // Also reduce mock wallet balance
          const walletBalKey = `pullpay_sandbox_wallet_balance_${publicKey}`;
          const currentWalletBal = parseFloat(localStorage.getItem(walletBalKey) || "100.00");
          localStorage.setItem(walletBalKey, String(Math.max(0, currentWalletBal - parseFloat(amountUsdc))));

          window.dispatchEvent(new CustomEvent("pullpay_balance_updated"));
        }

        setSuccessMessage(`Deposited ${amountUsdc} USDC successfully (Sandbox Mock Tx)!`);
        setTxStep('success');
      } catch (err: unknown) {
        setError(mapTxError(err));
        setTxStep('error');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const sourceAccount = await server.getAccount(publicKey);
      const contract = new Contract(contractId);
      const operation = contract.call(
        "deposit",
        new Address(publicKey).toScVal(),
        nativeToScVal(amountStroops, { type: "i128" })
      );

      let tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      tx = await server.prepareTransaction(tx);

      setTxStep('signing');
      const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
      if (signResult.error) {
        throw new Error(`Freighter signing failed: ${signResult.error}`);
      }
      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);

      setTxStep('submitting');
      const sendResponse = await server.sendTransaction(signedTx);
      if (sendResponse.status === "ERROR") {
        throw new Error(`Failed to send transaction: ${JSON.stringify(sendResponse.errorResult)}`);
      }

      setTxStep('polling');
      await pollTransaction(sendResponse.hash);
      setSuccessMessage(`Deposited ${amountUsdc} USDC successfully!`);
      setTxStep('success');
      
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("pullpay_balance_updated"));
      }
    } catch (err: unknown) {
      setError(mapTxError(err));
      setTxStep('error');
    } finally {
      setLoading(false);
    }
  };

  const getVaultBalance = async (contractId: string, address: string): Promise<string> => {
    if (isSandbox) {
      if (typeof window !== "undefined") {
        return localStorage.getItem(`pullpay_sandbox_balance_${address}`) || "0.00";
      }
      return "0.00";
    }

    try {
      const dummyAccount = await server.getAccount(address);
      const contract = new Contract(contractId);
      const operation = contract.call(
        "get_balance",
        new Address(address).toScVal()
      );

      const tx = new TransactionBuilder(dummyAccount, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const simRes = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationSuccess(simRes) && simRes.result?.retval) {
        const val = scValToNative(simRes.result.retval);
        return (Number(val) / 10000000).toFixed(2);
      }
      return "0.00";
    } catch (e) {
      console.error("Failed to fetch vault balance:", e);
      return "0.00";
    }
  };

  const getUsdcBalance = async (tokenId: string, address: string): Promise<string> => {
    if (isSandbox) {
      if (typeof window !== "undefined") {
        const walletBalKey = `pullpay_sandbox_wallet_balance_${address}`;
        let bal = localStorage.getItem(walletBalKey);
        if (bal === null) {
          localStorage.setItem(walletBalKey, "100.00");
          bal = "100.00";
        }
        return parseFloat(bal).toFixed(2);
      }
      return "100.00";
    }

    try {
      const dummyAccount = await server.getAccount(address);
      const contract = new Contract(tokenId);
      const operation = contract.call(
        "balance",
        new Address(address).toScVal()
      );

      const tx = new TransactionBuilder(dummyAccount, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const simRes = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationSuccess(simRes) && simRes.result?.retval) {
        const val = scValToNative(simRes.result.retval);
        return (Number(val) / 10000000).toFixed(2);
      }
      return "0.00";
    } catch (e) {
      console.error("Failed to fetch USDC balance:", e);
      return "0.00";
    }
  };

  return {
    subscribe,
    charge,
    cancel,
    deposit,
    getVaultBalance,
    getUsdcBalance,
    loading,
    error,
    successMessage,
    txStep,
    setTxStep,
    setError,
    setSuccessMessage,
  };
}
