"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, BrainCircuit, Activity, AlertTriangle, ShieldCheck, Bug, Zap, ShieldAlert, Cpu } from "lucide-react";
import { toast } from "react-hot-toast";
import dynamic from "next/dynamic";

const MermaidRenderer = dynamic(() => import("@/components/MermaidRenderer"), { ssr: false });

export default function ThreatModelDashboard() {
  const [sourceCode, setSourceCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [threatModel, setThreatModel] = useState<any>(null);
  const [ecosystem, setEcosystem] = useState<"Solidity" | "Rust">("Rust");

  const handleGenerate = async () => {
    if (!sourceCode.trim()) {
      toast.error("Please paste your smart contract code first!");
      return;
    }
    
    setIsGenerating(true);
    const toastId = toast.loading(`Analyzing ${ecosystem} contract and generating STRIDE model...`);
    
    try {
      const res = await fetch("/api/threat_model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: sourceCode,
          ecosystem: ecosystem
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to generate threat model");
      
      setThreatModel(data);
      toast.success("Threat model generated successfully!", { id: toastId });
    } catch (error: any) {
      toast.error(error.message, { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  const getSeverityStyle = (level: string) => {
    const l = level.toLowerCase();
    if (l.includes("critical") || l.includes("high")) {
      return "border-brutal-orange text-brutal-orange bg-brutal-orange/5";
    }
    if (l.includes("medium")) {
      return "border-yellow-600 text-yellow-600 bg-yellow-50";
    }
    return "border-green-600 text-green-600 bg-green-50";
  };

  const getCategoryIcon = (category: string) => {
    const c = category.toLowerCase();
    if (c.includes("spoof")) return <ShieldAlert className="w-5 h-5" />;
    if (c.includes("tamper")) return <Bug className="w-5 h-5" />;
    if (c.includes("info")) return <Activity className="w-5 h-5" />;
    if (c.includes("denial")) return <Zap className="w-5 h-5" />;
    return <AlertTriangle className="w-5 h-5" />;
  };

  return (
    <div className="min-h-screen pt-32 pb-24 px-6 md:px-24 pointer-events-auto text-brutal-text" style={{ backgroundColor: "#F2F0EB" }}>
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-[0.15em] uppercase text-brutal-text mb-2">
              Threat <span className="text-brutal-orange">Modeling</span>
            </h1>
            <p className="font-mono text-sm uppercase tracking-widest text-brutal-text/60">
              Interactive STRIDE threat modeling & architecture diagrams for Rust (Soroban/Stellar) & Solidity
            </p>
          </div>
        </header>

        {/* Setup and Layout Selection */}
        <div className="grid lg:grid-cols-[1fr_2fr] gap-12 items-start">
          
          {/* Left panel: Code input & Ecosystem selection */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            
            {/* Ecosystem Selection */}
            <div className="border-4 border-brutal-text p-6 bg-white shadow-[6px_6px_0px_0px_rgba(28,28,28,1)] space-y-4">
              <span className="text-xs tracking-widest text-brutal-text/60 uppercase font-bold block">1. Select Target Ecosystem:</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEcosystem("Rust")}
                  className={`relative py-3 border-2 font-mono text-xs uppercase font-bold transition-all ${
                    ecosystem === "Rust"
                      ? "border-brutal-orange bg-brutal-orange text-white"
                      : "border-brutal-text/20 text-brutal-text/60 hover:border-brutal-text"
                  }`}
                >
                  Rust / Soroban
                </button>
                <button
                  type="button"
                  onClick={() => setEcosystem("Solidity")}
                  className={`relative py-3 border-2 font-mono text-xs uppercase font-bold transition-all ${
                    ecosystem === "Solidity"
                      ? "border-brutal-orange bg-brutal-orange text-white"
                      : "border-brutal-text/20 text-brutal-text/60 hover:border-brutal-text"
                  }`}
                >
                  Solidity / EVM
                </button>
              </div>
            </div>

            {/* Input area */}
            <div className="border-4 border-brutal-text p-6 bg-white shadow-[6px_6px_0px_0px_rgba(28,28,28,1)] space-y-4">
              <h2 className="text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                <Shield className="w-5 h-5 text-brutal-orange" />
                Contract Source Code
              </h2>
              <div className="bg-white border-2 border-brutal-text p-2 h-[400px] flex flex-col">
                <textarea 
                  className="w-full h-full bg-transparent p-2 font-mono text-xs text-brutal-text focus:outline-none resize-none"
                  placeholder={`Paste your raw ${ecosystem === "Rust" ? "Rust (Soroban)" : "Solidity"} contract code here...`}
                  value={sourceCode}
                  onChange={(e) => setSourceCode(e.target.value)}
                />
              </div>
              
              <button 
                onClick={handleGenerate} 
                disabled={isGenerating}
                className="w-full border-4 border-brutal-text bg-brutal-text text-brutal-bg hover:bg-brutal-orange hover:border-brutal-orange hover:text-white px-6 py-4 text-xs tracking-[0.2em] font-bold uppercase transition-all shadow-[4px_4px_0px_0px_rgba(28,28,28,1)] hover:shadow-[4px_4px_0px_0px_rgba(255,69,34,1)] disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isGenerating ? (
                  <><div className="w-4 h-4 rounded-full border-2 border-brutal-bg border-t-transparent animate-spin" /> Generating Threat Model...</>
                ) : (
                  <><BrainCircuit className="w-5 h-5" /> Generate Threat Model</>
                )}
              </button>
            </div>
            
          </motion.div>

          {/* Right panel: Diagram and threat cards output */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
            
            {threatModel ? (
              <>
                {/* Mermaid Architecture Diagram */}
                <div className="border-4 border-brutal-text bg-white shadow-[12px_12px_0px_0px_rgba(28,28,28,1)] overflow-hidden">
                  <div className="bg-brutal-text p-4 border-b-4 border-brutal-text text-brutal-bg flex items-center justify-between">
                    <h2 className="font-bold uppercase tracking-[0.2em] flex items-center gap-3">
                      <Cpu className="w-5 h-5" /> Architecture & Trust Boundaries
                    </h2>
                  </div>
                  <div className="p-6 bg-white overflow-x-auto">
                    <MermaidRenderer chart={threatModel.mermaid_diagram} />
                  </div>
                </div>

                {/* STRIDE methodology Threats */}
                <div className="space-y-4">
                  <h2 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-brutal-orange" />
                    Identified STRIDE Threats ({ecosystem})
                  </h2>
                  <div className="grid gap-6">
                    {threatModel.threats.map((threat: any, idx: number) => (
                      <div key={idx} className="border-4 border-brutal-text bg-white p-6 shadow-[8px_8px_0px_0px_rgba(28,28,28,1)] relative overflow-hidden group">
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 border-2 border-brutal-text bg-brutal-bg">
                              {getCategoryIcon(threat.category)}
                            </div>
                            <div>
                              <h3 className="font-bold text-lg leading-tight">{threat.threat_name}</h3>
                              <p className="text-[10px] text-brutal-text/60 uppercase tracking-widest font-mono font-bold mt-1">
                                Category: {threat.category}
                              </p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-widest border-2 ${getSeverityStyle(threat.risk_level)}`}>
                            {threat.risk_level} Risk
                          </span>
                        </div>
                        <div className="space-y-4 font-mono text-sm leading-relaxed text-brutal-text">
                          <p>
                            <span className="font-bold uppercase text-xs text-brutal-text/50 block mb-1">Description:</span>
                            {threat.description}
                          </p>
                          <div className="p-4 bg-brutal-orange/10 border-2 border-brutal-text">
                            <span className="font-bold uppercase text-xs text-brutal-orange flex items-center gap-1.5 mb-1.5">
                              <ShieldCheck className="w-4 h-4"/> Mitigation Recommendation:
                            </span>
                            <p className="text-xs text-brutal-text">{threat.mitigation}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="border-4 border-dashed border-brutal-text/20 bg-white p-12 text-center flex flex-col items-center justify-center min-h-[450px] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.05)]">
                <BrainCircuit className="w-16 h-16 mb-4 text-brutal-text/20 animate-pulse" />
                <h3 className="text-xl font-bold uppercase tracking-widest text-brutal-text/40 mb-2">No Model Generated</h3>
                <p className="max-w-md font-mono text-xs text-brutal-text/50">
                  Select your ecosystem (Rust/Soroban or Solidity), paste your smart contract source code, and hit generate. 
                  Our security oracle will build an architectural boundary map and inspect for STRIDE threats.
                </p>
              </div>
            )}
            
          </motion.div>
        </div>
      </div>
    </div>
  );
}
