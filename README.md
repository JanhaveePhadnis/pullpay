# PullPay: On-Chain Subscription Protocol

PullPay is a non-custodial subscription billing protocol designed for the Stellar Soroban ecosystem. It enables merchants to securely pull recurring payments directly from subscriber vaults based on customer-approved limits and interval constraints. 

Stripped of bloat, styled in raw brutalism, and designed for reliability.

---

## 1. System Architecture

The protocol consists of three primary components:
1. **USDC Token (SAC):** The underlying currency (Stellar Asset Contract representation).
2. **Subscription Vault Contract:** Stores deposited customer funds, records active subscription approvals, handles billing intervals, and routes assets.
3. **Mock Yield Pool:** Simulates routing 80% of customer deposits into a yield-generating account, automatically pulling funds back to fulfill charges.

### Transaction Flow Diagram

```mermaid
sequence-block
  Customer -> Vault: deposit(amount)
  Vault -> USDC: transfer (100% deposit)
  Vault -> YieldPool: deposit (80% yield routing)
  Customer -> Vault: subscribe(merchant, amount, interval)
  Merchant -> Vault: charge(merchant, subscriber)
  Vault -> YieldPool: withdraw (80% pull)
  Vault -> USDC: transfer (100% charge to merchant)
```

---

## 2. Smart Contract API Spec

### `SubscriptionVault` Contract
*   `initialize(env: Env, token: Address, yield_pool: Address, admin: Address)`  
    Initializes the contract instance with target USDC asset, mock yield pool, and deployer admin.
*   `deposit(env: Env, user: Address, amount: i128)`  
    Locks tokens in the vault. Automatically routes 80% of the funds to the mock yield pool.
*   `subscribe(env: Env, user: Address, merchant: Address, amount: i128, interval_ledgers: u32)`  
    Customer signs and registers a billing authorization constraint specifying billing limit and ledger count frequency.
*   `charge(env: Env, merchant: Address, user: Address)`  
    Merchant triggers a subscription pull. Verifies the interval constraint, deducts subscriber balance, recalls the 80% allocation from the yield pool, and transfers 100% of the payment to the merchant.
*   `cancel(env: Env, user: Address, merchant: Address)`  
    Customer cancels the merchant's billing authorization.
*   `upgrade(env: Env, new_wasm_hash: BytesN<32>)`  
    Enables contract upgradeability signed by the admin.

---

## 3. Getting Started

### Prerequisites
- [Rust & Cargo](https://www.rust-lang.org/tools/install)
- [Node.js v20+](https://nodejs.org/)
- [stellar-cli](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)

### Compilation & Testing
Run contract test suite and verify lints:
```bash
# Test contracts
cargo test

# Check clippy warnings
cargo clippy --all-targets -- -D warnings
```

---

## 4. Deployment Workflow

We provide a fully automated script to compile and deploy the contracts onto the Stellar Testnet:

```bash
# Run deployment script
./scripts/deploy.sh
```

**What the script does:**
1. Compiles the Rust smart contracts to WASM targets.
2. Configures a `deployer` key and requests funds from the Testnet Friendbot.
3. Deploys a custom SAC USDC Token representing the billing currency.
4. Deploys `mock_yield_pool` and `subscription_vault` contracts.
5. Initializes and links the deployed contracts.
6. Writes the fresh contract IDs directly to `frontend/.env.local`.

---

## 5. Next.js Frontend App

The brutalist user interface provides a dual dashboard representing both Subscriber and Merchant views.

### Local Development
To launch the Next.js development server:
```bash
cd frontend
npm install
npm run dev
```

### Local Sandbox Mode
To bypass installing the Freighter extension or funding testnet accounts:
- Toggle **Enable Sandbox Mode** on the UI dashboard.
- This mocks wallet connections, uses local state cache for subscriptions, and logs simulated event ledger transactions locally.

### Production Build & Linting
```bash
# Run ESLint validation
npm run lint

# Build optimized production bundle
npm run build

# Run frontend tests
npm run test
```

---

## 6. CI/CD Pipeline

The repository integrates a GitHub Actions pipeline `.github/workflows/soroban-ci.yml` that triggers on push or pull requests to the `main` branch. It executes:
- Rust Cargo linting (Clippy) and unit tests.
- Frontend npm installations, ES check lints, Next.js build compilation, and Vitest frontend tests.
