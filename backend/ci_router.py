from fastapi import APIRouter, Header, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from google import genai
import os
import json
import hmac
import hashlib
import time
import jwt
import requests
from database import add_installation, remove_installation

ci_router = APIRouter()

class PRScanRequest(BaseModel):
    files: dict[str, str] # filename -> content
    ecosystem: str = "Rust" # Rust or Solidity
    github_repo: str = None # Owner/Repo format
    base_branch: str = "main"

def get_gemini_client():
    raw_keys = os.getenv("GEMINI_API_KEY", "")
    keys = [k.strip() for k in raw_keys.split(",") if k.strip()]
    if not keys:
        raise HTTPException(status_code=500, detail="Gemini API Key missing")
    return genai.Client(api_key=keys[0])

def get_installation_access_token(installation_id: int) -> str:
    """Generates a JWT and requests an installation access token from GitHub."""
    app_id = os.getenv("GITHUB_APP_ID")
    private_key = os.getenv("GITHUB_APP_PRIVATE_KEY")
    if not app_id or not private_key:
        raise ValueError("GitHub App ID or Private Key missing")
        
    private_key = private_key.replace('\\n', '\n')
    
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + (10 * 60),
        "iss": app_id
    }
    encoded_jwt = jwt.encode(payload, private_key, algorithm="RS256")
    
    headers = {
        "Authorization": f"Bearer {encoded_jwt}",
        "Accept": "application/vnd.github.v3+json"
    }
    url = f"https://api.github.com/app/installations/{installation_id}/access_tokens"
    response = requests.post(url, headers=headers)
    response.raise_for_status()
    return response.json()["token"]

def set_commit_status(token: str, repo_full_name: str, sha: str, state: str, description: str, context: str = "Web3 Guard AI Scan"):
    import requests
    url = f"https://api.github.com/repos/{repo_full_name}/statuses/{sha}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    payload = {
        "state": state,
        "description": description,
        "context": context
    }
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
    except Exception as e:
        print(f"Failed to set commit status: {e}")

async def process_pr_scan(payload: PRScanRequest, installation_id: int = None, commit_sha: str = None):
    """Background task to run the AI scan and create an Auto-Fix PR."""
    try:
        github_token_for_status = None
        if installation_id and commit_sha and payload.github_repo:
            try:
                github_token_for_status = get_installation_access_token(installation_id)
                set_commit_status(github_token_for_status, payload.github_repo, commit_sha, "pending", "Scanning smart contracts...")
            except Exception as e:
                print(f"Pending status error: {e}")
        if not payload.files:
            return

        code_context = ""
        for filename, code in payload.files.items():
            code_context += f"## File: {filename}\n```\n{code}\n```\n\n"

        custom_rules_text = ""
        if payload.github_repo:
            from database import get_custom_rules
            repo_owner = payload.github_repo.split('/')[0]
            rules = get_custom_rules(repo_owner)
            if rules:
                custom_rules_text = "\nCRITICAL CUSTOM RULES TO ENFORCE FOR THIS REPOSITORY:\n"
                for r in rules:
                    custom_rules_text += f"- [{r['severity']}] {r['rule_text']}\n"

        ecosystem_guidance = ""
        if payload.ecosystem.lower() in ["rust", "soroban"]:
            ecosystem_guidance = """
CRITICAL SOROBAN CHECKS:
1. Missing `require_auth()`: Check if sensitive functions (withdraw, set_admin, update) lack `require_auth()`. This allows anyone to drain or hijack the contract.
2. Arithmetic Overflows: Look for `+`, `-`, `*` without `checked_add`, `checked_sub`, etc. on i128/u64.
3. Underflow/Balance Checks: Ensure withdraws check if `amount <= balance`.
4. Front-runnable Initialization: Ensure `initialize()` checks if it has already been called.
5. Unprotected Setters: Ensure `set_admin` or similar setters are gated by `require_auth()`.
"""

        system_instruction = f"""
You are the Web3 Guard CI/CD GitHub Bot. 
You are analyzing a Pull Request containing {payload.ecosystem} smart contracts.
Identify any security vulnerabilities (Reentrancy, Integer Overflows, Unsafe CPIs, Account Substitution, etc).
{ecosystem_guidance}
Return your response precisely formatted as a Markdown GitHub PR Comment.
Use emojis, bold syntax, and clear severity headers (Critical, High, Medium, Low).
If no vulnerabilities exist, return an enthusiastic congratulatory message stating 'Web3 Guard: All Clear! \u2705'.
Do NOT wrap your response in a generic JSON block unless necessary, return pure markdown text.
{custom_rules_text}
"""
        client = get_gemini_client()
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=code_context,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1
            )
        )
        report = response.text.strip()
        
        # Web3 Guard Auto-Fix Feature via GitHub App Token
        if payload.github_repo and "All Clear!" not in report and "\u2705" not in report:
            if github_token_for_status and commit_sha:
                set_commit_status(github_token_for_status, payload.github_repo, commit_sha, "failure", "Vulnerabilities found. Auto-fix PR generating.")
            github_token = None
            if installation_id:
                try:
                    github_token = get_installation_access_token(installation_id)
                except Exception as e:
                    print(f"Failed to get installation token: {e}")
            else:
                github_token = os.getenv("GITHUB_TOKEN") # Fallback to personal token for testing
                
            if github_token:
                try:
                    from github import Github
                    import uuid
                    g = Github(github_token)
                    repo = g.get_repo(payload.github_repo)
                    
                    new_branch_name = f"web3guard-autofix-{uuid.uuid4().hex[:8]}"
                    sb = repo.get_branch(payload.base_branch)
                    repo.create_git_ref(ref=f"refs/heads/{new_branch_name}", sha=sb.commit.sha)
                    
                    for filename, code in payload.files.items():
                        secure_prompt = f"Rewrite this {payload.ecosystem} code to be 100% mathematically secure against the vulnerabilities identified. Return ONLY raw code, no markdown blocks.\n\n{code}"
                        sec_resp = client.models.generate_content(
                            model='gemini-2.0-flash',
                            contents=secure_prompt
                        )
                        secure_code = sec_resp.text.strip()
                        if secure_code.startswith("```"):
                            secure_code = "\\n".join(secure_code.split("\\n")[1:-1])
                        
                        try:
                            contents = repo.get_contents(filename, ref=payload.base_branch)
                            repo.update_file(contents.path, f"Web3Guard Auto-Fix: Secured {filename}", secure_code, contents.sha, branch=new_branch_name)
                        except Exception:
                            repo.create_file(filename, f"Web3Guard Auto-Fix: Created secure {filename}", secure_code, branch=new_branch_name)
                            
                    pr = repo.create_pull(
                        title="\U0001f6e1\ufe0f Web3Guard Auto-Fix PR",
                        body=f"Web3 Guard AI detected vulnerabilities. This Auto-Fix PR patches them.\\n\\n### Security Report\\n{report}",
                        head=new_branch_name,
                        base=payload.base_branch
                    )
                    print(f"Auto-Fix PR Created: {pr.html_url}")
                except Exception as e:
                    print(f"Failed to create Auto-Fix PR: {str(e)}")
        else:
            if payload.github_repo and github_token_for_status and commit_sha:
                set_commit_status(github_token_for_status, payload.github_repo, commit_sha, "success", "All Clear! No vulnerabilities found.")
                    
    except Exception as e:
        print(f"Error in background PR scan: {e}")

