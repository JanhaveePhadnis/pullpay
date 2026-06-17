import { useState, useEffect } from "react";
import { isConnected, getAddress, getNetworkDetails } from "@stellar/freighter-api";

export function useWallet() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = async () => {
    try {
      const connected = await isConnected();
      if (connected) {
        const { address, error: addressError } = await getAddress();
        if (addressError) {
          setError(addressError);
          setPublicKey(null);
          setWalletConnected(false);
          return;
        }
        if (address) {
          // Check network
          const networkDetails = await getNetworkDetails();
          if (networkDetails.network !== "TESTNET") {
            setError("Switch Freighter to TESTNET in settings!");
            setPublicKey(null);
            setWalletConnected(false);
            return;
          }
          setPublicKey(address);
          setWalletConnected(true);
          setError(null);
        }
      } else {
        setWalletConnected(false);
        setPublicKey(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to check Freighter wallet status");
    }
  };

  const connectWallet = async () => {
    setChecking(true);
    setError(null);
    try {
      const connected = await isConnected();
      if (!connected) {
        setError("Install Freighter extension first!");
        setChecking(false);
        return;
      }
      const { address, error: addressError } = await getAddress();
      if (addressError) {
        setError(addressError);
        setChecking(false);
        return;
      }
      if (!address) {
        setError("Failed to get public key, did you authorize?");
        setChecking(false);
        return;
      }
      const networkDetails = await getNetworkDetails();
      if (networkDetails.network !== "TESTNET") {
        setError("Switch Freighter to TESTNET in settings!");
        setChecking(false);
        return;
      }
      setPublicKey(address);
      setWalletConnected(true);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to connect Freighter wallet");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkConnection();
    // Periodically sync if wallet changes
    const interval = setInterval(checkConnection, 3000);
    return () => clearInterval(interval);
  }, []);

  return {
    publicKey,
    isConnected: walletConnected,
    checking,
    error,
    connectWallet,
  };
}
