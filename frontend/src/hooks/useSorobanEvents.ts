import { useState, useEffect, useRef } from "react";
import { rpc, scValToNative } from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC_URL);

export interface SorobanEventLog {
  id: string;
  ledger: number;
  topics: unknown[];
  value: unknown;
}

export function useSorobanEvents(contractId: string | null, isSandbox: boolean = false) {
  const [events, setEvents] = useState<SorobanEventLog[]>([]);
  const startLedgerRef = useRef<number | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());

  // Real event polling setup
  useEffect(() => {
    if (isSandbox) return;
    async function initLedger() {
      try {
        const { sequence } = await server.getLatestLedger();
        startLedgerRef.current = sequence;
        console.log(`Initialized event poller starting at ledger: ${sequence}`);
      } catch (err) {
        console.error("Failed to fetch initial ledger sequence for event poller:", err);
      }
    }
    initLedger();
  }, [isSandbox]);

  // Read simulated mock events when in Sandbox mode
  useEffect(() => {
    if (!isSandbox) return;

    const loadMockEvents = () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("pullpay_mock_events") || "[]";
        try {
          const parsed = JSON.parse(stored);
          setEvents(parsed);
        } catch (err) {
          console.error("Error reading mock events:", err);
        }
      }
    };

    // Load initial events
    loadMockEvents();

    // Listen to custom local update event
    window.addEventListener("pullpay_mock_event_added", loadMockEvents);
    return () => {
      window.removeEventListener("pullpay_mock_event_added", loadMockEvents);
    };
  }, [isSandbox]);

  // Real chain event polling
  useEffect(() => {
    if (isSandbox || !contractId) return;

    const poll = async () => {
      if (startLedgerRef.current === null) return;

      try {
        const response = await server.getEvents({
          startLedger: startLedgerRef.current,
          filters: [
            {
              type: "contract",
              contractIds: [contractId],
            },
          ],
        });

        if (response.latestLedger) {
          startLedgerRef.current = response.latestLedger;
        }

        const newEvents: SorobanEventLog[] = [];
        for (const rawEv of response.events) {
          if (seenEventIds.current.has(rawEv.id)) continue;
          seenEventIds.current.add(rawEv.id);

          try {
            const topics = rawEv.topic.map((t) => scValToNative(t));
            const value = scValToNative(rawEv.value);

            if (topics[0] === "charge_successful") {
              newEvents.push({
                id: rawEv.id,
                ledger: rawEv.ledger,
                topics,
                value,
              });
            }
          } catch (parseErr) {
            console.error("Failed to parse event:", rawEv, parseErr);
          }
        }

        if (newEvents.length > 0) {
          setEvents((prev) => [...prev, ...newEvents]);
        }
      } catch (err) {
        console.error("Error polling Soroban events:", err);
      }
    };

    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [contractId, isSandbox]);

  return {
    events,
    clearEvents: () => {
      setEvents([]);
      seenEventIds.current.clear();
      if (isSandbox && typeof window !== "undefined") {
        localStorage.removeItem("pullpay_mock_events");
      }
    },
  };
}
