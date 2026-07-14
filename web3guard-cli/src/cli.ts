#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { scanContract, getTrustScore } from './api';

const program = new Command();

program
  .name('web3guard')
  .description('CLI for Web3 Guard - Intelligent Multi-Chain Auditing & Security Oracle')
  .version('1.0.0');

program
  .command('scan <file>')
  .description('Scan a local smart contract file (.rs or .sol) for vulnerabilities')
  .action(async (file) => {
    const spinner = ora('Scanning contract for vulnerabilities...').start();
    try {
      const result = await scanContract(file);
      spinner.succeed('Scan completed successfully!');

      if (result.vulnerabilities && result.vulnerabilities.length > 0) {
        console.log(chalk.red.bold(`\nFound ${result.vulnerabilities.length} vulnerabilities:\n`));
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
        console.log(chalk.green.bold('\nWeb3 Guard: All Clear! ✅ No vulnerabilities found.'));
      }

      if (result.hash_key) {
        console.log(chalk.cyan(`\nAudit Hash: ${result.hash_key}`));
      }
    } catch (error: any) {
      spinner.fail('Scan failed.');
      console.error(chalk.red(error.message || error));
    }
  });

program
  .command('score <address>')
  .description('Check the live security trust score of a deployed contract')
  .action(async (address) => {
    const spinner = ora('Fetching trust score...').start();
    try {
      const result = await getTrustScore(address);
      spinner.succeed('Score fetched successfully!');

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
    } catch (error: any) {
      spinner.fail('Failed to fetch score.');
      console.error(chalk.red(error.message || error));
    }
  });

program.parse(process.argv);
