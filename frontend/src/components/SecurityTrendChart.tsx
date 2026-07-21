"use client";

import React, { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ShieldAlert, Info } from "lucide-react";

interface HistoricalMetric {
  date: string;
  vuln_count: number;
  clean_count: number;
}

export default function SecurityTrendChart() {
  const [data, setData] = useState<HistoricalMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistorical = async () => {
      try {
        const res = await fetch("/api/metrics/historical");
        const json = await res.json();
        if (json.metrics) {
          setData(json.metrics);
        }
      } catch (e) {
        console.error("Failed to fetch historical metrics", e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistorical();
  }, []);

  return (
    <div className="border-4 border-brutal-text p-6 shadow-[8px_8px_0px_0px_rgba(28,28,28,1)] bg-white relative overflow-hidden group">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brutal-text text-brutal-bg border-2 border-brutal-text">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="font-bold tracking-widest uppercase text-lg">30-Day Security Health</h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-widest opacity-60">
          <Info className="w-4 h-4" /> Real-Time Node Data
        </div>
      </div>

      <div className="h-64 w-full">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center font-mono uppercase tracking-widest text-brutal-text opacity-50">
            Fetching Data...
          </div>
        ) : data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center font-mono uppercase tracking-widest text-brutal-text opacity-50">
            No historical data found. Seed the network to begin tracking.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVuln" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff4d00" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff4d00" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorClean" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0055ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0055ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1c1c1c" opacity={0.2} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#1c1c1c", fontSize: 12, fontFamily: "monospace" }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#1c1c1c", fontSize: 12, fontFamily: "monospace" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#F2F0EB",
                  border: "4px solid #1c1c1c",
                  boxShadow: "4px 4px 0px 0px rgba(28,28,28,1)",
                  fontFamily: "monospace",
                  textTransform: "uppercase"
                }}
              />
              <Area 
                type="step" 
                dataKey="clean_count" 
                name="Secure Scans"
                stroke="#0055ff" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorClean)" 
              />
              <Area 
                type="step" 
                dataKey="vuln_count" 
                name="Vulnerabilities"
                stroke="#ff4d00" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorVuln)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      
      <div className="flex gap-6 mt-4">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest font-bold">
          <div className="w-3 h-3 bg-[#0055ff] border border-brutal-text"></div>
          Secure Scans
        </div>
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest font-bold">
          <div className="w-3 h-3 bg-[#ff4d00] border border-brutal-text"></div>
          Vulnerabilities
        </div>
      </div>
    </div>
  );
}
