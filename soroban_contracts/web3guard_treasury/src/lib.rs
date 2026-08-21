#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, token};

// ─── Constants ─────────────────────────────────────────────────────────────────
const LEDGER_THRESHOLD_INSTANCE: u32 = 100_000;
const LEDGER_TTL_INSTANCE: u32 = 500_000;

const LEDGER_THRESHOLD_PERSISTENT: u32 = 100_000;
const LEDGER_TTL_PERSISTENT: u32 = 500_000;

const THIRTY_DAYS_IN_SECONDS: u64 = 30 * 24 * 60 * 60;

// ─── Data Types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct TierConfig {
    pub cost: i128,
    pub audit_limit: u32,
    pub integrations: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct UserSubscription {
    pub tier_id: u32,
    pub expiry: u64,
    pub audits_remaining: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,                    // Instance
    FeeToken,                 // Instance
    TotalRevenue,             // Instance: Tracks accumulated profit
    Balance(Address),         // Persistent: User's deposited XLM
    TierConfig(u32),          // Persistent: Tier configurations
    UserSub(Address),         // Persistent: User's active subscription
    Consumer(Address),        // Persistent: Whitelisted consumer contracts
}

// ─── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct Web3GuardTreasuryContract;

#[contractimpl]
impl Web3GuardTreasuryContract {
    /// Initialize the treasury with admin and accepted token
    pub fn initialize(env: Env, admin: Address, fee_token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeToken, &fee_token);
        env.storage().instance().set(&DataKey::TotalRevenue, &0i128);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// Admin: Set pricing and limits for a specific subscription tier
    pub fn set_tier_pricing(env: Env, tier_id: u32, cost: i128, audit_limit: u32, integrations: bool) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Not initialized");
        admin.require_auth();

        if cost < 0 {
            panic!("Cost cannot be negative");
        }

