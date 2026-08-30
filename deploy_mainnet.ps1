# Web3 Guard — Stellar Mainnet Deployment Script
# 
# Level 7 Hackathon Requirement: "mainnet transaction activity is mandatory"
# This script deploys the Soroban `proof_of_audit` contract to the Stellar Mainnet.

Write-Host "========================================================="
Write-Host "🚀 Web3 Guard - Stellar Mainnet Deployment Script"
Write-Host "========================================================="
Write-Host ""
Write-Host "⚠️ PREREQUISITE: You must have a funded Stellar Mainnet account."
Write-Host "If you do not have one, generate one using:"
Write-Host "  stellar keys generate --network mainnet --global mainnet_deployer"
Write-Host "Then send at least 2-3 XLM to the public key to activate it."
Write-Host ""
Write-Host "Step 1: Building the Soroban Contract for release..."

cd soroban_contracts/proof_of_audit
stellar contract build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Please check the errors."
    exit 1
}

Write-Host "✅ Build successful!"
Write-Host ""
Write-Host "Step 2: Deploying to Stellar Mainnet..."
Write-Host "Please ensure your mainnet identity is named 'mainnet_deployer' or replace it below."
Write-Host ""
Write-Host "Run the following command to deploy:"
Write-Host "  stellar contract deploy --wasm target/wasm32-unknown-unknown/release/proof_of_audit.wasm --source mainnet_deployer --network mainnet"
Write-Host ""
Write-Host "Once deployed, copy the Contract ID (C...) and update your backend/main.py or frontend config with the new mainnet address!"
Write-Host "========================================================="
