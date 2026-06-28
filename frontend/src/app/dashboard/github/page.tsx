"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, Plus, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "react-hot-toast";

export default function GithubDashboard() {
  const [installations, setInstallations] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [rules, setRules] = useState<any[]>([]);
  const [newRule, setNewRule] = useState("");
  const [severity, setSeverity] = useState("High");

  useEffect(() => {
    fetch("/api/github/status")
      .then((res) => res.json())
      .then((data) => {
        setInstallations(data.installations || []);
        if (data.installations && data.installations.length > 0) {
          setSelectedRepo(data.installations[0].account_name);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    fetch(`/api/github/custom_rules/${selectedRepo}`)
      .then((res) => res.json())
      .then((data) => setRules(data.rules || []))
      .catch(console.error);
  }, [selectedRepo]);

  const handleAddRule = async () => {
    if (!newRule.trim()) return;
    const toastId = toast.loading("Adding custom rule...");
    try {
      const res = await fetch("/api/github/custom_rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_owner: selectedRepo,
          rule_text: newRule,
          severity: severity
        })
      });
      const data = await res.json();
      setRules(data.rules);
      setNewRule("");
      toast.success("Custom rule added!", { id: toastId });
    } catch (error) {
      toast.error("Failed to add rule", { id: toastId });
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

  return (
    <div className="min-h-screen pt-32 pb-24 px-6 md:px-24 pointer-events-auto text-brutal-text" style={{ backgroundColor: "#F2F0EB" }}>
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b-4 border-brutal-text">
          <div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-[0.15em] uppercase text-brutal-text mb-2">
              GitHub <span className="text-brutal-orange">Integration</span>
            </h1>
            <p className="font-mono text-sm uppercase tracking-widest text-brutal-text/60">
              Manage connected repositories, auto-patching PR bots, and custom rules in natural language
            </p>
          </div>
          <a 
            href="https://github.com/apps/web3-guard-bot/installations/new" 
            target="_blank" 
            rel="noreferrer" 
            className="flex items-center gap-3 px-6 py-3 border-2 border-brutal-text bg-brutal-text text-brutal-bg hover:bg-brutal-orange hover:border-brutal-orange hover:text-white text-xs tracking-[0.2em] font-bold uppercase transition-all shadow-[4px_4px_0px_0px_rgba(28,28,28,1)] hover:shadow-[4px_4px_0px_0px_rgba(255,69,34,1)] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Install GitHub App
          </a>
        </header>

        <div className="grid lg:grid-cols-[1fr_2fr] gap-12 items-start">
          {/* Repositories Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="border-4 border-brutal-text p-6 bg-white shadow-[8px_8px_0px_0px_rgba(28,28,28,1)]">
            <h2 className="text-xl font-bold tracking-widest uppercase mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brutal-orange" />
              Connected Accounts
            </h2>
            {installations.length === 0 ? (
              <div className="p-4 border-2 border-dashed border-brutal-text/20 font-mono text-xs text-brutal-text/50">
                No GitHub installations detected. Connect Web3 Guard to your repository to get started.
              </div>
            ) : (
              <div className="grid gap-4">
                {installations.map((inst, idx) => (
                  <div 
                    key={idx} 
                    className={`p-4 border-2 transition cursor-pointer flex flex-col justify-between gap-3 ${
                      selectedRepo === inst.account_name 
                        ? 'border-brutal-orange bg-brutal-orange/5' 
                        : 'border-brutal-text/20 hover:border-brutal-text bg-white'
                    }`} 
                    onClick={() => setSelectedRepo(inst.account_name)}
                  >
                    <div>
                      <div className="font-bold text-lg leading-snug">{inst.account_name}</div>
                      <div className="font-mono text-xs text-brutal-text/50 mt-1">ID: {inst.installation_id}</div>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-green-500 bg-green-50 text-green-600 font-mono text-[9px] font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Active & Listening
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Custom Rules Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="border-4 border-brutal-text p-6 bg-white shadow-[12px_12px_0px_0px_rgba(28,28,28,1)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 pb-4 border-b-2 border-brutal-text/10 gap-2">
              <h2 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-brutal-orange" />
                Custom Rules (NLP Heuristics)
              </h2>
              <div className="font-mono text-xs uppercase text-brutal-text/60">Target: <span className="text-brutal-orange font-bold">{selectedRepo || 'None Selected'}</span></div>
            </div>
            
            <div className="grid md:grid-cols-[2fr_1fr] gap-8">
              <div className="space-y-4">
                <h3 className="font-mono text-xs uppercase font-bold text-brutal-text/50">Saved Rules Matrix</h3>
                {rules.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-brutal-text/20 text-center font-mono text-xs text-brutal-text/50">
                    No custom rules configured yet. The PR bot will scan for standard vulnerabilities.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rules.map((rule, idx) => (
                      <div key={idx} className="p-4 border-2 border-brutal-text bg-brutal-bg flex justify-between items-start gap-4">
                        <p className="font-mono text-xs leading-relaxed">{rule.rule_text}</p>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest border-2 whitespace-nowrap ${getSeverityStyle(rule.severity)}`}>
                          {rule.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="font-mono text-xs uppercase font-bold text-brutal-text/50">Add Custom Rule</h3>
                <textarea 
                  className="w-full bg-white border-2 border-brutal-text p-3 text-xs font-mono focus:outline-none focus:border-brutal-orange resize-none h-32"
                  placeholder="e.g. Ensure all critical parameters emit a security event log when updated."
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                />
                <div className="flex flex-col gap-2">
                  <select 
                    className="bg-white border-2 border-brutal-text px-3 py-2 font-mono text-xs uppercase font-bold focus:outline-none focus:border-brutal-orange text-brutal-text" 
                    value={severity} 
                    onChange={(e) => setSeverity(e.target.value)}
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  <button 
                    onClick={handleAddRule} 
                    disabled={!selectedRepo} 
                    className="w-full border-4 border-brutal-text bg-brutal-text text-brutal-bg hover:bg-brutal-orange hover:border-brutal-orange hover:text-white px-4 py-2 text-xs tracking-[0.2em] font-bold uppercase transition-all shadow-[4px_4px_0px_0px_rgba(28,28,28,1)] hover:shadow-[4px_4px_0px_0px_rgba(255,69,34,1)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Save Rule
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

      </div>
    </div>
  );
}
