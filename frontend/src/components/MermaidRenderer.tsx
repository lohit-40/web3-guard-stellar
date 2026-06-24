"use client";

import React, { useEffect, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "monospace",
});

export default function MermaidRenderer({ chart }: { chart: string }) {
  const [svgCode, setSvgCode] = useState<string>("");

  useEffect(() => {
    if (!chart) return;
    const renderChart = async () => {
      try {
        const id = `mermaid-svg-${Math.round(Math.random() * 1000000)}`;
        const { svg } = await mermaid.render(id, chart);
        setSvgCode(svg);
      } catch (e) {
        console.error("Mermaid parsing error:", e);
        setSvgCode(`<div class="text-red-400">Failed to render architecture diagram. Validating mermaid syntax...</div>`);
      }
    };
    renderChart();
  }, [chart]);

  return (
    <div 
      dangerouslySetInnerHTML={{ __html: svgCode }} 
      className="flex justify-center overflow-x-auto w-full p-4 bg-white/5 border border-white/10 rounded-xl my-4" 
    />
  );
}
