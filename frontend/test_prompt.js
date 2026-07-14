const fs = require('fs');

async function testPrompt() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY");
    return;
  }
  
  const sourceCode = `#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    ReserveA,
    ReserveB,
    TotalLP,
    Owner,
}

#[contract]
pub struct VulnerableAMM;

#[contractimpl]
impl VulnerableAMM {

    pub fn initialize(
        env: Env,
        owner: Address,
        reserve_a: i128,
        reserve_b: i128,
    ) {

        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::ReserveA, &reserve_a);
        env.storage().instance().set(&DataKey::ReserveB, &reserve_b);
        env.storage().instance().set(&DataKey::TotalLP, &1000_i128);
    }

    pub fn add_liquidity(
        env: Env,
        amount_a: i128,
        amount_b: i128,
    ) {

        let reserve_a: i128 = env.storage().instance()
            .get(&DataKey::ReserveA)
            .unwrap();

        let reserve_b: i128 = env.storage().instance()
            .get(&DataKey::ReserveB)
            .unwrap();

        let total_lp: i128 = env.storage().instance()
            .get(&DataKey::TotalLP)
            .unwrap();

        // Vulnerable:
        // LP shares depend ONLY on amount_a.
        let minted_lp = amount_a;

        env.storage().instance()
            .set(&DataKey::ReserveA, &(reserve_a + amount_a));

        env.storage().instance()
            .set(&DataKey::ReserveB, &(reserve_b + amount_b));

        env.storage().instance()
            .set(&DataKey::TotalLP, &(total_lp + minted_lp));
    }

    pub fn remove_liquidity(
        env: Env,
        lp: i128,
    ) -> (i128, i128) {

        let reserve_a: i128 = env.storage().instance()
            .get(&DataKey::ReserveA)
            .unwrap();

        let reserve_b: i128 = env.storage().instance()
            .get(&DataKey::ReserveB)
            .unwrap();

        let total_lp: i128 = env.storage().instance()
            .get(&DataKey::TotalLP)
            .unwrap();

        let amount_a = lp * reserve_a / total_lp;
        let amount_b = lp * reserve_b / total_lp;

        env.storage().instance()
            .set(&DataKey::ReserveA, &(reserve_a - amount_a));

        env.storage().instance()
            .set(&DataKey::ReserveB, &(reserve_b - amount_b));

        env.storage().instance()
            .set(&DataKey::TotalLP, &(total_lp - lp));

        (amount_a, amount_b)
    }

    pub fn swap_a_to_b(
        env: Env,
        amount_in: i128,
    ) -> i128 {

        let reserve_a: i128 = env.storage().instance()
            .get(&DataKey::ReserveA)
            .unwrap();

        let reserve_b: i128 = env.storage().instance()
            .get(&DataKey::ReserveB)
            .unwrap();

        // Constant product
        let amount_out =
            reserve_b * amount_in /
            (reserve_a + amount_in);

        // Vulnerabilities:
        // - No fee
        // - No slippage check
        // - No reserve check

        env.storage().instance()
            .set(&DataKey::ReserveA, &(reserve_a + amount_in));

        env.storage().instance()
            .set(&DataKey::ReserveB, &(reserve_b - amount_out));

        amount_out
    }

    pub fn change_owner(
        env: Env,
        new_owner: Address,
    ) {

        // Vulnerability:
        // No authentication.
        env.storage().instance()
            .set(&DataKey::Owner, &new_owner);
    }

    pub fn get_reserves(env: Env) -> (i128, i128) {

        let reserve_a: i128 = env.storage().instance()
            .get(&DataKey::ReserveA)
            .unwrap();

        let reserve_b: i128 = env.storage().instance()
            .get(&DataKey::ReserveB)
            .unwrap();

        (reserve_a, reserve_b)
    }
}`;

  const prompt = `You are an elite, ruthless Web3 smart contract security auditor specializing in Rust and Stellar Soroban.
Analyze the following source code for all security vulnerabilities.

CRITICAL INSTRUCTIONS: You MUST explicitly check for and flag the following classic Soroban vulnerabilities. Do NOT give the code the benefit of the doubt. If a check is missing, FLAG IT:
1. Missing \`require_auth()\` calls: Are there functions (like withdraw, set_admin, transfer) that allow ANY caller to execute them because they lack \`caller.require_auth()\`? (CRITICAL)
2. Arithmetic Overflows/Underflows: Are balances or amounts modified using standard operators (e.g., \`+\`, \`-\`) without \`checked_add\`, \`checked_sub\`, or balance checks? (HIGH)
3. Front-runnable initialization: Can an attacker front-run the \`init\` function to hijack the contract before the true owner? (HIGH)
4. Missing authentication on ownership/admin transfers: Can anyone call \`set_admin\` or similar functions? (CRITICAL)
5. Reentrancy & Cross-Contract Calls: Are there state changes happening AFTER external contract calls? (HIGH)

Be absolutely merciless. If the code is flawed, you must expose it.
Return ONLY a valid JSON array of objects with keys: type, severity, line_number, description, remediation. If and ONLY if the code is perfectly flawless, return [].

Each vulnerability object MUST strictly follow this mapping:
{
    "type": "string (e.g. 'Missing require_auth', 'i128 Overflow')",
    "severity": "string ('High', 'Medium', or 'Low')",
    "line_number": integer (if a specific line is culpable, else null),
    "description": "string (Detailed explanation of why it is vulnerable)",
    "remediation": "string (Markdown explained fix and code)"
}

Code:
${sourceCode}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (response.ok) {
     const data = await response.json();
     const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
     console.log("Response text:", text);
  } else {
    console.log("Error:", await response.text());
  }
}
testPrompt();
