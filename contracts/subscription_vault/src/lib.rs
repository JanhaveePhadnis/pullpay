#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, IntoVal};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Token,
    YieldPool,
    Balance(Address),
    Subscription(SubscriptionKey),
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

#[contract]
pub struct SubscriptionVault;

#[contractimpl]
impl SubscriptionVault {
    pub fn initialize(env: Env, token: Address, yield_pool: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::YieldPool, &yield_pool);
    }

    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();

        // 1. Get Token client
        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = soroban_sdk::token::TokenClient::new(&env, &token_address);

        // 2. Transfer tokens from user to vault
        let contract_address = env.current_contract_address();
        token_client.transfer(&user, &contract_address, &amount);

        // 3. Update user's persistent balance in vault
        let mut balance: i128 = env.storage().persistent().get(&DataKey::Balance(user.clone())).unwrap_or(0);
        balance += amount;
        env.storage().persistent().set(&DataKey::Balance(user.clone()), &balance);

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
    }

    pub fn subscribe(env: Env, user: Address, merchant: Address, amount: i128, interval_ledgers: u32) {
        user.require_auth();

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

        env.storage().persistent().set(&DataKey::Subscription(key), &details);
    }

    pub fn charge(env: Env, merchant: Address, user: Address) {
        merchant.require_auth();

        let key = SubscriptionKey {
            user: user.clone(),
            merchant: merchant.clone(),
        };

        let mut sub = env.storage().persistent().get::<_, SubscriptionDetails>(&DataKey::Subscription(key.clone()))
            .unwrap_or_else(|| panic!("subscription does not exist"));

        // Check if interval has passed
        let current_ledger = env.ledger().sequence();
        if sub.last_pull_ledger > 0 {
            assert!(
                current_ledger >= sub.last_pull_ledger + sub.interval_ledgers,
                "subscription interval has not passed"
            );
        }

        // Check user balance
        let mut balance: i128 = env.storage().persistent().get(&DataKey::Balance(user.clone())).unwrap_or(0);
        assert!(balance >= sub.amount, "insufficient user balance");

        // Deduct user balance
        balance -= sub.amount;
        env.storage().persistent().set(&DataKey::Balance(user.clone()), &balance);

        // Withdraw 80% from yield pool
        let yield_withdraw = sub.amount * 80 / 100;
        if yield_withdraw > 0 {
            let yield_pool: Address = env.storage().instance().get(&DataKey::YieldPool).unwrap();
            let contract_address = env.current_contract_address();
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

        // Update subscription details
        sub.last_pull_timestamp = env.ledger().timestamp();
        sub.last_pull_ledger = current_ledger;
        env.storage().persistent().set(&DataKey::Subscription(key), &sub);
    }

    pub fn cancel(env: Env, user: Address, merchant: Address) {
        user.require_auth();

        let key = SubscriptionKey {
            user,
            merchant,
        };
        env.storage().persistent().remove(&DataKey::Subscription(key));
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

mod test;
