import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.web3guardrc');

export interface CLIConfig {
  api_url?: string;
}

export function readConfig(): CLIConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Warning: Could not parse config at ${CONFIG_PATH}`);
    return {};
  }
}

export function writeConfig(config: CLIConfig) {
  const current = readConfig();
  const updated = { ...current, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
}
