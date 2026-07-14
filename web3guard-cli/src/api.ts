import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Note: Replace with actual deployed URL in production or read from env.
const API_URL = process.env.WEB3GUARD_API_URL || 'https://web3guard.com/api';
const API_URL_LOCAL = process.env.WEB3GUARD_API_URL_LOCAL || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_URL_LOCAL, // We'll default to local for now, can be configured via env
});

export interface ScanResult {
  status: string;
  vulnerabilities: any[];
  hash_key?: string;
  audit_chain?: string;
}

export async function scanContract(filePath: string): Promise<ScanResult> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const sourceCode = fs.readFileSync(absolutePath, 'utf8');
  const ecosystem = absolutePath.endsWith('.sol') ? 'Solidity' : 'Rust';

  const response = await client.post('/scan', {
    source_code: sourceCode,
    ecosystem: ecosystem,
  });

  return response.data;
}

export async function getTrustScore(address: string): Promise<any> {
  const response = await client.get(`/api/v1/trust/${address}`);
  return response.data;
}
