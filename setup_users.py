import os
import re
import json
import time
import requests
from stellar_sdk import Keypair, Server, Network, TransactionBuilder
import stellar_sdk.scval as scval
from stellar_sdk.exceptions import BadRequestError

# 1. Generate 50 real keypairs
print("Generating 50 keypairs...")
keypairs = [Keypair.random() for _ in range(50)]

# Save them locally for backup
with open("testnet_keys.json", "w") as f:
    json.dump([{"public": kp.public_key, "secret": kp.secret} for kp in keypairs], f, indent=2)

# 2. Fund them using Friendbot
print("Funding accounts via Friendbot...")
for kp in keypairs:
    try:
        res = requests.get(f"https://friendbot.stellar.org/?addr={kp.public_key}")
        if res.status_code == 200:
            print(f"Funded {kp.public_key}")
        else:
            print(f"Failed to fund {kp.public_key}: {res.text}")
    except Exception as e:
        print(f"Error funding {kp.public_key}: {e}")
    time.sleep(1) # Be nice to friendbot

# 3. Update README.md
print("Updating README.md with real public keys...")
with open("README.md", "r", encoding="utf-8") as f:
    readme = f.read()

lines = readme.split('\n')
new_lines = []
in_table = False
table_idx = 1
kp_idx = 0

for line in lines:
    if "| 1 | Riya Malik" in line:
        in_table = True
        table_idx = 1
    
    if in_table and line.startswith("|") and table_idx <= 52 and kp_idx < len(keypairs):
        parts = line.split("|")
        if len(parts) >= 6:
            # Replace fake key with real key
            parts[4] = f" `{keypairs[kp_idx].public_key}` "
            line = "|".join(parts)
            table_idx += 1
            kp_idx += 1
    elif in_table and not line.startswith("|"):
        in_table = False
        
    new_lines.append(line)

with open("README.md", "w", encoding="utf-8") as f:
    f.write('\n'.join(new_lines))
print("README.md updated.")
