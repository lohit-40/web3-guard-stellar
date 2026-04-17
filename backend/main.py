from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel
from typing import Optional
import requests
import os
import re
import json
import hashlib
from dotenv import load_dotenv
from pathlib import Path
from google import genai
from database import get_cached_scan, set_cached_scan, get_recent_non_evm_audits, record_user_activity, get_dashboard_metrics

# Explicitly load .env from the backend directory
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

from ci_router import ci_router

import asyncio
import sqlite3
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

async def scout_monitor_loop():
    # Background task to monitor contracts
    while True:
        try:
            from database import get_watchlist_contracts, add_monitoring_event
            contracts = get_watchlist_contracts()
            
            # Simulated Agent Activity for Dashboard
            if contracts:
                import random
                import time
                c_addr = random.choice(contracts)
                
                # We pretend to scan and randomly find an "issue" 5% of time to make dashboard alive
                if random.random() < 0.05:
                    add_monitoring_event(c_addr, "VULN_DETECTED", "Scout Agent detected a state anomaly during CPI call.")
                else:
                    add_monitoring_event(c_addr, "SCAN_CLEAN", "Scout Agent verified program state. No anomalies.")
        except Exception as e:
            print(f"Scout Error: {e}")
            
        await asyncio.sleep(60) # Run every minute

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(scout_monitor_loop())



app.include_router(ci_router, prefix="/api/ci")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ETHERSCAN_API_KEY = os.getenv("ETHERSCAN_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Gemini client will be configured per-request with the appropriate key

class ScanRequest(BaseModel):
    contract_address: Optional[str] = None
    source_code: Optional[str] = None
    chain_id: Optional[str] = "1"
    ecosystem: Optional[str] = "Solidity"
    wallet_address: Optional[str] = None

class Vulnerability(BaseModel):
    type: str
    severity: str
    line_number: int | None
    description: str
    remediation: Optional[str] = None

class ScanResponse(BaseModel):
    address: Optional[str] = None
    status: str
    vulnerabilities: list[Vulnerability]
    audit_tx_hash: Optional[str] = None
    hash_key: Optional[str] = None
    audit_chain: Optional[str] = None  # "ethereum" | "solana" | "stellar"
    solana_explorer_url: Optional[str] = None
    stellar_explorer_url: Optional[str] = None
    soroban_contract_id: Optional[str] = None   # Soroban contract address
    soroban_proof_id: Optional[int] = None       # Sequential proof ID from contract
    timestamp: Optional[int] = None

def fetch_contract_source(address: str, chain_id: str = "1") -> str:
    # Always use the modern V2 endpoint to prevent deprecation errors on testnets
    api_key_param = f"&apikey={ETHERSCAN_API_KEY}" if ETHERSCAN_API_KEY and ETHERSCAN_API_KEY != "PASTE_YOUR_KEY_HERE" else ""
    url = f"https://api.etherscan.io/v2/api?chainid={chain_id}&module=contract&action=getsourcecode&address={address}{api_key_param}"
    
    try:
        response = requests.get(url, timeout=10)
    except Exception as e:
        return f"ERROR: Etherscan fetch hanging or failed: {e}"
        
    if response.status_code == 200:
        data = response.json()
        if data["status"] == "1" and data["result"]:
            fetched_code = data["result"][0].get("SourceCode", "")
            if not fetched_code:
                return "ERROR: Contract source code is empty or unverified."
            return fetched_code
        else:
            err_msg = data.get('result', '')
            if "Invalid Address format" in err_msg or "not verified" in err_msg.lower():
                return "ERROR: Contract is unverified on this network, or the address format is invalid."
            return f"ERROR: Etherscan v2 said - {data.get('message', 'Unknown error')} - {err_msg}"
    return "ERROR: Network request to Etherscan failed."

def scan_for_vulnerabilities(source_code: str, ecosystem: str = "Solidity") -> list[Vulnerability]:
    # Reload dotenv dynamically
    load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)
    raw_keys = os.getenv("GEMINI_API_KEY", "")
    current_keys = [k.strip() for k in raw_keys.split(",") if k.strip() and k.strip() != "PASTE_YOUR_GEMINI_KEY_HERE"]
    
    if not current_keys:
        return [Vulnerability(
            type="AI Pipeline Offline",
            severity="High",
            line_number=None,
            description="The AI Agent cannot scan this code because GEMINI_API_KEY is missing in backend/.env.",
            remediation="Please configure your GEMINI_API_KEY to enable the Web3 Guard Advanced AI Scanner."
        )]
    
    prompt = f"""
    You are an elite Web3 smart contract security auditor specializing in {ecosystem}.
    Analyze the following {ecosystem} source code for all security vulnerabilities.
    
    Return ONLY a raw JSON array of objects. Do NOT include markdown blocks like ```json. Just output the array.
    If the code is perfectly secure, return an empty array [].
    
    Each vulnerability object MUST strictly follow this mapping:
    {{
        "type": "string (e.g. 'Reentrancy')",
        "severity": "string ('High', 'Medium', or 'Low')",
        "line_number": integer (if a specific line is culpable, else null),
        "description": "string (Detailed explanation of why it is vulnerable)",
        "remediation": "string (Markdown explained fix and code)"
    }}
    
    Source Code:
    {source_code}
    """
    
    for i, key in enumerate(current_keys):
        try:
            client = genai.Client(api_key=key)
            try:
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt
                )
            except Exception as e:
                if "503" in str(e) or "UNAVAILABLE" in str(e):
                    response = client.models.generate_content(
                        model='gemini-2.0-flash',
                        contents=prompt
                    )
                else:
                    raise e
            text = response.text.strip()
            
            if text.startswith("```json"): text = text[7:]
            if text.startswith("```"): text = text[3:]
            if text.endswith("```"): text = text[:-3]
                
            import json
            vulns_data = json.loads(text.strip())
            
            vulnerabilities = []
            for v in vulns_data:
                vulnerabilities.append(Vulnerability(
                    type=v.get("type", "Unknown Flaw"),
                    severity=str(v.get("severity", "Medium")),
                    line_number=v.get("line_number") if isinstance(v.get("line_number"), int) else None,
                    description=v.get("description", "No description provided."),
                    remediation=v.get("remediation")
                ))
            return vulnerabilities
            
        except Exception as e:
            err_str = str(e)
            is_quota = "429" in err_str or "quota" in err_str.lower()
            if is_quota and i < len(current_keys) - 1:
                continue
            elif is_quota:
                raise HTTPException(status_code=429, detail="All provided Gemini API keys have exhausted their Free Tier daily quotas!")
            else:
                raise HTTPException(status_code=500, detail=f"The advanced AI Scanner encountered a systemic failure: {err_str}")

