#![no_std]
#![allow(deprecated)]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Token,
    Balance(Address),
}

#[contract]
pub struct MockYieldPool;

#[contractimpl]
impl MockYieldPool {
    pub fn initialize(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
    }

    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();

        let mut balance: i128 = env.storage().persistent().get(&DataKey::Balance(user.clone())).unwrap_or(0);
        balance += amount;
        env.storage().persistent().set(&DataKey::Balance(user.clone()), &balance);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "yield_deposit"), user.clone()),
            amount,
        );
    }

    pub fn withdraw(env: Env, user: Address, amount: i128) {
        user.require_auth();

        let mut balance: i128 = env.storage().persistent().get(&DataKey::Balance(user.clone())).unwrap_or(0);
        assert!(balance >= amount, "insufficient yield pool balance");
        balance -= amount;
        env.storage().persistent().set(&DataKey::Balance(user.clone()), &balance);

        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = soroban_sdk::token::TokenClient::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &user, &amount);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "yield_withdraw"), user.clone()),
            amount,
        );
    }

    pub fn get_balance(env: Env, user: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(user)).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
