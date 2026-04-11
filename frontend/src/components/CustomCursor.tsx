"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

if (typeof window !== 'undefined') {
  gsap.registerPlugin(useGSAP);
}

export default function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const followerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    document.body.style.cursor = "none";
    
    const cursor = cursorRef.current;
    const follower = followerRef.current;
    if (!cursor || !follower) return;

    // Force 3D translates to bypass standard rendering lag
    gsap.set([cursor, follower], { force3D: true, xPercent: -50, yPercent: -50 });

    let isHovering = false;

    // Kept the new optimized speeds!
    const xToCursor = gsap.quickTo(cursor, "x", { duration: 0.05, ease: "power3.out" });
    const yToCursor = gsap.quickTo(cursor, "y", { duration: 0.05, ease: "power3.out" });
    
    const xToFollower = gsap.quickTo(follower, "x", { duration: 0.15, ease: "power3.out" });
    const yToFollower = gsap.quickTo(follower, "y", { duration: 0.15, ease: "power3.out" });

    const onMouseMove = (e: MouseEvent) => {
      xToCursor(e.clientX);
      yToCursor(e.clientY);
      xToFollower(e.clientX);
      yToFollower(e.clientY);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        (target.tagName && ["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) ||
        target.closest("button") || 
        target.closest("a")
      ) {
        isHovering = true;
        gsap.to(cursor, { scale: 0, opacity: 0, duration: 0.15 });
        // The beautiful original inversion, using pure white difference blend!
        gsap.to(follower, { 
          scale: 2.5, 
          backgroundColor: "#FFF", 
          borderColor: "transparent", 
          duration: 0.25, 
          ease: "back.out(2)" 
        });
      } else {
        isHovering = false;
        gsap.to(cursor, { scale: 1, opacity: 1, duration: 0.15 });
        gsap.to(follower, { 
          scale: 1, 
          backgroundColor: "transparent", 
          borderColor: "#FFF", 
          duration: 0.25, 
          ease: "back.out(2)" 
        });
      }
    };

    const handleMouseDown = () => {
        gsap.to(follower, { scale: isHovering ? 2 : 0.5, duration: 0.1 });
    };

    const handleMouseUp = () => {
        gsap.to(follower, { scale: isHovering ? 2.5 : 1, duration: 0.1 });
    };

    const style = document.createElement("style");
    style.innerHTML = `* { cursor: none !important; }`;
    document.head.appendChild(style);

    // Passive listeners prevent scroll-thread blocking
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseover", handleMouseOver, { passive: true });
    window.addEventListener("mousedown", handleMouseDown, { passive: true });
    window.addEventListener("mouseup", handleMouseUp, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseover", handleMouseOver);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "auto";
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  return (
    <>
      <div 
        ref={followerRef} 
        className="fixed pointer-events-none z-[99999]"
        style={{ 
          width: '32px', 
          height: '32px', 
          borderRadius: '50%', 
          border: '2px solid #FFF', 
          top: 0, 
          left: 0,
          mixBlendMode: 'difference'
        }}
      />
      <div 
        ref={cursorRef} 
        className="fixed pointer-events-none z-[999999]"
        style={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '50%', 
          backgroundColor: '#FFF', 
          top: 0, 
          left: 0,
          mixBlendMode: 'difference'
        }}
      />
    </>
  );
}