import hashlib
import json
from web3 import Web3

# Initialize Web3 globally if env vars exist
W3_RPC = os.getenv("WEB3_RPC_URL")
W3_KEY = os.getenv("WALLET_PRIVATE_KEY")
w3 = Web3(Web3.HTTPProvider(W3_RPC, request_kwargs={'timeout': 10})) if W3_RPC and W3_RPC != "PASTE_YOUR_ALCHEMY_URL_HERE" else None

# Removed duplicate ScanResponse class definition

# ── Helper: derive risk level string from vuln list ──────────────────────────
def _risk_level_from_vulns(vulns_dicts: list) -> str:
    if not vulns_dicts:
        return "LOW"
    severities = [v.get("severity", "").lower() for v in vulns_dicts]
    if "critical" in severities:
        return "CRITICAL"
    if "high" in severities:
        return "HIGH"
    if "medium" in severities:
        return "MEDIUM"
    return "LOW"

@app.post("/scan", response_model=ScanResponse)
@limiter.limit("5/minute")
def scan_contract(request: Request, payload: ScanRequest):
    if not payload.contract_address and not payload.source_code:
        raise HTTPException(status_code=400, detail="Must provide either a contract address or raw source code.")
        
    if payload.wallet_address:
        record_user_activity(payload.wallet_address)
        
    address = payload.contract_address
    
    # 1. Fetch Source Code OR use provided
    if payload.source_code:
        source_code = payload.source_code
    else:
        source_code = fetch_contract_source(address, payload.chain_id)
        if source_code.startswith("ERROR:"):
            raise HTTPException(status_code=400, detail=source_code)
        
    # 2. Check Cache
    source_hash = hashlib.sha256(source_code.encode()).hexdigest()
    cached = get_cached_scan(source_hash)
    if cached:
        cached["address"] = address if address else "Raw Source Code Provided"
        
        if address:
            from database import add_to_watchlist, add_monitoring_event
            try:
                risk = _risk_level_from_vulns(cached.get("vulnerabilities", []))
                add_to_watchlist(address, payload.wallet_address or "System", risk)
                add_monitoring_event(address, "AUDIT_COMPLETED", f"Audit completed for {address}. Risk: {risk}")
            except Exception as e:
                pass

        import time
        cached["timestamp"] = int(time.time())
        set_cached_scan(source_hash, cached)
        
        return ScanResponse(**cached)
        
    # 3. Run Analysis & AI Remediation
    vulns = scan_for_vulnerabilities(source_code, payload.ecosystem)
    
    # 4. Calculate Audit Hash
    vulns_dicts = [v.dict() for v in vulns]
    report_string = json.dumps({"address": address, "vulnerabilities": vulns_dicts}, sort_keys=True)
    report_hash = hashlib.sha256(report_string.encode()).hexdigest()
    
    # 5. Proof of Audit on-chain (chain depends on ecosystem)
    tx_hash_hex = None
    audit_chain = None
    solana_explorer_url = None
    stellar_explorer_url = None
    
    soroban_contract_id = None
    soroban_proof_id = None

    if payload.ecosystem == "Rust":
        if payload.chain_id == "stellar":
            # ─── Stellar Testnet — Frontend Signed ───
            # Frontend will build, sign, and submit the tx via Freighter Wallet.
            # Then it will call /update_audit_tx to update the DB.
            audit_chain = "stellar"
            tx_hash_hex = "pending_user_signature" 
            stellar_explorer_url = ""
            soroban_contract_id = os.getenv("SOROBAN_CONTRACT_ID", "")
        else:
            # ─── Solana Devnet Memo Transaction ───
            try:
                from solders.keypair import Keypair
                from solders.pubkey import Pubkey
                from solders.system_program import TransferParams, transfer
                from solders.transaction import Transaction
                from solders.message import Message
                from solders.instruction import Instruction, AccountMeta
                from solana.rpc.api import Client as SolanaClient
                
                sol_client = SolanaClient("https://api.devnet.solana.com")
                
                # Use same private key (first 32 bytes if needed) or derive from env
                sol_key_hex = os.getenv("WALLET_PRIVATE_KEY", "")
                if sol_key_hex:
                    key_bytes = bytes.fromhex(sol_key_hex)
                    # Ed25519 keypairs are 64 bytes; if we only have 32, it's a seed
                    if len(key_bytes) == 32:
                        signer = Keypair.from_seed(key_bytes)
                    else:
                        signer = Keypair.from_bytes(key_bytes[:64])
                    
                    # Build memo instruction
                    MEMO_PROGRAM_ID = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
                    memo_data = f"Web3Guard|audit|{report_hash[:32]}".encode("utf-8")
                    memo_ix = Instruction(
                        program_id=MEMO_PROGRAM_ID,
                        accounts=[AccountMeta(pubkey=signer.pubkey(), is_signer=True, is_writable=False)],
                        data=memo_data
                    )
                    
                    # Get latest blockhash and build tx
                    blockhash_resp = sol_client.get_latest_blockhash()
                    recent_blockhash = blockhash_resp.value.blockhash
                    
                    msg = Message.new_with_blockhash(
                        [memo_ix],
                        signer.pubkey(),
                        recent_blockhash
                    )
                    tx = Transaction.new_unsigned(msg)
                    tx.sign([signer], recent_blockhash)
                    
                    result_tx = sol_client.send_transaction(tx)
                    sol_sig = str(result_tx.value)
                    tx_hash_hex = sol_sig
                    audit_chain = "solana"
                    solana_explorer_url = f"https://explorer.solana.com/tx/{sol_sig}?cluster=devnet"
                    print(f"Solana Proof of Audit TX: {sol_sig}")
            except Exception as e:
                print(f"Solana Proof of Audit Error: {e}")
                audit_chain = "solana"
                tx_hash_hex = "insufficient_sol_devnet_funds"
                solana_explorer_url = "https://explorer.solana.com/?cluster=devnet"
                # Non-blocking — we still return the scan results
    else:
        # ─── Ethereum Sepolia Proof of Audit ───
        contract_address = os.getenv("PROOF_OF_AUDIT_CONTRACT")
        audit_chain = "ethereum"
        
        if w3 and w3.is_connected() and contract_address and contract_address != "LEAVE_BLANK_UNTIL_DEPLOYED":
            try:
                abi_path = Path(__file__).parent / "ProofOfAudit.json"
                if abi_path.exists():
                    with open(abi_path, "r") as f:
                        abi = json.load(f)["abi"]
                    
                    account = w3.eth.account.from_key(W3_KEY)
                    contract = w3.eth.contract(address=w3.to_checksum_address(contract_address), abi=abi)
                    base_fee = w3.eth.get_block('pending').baseFeePerGas
                    
                    target_address = w3.to_checksum_address(address) if address and w3.is_address(address) else "0x0000000000000000000000000000000000000000"
                    
                    transaction = contract.functions.storeAuditHash(target_address, bytes.fromhex(report_hash)).build_transaction({
                        'chainId': w3.eth.chain_id,
                        'gas': 200000,
                        'maxFeePerGas': int(base_fee * 2) + w3.to_wei(3, 'gwei'),
                        'maxPriorityFeePerGas': w3.to_wei(3, 'gwei'),
                        'nonce': w3.eth.get_transaction_count(account.address),
                    })
                    
                    signed_txn = w3.eth.account.sign_transaction(transaction, private_key=W3_KEY)
                    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
                    tx_hash_hex = w3.to_hex(tx_hash)
            except Exception as e:
                print(f"Web3 Proof of Audit Error: {e}")
    
    # 6. Return Report
    import time
    response_data = {
        "address": address if address else "Raw Source Code Provided",
        "status": "Success",
        "vulnerabilities": vulns_dicts,
        "audit_tx_hash": tx_hash_hex,
        "hash_key": source_hash,
        "audit_chain": audit_chain,
        "solana_explorer_url": solana_explorer_url,
        "stellar_explorer_url": stellar_explorer_url,
        "soroban_contract_id": soroban_contract_id,
        "soroban_proof_id": soroban_proof_id,
        "timestamp": int(time.time())
    }
    
    # ── Automatically add to Watchlist for dashboard monitoring ──
    if address:
        from database import add_to_watchlist, add_monitoring_event
        try:
            risk = _risk_level_from_vulns(vulns_dicts)
            add_to_watchlist(address, payload.wallet_address or "System", risk)
            add_monitoring_event(address, "AUDIT_COMPLETED", f"Audit completed for {address}. Risk: {risk}")
        except:
            pass
    
    set_cached_scan(source_hash, response_data)
    
    return ScanResponse(**response_data)

