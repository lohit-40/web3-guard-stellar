#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { scanContract, getTrustScore, findContracts } from './api';
import { writeConfig } from './config';

const program = new Command();

program
  .name('web3guard')
  .description('CLI for Web3 Guard - Intelligent Multi-Chain Auditing & Security Oracle')
  .version('1.0.0');



program
  .command('scan [path]')
  .description('Scan a local smart contract file or directory for vulnerabilities')
  .option('--json', 'Output result in JSON format')
  .option('--out <file>', 'Save output to a file (JSON format)')
  .option('--staged', 'Scan only staged files in Git')
  .option('--strict', 'Exit with code 1 if vulnerabilities are found')
  .action(async (scanPath, options) => {
    let filesToScan: string[] = [];
    if (options.staged) {
      try {
        const output = execSync('git diff --cached --name-only --diff-filter=ACM').toString();
        filesToScan = output.split('\n').filter(f => f.endsWith('.rs') || f.endsWith('.sol')).map(f => f.trim()).filter(f => f.length > 0);
      } catch (e) {
        console.error(chalk.red('Error running git command. Are you in a git repository?'));
        process.exit(1);
      }
    } else {
      if (!scanPath) {
        console.error(chalk.red('Error: path is required if --staged is not used.'));
        process.exit(1);
      }
      try {
        const stat = fs.statSync(scanPath);
        if (stat.isDirectory()) {
          filesToScan = findContracts(scanPath);
        } else {
          filesToScan = [scanPath];
        }
      } catch (e: any) {
        console.error(chalk.red(`Error accessing path: ${e.message}`));
        return;
      }
    }

    if (filesToScan.length === 0) {
      console.log(chalk.yellow('No .rs or .sol files found to scan.'));
      return;
    }

    let allResults: any[] = [];
    const spinner = options.json ? null : ora(`Scanning ${filesToScan.length} contract(s)...`).start();

    for (const file of filesToScan) {
      if (spinner) spinner.text = `Scanning ${file}...`;
      try {
        const result = await scanContract(file);
        allResults.push({ file, result });
      } catch (error: any) {
        allResults.push({ file, error: error.message || String(error) });
      }
    }

    if (spinner) spinner.succeed(`Scan completed for ${filesToScan.length} file(s)!`);

    if (options.json || options.out) {
      const outputJson = JSON.stringify(allResults, null, 2);
      if (options.out) {
        fs.writeFileSync(options.out, outputJson, 'utf8');
        if (!options.json) console.log(chalk.green(`\nResults saved to ${options.out}`));
      }
      if (options.json) {
        console.log(outputJson);
      }
    } else {
      allResults.forEach(({ file, result, error }) => {
        console.log(`\n${chalk.cyan.bold(file)}:`);
        if (error) {
          console.log(chalk.red(`Error: ${error}`));
          return;
        }
        if (result.vulnerabilities && result.vulnerabilities.length > 0) {
          console.log(chalk.red.bold(`Found ${result.vulnerabilities.length} vulnerabilities:\n`));
          result.vulnerabilities.forEach((v: any, index: number) => {
            console.log(chalk.yellow(`[${index + 1}] ${v.type} (${v.severity})`));
            if (v.line_number) console.log(chalk.gray(`Line: ${v.line_number}`));
            console.log(`Description: ${v.description}`);
            if (v.remediation) {
              console.log(chalk.green(`Remediation: ${v.remediation}`));
            }
            console.log('---');
          });
        } else {
          console.log(chalk.green('Web3 Guard: All Clear! ✅ No vulnerabilities found.'));
        }
        if (result.hash_key) {
          console.log(chalk.cyan(`Audit Hash: ${result.hash_key}`));
        }
      });
    }

    if (options.strict) {
      const hasVulnerabilities = allResults.some(r => r.result && r.result.vulnerabilities && r.result.vulnerabilities.length > 0);
      if (hasVulnerabilities) {
        process.exit(1);
      }
    }
  });

program
  .command('score <address>')
  .description('Check the live security trust score of a deployed contract')
  .option('--json', 'Output result in JSON format')
  .action(async (address, options) => {
    const spinner = options.json ? null : ora('Fetching trust score...').start();
    try {
      const result = await getTrustScore(address);
      if (spinner) spinner.succeed('Score fetched successfully!');

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nAddress: ${chalk.cyan(address)}`);
        let scoreColor = chalk.green;
        if (result.grade === 'D' || result.grade === 'F') scoreColor = chalk.red;
        else if (result.grade === 'C') scoreColor = chalk.yellow;

        console.log(`Score: ${scoreColor.bold(result.score)}`);
        console.log(`Grade: ${scoreColor.bold(result.grade)}`);

        if (result.factors && result.factors.length > 0) {
          console.log('\nFactors:');
          result.factors.forEach((f: any) => {
            const pointsStr = f.points > 0 ? `+${f.points}` : `${f.points}`;
            console.log(`- ${f.reason} (${pointsStr})`);
          });
        }
      }
    } catch (error: any) {
      if (spinner) spinner.fail('Failed to fetch score.');
      if (options.json) {
        console.log(JSON.stringify({ error: error.message || String(error) }, null, 2));
      } else {
        console.error(chalk.red(error.message || error));
      }
    }
  });

program
  .command('config <action> [key] [value]')
  .description('Manage CLI configuration (e.g., config set api-url http://localhost:8000)')
  .action((action, key, value) => {
    if (action === 'set' && key === 'api-url' && value) {
      writeConfig({ api_url: value });
      console.log(chalk.green(`Configuration updated: api_url = ${value}`));
    } else {
      console.log(chalk.yellow('Usage: web3guard config set api-url <url>'));
    }
  });

program
  .command('init-hook')
  .description('Initialize a Git pre-commit hook for Web3 Guard')
  .action(() => {
    const hookDir = path.join(process.cwd(), '.git', 'hooks');
    const hookPath = path.join(hookDir, 'pre-commit');
    
    if (!fs.existsSync(hookDir)) {
      console.error(chalk.red('Error: .git/hooks directory not found. Are you in a Git repository?'));
      process.exit(1);
    }

    const hookContent = `#!/bin/sh
echo "🛡️ Running Web3 Guard Pre-Commit Scan..."
npx web3guard-cli scan --staged --strict
if [ $? -ne 0 ]; then
  echo "❌ Security vulnerabilities found! Commit rejected."
  exit 1
fi
`;

    try {
      fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
      console.log(chalk.green('✅ Successfully installed Web3 Guard pre-commit hook at .git/hooks/pre-commit'));
    } catch (e: any) {
      console.error(chalk.red(`Error writing hook file: ${e.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
