<div align="center">
  
# 🛡️ Web3 Guard 
**The Intelligent Multi-Chain Auditing & Security Oracle**

<p align="center">
  <img src="https://img.shields.io/badge/Blockchain-Stellar%20|%20Soroban-08B5E5?style=for-the-badge&logo=stellar&logoColor=white" alt="Stellar" />
  <img src="https://img.shields.io/badge/Frontend-Next.js%20|%20React-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Backend-Python%20|%20FastAPI-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
</p>

[**🚀 Live Demo**](#) • [**📼 Watch Video**](#) • [**📚 Read Docs**](#setup-instructions)

<br/>
<p align="justify">
Web3 Guard is a production-ready, decentralized security platform. It utilizes advanced AI heuristics to autonomously scan Soroban, Solana, and Ethereum smart contracts for critical vulnerabilities. To ensure absolute transparency and immutability, Web3 Guard cryptographically anchors every audit's hash, risk severity, and vulnerability count natively onto the <b>Stellar Testnet</b> via a custom Soroban Rust contract.
</p>

</div>

---

## ✨ Outstanding Technical Features

* 🧠 **AI-Powered Vulnerability Engine:** Automatically parses and analyzes large Rust/Solidity codebases to hunt zero-days.
* ⚓ **Native Soroban Registry:** Cryptographically anchors the resulting hash into a Soroban smart contract (`proof_of_audit`).
* 👛 **Freighter Wallet v6 Integration:** A brilliant implementation of `@stellar/stellar-sdk` to execute UI-driven, client-side signature workflows natively through the Freighter wallet.
* 💸 **Cross-Contract Protocol Fees:** Employs advanced Inter-Contract Calls to move native XLM, charging a spam-preventing storage fee for every audit explicitly via `token::Client`.
* ⚡ **Real-Time UI Architecture:** A beautifully designed frontend that interfaces directly with Stellar's Horizon API to fetch immediate wallet balances and multi-chain states.

---

## 🛠️ Setup Instructions (Run locally)

### 1. 🦀 The Soroban Smart Contract
```bash
cd soroban_contracts/proof_of_audit
cargo test  # Runs the 3 required unit tests
cargo build --target wasm32-unknown-unknown --release
# Deploy to testnet using stellar CLI
```

### 2. 🐍 The Python Core Backend
```bash
cd backend
python -m venv venv
./venv/Scripts/activate      # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### 3. ⚛️ The Next.js Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 🔗 Stellar Ecosystem Submission Data

> **📍 Soroban Advanced Contract:** `CDQQQUGCX33O7JAUXOJHPC6JONZ3D5UPWW6IHNUHLPSLF7IPZHQ2WBZU`  
> **💸 Token Address:** Uses Native XLM standard for Inter-Contract Protocol Fees  
> **🧾 Example Transaction Hash:** `[Insert Tx Hash Here]`  

---

<br/>

<div align="center">
  <h2>📸 Hackathon Belt Submission Gallery</h2>
  <p><i>The visual proof of requirements spanning Level 1 through Level 4</i></p>
</div>

### 🥋 Level 1 & 2: Wallet & Core UI Checkpoints
<details>
  <summary><b>1. Multi-Wallet Connection Options</b> (Click to expand)</summary>
  
  *Replace with screenshot of wallet options*
  ![Wallet Settings](#)
</details>

<details>
  <summary><b>2. Freighter Connection & Real-time Balance Execution</b> (Click to expand)</summary>

  *Replace with screenshot of Top-Right Navbar showing connected address and XLM balance*
  ![Balance](#)
</details>

### 🥋 Level 3: Testing Paradigms
<details>
  <summary><b>3. Soroban Rust Test Suite Output (3+ Passing)</b> (Click to expand)</summary>

  *Replace with screenshot of your terminal after running `cargo test`*
  ![Tests](#)
</details>

<details>
  <summary><b>4. On-Chain Transaction Anchoring</b> (Click to expand)</summary>

  *Replace with screenshot of the Green UI success message or Stellar Expert Tx Result*
  ![Success Tx](#)
</details>


### 🥋 Level 4: Scale & Production 
<details>
  <summary><b>5. Responsive Mobile Architecture</b> (Click to expand)</summary>

  *Replace with screenshot of the site viewed on a mobile resolution*
  ![Mobile UX](#)
</details>

<details>
  <summary><b>6. Automated CI/CD Pipeline</b> (Click to expand)</summary>

  *Replace with screenshot of GitHub actions showing the Soroban Build Pipeline succeeding*
  ![CI/CD Build](#)
</details>

<br/>
<div align="center">
   <i>Built with structural integrity by Lohit.</i>
</div>
