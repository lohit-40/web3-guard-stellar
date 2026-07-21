import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { readConfig } from './config';

// Note: Replace with actual deployed URL in production or read from env.
const config = readConfig();
const API_URL = process.env.WEB3GUARD_API_URL || config.api_url || 'https://stellar-submission-v2-backend.up.railway.app';
const API_URL_LOCAL = process.env.WEB3GUARD_API_URL_LOCAL || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_URL, // Default to production URL
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

export function findContracts(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'target' && file !== 'dist' && !file.startsWith('.')) {
        results = results.concat(findContracts(filePath));
      }
    } else {
      if (filePath.endsWith('.rs') || filePath.endsWith('.sol')) {
        results.push(filePath);
      }
    }
  });
  return results;
}
