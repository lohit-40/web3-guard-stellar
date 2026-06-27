"use client";

import { X } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { useEffect, useState } from "react";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { connectEVM, connectSolana, connectStellar, isConnected } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);

  // Close modal automatically if connection succeeds
  useEffect(() => {
    if (isConnected) {
      onClose();
      setIsConnecting(false);
    }
  }, [isConnected, onClose]);

  if (!isOpen) return null;

  const handleConnect = async (connectFn: () => Promise<void>) => {
    setIsConnecting(true);
    try {
      await connectFn();
    } catch (err) {
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
      <div className="relative w-full max-w-md bg-brutal-bg border-4 border-brutal-text shadow-[12px_12px_0px_0px_rgba(28,28,28,1)] p-6 md:p-8 animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-brutal-text/10 transition-colors"
        >
          <X className="w-6 h-6 text-brutal-text" />
        </button>

        <h2 className="text-2xl font-black uppercase tracking-widest text-brutal-text mb-2">
          Connect Wallet
        </h2>
        <p className="text-xs font-mono text-brutal-text/60 uppercase mb-8 border-b-2 border-brutal-text/10 pb-4">
          Select your network to interact with Web3 Guard
        </p>

        <div className="flex flex-col gap-4">
          {/* Stellar - Freighter */}
          <button
            onClick={() => handleConnect(connectStellar)}
            disabled={isConnecting}
            className="group relative flex items-center justify-between p-4 border-2 border-brutal-text bg-white hover:bg-[#08B5E5]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#08B5E5]/20 flex items-center justify-center border-2 border-[#08B5E5]">
                <img 
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png" 
                  alt="Stellar" 
                  className="w-6 h-6 object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-bold text-sm tracking-widest uppercase">Freighter</span>
                <span className="text-[10px] font-mono text-brutal-text/60 uppercase">Stellar Network</span>
              </div>
            </div>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-[#08B5E5] tracking-widest uppercase">
              Connect →
            </span>
          </button>

          {/* EVM - MetaMask */}
          <button
            onClick={() => handleConnect(connectEVM)}
            disabled={isConnecting}
            className="group relative flex items-center justify-between p-4 border-2 border-brutal-text bg-white hover:bg-[#F6851B]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#F6851B]/20 flex items-center justify-center border-2 border-[#F6851B]">
                <img 
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png" 
                  alt="MetaMask" 
                  className="w-6 h-6 object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-bold text-sm tracking-widest uppercase">MetaMask</span>
                <span className="text-[10px] font-mono text-brutal-text/60 uppercase">EVM (Ethereum / Arbitrum)</span>
              </div>
            </div>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-[#F6851B] tracking-widest uppercase">
              Connect →
            </span>
          </button>

          {/* Solana - Phantom */}
          <button
            onClick={() => handleConnect(connectSolana)}
            disabled={isConnecting}
            className="group relative flex items-center justify-between p-4 border-2 border-brutal-text bg-white hover:bg-[#AB9FF2]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#AB9FF2]/20 flex items-center justify-center border-2 border-[#AB9FF2]">
                <img 
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png" 
                  alt="Solana" 
                  className="w-6 h-6 object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div className="flex flex-col items-start">
                <span className="font-bold text-sm tracking-widest uppercase">Phantom</span>
                <span className="text-[10px] font-mono text-brutal-text/60 uppercase">Solana Devnet</span>
              </div>
            </div>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-[#AB9FF2] tracking-widest uppercase">
              Connect →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