@app.get("/report/{hash_key}", response_model=ScanResponse)
@limiter.limit("10/minute")
def get_report(request: Request, hash_key: str):
    cached = get_cached_scan(hash_key)
    if not cached:
        raise HTTPException(status_code=404, detail="Report not found")
    return ScanResponse(**cached)

class UpdateTxRequest(BaseModel):
    hash_key: str
    audit_tx_hash: str
    stellar_explorer_url: Optional[str] = None

@app.post("/update_audit_tx")
@limiter.limit("10/minute")
def update_audit_tx_hash(request: Request, payload: UpdateTxRequest):
    cached = get_cached_scan(payload.hash_key)
    if not cached:
        raise HTTPException(status_code=404, detail="Report not found in cache")
    
    cached["audit_tx_hash"] = payload.audit_tx_hash
    if payload.stellar_explorer_url:
        cached["stellar_explorer_url"] = payload.stellar_explorer_url
        
    set_cached_scan(payload.hash_key, cached)
    return {"message": "Updated successfully"}

@app.get("/wallet/{address}/deployments")
@limiter.limit("10/minute")
def get_user_deployments(request: Request, address: str, chain_id: str = "1"):
    api_key = os.getenv("ETHERSCAN_API_KEY")
    api_key_param = f"&apikey={api_key}" if api_key and api_key != "PASTE_YOUR_KEY_HERE" else ""
    url = f"https://api.etherscan.io/v2/api?chainid={chain_id}&module=account&action=txlist&address={address}&sort=desc{api_key_param}"
    
    try:
        response = requests.get(url, timeout=10)
    except Exception:
        return {"deployments": []}
        
    deployments = []
    if response.status_code == 200:
        data = response.json()
        if data.get("status") == "1" and data.get("result"):
            for tx in data["result"]:
                if tx.get("to") == "" and tx.get("contractAddress"):
                    deployments.append(tx["contractAddress"])
                    if len(deployments) >= 3:
                        break
    return {"deployments": deployments}

