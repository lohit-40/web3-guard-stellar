import asyncio
from ci_router import scan_pull_request, PRScanRequest

async def run_test():
    payload = PRScanRequest(
        files={
            "Vulnerable.sol": """
contract Vulnerable { 
    mapping(address => uint) public balances; 
    function withdraw() public { 
        uint bal = balances[msg.sender]; 
        require(bal > 0); 
        (bool sent, ) = msg.sender.call{value: bal}(""); 
        require(sent, "Failed"); 
        balances[msg.sender] = 0; 
    } 
}"""
        },
        ecosystem="Solidity",
        github_repo="lohit-40/web3-guard-stellar",
        base_branch="main"
    )
    print("Sending vulnerable contract to Web3Guard AI...")
    res = await scan_pull_request(payload, x_api_key="WEB3GUARD_HACKATHON_DEMO")
    print("\nResult:")
    print(res)

if __name__ == "__main__":
    asyncio.run(run_test())
