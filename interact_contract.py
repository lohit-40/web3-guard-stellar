import json
import os
import subprocess
import time

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr

with open("testnet_keys.json", "r") as f:
    keys = json.load(f)

print(f"Loaded {len(keys)} keypairs. Starting interactions...")

# The contract on testnet
contract_id = "CAB4ZTQ2A7HIBTTY55JZ6P2SLFNQXPVZCZBSY33DIJ6G4A3HZPN44X5P"

success_count = 0

for i, kp in enumerate(keys):
    secret = kp["secret"]
    public = kp["public"]
    
    # store_proof(env: Env, caller: Address, audit_hash: String, program_id: String, risk_level: String, vuln_count: u32)
    # Generate some fake data for the audit
    audit_hash = f"abcdef{i}1234567890abcdef{i}1234567890abcdef{i}"[:32]
    program_id = f"CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX{i:02d}"
    risk_level = "LOW" if i % 3 == 0 else "MEDIUM"
    vulns = i % 5
    
    print(f"[{i+1}/50] Invoking with {public}...")
    
    # First, let's use the CLI directly.
    # Note: stellar-cli might require the network to be explicitly set.
    cmd = (
        f"stellar contract invoke "
        f"--id {contract_id} "
        f"--source {secret} "
        f"--network testnet -- "
        f"store_proof "
        f"--caller {public} "
        f"--audit_hash \"{audit_hash}\" "
        f"--program_id \"{program_id}\" "
        f"--risk_level \"{risk_level}\" "
        f"--vuln_count {vulns}"
    )
    
    code, out, err = run_cmd(cmd)
    
    if code == 0:
        print(f"  -> Success! Proof ID: {out.strip()}")
        success_count += 1
    else:
        print(f"  -> Failed: {err.strip()}")
    
    time.sleep(2)  # Rate limiting

print(f"Finished! {success_count}/{len(keys)} successful interactions.")
