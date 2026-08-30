"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

/**
 * Pure CSS-3D AI Robot with mouse parallax, floating animation,
 * glowing eyes, orbiting rings and holographic base.
 */
export function Robot3D() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 15 });
  const sy = useSpring(my, { stiffness: 60, damping: 15 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [-22, 22]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [16, -16]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  return (
    <div className="relative flex items-center justify-center" style={{ perspective: 1200 }}>
      {/* glow behind robot */}
      <div className="absolute w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-amber-500/30 via-orange-600/30 to-rose-500/30 blur-[100px] animate-pulse" />

      {/* orbiting rings */}
      <motion.div
        className="absolute w-[440px] h-[440px] rounded-full border border-amber-400/20"
        style={{ rotateX: 70 }}
        animate={{ rotateZ: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute -top-1.5 left-1/2 w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_20px_4px_rgba(251,191,36,0.8)]" />
      </motion.div>
      <motion.div
        className="absolute w-[520px] h-[520px] rounded-full border border-rose-400/15"
        style={{ rotateX: 70 }}
        animate={{ rotateZ: -360 }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-1/2 -right-1.5 w-2.5 h-2.5 rounded-full bg-rose-400 shadow-[0_0_16px_4px_rgba(251,113,133,0.7)]" />
      </motion.div>

      {/* floating robot */}
      <motion.div
        animate={{ y: [0, -22, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
          className="relative w-[260px] h-[360px]"
        >
          {/* ===== HEAD ===== */}
          <div
            className="absolute left-1/2 top-0 -transtone-x-1/2 w-[190px] h-[150px] rounded-[42px] bg-gradient-to-b from-stone-100 via-stone-300 to-stone-400 shadow-[inset_0_-14px_24px_rgba(0,0,0,0.25),0_25px_60px_rgba(251,191,36,0.25)]"
            style={{ transformStyle: "preserve-3d", transform: "translateZ(40px)" }}
          >
            {/* face screen */}
            <div className="absolute inset-x-4 top-6 bottom-6 rounded-[28px] bg-gradient-to-br from-[#171208] to-[#241A0C] overflow-hidden border border-amber-400/30 shadow-[inset_0_0_30px_rgba(251,191,36,0.15)]">
              <motion.div
                className="absolute left-9 top-1/2 -transtone-y-1/2 w-8 h-10 rounded-full bg-amber-400 shadow-[0_0_25px_6px_rgba(251,191,36,0.7)]"
                animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
                transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }}
              />
              <motion.div
                className="absolute right-9 top-1/2 -transtone-y-1/2 w-8 h-10 rounded-full bg-amber-400 shadow-[0_0_25px_6px_rgba(251,191,36,0.7)]"
                animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
                transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }}
              />
              <div className="absolute left-1/2 -transtone-x-1/2 bottom-4 w-14 h-4 border-b-4 border-amber-300/90 rounded-b-full" />
              <motion.div
                className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-amber-400/15 to-transparent"
                animate={{ top: ["-20%", "120%"] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
              />
            </div>
            {/* ear pods */}
            <div className="absolute -left-4 top-1/2 -transtone-y-1/2 w-5 h-14 rounded-full bg-gradient-to-b from-orange-500 to-rose-600 shadow-[0_0_20px_rgba(249,115,22,0.7)]" />
            <div className="absolute -right-4 top-1/2 -transtone-y-1/2 w-5 h-14 rounded-full bg-gradient-to-b from-orange-500 to-rose-600 shadow-[0_0_20px_rgba(249,115,22,0.7)]" />
            {/* antenna */}
            <div className="absolute left-1/2 -transtone-x-1/2 -top-10 w-1.5 h-10 bg-gradient-to-t from-stone-400 to-stone-200 rounded-full">
              <motion.div
                className="absolute -top-3 left-1/2 -transtone-x-1/2 w-4 h-4 rounded-full bg-rose-400 shadow-[0_0_18px_5px_rgba(251,113,133,0.8)]"
                animate={{ scale: [1, 1.35, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
            </div>
          </div>


          {/* ===== NECK ===== */}
          <div
            className="absolute left-1/2 top-[152px] -transtone-x-1/2 w-12 h-6 bg-gradient-to-b from-stone-500 to-stone-600 rounded"
            style={{ transform: "translateZ(20px)" }}
          />

          {/* ===== BODY ===== */}
          <div
            className="absolute left-1/2 top-[176px] -transtone-x-1/2 w-[150px] h-[130px] rounded-[36px] bg-gradient-to-b from-stone-200 via-stone-300 to-stone-500 shadow-[inset_0_-12px_20px_rgba(0,0,0,0.3),0_20px_50px_rgba(249,115,22,0.25)]"
            style={{ transform: "translateZ(30px)" }}
          >
            <motion.div
              className="absolute left-1/2 top-1/2 -transtone-x-1/2 -transtone-y-1/2 w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-orange-500"
              animate={{
                boxShadow: [
                  "0 0 20px 4px rgba(251,191,36,0.5)",
                  "0 0 45px 12px rgba(249,115,22,0.7)",
                  "0 0 20px 4px rgba(251,191,36,0.5)",
                ],
              }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              <div className="absolute inset-2 rounded-full bg-[#171208]" />
              <motion.div
                className="absolute inset-4 rounded-full bg-gradient-to-br from-amber-400 to-rose-500"
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          </div>

          {/* ===== ARMS ===== */}
          <motion.div
            className="absolute left-[-6px] top-[190px] w-10 h-24 rounded-full bg-gradient-to-b from-stone-300 to-stone-500 origin-top"
            style={{ transform: "translateZ(10px)" }}
            animate={{ rotate: [8, 16, 8] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute -bottom-3 left-1/2 -transtone-x-1/2 w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_0_15px_rgba(251,191,36,0.6)]" />
          </motion.div>
          <motion.div
            className="absolute right-[-6px] top-[190px] w-10 h-24 rounded-full bg-gradient-to-b from-stone-300 to-stone-500 origin-top"
            style={{ transform: "translateZ(10px)" }}
            animate={{ rotate: [-8, -16, -8] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          >
            <div className="absolute -bottom-3 left-1/2 -transtone-x-1/2 w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_0_15px_rgba(251,191,36,0.6)]" />
          </motion.div>

          {/* ===== HOLO BASE ===== */}
          <motion.div
            className="absolute left-1/2 -transtone-x-1/2 bottom-[-18px] w-[220px] h-[50px] rounded-[50%] bg-gradient-to-r from-amber-500/40 via-orange-500/40 to-rose-500/40 blur-md"
            animate={{ scaleX: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </motion.div>
      </motion.div>

      {/* floating particles */}
      {[
        { x: -170, y: -60, d: 0 },
        { x: 180, y: -110, d: 0.8 },
        { x: -150, y: 130, d: 1.6 },
        { x: 165, y: 110, d: 2.2 },
        { x: 0, y: -180, d: 1.1 },
      ].map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-amber-300 shadow-[0_0_12px_3px_rgba(251,191,36,0.7)]"
          style={{ left: `calc(50% + ${p.x}px)`, top: `calc(50% + ${p.y}px)` }}
          animate={{ y: [0, -18, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 3.5, repeat: Infinity, delay: p.d }}
        />
      ))}
    </div>
  );
}
