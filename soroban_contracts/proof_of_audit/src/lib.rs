#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Address, IntoVal};

// ─── Constants ─────────────────────────────────────────────────────────────────

// ~30 days in ledgers (assuming 5 seconds per ledger)
const LEDGER_THRESHOLD_INSTANCE: u32 = 100_000;
const LEDGER_TTL_INSTANCE: u32 = 500_000;

const LEDGER_THRESHOLD_PERSISTENT: u32 = 100_000;
const LEDGER_TTL_PERSISTENT: u32 = 500_000;

// ─── Data Types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct AuditRecord {
    pub audit_hash: String, // SHA-256 of audit report
    pub program_id: String, // Audited program / contract address
    pub risk_level: String, // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    pub vuln_count: u32,    // Number of vulnerabilities found
    pub auditor: String,    // "Web3 Guard Autonomous Agent"
    pub timestamp: u64,     // Ledger timestamp
    pub proof_id: u64,      // Sequential proof number
    pub caller: Address,    // User submitting the audit
}

// Storage key types
#[contracttype]
pub enum DataKey {
    Admin,         // Instance
    Treasury,      // Instance
    ProofCount,    // Instance
    Proof(String), // Persistent: audit_hash → AuditRecord
}

// ─── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ProofOfAuditContract;

#[contractimpl]
impl ProofOfAuditContract {
    /// Initialize the contract with an admin and the treasury contract address.
    /// Can only be called once.
    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        
        // Initialize proof count
        env.storage().instance().set(&DataKey::ProofCount, &0u64);
        
        // Extend instance TTL
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
    }

    /// Store a new audit proof on the Stellar ledger.
    /// Requires the user's signature (`caller.require_auth()`).
    /// Invokes the Treasury contract to consume 1 audit from their subscription quota.
    pub fn store_proof(
        env: Env,
        caller: Address,
        audit_hash: String,
        program_id: String,
        risk_level: String,
        vuln_count: u32,
    ) -> u64 {
        caller.require_auth();

        // Cross-contract call to Treasury to consume audit
        let treasury: Address = env.storage().instance().get(&DataKey::Treasury).expect("Not initialized");
        let args = soroban_sdk::vec![&env, env.current_contract_address().into_val(&env), caller.into_val(&env)];
        env.invoke_contract::<()>(&treasury, &soroban_sdk::Symbol::new(&env, "consume_audit"), args);

        // Increment global proof counter
        let mut proof_id: u64 = env.storage().instance().get(&DataKey::ProofCount).expect("Not initialized");
        proof_id += 1;

        let record = AuditRecord {
            audit_hash: audit_hash.clone(),
            program_id,
            risk_level,
            vuln_count,
            auditor: String::from_str(&env, "Web3 Guard Autonomous Agent"),
            timestamp: env.ledger().timestamp(),
            proof_id,
            caller: caller.clone(),
        };

        // Persist: audit_hash → record in Persistent storage (prevents instance bloating)
        let proof_key = DataKey::Proof(audit_hash.clone());
        env.storage().persistent().set(&proof_key, &record);
        // Extend TTL for this specific persistent entry
        env.storage().persistent().extend_ttl(&proof_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);

        // Persist updated counter in Instance storage
        env.storage().instance().set(&DataKey::ProofCount, &proof_id);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);

        // Emit event for indexers / explorers to pick up
        env.events()
            .publish((symbol_short!("audit"), symbol_short!("stored")), proof_id);

        proof_id
    }

    /// Retrieve a stored audit proof by its hash.
    /// Returns None if not found (never audited).
    pub fn get_proof(env: Env, audit_hash: String) -> Option<AuditRecord> {
        let proof_key = DataKey::Proof(audit_hash);
        if let Some(record) = env.storage().persistent().get::<_, AuditRecord>(&proof_key) {
            // Bump TTL on read to keep active records alive
            env.storage().persistent().extend_ttl(&proof_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
            Some(record)
        } else {
            None
        }
    }

    /// Return the total number of proofs stored in this contract.
    pub fn total_proofs(env: Env) -> u64 {
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD_INSTANCE, LEDGER_TTL_INSTANCE);
        env.storage().instance().get(&DataKey::ProofCount).unwrap_or(0u64)
    }

    /// Check if a given audit hash has been stored (verification helper).
    pub fn verify_proof(env: Env, audit_hash: String) -> bool {
        let proof_key = DataKey::Proof(audit_hash);
        if env.storage().persistent().has(&proof_key) {
            env.storage().persistent().extend_ttl(&proof_key, LEDGER_THRESHOLD_PERSISTENT, LEDGER_TTL_PERSISTENT);
            true
        } else {
            false
        }
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String, Address};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        
        let contract_id = env.register_contract(None, crate::ProofOfAuditContract);
        let client = ProofOfAuditContractClient::new(&env, &contract_id);

        client.initialize(&admin, &treasury);
        assert_eq!(client.total_proofs(), 0);
    }

    #[test]
    fn test_missing_proof_returns_none() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        
        let contract_id = env.register(crate::ProofOfAuditContract, ());
        let client = ProofOfAuditContractClient::new(&env, &contract_id);
        client.initialize(&admin, &treasury);

        let missing = String::from_str(&env, "nonexistent_hash");
        assert!(client.get_proof(&missing).is_none());
        assert!(!client.verify_proof(&missing));
    }

    #[contract]
    pub struct MockTreasury;

    #[contractimpl]
    impl MockTreasury {
        pub fn consume_audit(_env: Env, _consumer: Address, user: Address) {
            user.require_auth();
            // Mock success
        }
    }

    #[test]
    fn test_store_and_retrieve_proof() {
        let env = Env::default();
        env.mock_all_auths();
        
        let admin = Address::generate(&env);
        let caller = Address::generate(&env);
        let treasury_id = env.register(MockTreasury, ());
        
        let contract_id = env.register(crate::ProofOfAuditContract, ());
        let client = ProofOfAuditContractClient::new(&env, &contract_id);

        client.initialize(&admin, &treasury_id);

        let hash = String::from_str(&env, "abc123deadbeef");
        let program = String::from_str(&env, "GABCDEF123456");
        let risk = String::from_str(&env, "HIGH");

        // Store a proof
        let proof_id = client.store_proof(&caller, &hash, &program, &risk, &3u32);
        assert_eq!(proof_id, 1);

        // Retrieve it
        let record = client.get_proof(&hash).unwrap();
        assert_eq!(record.vuln_count, 3);
        assert_eq!(record.proof_id, 1);
        assert_eq!(record.caller, caller.clone());

        assert!(client.verify_proof(&hash));
        assert_eq!(client.total_proofs(), 1);
    }
}
