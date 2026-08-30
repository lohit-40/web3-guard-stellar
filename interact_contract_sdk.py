import json
import time
import os
from stellar_sdk import Keypair, TransactionBuilder, Network, SorobanServer
from stellar_sdk.soroban_rpc import SendTransactionStatus, GetTransactionStatus
from stellar_sdk import scval

SOROBAN_RPC = "https://soroban-testnet.stellar.org"
CONTRACT_ID = "CAB4ZTQ2A7HIBTTY55JZ6P2SLFNQXPVZCZBSY33DIJ6G4A3HZPN44X5P"
soroban_server = SorobanServer(SOROBAN_RPC)

with open("testnet_keys.json", "r") as f:
    keys = json.load(f)

print(f"Loaded {len(keys)} keypairs. Starting interactions...")

success_count = 0

for i, kp_data in enumerate(keys):
    secret = kp_data["secret"]
    public = kp_data["public"]
    
    stellar_keypair = Keypair.from_secret(secret)
    
    # Generate some fake data for the audit
    audit_hash = f"abcdef{i}1234567890abcdef{i}1234567890abcdef{i}"[:32]
    program_id = f"CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX{i:02d}"
    risk_level = "LOW" if i % 3 == 0 else "MEDIUM"
    vulns = i % 5
    
    print(f"[{i+1}/50] Invoking with {public}...")
    
    try:
        source_account = soroban_server.load_account(public)
        
        args = [
            scval.to_address(public),
            scval.to_string(audit_hash),
            scval.to_string(program_id),
            scval.to_string(risk_level),
            scval.to_uint32(vulns),
        ]
        
        tx = (
            TransactionBuilder(
                source_account=source_account,
                network_passphrase=Network.TESTNET_NETWORK_PASSPHRASE,
                base_fee=3000,
            )
            .append_invoke_contract_function_op(
                contract_id=CONTRACT_ID,
                function_name="store_proof",
                parameters=args,
            )
            .set_timeout(30)
            .build()
        )
        
        tx = soroban_server.prepare_transaction(tx)
        tx.sign(stellar_keypair)
        
        response = soroban_server.send_transaction(tx)
        if response.status != SendTransactionStatus.ERROR:
            # Wait for finalization
            hash_id = response.hash
            for _ in range(15):
                time.sleep(4)
                tx_res = soroban_server.get_transaction(hash_id)
                if tx_res.status == GetTransactionStatus.SUCCESS:
                    print(f"  -> SUCCESS! Hash: {hash_id}")
                    success_count += 1
                    break
                elif tx_res.status == GetTransactionStatus.FAILED:
                    print(f"  -> ERROR during finalization.")
                    break
        else:
            print(f"  -> Failed: {response.error_result_xdr}")
            
    except Exception as e:
        print(f"  -> Exception: {e}")
    
    time.sleep(2)  # Rate limiting

print(f"Finished! {success_count}/{len(keys)} successful interactions.")
