import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Manage from "../manage/page";

// Mock the React hooks so the tests run in pure JSDOM isolation
vi.mock("../../hooks/useWallet", () => ({
  useWallet: () => ({
    publicKey: null,
    isConnected: false,
    checking: false,
    error: null,
    connectWallet: vi.fn(),
    disconnectWallet: vi.fn(),
    isSandbox: true,
    toggleSandbox: vi.fn(),
  }),
}));

vi.mock("../../hooks/useSubscriptionVault", () => ({
  useSubscriptionVault: () => ({
    subscribe: vi.fn(),
    charge: vi.fn(),
    cancel: vi.fn(),
    loading: false,
    error: null,
    successMessage: null,
  }),
}));

vi.mock("../../hooks/useSorobanEvents", () => ({
  useSorobanEvents: () => ({
    events: [],
    clearEvents: vi.fn(),
  }),
}));

test("renders manage page dashboard headings", () => {
  render(<Manage />);
  
  // Verify page main header
  const heading = screen.getByRole("heading", { name: /Manage Subscriptions/i });
  expect(heading).toBeDefined();

  // Verify step titles
  const walletStep = screen.getByRole("heading", { name: /1. Wallet Connection/i });
  expect(walletStep).toBeDefined();

  const configStep = screen.getByRole("heading", { name: /2. Contract Config/i });
  expect(configStep).toBeDefined();

  const subscribeStep = screen.getByRole("heading", { name: /3. Create Subscription/i });
  expect(subscribeStep).toBeDefined();
});
