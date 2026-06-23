from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel
from google import genai
import os
import json

ci_router = APIRouter()

class PRScanRequest(BaseModel):
    files: dict[str, str] # filename -> content
    ecosystem: str = "Rust" # Rust or Solidity
    github_repo: str = None # Owner/Repo format
    base_branch: str = "main"

# Load the base API config
def get_gemini_client():
    raw_keys = os.getenv("GEMINI_API_KEY", "")
    keys = [k.strip() for k in raw_keys.split(",") if k.strip()]
    if not keys:
        raise HTTPException(status_code=500, detail="Gemini API Key missing")
    return genai.Client(api_key=keys[0])

@ci_router.post("/scan_pr")
async def scan_pull_request(payload: PRScanRequest, x_api_key: str = Header(None)):
    if x_api_key != "WEB3GUARD_HACKATHON_DEMO" and x_api_key != os.getenv("CI_API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid or Missing API Key. Use WEB3GUARD_HACKATHON_DEMO for testing.")
    
    if not payload.files:
        return {"report": "No valid smart contract files found in this PR."}

    # Format the payload for the prompt
    code_context = ""
    for filename, code in payload.files.items():
        code_context += f"## File: {filename}\n```\n{code}\n```\n\n"

    system_instruction = f"""
You are the Web3 Guard CI/CD GitHub Bot. 
You are analyzing a Pull Request containing {payload.ecosystem} smart contracts.
Identify any security vulnerabilities (Reentrancy, Integer Overflows, Unsafe CPIs, Account Substitution, etc).
Return your response precisely formatted as a Markdown GitHub PR Comment.
Use emojis, bold syntax, and clear severity headers (Critical, High, Medium, Low).
If no vulnerabilities exist, return an enthusiastic congratulatory message stating 'Web3 Guard: All Clear! \u2705'.
Do NOT wrap your response in a generic JSON block unless necessary, return pure markdown text.
    """

    client = get_gemini_client()
    try:
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=code_context,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1
            )
        )
        report = response.text.strip()
        
        # Almanax Auto-Fix Feature
        if payload.github_repo and "All Clear!" not in report and "\u2705" not in report:
            github_token = os.getenv("GITHUB_TOKEN")
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
                            # Fallback if file doesn't exist on main branch yet
                            repo.create_file(filename, f"Web3Guard Auto-Fix: Created secure {filename}", secure_code, branch=new_branch_name)
                            
                    pr = repo.create_pull(
                        title="\U0001f6e1\ufe0f Web3Guard Auto-Fix PR",
                        body=f"Web3 Guard AI detected vulnerabilities. This Auto-Fix PR patches them.\\n\\n### Security Report\\n{report}",
                        head=new_branch_name,
                        base=payload.base_branch
                    )
                    report += f"\\n\\n\U0001f6e0\ufe0f **Auto-Fix PR Created:** [View Pull Request]({pr.html_url})"
                except Exception as e:
                    report += f"\\n\\n\u26a0\ufe0f Failed to create Auto-Fix PR: {str(e)}"
                    
        return {"report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
