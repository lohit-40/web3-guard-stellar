#![cfg(test)]

use super::*;
use soroban_sdk::{Env, String, testutils::Address as _};

#[test]
fn test_store_and_get_proof() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, ProofOfAuditContract);
    let client = ProofOfAuditContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let caller = Address::generate(&env);

    // Initialize the contract
    client.initialize(&admin, &treasury);

    // Store a proof
    let audit_hash = String::from_str(&env, "abcdef1234567890abcdef1234567890");
    let program_id = String::from_str(&env, "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    let risk_level = String::from_str(&env, "LOW");
    
    let proof_id = client.store_proof(&caller, &audit_hash, &program_id, &risk_level, &0);
    assert_eq!(proof_id, 1);

    // Retrieve the proof
    let record = client.get_proof(&audit_hash).unwrap();
    assert_eq!(record.audit_hash, audit_hash);
    assert_eq!(record.program_id, program_id);
    assert_eq!(record.risk_level, risk_level);
    assert_eq!(record.vuln_count, 0);
    assert_eq!(record.caller, caller);
    assert_eq!(record.proof_id, 1);

    // Verify helper
    let exists = client.verify_proof(&audit_hash);
    assert_eq!(exists, true);

    // Check total proofs
    let total = client.total_proofs();
    assert_eq!(total, 1);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_double_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ProofOfAuditContract);
    let client = ProofOfAuditContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    
    client.initialize(&admin, &treasury);
    // Should panic here
    client.initialize(&admin, &treasury);
}