async def fetch_and_process_pr(inst_id: int, repo_full_name: str, base_branch: str, pr_number: int):
    try:
        token = get_installation_access_token(inst_id)
        from github import Github
        g = Github(token)
        repo = g.get_repo(repo_full_name)
        pr = repo.get_pull(pr_number)
        
        files_dict = {}
        for file in pr.get_files():
            if file.filename.endswith(".sol") or file.filename.endswith(".rs"):
                contents = repo.get_contents(file.filename, ref=pr.head.sha)
                files_dict[file.filename] = contents.decoded_content.decode()
                
        if files_dict:
            payload = PRScanRequest(
                files=files_dict,
                ecosystem="Solidity" if any(f.endswith('.sol') for f in files_dict) else "Rust",
                github_repo=repo_full_name,
                base_branch=base_branch
            )
            await process_pr_scan(payload, installation_id=inst_id, commit_sha=pr.head.sha)
    except Exception as e:
        print(f"Failed to fetch PR files: {e}")

@ci_router.post("/scan_pr")
async def scan_pull_request(payload: PRScanRequest, background_tasks: BackgroundTasks, x_api_key: str = Header(None)):
    """Legacy manual trigger endpoint"""
    if x_api_key != "WEB3GUARD_HACKATHON_DEMO" and x_api_key != os.getenv("CI_API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid API Key")
    background_tasks.add_task(process_pr_scan, payload)
    return {"status": "processing_started"}

@ci_router.post("/webhook")
async def handle_github_webhook(request: Request, background_tasks: BackgroundTasks):
    """Production GitHub App Webhook Endpoint"""
    signature = request.headers.get("x-hub-signature-256")
    event = request.headers.get("x-github-event")
    
    if not signature:
        raise HTTPException(status_code=401, detail="Missing signature")
        
    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "").encode()
    body = await request.body()
    
    # Verify HMAC signature
    hash_obj = hmac.new(secret, body, hashlib.sha256)
    expected_sig = "sha256=" + hash_obj.hexdigest()
    if not hmac.compare_digest(expected_sig, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
        
    data = json.loads(body)
    
    if event == "installation":
        action = data.get("action")
        inst_id = data["installation"]["id"]
        account = data["installation"]["account"]["login"]
        if action == "created":
            add_installation(inst_id, account)
        elif action == "deleted":
            remove_installation(inst_id)
            
    elif event == "pull_request":
        action = data.get("action")
        if action in ["opened", "synchronize"]:
            inst_id = data.get("installation", {}).get("id")
            if not inst_id:
                return {"status": "ignored - no installation id"}
            repo_full_name = data["repository"]["full_name"]
            base_branch = data["pull_request"]["base"]["ref"]
            pr_number = data["pull_request"]["number"]
            
            # Use background tasks to fetch files and process them immediately freeing the webhook response
            background_tasks.add_task(fetch_and_process_pr, inst_id, repo_full_name, base_branch, pr_number)
            
    return {"status": "accepted"}
