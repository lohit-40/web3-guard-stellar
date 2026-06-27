"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cpu, Wallet, Zap } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import WalletModal from "./WalletModal";

export default function Navbar() {
  const pathname = usePathname();
  const { chain, address, isConnected, xlmBalance, disconnect } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const chainLabel = chain === "solana" ? "SOL DEVNET" : chain === "stellar" ? "STELLAR" : "SEPOLIA";
  const chainColor = chain === "solana" ? "#9945FF" : chain === "stellar" ? "#08B5E5" : "#10B981";

  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  return (
    <nav className="relative w-full z-40 px-6 pt-8 pb-4 md:px-24 md:pt-12 md:pb-6 pointer-events-none">
      <div className="max-w-7xl mx-auto flex flex-wrap md:flex-nowrap gap-4 items-center justify-between pointer-events-auto">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative flex items-center justify-center w-10 h-10 translate-y-1">
            <img 
              src="/shield.png" 
              alt="Web3 Guard Shield" 
              className="absolute w-[400%] max-w-none object-contain transition-transform duration-300 group-hover:scale-110" 
            />
          </div>
          <span className="font-extrabold text-[26px] tracking-wider hidden md:block transition-transform duration-300 group-hover:scale-105">
            <span className="text-brutal-text">WEB3</span>
            <span className="text-brutal-orange">Guard</span>
          </span>
        </Link>

        {/* Links */}
        <div className="flex w-full md:w-auto order-last md:order-none items-center justify-center gap-1 border-2 border-brutal-text bg-brutal-bg p-1 rounded-none shadow-[4px_4px_0px_0px_rgba(28,28,28,1)] overflow-x-auto no-scrollbar shrink-0">
          <Link 
            href="/"
            className={`px-2.5 py-1.5 md:px-3 lg:px-5 md:py-2 text-[10px] sm:text-xs uppercase tracking-[0.15em] font-bold transition-all ${
              pathname === "/" ? "bg-brutal-text text-brutal-bg" : "text-brutal-text/60 hover:text-brutal-text hover:bg-brutal-text/5"
            }`}
          >
            audit
          </Link>
          <Link 
            href="/explorer"
            className={`px-2.5 py-1.5 md:px-3 lg:px-5 md:py-2 text-[10px] sm:text-xs uppercase tracking-[0.15em] font-bold transition-all ${
              pathname === "/explorer" ? "bg-brutal-text text-brutal-bg" : "text-brutal-text/60 hover:text-brutal-text hover:bg-brutal-text/5"
            }`}
          >
            explorer
          </Link>
          <Link 
            href="/about"
            className={`px-2.5 py-1.5 md:px-3 lg:px-5 md:py-2 text-[10px] sm:text-xs uppercase tracking-[0.15em] font-bold transition-all ${
              pathname === "/about" ? "bg-brutal-text text-brutal-bg" : "text-brutal-text/60 hover:text-brutal-text hover:bg-brutal-text/5"
            }`}
          >
            ethos
          </Link>
          <Link 
            href="/dashboard"
            className={`px-2.5 py-1.5 md:px-3 lg:px-5 md:py-2 text-[10px] sm:text-xs uppercase tracking-[0.15em] font-bold transition-all ${
              pathname === "/dashboard" ? "bg-brutal-text text-brutal-bg" : "text-brutal-text/60 hover:text-brutal-text hover:bg-brutal-text/5"
            }`}
          >
            monitor
          </Link>
          <Link 
            href="/dashboard/github"
            className={`px-2.5 py-1.5 md:px-3 lg:px-5 md:py-2 text-[10px] sm:text-xs uppercase tracking-[0.15em] font-bold transition-all flex items-center gap-1 ${
              pathname === "/dashboard/github" ? "bg-brutal-text text-brutal-bg" : "text-brutal-text/60 hover:text-brutal-text hover:bg-brutal-text/5"
            }`}
          >
            github
          </Link>
          <Link 
            href="/dashboard/threat-model"
            className={`px-2.5 py-1.5 md:px-3 lg:px-5 md:py-2 text-[10px] sm:text-xs uppercase tracking-[0.15em] font-bold transition-all flex items-center gap-1 ${
              pathname === "/dashboard/threat-model" ? "bg-brutal-text text-brutal-bg" : "text-brutal-text/60 hover:text-brutal-text hover:bg-brutal-text/5"
            }`}
          >
            threat-model
          </Link>
          <a 
            href="https://x.com/Web3zGuard"
            target="_blank"
            rel="noopener noreferrer"
            className={`px-2.5 py-1.5 md:px-3 lg:px-5 md:py-2 text-[10px] sm:text-xs uppercase tracking-[0.15em] font-bold transition-all text-brutal-text/60 hover:text-brutal-text hover:bg-brutal-text/5`}
          >
            𝕏
          </a>
        </div>

        {/* Wallet Connect — Multi-Chain */}
        <div className="pointer-events-auto">
          {isConnected ? (
            <button 
              onClick={() => disconnect()}
              title="Click to disconnect"
              className="px-4 py-3 border-2 text-xs tracking-[0.1em] uppercase font-bold flex items-center gap-3 transition-colors hover:brightness-125"
              style={{
                borderColor: chainColor,
                backgroundColor: `${chainColor}10`,
                color: chainColor,
                boxShadow: `4px 4px 0px 0px ${chainColor}30`,
              }}
            >
              <div className="w-2 h-2 animate-pulse rounded-full" style={{ backgroundColor: chainColor }} />
              <span className="text-[10px] opacity-70">{chainLabel}</span>
              
              {/* XLM Balance Display — L1 requirement */}
              {chain === "stellar" && xlmBalance && (
                <span
                  className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold border"
                  style={{ borderColor: `${chainColor}50`, backgroundColor: `${chainColor}15` }}
                >
                  <Zap className="w-2.5 h-2.5" />
                  {xlmBalance} XLM
                </span>
              )}

              <span className="hidden sm:inline">{truncated}</span>
              <span className="sm:hidden">Connected</span>
              <span className="hidden sm:inline-block ml-1 opacity-50 hover:opacity-100 text-[10px] uppercase">X</span>
            </button>
          ) : (
            <button 
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-3 px-6 py-3 border-2 border-brutal-text bg-brutal-text text-brutal-bg hover:bg-brutal-orange hover:border-brutal-orange text-xs tracking-[0.2em] font-bold transition-all shadow-[4px_4px_0px_0px_rgba(28,28,28,1)] hover:shadow-[4px_4px_0px_0px_rgba(255,69,34,1)]"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}
        </div>

      </div>

      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />
    </nav>
  );
}
