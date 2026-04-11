"use client";
import { useEffect, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*<>";

export default function ScrambleText({ text, className = "", delayMs = 400 }: { text: string; className?: string; delayMs?: number }) {
  // Start with the EXACT text so Server-Side Rendering perfectly matches the initial Client-Side render.
  // This completely eliminates any Next.js React Hydration errors.
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    let iteration = 0;
    const maxIterations = text.length;
    let interval: ReturnType<typeof setInterval>;
    
    // Immediately clear the text into spaces as soon as React mounts on the client
    setDisplayText(text.replace(/[^\n\s]/g, " "));
    
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        setDisplayText((prev) => {
          const current = prev.split("");
          for (let i = 0; i < text.length; i++) {
            if (i < iteration) {
              current[i] = text[i];
            } else if (text[i] !== " " && text[i] !== "\n") {
              current[i] = CHARS[Math.floor(Math.random() * CHARS.length)];
            } else {
              current[i] = text[i]; // Preserve spaces and line breaks
            }
          }
          return current.join("");
        });
        
        if (iteration >= maxIterations) {
          clearInterval(interval);
          setDisplayText(text);
        }
        
        iteration += 1/3;
      }, 30);
    }, delayMs);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [text, delayMs]);

  return <span suppressHydrationWarning className={className} style={{ whiteSpace: "pre-line" }}>{displayText}</span>;
}
