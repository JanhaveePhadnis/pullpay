#![no_std]
#![allow(deprecated)]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, IntoVal};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Token,
    YieldPool,
    Balance(Address),
    Subscription(SubscriptionKey),
    Admin,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionKey {
    pub user: Address,
    pub merchant: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionDetails {
    pub amount: i128,
    pub interval_ledgers: u32,
    pub last_pull_timestamp: u64,
    pub last_pull_ledger: u32,
}

const DAY_IN_LEDGERS: u32 = 17280; // Assuming 5s ledger close time
const INSTANCE_BUMP_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS; // 7 days
const INSTANCE_BUMP_LIMIT: u32 = 30 * DAY_IN_LEDGERS; // 30 days
const PERSISTENT_BUMP_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;
const PERSISTENT_BUMP_LIMIT: u32 = 30 * DAY_IN_LEDGERS;

#[contract]
pub struct SubscriptionVault;

#[contractimpl]
impl SubscriptionVault {
    pub fn initialize(env: Env, token: Address, yield_pool: Address, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::YieldPool, &yield_pool);
        env.storage().instance().extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_LIMIT);
    }

    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();

        env.storage().instance().extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_LIMIT);

        // 1. Get Token client
        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = soroban_sdk::token::TokenClient::new(&env, &token_address);

        // 2. Transfer tokens from user to vault
        let contract_address = env.current_contract_address();
        token_client.transfer(&user, &contract_address, &amount);

        // 3. Update user's persistent balance in vault
        let balance_key = DataKey::Balance(user.clone());
        let mut balance: i128 = env.storage().persistent().get(&balance_key).unwrap_or(0);
        balance += amount;
        env.storage().persistent().set(&balance_key, &balance);
        env.storage().persistent().extend_ttl(&balance_key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_LIMIT);

        // 4. Route 80% to mock_yield_pool
        let yield_amount = amount * 80 / 100;
        if yield_amount > 0 {
            let yield_pool: Address = env.storage().instance().get(&DataKey::YieldPool).unwrap();
            
            // First transfer the yield tokens to mock_yield_pool
            token_client.transfer(&contract_address, &yield_pool, &yield_amount);

            // Call deposit on mock_yield_pool via Env::invoke_contract
            let args = soroban_sdk::vec![&env, contract_address.into_val(&env), yield_amount.into_val(&env)];
            env.invoke_contract::<()>(
                &yield_pool,
                &soroban_sdk::Symbol::new(&env, "deposit"),
                args,
            );
        }

        // Emit deposit_successful event
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "deposit_successful"), user.clone()),
            amount,
        );
    }

    pub fn subscribe(env: Env, user: Address, merchant: Address, amount: i128, interval_ledgers: u32) {
        user.require_auth();

        env.storage().instance().extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_LIMIT);

        let key = SubscriptionKey {
            user: user.clone(),
            merchant: merchant.clone(),
        };

        let details = SubscriptionDetails {
            amount,
            interval_ledgers,
            last_pull_timestamp: 0,
            last_pull_ledger: 0,
        };

        let sub_key = DataKey::Subscription(key);
        env.storage().persistent().set(&sub_key, &details);
        env.storage().persistent().extend_ttl(&sub_key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_LIMIT);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "subscribed"), merchant.clone(), user.clone()),
            amount,
        );
    }

    #[allow(deprecated)]
    pub fn charge(env: Env, merchant: Address, user: Address) {
        merchant.require_auth();

        env.storage().instance().extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_LIMIT);

        let key = SubscriptionKey {
            user: user.clone(),
            merchant: merchant.clone(),
        };

        let sub_key = DataKey::Subscription(key.clone());
        let mut sub = env.storage().persistent().get::<_, SubscriptionDetails>(&sub_key)
            .unwrap_or_else(|| panic!("subscription does not exist"));
        env.storage().persistent().extend_ttl(&sub_key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_LIMIT);

        // Check if interval has passed
        let current_ledger = env.ledger().sequence();
        if sub.last_pull_ledger > 0 {
            assert!(
                current_ledger >= sub.last_pull_ledger + sub.interval_ledgers,
                "subscription interval has not passed"
            );
        }

        // Check user balance
        let balance_key = DataKey::Balance(user.clone());
        let mut balance: i128 = env.storage().persistent().get(&balance_key).unwrap_or(0);
        assert!(balance >= sub.amount, "insufficient user balance");
        env.storage().persistent().extend_ttl(&balance_key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_LIMIT);

        // Deduct user balance
        balance -= sub.amount;
        env.storage().persistent().set(&balance_key, &balance);

        // Withdraw 80% from yield pool
        let yield_withdraw = sub.amount * 80 / 100;
        if yield_withdraw > 0 {
            let yield_pool: Address = env.storage().instance().get(&DataKey::YieldPool).unwrap();
            let contract_address = env.current_contract_address();
            
            // Call withdraw on mock_yield_pool via Env::invoke_contract
            let args = soroban_sdk::vec![&env, contract_address.into_val(&env), yield_withdraw.into_val(&env)];
            env.invoke_contract::<()>(
                &yield_pool,
                &soroban_sdk::Symbol::new(&env, "withdraw"),
                args,
            );
        }

        // Transfer 100% of charge amount to merchant
        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = soroban_sdk::token::TokenClient::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &merchant, &sub.amount);

        // Emit charge_successful event
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "charge_successful"), merchant.clone(), user.clone()),
            sub.amount,
        );

        // Update subscription details
        sub.last_pull_timestamp = env.ledger().timestamp();
        sub.last_pull_ledger = current_ledger;
        env.storage().persistent().set(&sub_key, &sub);
    }

    pub fn cancel(env: Env, user: Address, merchant: Address) {
        user.require_auth();

        env.storage().instance().extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_LIMIT);

        let key = SubscriptionKey {
            user: user.clone(),
            merchant: merchant.clone(),
        };
        env.storage().persistent().remove(&DataKey::Subscription(key));

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "subscription_cancelled"), merchant.clone(), user.clone()),
            (),
        );
    }

    pub fn upgrade(env: Env, new_wasm_hash: soroban_sdk::BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn get_balance(env: Env, user: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(user)).unwrap_or(0)
    }

    pub fn get_subscription(env: Env, user: Address, merchant: Address) -> Option<SubscriptionDetails> {
        let key = SubscriptionKey {
            user,
            merchant,
        };
        env.storage().persistent().get(&DataKey::Subscription(key))
    }
}

#[cfg(test)]
mod test;
