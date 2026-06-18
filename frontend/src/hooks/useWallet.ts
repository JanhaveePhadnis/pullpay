import { useState, useEffect, useCallback } from "react";
import { isConnected as checkFreighterConnected, getAddress, getNetworkDetails, requestAccess } from "@stellar/freighter-api";

export function useWallet() {
  const [isSandbox, setIsSandbox] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pullpay_sandbox") === "true";
    }
    return false;
  });

  const [publicKey, setPublicKey] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pullpay_sandbox");
      if (stored === "true") {
        return "GD_SANDBOX_USER_MOCK_WALLET_ADDRESS_6789";
      }
    }
    return null;
  });

  const [walletConnected, setWalletConnected] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pullpay_sandbox") === "true";
    }
    return false;
  });

  const [checking, setChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = useCallback(async (isInitial = false) => {
    if (isSandbox) return;
    if (typeof window !== "undefined" && localStorage.getItem("pullpay_disconnected") === "true") {
      return;
    }
    try {
      const status = await checkFreighterConnected();
      const connected = status && status.isConnected;
      if (connected) {
        const { address, error: addressError } = await getAddress();
        if (addressError || !address) {
          setPublicKey(null);
          setWalletConnected(false);
          return;
        }
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
      } else {
        setWalletConnected(false);
        setPublicKey(null);
      }
    } catch (err: unknown) {
      if (isInitial || walletConnected) {
        setError(err instanceof Error ? err.message : "Failed to check Freighter wallet status");
      }
    }
  }, [isSandbox, walletConnected]);

  // Sync initial sandbox status if in client environment
  useEffect(() => {
    if (typeof window !== "undefined" && !isSandbox) {
      const disconnected = localStorage.getItem("pullpay_disconnected") === "true";
      if (!disconnected) {
        const timer = setTimeout(() => {
          checkConnection(true);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [isSandbox, checkConnection]);

  const toggleSandbox = (enable: boolean) => {
    setIsSandbox(enable);
    if (typeof window !== "undefined") {
      if (enable) {
        localStorage.setItem("pullpay_sandbox", "true");
        setPublicKey("GD_SANDBOX_USER_MOCK_WALLET_ADDRESS_6789");
        setWalletConnected(true);
        setError(null);
      } else {
        localStorage.removeItem("pullpay_sandbox");
        setPublicKey(null);
        setWalletConnected(false);
      }
    }
  };

  const connectWallet = async () => {
    if (isSandbox) return;
    setChecking(true);
    setError(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("pullpay_disconnected");
    }
    try {
      const status = await checkFreighterConnected();
      const connected = status && status.isConnected;
      if (!connected) {
        setError("Install Freighter extension first! Or toggle Sandbox Mode below.");
        setChecking(false);
        return;
      }
      
      const { address, error: addressError } = await requestAccess();
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect Freighter wallet");
    } finally {
      setChecking(false);
    }
  };

  const disconnectWallet = () => {
    setPublicKey(null);
    setWalletConnected(false);
    setError(null);
    if (typeof window !== "undefined") {
      localStorage.setItem("pullpay_disconnected", "true");
    }
  };

  useEffect(() => {
    if (!isSandbox) {
      const interval = setInterval(() => checkConnection(false), 3000);
      return () => clearInterval(interval);
    }
  }, [isSandbox, checkConnection]);

  return {
    publicKey,
    isConnected: walletConnected,
    checking,
    error,
    connectWallet,
    disconnectWallet,
    isSandbox,
    toggleSandbox,
  };
}