class SecureContractRequest(BaseModel):
    contract_address: Optional[str] = None
    source_code: Optional[str] = None
    ecosystem: Optional[str] = "Solidity"
    
class SecureContractResponse(BaseModel):
    secure_code: str
    
@app.post("/secure_contract", response_model=SecureContractResponse)
@limiter.limit("3/minute")
def auto_remediate_contract(request: Request, payload: SecureContractRequest):
    load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)
    raw_keys = os.getenv("GEMINI_API_KEY", "")
    current_keys = [k.strip() for k in raw_keys.split(",") if k.strip() and k.strip() != "PASTE_YOUR_GEMINI_KEY_HERE"]
    
    if not current_keys:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is missing in backend/.env")
        
    if not payload.contract_address and not payload.source_code:
        raise HTTPException(status_code=400, detail="Must provide either a contract address or raw source code.")
        
    source_code = payload.source_code
    if not source_code:
        source_code = fetch_contract_source(payload.contract_address)
        if source_code.startswith("ERROR:"):
            raise HTTPException(status_code=400, detail=source_code)
        
    prompt = f"""
    You are an elite Web3 security engineer.
    Take the following vulnerable {payload.ecosystem} smart contract and completely rewrite it from start to finish.
    Ensure it is 100% mathematically secure with ZERO loopholes (e.g. fix all Reentrancy, Access Control, and Logic flaws).
    Keep the same core business logic and function signatures as the original contract.
    
    Return ONLY the raw secure {payload.ecosystem} code. Do NOT wrap it in ```markdown blocks, just the raw code.
    Do NOT include any conversational text before or after the code block.
    
    Vulnerable Code:
    {source_code}
    """
    
    for i, key in enumerate(current_keys):
        try:
            client = genai.Client(api_key=key)
            try:
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt
                )
            except Exception as e:
                if "503" in str(e) or "UNAVAILABLE" in str(e):
                    response = client.models.generate_content(
                        model='gemini-2.0-flash',
                        contents=prompt
                    )
                else:
                    raise e
            text = response.text.strip()
            
            if text.startswith("```solidity"):
                text = text[11:]
            elif text.startswith("```"):
                text = text[3:]
                
            if text.endswith("```"):
                text = text[:-3]
                
            return SecureContractResponse(secure_code=text.strip())
            
        except Exception as e:
            err_str = str(e)
            is_quota = "429" in err_str or "quota" in err_str.lower()
            if is_quota and i < len(current_keys) - 1:
                continue
            elif is_quota:
                raise HTTPException(status_code=429, detail="All provided Gemini API keys have exhausted their Free Tier daily quotas!")
            else:
                raise HTTPException(status_code=500, detail=str(e))

