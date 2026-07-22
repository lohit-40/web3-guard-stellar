"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const child_process_1 = require("child_process");
let outputChannel;
function activate(context) {
    outputChannel = vscode.window.createOutputChannel('Web3 Guard');
    let disposable = vscode.commands.registerCommand('web3guard.scan', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Web3 Guard: No active file to scan.');
            return;
        }
        const document = editor.document;
        const filePath = document.uri.fsPath;
        if (!filePath.endsWith('.rs') && !filePath.endsWith('.sol') && !filePath.endsWith('.move') && !filePath.endsWith('.cairo')) {
            vscode.window.showWarningMessage('Web3 Guard: Only .rs, .sol, .move, and .cairo files are supported.');
            return;
        }
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Web3 Guard',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Scanning for vulnerabilities...' });
            return new Promise((resolve) => {
                (0, child_process_1.exec)(`npx web3guard-cli scan "${filePath}" --json`, (error, stdout, stderr) => {
                    if (stderr && !stdout) {
                        vscode.window.showErrorMessage(`Web3 Guard Error: ${stderr}`);
                        resolve();
                        return;
                    }
                    try {
                        const results = JSON.parse(stdout);
                        if (results.length === 0) {
                            vscode.window.showInformationMessage('Web3 Guard: Scan completed. No results.');
                            resolve();
                            return;
                        }
                        const scanResult = results[0].result;
                        if (scanResult.vulnerabilities && scanResult.vulnerabilities.length > 0) {
                            vscode.window.showErrorMessage(`Web3 Guard: Found ${scanResult.vulnerabilities.length} vulnerabilities. Check Output channel for details.`);
                            outputChannel.clear();
                            outputChannel.appendLine(`Scan Results for ${filePath}`);
                            outputChannel.appendLine('='.repeat(50));
                            scanResult.vulnerabilities.forEach((v, index) => {
                                outputChannel.appendLine(`\n[${index + 1}] ${v.type} (${v.severity})`);
                                if (v.line_number)
                                    outputChannel.appendLine(`Line: ${v.line_number}`);
                                outputChannel.appendLine(`Description: ${v.description}`);
                                if (v.remediation)
                                    outputChannel.appendLine(`Remediation: ${v.remediation}`);
                                outputChannel.appendLine('-'.repeat(30));
                            });
                            outputChannel.show();
                        }
                        else {
                            vscode.window.showInformationMessage('Web3 Guard: All Clear! ✅ No vulnerabilities found.');
                        }
                    }
                    catch (e) {
                        vscode.window.showErrorMessage(`Web3 Guard Error: Failed to parse scan results. ${e.message}`);
                        outputChannel.appendLine(`Raw Output:\n${stdout}`);
                        outputChannel.show();
                    }
                    resolve();
                });
            });
        });
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map