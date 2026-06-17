import { useState, useEffect, useRef } from "react";
import { rpc, scValToNative } from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC_URL);

export interface SorobanEventLog {
  id: string;
  ledger: number;
  topics: any[];
  value: any;
}

export function useSorobanEvents(contractId: string | null) {
  const [events, setEvents] = useState<SorobanEventLog[]>([]);
  const startLedgerRef = useRef<number | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!contractId) return;

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
  }, [contractId]);

  return {
    events,
    clearEvents: () => {
      setEvents([]);
      seenEventIds.current.clear();
    },
  };
}
