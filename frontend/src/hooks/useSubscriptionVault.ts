import { useState } from "react";
import { rpc, TransactionBuilder, Networks, Address, Contract, nativeToScVal } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";

const RPC_URL = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC_URL);

export function useSubscriptionVault(publicKey: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const pollTransaction = async (txHash: string) => {
    let getResponse = await server.getTransaction(txHash);
    let attempts = 0;
    while (
      ((getResponse.status as any) === "NOT_FOUND" || (getResponse.status as any) === "PENDING") &&
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

  const subscribe = async (
    contractId: string,
    merchantAddress: string,
    amount: string,
    interval: number
  ) => {
    if (!publicKey) {
      setError("Please connect your wallet first!");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

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

      // 4. Prepare transaction (simulates and updates resources/fees)
      tx = await server.prepareTransaction(tx);

      // 5. Sign with Freighter wallet
      const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
      if (signResult.error) {
        throw new Error(`Freighter signing failed: ${signResult.error}`);
      }
      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);

      // 6. Submit transaction
      const sendResponse = await server.sendTransaction(signedTx);
      if (sendResponse.status === "ERROR") {
        throw new Error(`Failed to send transaction: ${JSON.stringify(sendResponse.errorResult)}`);
      }

      // 7. Poll for results
      await pollTransaction(sendResponse.hash);
      setSuccessMessage("Hooray! Subscribed successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to submit subscription transaction");
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
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // 1. Fetch account sequence
      const sourceAccount = await server.getAccount(publicKey);

      // 2. Build the contract call operation
      const contract = new Contract(contractId);
      const operation = contract.call(
        "charge",
        new Address(merchantAddress).toScVal(),
        new Address(userAddress).toScVal()
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

      // 5. Sign with Freighter
      const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
      if (signResult.error) {
        throw new Error(`Freighter signing failed: ${signResult.error}`);
      }
      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);

      // 6. Submit transaction
      const sendResponse = await server.sendTransaction(signedTx);
      if (sendResponse.status === "ERROR") {
        throw new Error(`Failed to send transaction: ${JSON.stringify(sendResponse.errorResult)}`);
      }

      // 7. Poll for results
      await pollTransaction(sendResponse.hash);
      setSuccessMessage("Boom! Charged that customer successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to submit charge transaction");
    } finally {
      setLoading(false);
    }
  };

  return {
    subscribe,
    charge,
    loading,
    error,
    successMessage,
  };
}
