#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    token::{StellarAssetClient, TokenClient},
    Address, Env, IntoVal,
};

fn setup_test<'a>(env: &Env) -> (Address, TokenClient<'a>, Address, MockYieldPoolClient<'a>) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let user = Address::generate(env);

    // Deploy SAC Token
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token_address = sac.address();
    let token_client = TokenClient::new(env, &token_address);
    let token_admin_client = StellarAssetClient::new(env, &token_address);

    // Mint tokens to user (which will act as the vault address)
    token_admin_client.mint(&user, &1000);

    // Deploy MockYieldPool
    let pool_address = env.register(MockYieldPool, ());
    let pool_client = MockYieldPoolClient::new(env, &pool_address);
    pool_client.initialize(&token_address);

    // Give tokens to pool to simulate pool holding balance for withdrawals
    token_admin_client.mint(&pool_address, &5000);

    (user, token_client, pool_address, pool_client)
}

#[test]
fn test_yield_pool_deposit() {
    let env = Env::default();
    let (vault, token_client, pool_address, pool_client) = setup_test(&env);

    // Deposit tokens from vault to pool
    // Transfer tokens first to simulate vault routing
    token_client.transfer(&vault, &pool_address, &200);
    pool_client.deposit(&vault, &200);

    // Check balances
    assert_eq!(pool_client.get_balance(&vault), 200);
}

#[test]
fn test_yield_pool_withdraw() {
    let env = Env::default();
    let (vault, token_client, pool_address, pool_client) = setup_test(&env);

    // Initial deposit
    token_client.transfer(&vault, &pool_address, &300);
    pool_client.deposit(&vault, &300);
    assert_eq!(pool_client.get_balance(&vault), 300);

    // Withdraw 100
    pool_client.withdraw(&vault, &100);

    // Balance verification
    assert_eq!(pool_client.get_balance(&vault), 200);
    assert_eq!(token_client.balance(&vault), 800); // 1000 - 300 + 100
}

#[test]
#[should_panic(expected = "insufficient yield pool balance")]
fn test_yield_pool_withdraw_insufficient() {
    let env = Env::default();
    let (vault, token_client, pool_address, pool_client) = setup_test(&env);

    // Deposit 100
    token_client.transfer(&vault, &pool_address, &100);
    pool_client.deposit(&vault, &100);

    // Try withdrawing 200 (should fail)
    pool_client.withdraw(&vault, &200);
}
