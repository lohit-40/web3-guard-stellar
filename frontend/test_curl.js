const http = require('http');

const data = JSON.stringify({
  source_code: `#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};
#[contract] pub struct VulnerableAMM;
#[contractimpl] impl VulnerableAMM {
  pub fn change_owner(env: Env, new_owner: Address) {
    env.storage().instance().set(&soroban_sdk::symbol_short!("Owner"), &new_owner);
  }
}`
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
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
