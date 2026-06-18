#!/bin/bash
set -e

# Change directory to project root
cd "$(dirname "$0")/.."

echo "============================================="
echo "Building Soroban Contracts..."
echo "============================================="
# Build contracts
cargo build --target wasm32v1-none --release

# Select network (testnet by default)
NETWORK="testnet"
RPC_URL="https://soroban-testnet.stellar.org"

echo "============================================="
echo "Configuring Deployer Identity..."
echo "============================================="
# Generate keys if they don't exist
stellar keys generate deployer --network $NETWORK || true
DEPLOYER_ADDRESS=$(stellar keys address deployer)

echo "Deployer address: $DEPLOYER_ADDRESS"
echo "Funding deployer account via Friendbot..."
curl -s "https://friendbot.stellar.org?addr=$DEPLOYER_ADDRESS" > /dev/null

echo "============================================="
echo "Deploying Contracts..."
echo "============================================="
echo "Deploying USDC custom asset SAC..."
# Deploy SAC for a custom asset USDC representing the subscription currency
TOKEN_ID=$(stellar contract asset deploy \
  --asset USDC:$DEPLOYER_ADDRESS \
  --source deployer \
  --network $NETWORK 2>/dev/null || stellar contract id asset --asset USDC:$DEPLOYER_ADDRESS --network $NETWORK)
echo "Custom Token SAC ID: $TOKEN_ID"

echo "Deploying mock_yield_pool..."
POOL_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/mock_yield_pool.wasm \
  --source deployer \
  --network $NETWORK)
echo "Mock Yield Pool ID: $POOL_ID"

echo "Deploying subscription_vault..."
VAULT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/subscription_vault.wasm \
  --source deployer \
  --network $NETWORK)
echo "Subscription Vault ID: $VAULT_ID"

echo "============================================="
echo "Initializing Contracts..."
echo "============================================="
echo "Initializing mock_yield_pool..."
stellar contract invoke \
  --id $POOL_ID \
  --source deployer \
  --network $NETWORK \
  -- \
  initialize \
  --token $TOKEN_ID

echo "Initializing subscription_vault..."
stellar contract invoke \
  --id $VAULT_ID \
  --source deployer \
  --network $NETWORK \
  -- \
  initialize \
  --token $TOKEN_ID \
  --yield_pool $POOL_ID \
  --admin $DEPLOYER_ADDRESS

echo "============================================="
echo "Writing environment configurations..."
echo "============================================="
# Write variables to frontend/.env.local
cat << EOF > frontend/.env.local
NEXT_PUBLIC_TOKEN_ID=$TOKEN_ID
NEXT_PUBLIC_YIELD_POOL_ID=$POOL_ID
NEXT_PUBLIC_VAULT_ID=$VAULT_ID
NEXT_PUBLIC_NETWORK=testnet
EOF

echo "Done! env written to frontend/.env.local"
echo "============================================="
echo "Deployment Complete!"
echo "USDC Asset: $TOKEN_ID"
echo "Yield Pool: $POOL_ID"
echo "Subscription Vault: $VAULT_ID"
echo "============================================="
