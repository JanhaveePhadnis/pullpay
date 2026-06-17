#![cfg(test)]

use super::*;
use mock_yield_pool::MockYieldPool;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

fn setup_test<'a>(
    env: &Env,
) -> (
    Address,            // user
    Address,            // merchant
    TokenClient<'a>,    // token client
    Address,            // vault address
    SubscriptionVaultClient<'a>, // vault client
    Address,            // yield pool address
    mock_yield_pool::MockYieldPoolClient<'a>, // yield pool client
) {
    env.mock_all_auths();

    env.ledger().with_mut(|li| {
        li.sequence_number = 100;
        li.timestamp = 1000;
    });

    let admin = Address::generate(env);
    let user = Address::generate(env);
    let merchant = Address::generate(env);

    // Deploy SAC Token
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token_address = sac.address();
    let token_client = TokenClient::new(env, &token_address);
    let token_admin_client = StellarAssetClient::new(env, &token_address);

    // Mint tokens to user
    token_admin_client.mint(&user, &1000);

    // Deploy mock yield pool
    let yield_pool_address = env.register(MockYieldPool, ());
    let yield_pool_client = mock_yield_pool::MockYieldPoolClient::new(env, &yield_pool_address);
    yield_pool_client.initialize(&token_address);

    // Deploy subscription vault
    let vault_address = env.register(SubscriptionVault, ());
    let vault_client = SubscriptionVaultClient::new(env, &vault_address);
    vault_client.initialize(&token_address, &yield_pool_address);

    (
        user,
        merchant,
        token_client,
        vault_address,
        vault_client,
        yield_pool_address,
        yield_pool_client,
    )
}

#[test]
fn test_deposit_and_yield_routing() {
    let env = Env::default();
    let (
        user,
        _merchant,
        token_client,
        vault_address,
        vault_client,
        yield_pool_address,
        yield_pool_client,
    ) = setup_test(&env);

    // User deposits 100 SAC tokens
    vault_client.deposit(&user, &100);

    // Verify user balance in vault storage
    assert_eq!(vault_client.get_balance(&user), 100);

    // Verify physical token balances (20% in vault, 80% in yield pool)
    assert_eq!(token_client.balance(&user), 900); // 1000 - 100
    assert_eq!(token_client.balance(&vault_address), 20); // 20%
    assert_eq!(token_client.balance(&yield_pool_address), 80); // 80%

    // Verify yield pool recorded balance for vault
    assert_eq!(yield_pool_client.get_balance(&vault_address), 80);
}

#[test]
fn test_successful_merchant_charge() {
    let env = Env::default();
    let (
        user,
        merchant,
        token_client,
        vault_address,
        vault_client,
        yield_pool_address,
        yield_pool_client,
    ) = setup_test(&env);

    // 1. User deposits 100
    vault_client.deposit(&user, &100);

    // 2. User subscribes to merchant with amount 10 and interval 30 ledgers
    vault_client.subscribe(&user, &merchant, &10, &30);

    // Verify subscription created
    let sub = vault_client.get_subscription(&user, &merchant).unwrap();
    assert_eq!(sub.amount, 10);
    assert_eq!(sub.interval_ledgers, 30);
    assert_eq!(sub.last_pull_ledger, 0);

    // 3. First charge should succeed immediately (last_pull_ledger starts at 0)
    vault_client.charge(&merchant, &user);

    // Verify user vault balance is 90
    assert_eq!(vault_client.get_balance(&user), 90);
    // Verify merchant received 10 tokens
    assert_eq!(token_client.balance(&merchant), 10);
    // Verify 80/20 split on remaining 90 balance (18 in vault, 72 in yield pool)
    assert_eq!(token_client.balance(&vault_address), 18);
    assert_eq!(token_client.balance(&yield_pool_address), 72);
    assert_eq!(yield_pool_client.get_balance(&vault_address), 72);

    // Verify subscription updated
    let sub = vault_client.get_subscription(&user, &merchant).unwrap();
    assert_eq!(sub.last_pull_ledger, env.ledger().sequence());

    // 4. Advance ledger time and charge again
    env.ledger().with_mut(|li| {
        li.sequence_number += 30;
    });

    vault_client.charge(&merchant, &user);

    // Verify balances after second charge (total balance 80)
    assert_eq!(vault_client.get_balance(&user), 80);
    assert_eq!(token_client.balance(&merchant), 20); // 10 + 10
    assert_eq!(token_client.balance(&vault_address), 16); // 20% of 80
    assert_eq!(token_client.balance(&yield_pool_address), 64); // 80% of 80
    assert_eq!(yield_pool_client.get_balance(&vault_address), 64);
}

#[test]
#[should_panic(expected = "subscription interval has not passed")]
fn test_failed_charge_timelock() {
    let env = Env::default();
    let (
        user,
        merchant,
        _token_client,
        _vault_address,
        vault_client,
        _yield_pool_address,
        _yield_pool_client,
    ) = setup_test(&env);

    // 1. User deposits 100 and subscribes
    vault_client.deposit(&user, &100);
    vault_client.subscribe(&user, &merchant, &10, &30);

    // 2. First charge succeeds
    vault_client.charge(&merchant, &user);

    // 3. Second charge immediately should fail because interval_ledgers (30) has not passed
    vault_client.charge(&merchant, &user);
}

#[test]
fn test_cancel_subscription() {
    let env = Env::default();
    let (
        user,
        merchant,
        _token_client,
        _vault_address,
        vault_client,
        _yield_pool_address,
        _yield_pool_client,
    ) = setup_test(&env);

    vault_client.subscribe(&user, &merchant, &10, &30);
    assert!(vault_client.get_subscription(&user, &merchant).is_some());

    vault_client.cancel(&user, &merchant);
    assert!(vault_client.get_subscription(&user, &merchant).is_none());
}
