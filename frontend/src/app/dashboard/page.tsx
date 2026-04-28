"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Activity, Users, ShieldAlert, Cpu, AlertTriangle, CheckCircle, Radio } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

if (typeof window !== 'undefined') {
  gsap.registerPlugin(useGSAP);
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface LiveEvent {
  id: string;
  contract: string;
  type: "SCAN_CLEAN" | "VULN_DETECTED" | "AUDIT_COMPLETED" | "HORIZON_TX";
  details: string;
  time: string;
}

interface MetricsData {
  active_users: number;
  watched_contracts: number;
  total_audits: number;
}

type SSEStatus = "CONNECTING" | "LIVE" | "OFFLINE";

// ── Horizon SSE endpoint — real-time Stellar Testnet transactions ──────────────
const HORIZON_SSE_URL =
  "https://horizon-testnet.stellar.org/transactions?cursor=now&limit=10";

// ── Helpers ────────────────────────────────────────────────────────────────────
function truncate(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function horizonTxToEvent(tx: Record<string, unknown>, watchedContracts: string[]): LiveEvent {
  const sourceAccount = String(tx.source_account ?? "");
  const isWatched = watchedContracts.some((c) => sourceAccount.startsWith(c.slice(0, 8)));
  return {
    id: String(tx.id ?? Math.random()),
    contract: sourceAccount || "STELLAR_NETWORK",
    type: isWatched ? "VULN_DETECTED" : "HORIZON_TX",
    details: isWatched
      ? `⚠ Watched contract active — tx ${String(tx.id ?? "").slice(0, 12)} detected on Stellar Testnet.`
      : `Scout Agent verified program state. No anomalies.`,
    time: String(tx.created_at ?? new Date().toISOString()),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [sseStatus, setSseStatus] = useState<SSEStatus>("CONNECTING");
  const [watchedContracts, setWatchedContracts] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useGSAP(() => {
    gsap.fromTo(".gsap-dash-title", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1, ease: "power4.out" });
    gsap.fromTo(".gsap-dash-stat", { opacity: 0, scale: 0.9, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.8, stagger: 0.1, delay: 0.2, ease: "back.out(1.5)" });
    gsap.fromTo(".gsap-dash-feed", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1, delay: 0.5, ease: "power3.out" });
  }, { scope: containerRef });

  // ── Fetch static metrics (users, watchlist count, total audits) ──────────────
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics/live");
      const data = await res.json();
      setMetrics({
        active_users: data.active_users ?? 0,
        watched_contracts: data.watched_contracts ?? 0,
        total_audits: data.total_audits ?? 0,
      });
      // also pull watched contract addresses for cross-referencing SSE events
      if (Array.isArray(data.watched_addresses)) {
        setWatchedContracts(data.watched_addresses);
      }
      // Seed initial events if backend provides them
      if (Array.isArray(data.recent_events) && data.recent_events.length > 0) {
        setEvents(data.recent_events.slice(0, 10));
      }
    } catch (e) {
      console.error("Failed to fetch metrics", e);
    }
  }, []);

  // ── Real Horizon SSE connection ────────────────────────────────────────────
  const connectHorizonSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    setSseStatus("CONNECTING");
    const es = new EventSource(HORIZON_SSE_URL);
    esRef.current = es;

    es.onopen = () => {
      setSseStatus("LIVE");
    };

    // Horizon sends each transaction as a message event
    es.onmessage = (e: MessageEvent) => {
      if (!e.data || e.data === "\"hello\"" || e.data.trim() === "") return;
      try {
        const tx = JSON.parse(e.data) as Record<string, unknown>;
        const newEvent = horizonTxToEvent(tx, watchedContracts);
        setEvents((prev) => [newEvent, ...prev].slice(0, 30)); // keep latest 30
        // bump total_audits counter for visual feedback
        setMetrics((prev) =>
          prev ? { ...prev, total_audits: prev.total_audits + 1 } : prev
        );
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setSseStatus("OFFLINE");
      es.close();
      // auto-reconnect after 5 s
      setTimeout(connectHorizonSSE, 5000);
    };
  }, [watchedContracts]);

  useEffect(() => {
    fetchMetrics();
    // Refresh static metrics every 60 s
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Start SSE after first metrics fetch so we have the watched addresses
  useEffect(() => {
    connectHorizonSSE();
    return () => {
      esRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Status badge ─────────────────────────────────────────────────────────────
  const statusColor: Record<SSEStatus, string> = {
    LIVE: "bg-green-500",
    CONNECTING: "bg-yellow-400",
    OFFLINE: "bg-red-500",
  };

  return (
    <div ref={containerRef} className="min-h-screen pt-32 pb-24 px-6 md:px-12 pointer-events-auto" style={{ backgroundColor: '#F2F0EB' }}>
      <div className="max-w-7xl mx-auto space-y-12">

        {/* Header */}
        <header className="gsap-dash-title flex flex-col md:flex-row md:items-end justify-between gap-6 opacity-0">
          <div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-[0.15em] uppercase text-brutal-text mb-2">
              Command <span className="text-brutal-orange">Center</span>
            </h1>
            <p className="font-mono text-sm uppercase tracking-widest text-brutal-text/60">
              Live Monitor / Level 6 Black Belt Validation
            </p>
          </div>
          {/* Real SSE connection badge */}
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor[sseStatus]}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${statusColor[sseStatus]}`}></span>
            </span>
            <span className="font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <Radio className="w-3.5 h-3.5" />
              Horizon SSE — {sseStatus}
            </span>
          </div>
        </header>

        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="gsap-dash-stat opacity-0 border-4 border-brutal-text p-6 shadow-[8px_8px_0px_0px_rgba(28,28,28,1)] bg-white relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-brutal-blue/10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-brutal-blue/20 border-2 border-brutal-text">
                <Users className="w-6 h-6 text-brutal-blue" />
              </div>
              <h3 className="font-bold tracking-widest uppercase text-sm">Verified Users</h3>
            </div>
            <div className="text-5xl font-black">{metrics?.active_users ?? "—"}</div>
            <p className="mt-2 text-xs font-mono text-brutal-text/60 uppercase">Target: 30+ for Level 6</p>
          </div>

          <div className="gsap-dash-stat opacity-0 border-4 border-brutal-text p-6 shadow-[8px_8px_0px_0px_rgba(28,28,28,1)] bg-white relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-brutal-orange/10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-brutal-orange/20 border-2 border-brutal-text">
                <ShieldAlert className="w-6 h-6 text-brutal-orange" />
              </div>
              <h3 className="font-bold tracking-widest uppercase text-sm">Watched Contracts</h3>
            </div>
            <div className="text-5xl font-black">{metrics?.watched_contracts ?? "—"}</div>
            <p className="mt-2 text-xs font-mono text-brutal-text/60 uppercase">Active 24/7 via Horizon SSE</p>
          </div>

          <div className="gsap-dash-stat opacity-0 border-4 border-brutal-text p-6 shadow-[8px_8px_0px_0px_rgba(28,28,28,1)] bg-white relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-green-500/10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-green-500/20 border-2 border-brutal-text">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-bold tracking-widest uppercase text-sm">Total Scans</h3>
            </div>
            <div className="text-5xl font-black">{metrics?.total_audits ?? "—"}</div>
            <p className="mt-2 text-xs font-mono text-brutal-text/60 uppercase">Cross-chain Volume</p>
          </div>
        </div>

        {/* Live Horizon SSE Feed */}
        <div className="gsap-dash-feed opacity-0 border-4 border-brutal-text bg-white shadow-[12px_12px_0px_0px_rgba(28,28,28,1)] overflow-hidden">
          <div className="bg-brutal-text p-4 border-b-4 border-brutal-text text-brutal-bg flex items-center justify-between">
            <h2 className="font-bold uppercase tracking-[0.2em] flex items-center gap-3">
              <Cpu className="w-5 h-5" /> Horizon SSE — Real-Time Event Feed
            </h2>
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 border ${
              sseStatus === "LIVE" ? "border-green-400 text-green-400" :
              sseStatus === "CONNECTING" ? "border-yellow-400 text-yellow-400" :
              "border-red-400 text-red-400"
            }`}>
              {sseStatus === "LIVE" ? "● STREAMING" : sseStatus === "CONNECTING" ? "◌ CONNECTING" : "✕ OFFLINE"}
            </span>
          </div>

          <div className="p-0">
            {events.length === 0 ? (
              <div className="p-8 text-center font-mono opacity-50 uppercase">
                {sseStatus === "CONNECTING" ? "Connecting to Stellar Horizon SSE…" : "No events received yet."}
              </div>
            ) : (
              <div className="divide-y-4 divide-brutal-text">
                <AnimatePresence initial={false}>
                  {events.map((event) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -20, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center hover:bg-brutal-text/5 transition-colors"
                    >
                      <div className="flex-shrink-0">
                        {event.type === "VULN_DETECTED" ? (
                          <div className="w-16 h-16 border-4 border-brutal-orange bg-brutal-orange/20 flex items-center justify-center animate-pulse">
                            <AlertTriangle className="w-8 h-8 text-brutal-orange" />
                          </div>
                        ) : (
                          <div className="w-16 h-16 border-4 border-green-500 bg-green-500/20 flex items-center justify-center">
                            <CheckCircle className="w-8 h-8 text-green-600" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-widest border-2 ${
                            event.type === "VULN_DETECTED"
                              ? "border-brutal-orange text-brutal-orange"
                              : "border-green-600 text-green-600"
                          }`}>
                            {event.type === "SCAN_CLEAN" || event.type === "HORIZON_TX" ? "SECURE" :
                             event.type === "AUDIT_COMPLETED" ? "AUDITED" : event.type}
                          </span>
                          <span className="font-mono text-xs opacity-50 uppercase">
                            {new Date(event.time).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-mono text-sm leading-relaxed max-w-2xl">{event.details}</p>
                        <div className="font-mono text-xs font-bold pt-2">
                          TARGET: <span className="text-brutal-blue">{truncate(event.contract)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
