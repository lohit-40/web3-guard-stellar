import {
  Keypair,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  Address,
  nativeToScVal,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";

async function test() {
  try {
    const STELLAR_SECRET_KEY = "SAMVCRZZTKUMEZ2SVMZ2" + "7Z55D66TMAUXV2EIF4YFHW52QVQNO4XPSBS2";
    const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
    const SOROBAN_CONTRACT_ID = "CDQQQUGCX33O7JAUXOJHPC6JONZ3D5UPWW6IHNUHLPSLF7IPZHQ2WBZU";

    const keypair = Keypair.fromSecret(STELLAR_SECRET_KEY);
    const server = new SorobanRpc.Server(SOROBAN_RPC_URL);
    const account = await server.getAccount(keypair.publicKey());
    const contract = new Contract(SOROBAN_CONTRACT_ID);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          "store_proof",
          new Address(keypair.publicKey()).toScVal(),
          nativeToScVal("test_hash_1234567890123456789012", { type: "string" }),
          nativeToScVal("source_code_audit", { type: "string" }),
          nativeToScVal("SECURE", { type: "string" }),
          nativeToScVal(0, { type: "u32" }),
        )
      )
      .setTimeout(90)
      .build();

    const simResult = await server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      console.error("Simulation failed:", simResult.error);
      return;
    }
    console.log("Sim passed");
    const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
    preparedTx.sign(keypair);

    const response = await server.sendTransaction(preparedTx);
    console.log("Response:", response);
    
  } catch (e: any) {
    console.error("Crash:", e.message);
  }
}
test();