        let config = TierConfig {
            cost,
            audit_limit,
            integrations,
        };
        let key = DataKey::TierConfig(tier_id);
        env.storage().persistent().set(&key, &config);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// Admin: Whitelist a contract (e.g. proof_of_audit) as an authorized consumer
    pub fn authorize_consumer(env: Env, contract: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Not initialized");
        admin.require_auth();

        let key = DataKey::Consumer(contract.clone());
        env.storage().persistent().set(&key, &true);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// User: Deposit tokens into their treasury balance
    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let fee_token: Address = env.storage().instance().get(&DataKey::FeeToken).expect("Not initialized");
        let token_client = token::Client::new(&env, &fee_token);
        
        // Transfer from user to treasury
        token_client.transfer(&user, &env.current_contract_address(), &amount);

        // Update internal balance
        let key = DataKey::Balance(user.clone());
        let current_balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_balance = current_balance.checked_add(amount).expect("Overflow");
        env.storage().persistent().set(&key, &new_balance);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// User: Withdraw unused funds from their treasury balance
    pub fn user_withdraw(env: Env, user: Address, amount: i128) {
        user.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let key = DataKey::Balance(user.clone());
        let current_balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        
        if current_balance < amount {
            panic!("Insufficient balance");
        }

        let new_balance = current_balance.checked_sub(amount).expect("Underflow");
        env.storage().persistent().set(&key, &new_balance);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);

        let fee_token: Address = env.storage().instance().get(&DataKey::FeeToken).expect("Not initialized");
        let token_client = token::Client::new(&env, &fee_token);
        token_client.transfer(&env.current_contract_address(), &user, &amount);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// User: Purchase or renew a subscription tier
    pub fn buy_subscription(env: Env, user: Address, tier_id: u32) {
        user.require_auth();

        let tier_key = DataKey::TierConfig(tier_id);
        let config: TierConfig = env.storage().persistent().get(&tier_key).expect("Invalid tier ID");

        let bal_key = DataKey::Balance(user.clone());
        let current_balance: i128 = env.storage().persistent().get(&bal_key).unwrap_or(0);
        
        if current_balance < config.cost {
            panic!("Insufficient balance to buy subscription");
        }

        // Deduct from user
        let new_balance = current_balance.checked_sub(config.cost).expect("Underflow");
        env.storage().persistent().set(&bal_key, &new_balance);
        env.storage().persistent().extend_ttl(&bal_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);

        // Add to protocol revenue
        let current_revenue: i128 = env.storage().instance().get(&DataKey::TotalRevenue).unwrap_or(0);
        let new_revenue = current_revenue.checked_add(config.cost).expect("Overflow");
        env.storage().instance().set(&DataKey::TotalRevenue, &new_revenue);

        // Update Subscription
        let sub_key = DataKey::UserSub(user.clone());
        let now = env.ledger().timestamp();
        let sub = UserSubscription {
            tier_id,
            expiry: now + THIRTY_DAYS_IN_SECONDS,
            audits_remaining: config.audit_limit,
        };
        env.storage().persistent().set(&sub_key, &sub);
        env.storage().persistent().extend_ttl(&sub_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// Cross-Contract: Consume 1 audit from the user's quota.
    pub fn consume_audit(env: Env, consumer: Address, user: Address) {
        consumer.require_auth();

        let consumer_key = DataKey::Consumer(consumer.clone());
        if !env.storage().persistent().has(&consumer_key) {
            panic!("Unauthorized consumer");
        }
        env.storage().persistent().extend_ttl(&consumer_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);

        let sub_key = DataKey::UserSub(user.clone());
        let mut sub: UserSubscription = env.storage().persistent().get(&sub_key).expect("No active subscription");

        let now = env.ledger().timestamp();
        if now >= sub.expiry {
            panic!("Subscription expired");
        }

        if sub.audits_remaining == 0 {
            panic!("Audit quota exceeded");
        }

        sub.audits_remaining -= 1;
        env.storage().persistent().set(&sub_key, &sub);
        env.storage().persistent().extend_ttl(&sub_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// Read-Only: Check if user has active integration access
    pub fn has_integration_access(env: Env, user: Address) -> bool {
        let sub_key = DataKey::UserSub(user.clone());
        if let Some(sub) = env.storage().persistent().get::<_, UserSubscription>(&sub_key) {
            env.storage().persistent().extend_ttl(&sub_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
            let now = env.ledger().timestamp();
            if now < sub.expiry {
                let tier_key = DataKey::TierConfig(sub.tier_id);
                if let Some(config) = env.storage().persistent().get::<_, TierConfig>(&tier_key) {
                    env.storage().persistent().extend_ttl(&tier_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
                    return config.integrations;
                }
            }
        }
        false
    }

    /// Admin: Withdraw profits from revenue
    pub fn admin_withdraw(env: Env, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Not initialized");
        admin.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let current_revenue: i128 = env.storage().instance().get(&DataKey::TotalRevenue).unwrap_or(0);
        if amount > current_revenue {
            panic!("Amount exceeds available revenue");
        }

        // Deduct from revenue
        let new_revenue = current_revenue.checked_sub(amount).expect("Underflow");
        env.storage().instance().set(&DataKey::TotalRevenue, &new_revenue);

        let fee_token: Address = env.storage().instance().get(&DataKey::FeeToken).expect("Not initialized");
        let token_client = token::Client::new(&env, &fee_token);
        token_client.transfer(&env.current_contract_address(), &admin, &amount);
        
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// Read-Only: Get total revenue
    pub fn get_total_revenue(env: Env) -> i128 {
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
        env.storage().instance().get(&DataKey::TotalRevenue).unwrap_or(0)
    }

    /// Read-Only: Get user's balance
    pub fn get_balance(env: Env, user: Address) -> i128 {
        let key = DataKey::Balance(user.clone());
        let bal = env.storage().persistent().get(&key).unwrap_or(0);
        if env.storage().persistent().has(&key) {
             env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
        }
        bal
    }

    /// Read-Only: Get user's subscription
    pub fn get_subscription(env: Env, user: Address) -> Option<UserSubscription> {
        let key = DataKey::UserSub(user.clone());
        let sub = env.storage().persistent().get(&key);
        if env.storage().persistent().has(&key) {
             env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
        }
        sub
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, Address};
    use soroban_sdk::token;

    #[test]
    fn test_deposit_and_subscribe() {
        let env = Env::default();
        env.mock_all_auths();

        let auth_admin = Address::generate(&env);
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let consumer = Address::generate(&env);
        
        let token_id = env.register_stellar_asset_contract_v2(auth_admin.clone()).address();
        let token_client = token::Client::new(&env, &token_id);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
        token_admin_client.mint(&user, &1000);

        let contract_id = env.register_contract(None, crate::Web3GuardTreasuryContract);
        let client = Web3GuardTreasuryContractClient::new(&env, &contract_id);

        client.initialize(&admin, &token_id);
        client.set_tier_pricing(&1, &100, &10, &false);
        client.authorize_consumer(&consumer);

        // User deposits
        client.deposit(&user, &500);
        assert_eq!(client.get_balance(&user), 500);
        assert_eq!(token_client.balance(&user), 500);
        assert_eq!(token_client.balance(&contract_id), 500);

        // User buys subscription
        client.buy_subscription(&user, &1);
        assert_eq!(client.get_balance(&user), 400);
        assert_eq!(client.get_total_revenue(), 100);

        // Consumer deducts
        client.consume_audit(&consumer, &user);
        let sub = client.get_subscription(&user).unwrap();
        assert_eq!(sub.audits_remaining, 9);

        // Admin withdraws revenue
        client.admin_withdraw(&100);
        assert_eq!(client.get_total_revenue(), 0);
        assert_eq!(token_client.balance(&admin), 100);
    }
}
