import subprocess
import time
import json
import os

CONTRACT_ID = "CAB4ZTQ2A7HIBTTY55JZ6P2SLFNQXPVZCZBSY33DIJ6G4A3HZPN44X5P"
REPORT_FILE = "c:\\\\Users\\\\Asus\\\\Desktop\\\\bc-adv\\\\stellar_submission_v2\\\\interactions_report.md"

def run_cmd(cmd):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
        stdout = result.stdout.strip() if result.stdout else ""
        stderr = result.stderr.strip() if result.stderr else ""
        return stdout, stderr, result.returncode
    except Exception as e:
        return "", str(e), 1

def main():
    report = ["# 🚀 10 Testnet Wallets & Contract Interactions\n"]
    
    for i in range(1, 11):
        wallet_alias = f"test_wallet_gen_{i}"
        audit_hash = f"test_audit_hash_{i}_{int(time.time())}"
        program_id = f"prog_solana_{i}"
        risk = ["LOW", "MEDIUM", "HIGH", "CRITICAL"][i % 4]
        vuln = i * 2

        print(f"\n--- Processing Wallet {i}/10: {wallet_alias} ---")
        
        # 1. Generate Wallet
        print(f"Generating {wallet_alias}...")
        out, err, code = run_cmd(f"stellar keys generate {wallet_alias} --network testnet")
        
        # 2. Extract Public Key
        pubkey, _, _ = run_cmd(f"stellar keys address {wallet_alias}")
        
        # 3. Extract Secret Key from TOML
        toml_path = f"C:\\Users\\Asus\\.config\\stellar\\identity\\{wallet_alias}.toml"
        secret = "unknown"
        if os.path.exists(toml_path):
            with open(toml_path, "r") as f:
                for line in f:
                    if "seed_phrase" in line:
                        secret = line.split("=")[1].strip().replace('"', '')
                        break
        
        # 4. Fund Wallet (usually stellar keys generate on testnet funds it automatically, but let's be sure)
        print(f"Funding {wallet_alias}...")
        run_cmd(f"stellar keys fund {wallet_alias} --network testnet")

        # 5. Total Proofs (Read-only as Tx)
        print("Invoking total_proofs...")
        total_cmd = f"stellar contract invoke --id {CONTRACT_ID} --source {wallet_alias} --network testnet --send=yes -- total_proofs"
        total_out, total_err, _ = run_cmd(total_cmd)

        # 6. Verify Proof (Read-only as Tx)
        print("Invoking verify_proof...")
        verify_cmd = f"stellar contract invoke --id {CONTRACT_ID} --source {wallet_alias} --network testnet --send=yes -- verify_proof --audit_hash {audit_hash}"
        verify_out, verify_err, _ = run_cmd(verify_cmd)

        # 7. Get Proof (Read-only as Tx)
        print("Invoking get_proof...")
        get_cmd = f"stellar contract invoke --id {CONTRACT_ID} --source {wallet_alias} --network testnet --send=yes -- get_proof --audit_hash {audit_hash}"
        get_out, get_err, _ = run_cmd(get_cmd)
        
        # Format the report section for this wallet
        report.append(f"## {wallet_alias}")
        report.append(f"**Public Key:** `{pubkey}`")
        report.append(f"**Secret Phrase:** `{secret}`")
        report.append("")
        report.append("### Interactions")
        
        report.append(f"**1. `total_proofs` (Read-only as Tx)**")
        report.append("```text")
        report.append(total_out.replace('\\n', '\n'))
        report.append("```\n")

        report.append(f"**2. `verify_proof` (Read-only as Tx)**")
        report.append("```text")
        report.append(verify_out.replace('\\n', '\n'))
        report.append("```\n")

        report.append(f"**3. `get_proof` (Read-only as Tx)**")
        report.append("```text")
        report.append(get_out.replace('\\n', '\n'))
        report.append("```\n")
        
        report.append("---\n")
        
        time.sleep(2) # Prevent rate limiting

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(report))
        
    print(f"Done! Report saved to {REPORT_FILE}")

if __name__ == "__main__":
    main()