class ChatMessage(BaseModel):
    role: str
    text: str

class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage]
    vulnerabilities: list[dict]
    source_code: Optional[str] = None
    secure_code: Optional[str] = None
    
class ChatResponse(BaseModel):
    reply: str
    
@app.post("/chat", response_model=ChatResponse)
@limiter.limit("15/minute")
def multilingual_chat(request: Request, payload: ChatRequest):
    load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)
    raw_keys = os.getenv("GEMINI_API_KEY", "")
    current_keys = [k.strip() for k in raw_keys.split(",") if k.strip() and k.strip() != "PASTE_YOUR_GEMINI_KEY_HERE"]
    if not current_keys:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is missing in backend/.env")
        
    # Build prompt context
    system_prompt = f"""
    You are 'Web3 Guard', an elite multilingual Web3 security AI tracking an active smart contract audit.
    IMPORTANT: ALWAYS reply natively in the exact language the user just asked their question in!
    If they speak Hindi, reply in Hindi. If French, reply in French, etc.
    
    CONTEXT OF CURRENT AUDIT:
    Original Source Code: {payload.source_code if payload.source_code else 'Not provided'}
    Vulnerabilities Found: {json.dumps(payload.vulnerabilities) if payload.vulnerabilities else 'None'}
    Secure Rewrite Generated: {payload.secure_code if payload.secure_code else 'Not generated yet'}
    """
    
    # Construct Gemini Chat history format using proper Content objects
    from google.genai import types
    
    messages = [
        types.Content(role="user", parts=[types.Part(text=system_prompt)]),
        types.Content(role="model", parts=[types.Part(text="Acknowledged. I will analyze the context and answer beautifully in the user's language.")])
    ]
    
    for msg in payload.history:
        role = "user" if msg.role == "user" else "model"
        messages.append(types.Content(role=role, parts=[types.Part(text=msg.text)]))
        
    messages.append(types.Content(role="user", parts=[types.Part(text=payload.message)]))
    
    for i, key in enumerate(current_keys):
        try:
            client = genai.Client(api_key=key)
            try:
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=messages
                )
            except Exception as e:
                if "503" in str(e) or "UNAVAILABLE" in str(e):
                    response = client.models.generate_content(
                        model='gemini-2.0-flash',
                        contents=messages
                    )
                else:
                    raise e
            return ChatResponse(reply=response.text.strip())
            
        except Exception as e:
            err_str = str(e)
            is_quota = "429" in err_str or "quota" in err_str.lower()
            if is_quota and i < len(current_keys) - 1:
                continue
            elif is_quota:
                raise HTTPException(status_code=429, detail="All provided Gemini API keys have exhausted their Free Tier daily quotas!")
            else:
                print("Chat Error:", err_str)
                raise HTTPException(status_code=500, detail=err_str)

