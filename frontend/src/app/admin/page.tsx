"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { TransactionBuilder, Networks, Contract, rpc, xdr, nativeToScVal } from "@stellar/stellar-sdk";
import { signTransaction, requestAccess, setAllowed } from "@stellar/freighter-api";

// The Admin address that deployed the Treasury contract
const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS || "GBY72PDQ6X3PHB2DNTEASIQPGF2HU2X5ISARTHAQ72BX22LVJJFADCEJ"; // Replace with your actual deployed admin address in production
// The deployed Treasury contract address
const TREASURY_CONTRACT_ID = process.env.NEXT_PUBLIC_TREASURY_CONTRACT || "CDQQQUGCX33O7JAUXOJHPC6JONZ3D5UPWW6IHNUHLPSLF7IPZHQ2WBZU";

export default function AdminDashboard() {
  const { address, isConnected, chain, connectStellar, network } = useWallet();
  const [revenue, setRevenue] = useState("0");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  
  const [tierId, setTierId] = useState("1");
  const [tierCost, setTierCost] = useState("10");
  const [auditLimit, setAuditLimit] = useState("10");
  const [integrations, setIntegrations] = useState(false);

  const [loading, setLoading] = useState(false);

  const rpcUrl = network === "mainnet" ? "https://soroban-mainnet.stellar.org:443" : "https://soroban-testnet.stellar.org:443";
  const networkPassphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

  const fetchRevenue = async () => {
     try {
       const server = new rpc.Server(rpcUrl);
       const contract = new Contract(TREASURY_CONTRACT_ID);
       
       const tx = new TransactionBuilder(
         await server.getAccount(address!),
         { fee: "100000", networkPassphrase }
       )
       .addOperation(contract.call("get_total_revenue"))
       .setTimeout(30)
       .build();
       
       const simResult = await server.simulateTransaction(tx);
       if (rpc.Api.isSimulationSuccess(simResult) && simResult.result) {
          const revVal = simResult.result.retval;
          // Decode scval i128
          setRevenue((Number(revVal.i128().lo()) / 10000000).toString());
       }
     } catch (e) {
       console.error("Error fetching revenue:", e);
     }
  };

  useEffect(() => {
    if (isConnected && chain === "stellar" && address) {
      fetchRevenue();
    }
  }, [isConnected, chain, address, rpcUrl]);

  if (!isConnected || chain !== "stellar") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
          <button onClick={connectStellar} className="bg-blue-600 px-6 py-2 rounded">
            Connect Freighter Wallet
          </button>
        </div>
      </div>
    );
  }

  // Submit standard Soroban transaction using Freighter
  const submitSorobanTx = async (op: xdr.Operation) => {
    setLoading(true);
    try {
      const server = new rpc.Server(rpcUrl);
      const source = await server.getAccount(address!);
      
      let tx = new TransactionBuilder(source, { fee: "100000", networkPassphrase })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const simResult = await server.simulateTransaction(tx);
      if (!rpc.Api.isSimulationSuccess(simResult)) {
        throw new Error("Simulation failed");
      }

      tx = rpc.assembleTransaction(tx, simResult).build();

      // Sign with Freighter
      const signedXdr = await signTransaction(tx.toXDR(), {
        networkPassphrase,
      });

      if (signedXdr.error) {
         throw new Error(signedXdr.error);
      }

      // We ensure signedTxXdr is passed as a string
      const signedTx = TransactionBuilder.fromXDR(signedXdr.signedTxXdr, networkPassphrase);
      
      const sendResponse = await server.sendTransaction(signedTx);
      if (sendResponse.status === "ERROR") {
        throw new Error("Transaction submission failed");
      }

      alert("Transaction sent! Hash: " + sendResponse.hash);
      await fetchRevenue();
    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    const amountStroops = Math.floor(parseFloat(withdrawAmount) * 10000000);
    const contract = new Contract(TREASURY_CONTRACT_ID);
    const op = contract.call("admin_withdraw", nativeToScVal(amountStroops, { type: "i128" }));
    await submitSorobanTx(op);
  };

  const handleSetPricing = async () => {
    const costStroops = Math.floor(parseFloat(tierCost) * 10000000);
    const contract = new Contract(TREASURY_CONTRACT_ID);
    
    const op = contract.call(
      "set_tier_pricing",
      nativeToScVal(parseInt(tierId), { type: "u32" }),
      nativeToScVal(costStroops, { type: "i128" }),
      nativeToScVal(parseInt(auditLimit), { type: "u32" }),
      nativeToScVal(integrations, { type: "bool" })
    );

    await submitSorobanTx(op);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-4xl font-bold mb-8 text-blue-500">Web3 Guard Treasury Admin</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Revenue Card */}
        <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
          <h2 className="text-2xl font-semibold mb-4 text-gray-300">Treasury Revenue</h2>
          <p className="text-5xl font-bold text-green-400 mb-6">{revenue} XLM</p>
          
          <div className="flex gap-4">
            <input 
              type="number" 
              placeholder="Amount to withdraw" 
              className="bg-gray-800 p-2 rounded text-white flex-1"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            <button onClick={handleWithdraw} disabled={loading} className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-semibold transition disabled:opacity-50">
              Withdraw
            </button>
          </div>
        </div>

        {/* Pricing Management Card */}
        <div className="bg-gray-900 p-6 rounded-lg border border-gray-800">
          <h2 className="text-2xl font-semibold mb-4 text-gray-300">Set Tier Pricing</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tier ID (1=Basic, 2=Pro, 3=Enterprise)</label>
              <input type="number" className="w-full bg-gray-800 p-2 rounded text-white" value={tierId} onChange={e => setTierId(e.target.value)} />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Cost (XLM)</label>
              <input type="number" className="w-full bg-gray-800 p-2 rounded text-white" value={tierCost} onChange={e => setTierCost(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Audit Limit</label>
              <input type="number" className="w-full bg-gray-800 p-2 rounded text-white" value={auditLimit} onChange={e => setAuditLimit(e.target.value)} />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="integrations" checked={integrations} onChange={e => setIntegrations(e.target.checked)} />
              <label htmlFor="integrations" className="text-sm text-gray-400">Enable Integrations (CLI/GitHub)</label>
            </div>

            <button onClick={handleSetPricing} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded font-semibold mt-4 transition disabled:opacity-50">
              Update Tier Configuration
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

