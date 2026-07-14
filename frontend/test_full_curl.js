const http = require('http');

const data = JSON.stringify({
  source_code: `#![no_std]

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
}
`
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let output = '';
  res.on('data', (d) => output += d);
  res.on('end', () => console.log('Response:', output));
});

req.on('error', (error) => console.error(error));
req.write(data);
req.end();