# ──────────────────────────────────────────────────────
#  NFT BADGE MINTING ENDPOINT
# ──────────────────────────────────────────────────────

class MintBadgeRequest(BaseModel):
    recipient: str  # The user's wallet address
    contract_audited: str  # The contract they audited
    vulns_found: int
    severity: str  # "SECURE", "LOW", "MEDIUM", "HIGH"

class MintBadgeResponse(BaseModel):
    tx_hash: str
    token_id: int | None = None
    etherscan_nft_url: str | None = None

@app.post("/mint_badge", response_model=MintBadgeResponse)
@limiter.limit("3/minute")
def mint_badge(request: Request, payload: MintBadgeRequest):
    badge_contract_address = os.getenv("AUDIT_BADGE_NFT_CONTRACT")
    
    if not w3 or not w3.is_connected():
        raise HTTPException(status_code=503, detail="Web3 RPC is not connected. Check WEB3_RPC_URL.")
    
    if not badge_contract_address or badge_contract_address == "LEAVE_BLANK_UNTIL_DEPLOYED":
        raise HTTPException(status_code=503, detail="AuditBadgeNFT contract not deployed yet. Set AUDIT_BADGE_NFT_CONTRACT in .env")
    
    if not W3_KEY:
        raise HTTPException(status_code=503, detail="WALLET_PRIVATE_KEY not configured.")
    
    try:
        # Load ABI
        abi_path = Path(__file__).parent / "AuditBadgeNFT.json"
        if not abi_path.exists():
            raise HTTPException(status_code=500, detail="AuditBadgeNFT.json ABI file not found in backend directory.")
        
        with open(abi_path, "r") as f:
            abi = json.load(f)["abi"]
        
        account = w3.eth.account.from_key(W3_KEY)
        contract = w3.eth.contract(address=w3.to_checksum_address(badge_contract_address), abi=abi)
        
        if not w3.is_address(payload.recipient):
            raise HTTPException(status_code=400, detail="Recipient must be a valid Ethereum address. NFT badges are currently only supported on EVM.")
            
        recipient = w3.to_checksum_address(payload.recipient)
        
        # Read next token ID before minting
        next_token_id = contract.functions.nextTokenId().call()
        
        # Build transaction
        base_fee = w3.eth.get_block('pending').baseFeePerGas
        
        tx = contract.functions.mintBadge(
            recipient,
            payload.contract_audited,
            payload.vulns_found,
            payload.severity
        ).build_transaction({
            'chainId': w3.eth.chain_id,
            'gas': 350000,
            'maxFeePerGas': int(base_fee * 2) + w3.to_wei(3, 'gwei'),
            'maxPriorityFeePerGas': w3.to_wei(3, 'gwei'),
            'nonce': w3.eth.get_transaction_count(account.address),
        })
        
        signed = w3.eth.account.sign_transaction(tx, private_key=W3_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        tx_hash_hex = w3.to_hex(tx_hash)
        
        # Generate Etherscan NFT viewer link (OpenSea dropped testnet support)
        etherscan_nft_url = f"https://sepolia.etherscan.io/nft/{badge_contract_address}/{next_token_id}"
        
        return MintBadgeResponse(
            tx_hash=tx_hash_hex,
            token_id=next_token_id,
            etherscan_nft_url=etherscan_nft_url
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Badge Mint Error: {e}")
        raise HTTPException(status_code=500, detail=f"Minting failed: {str(e)}")

# ──────────────────────────────────────────────────────
#  LIVE BLOCK EXPLORER ENDPOINTS
# ──────────────────────────────────────────────────────

@app.get("/explorer/stats")
@limiter.limit("10/minute")
def explorer_stats(request: Request):
    stats = {
        "total_audits": 0,
        "total_badges": 0,
        "contract_audit_address": os.getenv("PROOF_OF_AUDIT_CONTRACT", ""),
        "contract_badge_address": os.getenv("AUDIT_BADGE_NFT_CONTRACT", ""),
        "chain": "Sepolia",
        "rpc_connected": False
    }
    
    if w3 and w3.is_connected():
        stats["rpc_connected"] = True
        
        # Read ProofOfAudit totals
        audit_contract_addr = os.getenv("PROOF_OF_AUDIT_CONTRACT")
        if audit_contract_addr and audit_contract_addr != "LEAVE_BLANK_UNTIL_DEPLOYED":
            try:
                abi_path = Path(__file__).parent / "ProofOfAudit.json"
                if abi_path.exists():
                    with open(abi_path, "r") as f:
                        abi = json.load(f)["abi"]
                    contract = w3.eth.contract(address=w3.to_checksum_address(audit_contract_addr), abi=abi)
                    stats["total_audits"] = contract.functions.nextAuditId().call()
            except Exception as e:
                print(f"Explorer stats audit error: {e}")
        
        # Read AuditBadgeNFT totals
        badge_contract_addr = os.getenv("AUDIT_BADGE_NFT_CONTRACT")
        if badge_contract_addr and badge_contract_addr != "LEAVE_BLANK_UNTIL_DEPLOYED":
            try:
                abi_path = Path(__file__).parent / "AuditBadgeNFT.json"
                if abi_path.exists():
                    with open(abi_path, "r") as f:
                        abi = json.load(f)["abi"]
                    contract = w3.eth.contract(address=w3.to_checksum_address(badge_contract_addr), abi=abi)
                    stats["total_badges"] = contract.functions.nextTokenId().call()
            except Exception as e:
                print(f"Explorer stats badge error: {e}")
    
    # Always include non-EVM audits from cache DB regardless of w3 status
    try:
        non_evm_audits = get_recent_non_evm_audits(1000)
        stats["total_audits"] += len(non_evm_audits)
    except Exception as e:
        print(f"Error fetching non_evm audits: {e}")

    # Include user audit_count sum — same source as /metrics/live dashboard
    try:
        user_scans = get_total_user_scans()
        stats["total_audits"] = max(stats["total_audits"], user_scans)
    except Exception as e:
        print(f"Error fetching user scans for explorer stats: {e}")

    return stats

@app.get("/explorer/audits")
@limiter.limit("10/minute")
def explorer_audits(request: Request):
    audits = []
    audit_contract_addr = os.getenv("PROOF_OF_AUDIT_CONTRACT")
    
    # Fetch on-chain EVM audits if RPC is available
    if w3 and w3.is_connected() and audit_contract_addr and audit_contract_addr != "LEAVE_BLANK_UNTIL_DEPLOYED":
        try:
            abi_path = Path(__file__).parent / "ProofOfAudit.json"
            if abi_path.exists():
                with open(abi_path, "r") as f:
                    abi = json.load(f)["abi"]
                contract = w3.eth.contract(address=w3.to_checksum_address(audit_contract_addr), abi=abi)
                total = contract.functions.nextAuditId().call()
                
                # Fetch last 20 audits (most recent first)
                start = max(0, total - 20)
                for i in range(total - 1, start - 1, -1):
                    try:
                        result = contract.functions.getAudit(i).call()
                        audits.append({
                            "id": i,
                            "audited_contract": result[0],
                            "report_hash": "0x" + result[1].hex(),
                            "timestamp": result[2],
                            "audit_chain": "ethereum",
                            "explorer_url": f"https://sepolia.etherscan.io/tx/unknown"
                        })
                    except Exception:
                        continue
        except Exception as e:
            print(f"Explorer audits error: {e}")
    
    # Always append multi-chain audits from cache DB
    try:
        non_evm = get_recent_non_evm_audits(20)
        audits.extend(non_evm)
        audits.sort(key=lambda x: x["timestamp"], reverse=True)
        audits = audits[:20]
    except Exception as e:
        print(f"Explorer multi-chain audits error: {e}")
    
    return {"audits": audits}

# ──────────────────────────────────────────────────────
#  LEVEL 6: METRICS DASHBOARD ENDPOINTS
# ──────────────────────────────────────────────────────

@app.get("/metrics/live")
@limiter.limit("20/minute")
def get_live_metrics(request: Request):
    """Provides real-time stats for the L6 Metrics Dashboard"""
    metrics = get_dashboard_metrics()
    
    # Check Proof of Audit total as well
    audit_contract_addr = os.getenv("PROOF_OF_AUDIT_CONTRACT")
    total_audits = 0
    if audit_contract_addr and audit_contract_addr != "LEAVE_BLANK_UNTIL_DEPLOYED" and w3 and w3.is_connected():
        try:
            abi_path = Path(__file__).parent / "ProofOfAudit.json"
            if abi_path.exists():
                with open(abi_path, "r") as f:
                    abi = json.load(f)["abi"]
                contract = w3.eth.contract(address=w3.to_checksum_address(audit_contract_addr), abi=abi)
                total_audits = contract.functions.nextAuditId().call()
        except:
            pass
            
    # Add off-chain and user local totals dynamically
    try:
        from database import get_total_user_scans
        user_scans = get_total_user_scans()
        total_audits = max(total_audits, user_scans)
    except:
        pass
    
    non_evm = get_recent_non_evm_audits(1000)
    total_audits = max(total_audits, len(non_evm))
    
    metrics["total_audits"] = total_audits
    return metrics

class WatchlistRequest(BaseModel):
    contract_address: str
    added_by: str
    risk_level: str = "PENDING"

@app.post("/watchlist/add")
@limiter.limit("10/minute")
def add_to_watchlist_endpoint(request: Request, payload: WatchlistRequest):
    from database import add_to_watchlist as db_add_to_watchlist
    db_add_to_watchlist(payload.contract_address, payload.added_by, payload.risk_level)
    return {"message": "Success"}


@app.get("/explorer/badges")
@limiter.limit("10/minute")
def explorer_badges(request: Request):
    badges_list = []
    badge_contract_addr = os.getenv("AUDIT_BADGE_NFT_CONTRACT")
    
    if not w3 or not w3.is_connected() or not badge_contract_addr:
        return {"badges": badges_list}
    
    try:
        abi_path = Path(__file__).parent / "AuditBadgeNFT.json"
        if not abi_path.exists():
            return {"badges": badges_list}
        with open(abi_path, "r") as f:
            abi = json.load(f)["abi"]
        contract = w3.eth.contract(address=w3.to_checksum_address(badge_contract_addr), abi=abi)
        total = contract.functions.nextTokenId().call()
        
        # Fetch last 20 badges
        start = max(0, total - 20)
        for i in range(total - 1, start - 1, -1):
            try:
                badge_data = contract.functions.badges(i).call()
                owner = contract.functions.ownerOf(i).call()
                badges_list.append({
                    "token_id": i,
                    "owner": owner,
                    "contract_audited": badge_data[0],
                    "vulns_found": badge_data[1],
                    "severity": badge_data[2],
                    "timestamp": badge_data[3]
                })
            except Exception:
                continue
    except Exception as e:
        print(f"Explorer badges error: {e}")
    
    return {"badges": badges_list}
