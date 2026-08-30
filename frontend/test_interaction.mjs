import * as StellarSdk from '@stellar/stellar-sdk';

const CONTRACT_ID = "CAB4ZTQ2A7HIBTTY55JZ6P2SLFNQXPVZCZBSY33DIJ6G4A3HZPN44X5P";

async function main() {
    console.log("1. Generating new wallet...");
    const keypair = StellarSdk.Keypair.random();
    console.log("   Public Key: ", keypair.publicKey());
    console.log("   Secret Key: ", keypair.secret());

    console.log("\n2. Funding wallet via Friendbot on Testnet...");
    try {
        const response = await fetch(`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`);
        if (!response.ok) {
            throw new Error(`Friendbot failed: ${response.statusText}`);
        }
        await response.json();
        console.log("   Wallet successfully funded!");
    } catch (e) {
        console.error("   Failed to fund wallet:", e);
        return;
    }

    console.log("\n3. Setting up RPC Server...");
    const rpcUrl = "https://soroban-testnet.stellar.org:443";
    const server = new StellarSdk.rpc.Server(rpcUrl);

    console.log("\n4. Fetching account details...");
    const account = await server.getAccount(keypair.publicKey());
    console.log("   Account sequence:", account.sequenceNumber());

    console.log(`\n5. Preparing to interact with contract: ${CONTRACT_ID}`);
    console.log("   Invoking 'total_proofs' function...");
    
    try {
        const contract = new StellarSdk.Contract(CONTRACT_ID);
        const txBuilder = new StellarSdk.TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: StellarSdk.Networks.TESTNET,
        });

        const operation = contract.call("total_proofs");
        txBuilder.addOperation(operation);
        
        txBuilder.setTimeout(30);
        let tx = txBuilder.build();

        console.log("   Simulating transaction...");
        const simResult = await server.simulateTransaction(tx);
        
        if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
            console.error("   Simulation failed:", simResult.error);
            return;
        }

        console.log("   Simulation successful. Assembling and signing...");
        tx = StellarSdk.rpc.assembleTransaction(tx, simResult);
        tx.sign(keypair);

        console.log("   Submitting transaction to network...");
        const sendResult = await server.sendTransaction(tx);
        
        if (sendResult.status === "ERROR") {
            console.error("   Transaction failed to submit:", sendResult.errorResult);
            return;
        }

        console.log(`   Transaction submitted! Hash: ${sendResult.hash}`);
        console.log("   Waiting for finality...");
        
        let txStatus;
        while (true) {
            txStatus = await server.getTransaction(sendResult.hash);
            if (txStatus.status !== "NOT_FOUND") {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (txStatus.status === "SUCCESS") {
            console.log("\n✅ Transaction was SUCCESSFUL!");
            console.log("   Let's decode the result to see the total proofs.");
            const returnValue = txStatus.returnValue;
            if (returnValue) {
                 const parsed = StellarSdk.scValToNative(returnValue);
                 console.log(`   total_proofs = ${parsed}`);
            }
            
            console.log(`\n🔍 Verifying interaction:`);
            console.log(`   The transaction interacted with contract address: ${CONTRACT_ID}`);
            console.log(`   Explorer link: https://stellar.expert/explorer/testnet/tx/${sendResult.hash}`);
        } else {
            console.log(`\n❌ Transaction failed: ${txStatus.status}`);
            console.log(txStatus);
        }

    } catch (e) {
        console.error("Error during contract interaction:", e);
    }
}

main();
