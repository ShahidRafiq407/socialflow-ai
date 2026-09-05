"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

/**
 * Loom — High-End Autonomous AI Marketing Droid.
 *
 * Sculpted obsidian-titanium chassis, living holographic visor with neural waveform,
 * aerodynamic floating magnetic stabilizer foils, and floating marketing telemetry chips.
 * Natural, organic lighting and smooth spring-physics parallax that stays
 * 100% mobile-first responsive and non-blocking for touch scrolling.
 */
export function Robot3D() {
  const [isMobile, setIsMobile] = useState(false);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 45, damping: 18 });
  const sy = useSpring(my, { stiffness: 45, damping: 18 });

  const rotateY = useTransform(sx, [-0.5, 0.5], [-16, 16]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [12, -12]);
  const wingTiltLeft = useTransform(sx, [-0.5, 0.5], [4, -14]);
  const wingTiltRight = useTransform(sx, [-0.5, 0.5], [14, -4]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);

    const onMove = (e: MouseEvent) => {
      if (window.innerWidth >= 768) {
        mx.set(e.clientX / window.innerWidth - 0.5);
        my.set(e.clientY / window.innerHeight - 0.5);
      }
    };
    window.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("resize", checkMobile);
      window.removeEventListener("mousemove", onMove);
    };
  }, [mx, my]);

  return (
    <div
      className="relative flex items-center justify-center select-none w-full max-w-[280px] sm:max-w-[340px] md:max-w-[440px] mx-auto py-3 sm:py-6"
      style={{ perspective: 1100 }}
    >
      {/* Volumetric ambient back-glows (soft, atmospheric lighting) */}
      <div className="absolute w-[240px] sm:w-[340px] md:w-[420px] h-[240px] sm:h-[340px] md:h-[420px] rounded-full bg-[#18713C]/15 dark:bg-[#18713C]/20 blur-[80px] sm:blur-[90px] pointer-events-none" />
      <div className="absolute w-[200px] sm:w-[280px] md:w-[360px] h-[200px] sm:h-[280px] md:h-[360px] rounded-full bg-[#48357B]/15 dark:bg-[#48357B]/25 blur-[90px] sm:blur-[100px] pointer-events-none -translate-y-4 sm:-translate-y-6" />

      {/* Subtle orbital energy horizon */}
      <motion.div
        className="absolute w-[240px] sm:w-[320px] md:w-[400px] h-[90px] sm:h-[110px] md:h-[130px] rounded-[50%] border border-[#18713C]/20 dark:border-[#3DB36B]/20 pointer-events-none"
        style={{ rotateX: 72 }}
        animate={{ rotateZ: 360 }}
        transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#18713C] dark:bg-[#3DB36B] shadow-[0_0_12px_2px_#3DB36B]" />
      </motion.div>

      {/* Floating Marketing Telemetry Card 1 — Top Left */}
      <motion.div
        className="absolute -top-1 sm:top-2 left-0 sm:-left-4 z-30 pointer-events-none"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/90 dark:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)] text-[10px] sm:text-[11px] font-medium text-slate-700 dark:text-slate-200">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-semibold text-slate-900 dark:text-white">Autopilot Active</span>
          <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 hidden sm:inline">· 6 platforms</span>
        </div>
      </motion.div>

      {/* Floating Marketing Telemetry Card 2 — Bottom Right */}
      <motion.div
        className="absolute -bottom-1 sm:bottom-4 right-0 sm:-right-4 z-30 pointer-events-none"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/90 dark:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)] text-[10px] sm:text-[11px] font-medium text-slate-700 dark:text-slate-200">
          <Zap className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-amber-500 shrink-0" />
          <div>
            <span className="font-semibold text-slate-900 dark:text-white">Peak Timing Pick</span>
            <span className="text-[9px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 ml-1 font-bold">+42% reach</span>
          </div>
        </div>
      </motion.div>

      {/* Floating Droid Assembly with Levitation Physics */}
      <motion.div
        animate={{ y: [0, -18, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <motion.div
          style={{
            rotateX: isMobile ? 0 : rotateX,
            rotateY: isMobile ? 0 : rotateY,
            transformStyle: "preserve-3d",
          }}
          className="relative w-[210px] sm:w-[250px] md:w-[260px] h-[300px] sm:h-[340px] md:h-[360px] flex items-center justify-center"
        >
          {/* ===== HEAD & LIVING VISOR ===== */}
          <div
            className="absolute left-1/2 top-3 sm:top-4 -translate-x-1/2 w-[155px] sm:w-[175px] md:w-[188px] h-[125px] sm:h-[140px] md:h-[150px] rounded-[38px] sm:rounded-[44px] bg-gradient-to-b from-white via-slate-100 to-slate-200 dark:from-slate-800 dark:via-[#131720] dark:to-slate-950 border border-slate-300/80 dark:border-white/15 shadow-[inset_0_2px_4px_rgba(255,255,255,0.9),inset_0_-4px_10px_rgba(0,0,0,0.06),0_15px_35px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-8px_16px_rgba(0,0,0,0.7),0_20px_45px_rgba(0,0,0,0.6)]"
            style={{ transformStyle: "preserve-3d", transform: "translateZ(36px)" }}
          >
            {/* Specular curved reflection across crown */}
            <div className="absolute top-2 inset-x-8 h-4 rounded-full bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent blur-[1px]" />

            {/* Panoramic Curved Dark-Glass Visor */}
            <div className="absolute inset-x-3 sm:inset-x-3.5 top-4 sm:top-5 bottom-4 sm:bottom-5 rounded-[28px] sm:rounded-[32px] bg-slate-950/95 dark:bg-[#070a0d] overflow-hidden border border-emerald-500/30 dark:border-emerald-500/20 shadow-[inset_0_0_28px_rgba(61,179,107,0.15),0_4px_12px_rgba(0,0,0,0.3)] dark:shadow-[inset_0_0_28px_rgba(61,179,107,0.12),0_4px_12px_rgba(0,0,0,0.8)]">
              {/* Glass glare diagonal highlight */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.08] to-transparent pointer-events-none" />

              {/* Neural Waveform Spectrum Line (living intelligence activity) */}
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center justify-between opacity-80 pointer-events-none">
                {[14, 22, 38, 52, 32, 48, 64, 42, 28, 16].map((h, i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-b from-[#3DB36B] to-[#8B6FD8] shadow-[0_0_8px_rgba(61,179,107,0.8)]"
                    animate={{
                      height: [h * 0.4, h, h * 0.35],
                      opacity: [0.6, 1, 0.6],
                    }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.14,
                    }}
                  />
                ))}
              </div>

              {/* Living Optical Sensor Array — Left & Right subtle apertures */}
              <motion.div
                className="absolute left-7 sm:left-8 top-1/2 -translate-y-1/2 w-5 sm:w-6 h-5 sm:h-6 rounded-full border border-emerald-400/60 bg-emerald-500/10 flex items-center justify-center shadow-[0_0_14px_rgba(61,179,107,0.6)]"
                animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#3DB36B]" />
              </motion.div>

              <motion.div
                className="absolute right-7 sm:right-8 top-1/2 -translate-y-1/2 w-5 sm:w-6 h-5 sm:h-6 rounded-full border border-emerald-400/60 bg-emerald-500/10 flex items-center justify-center shadow-[0_0_14px_rgba(61,179,107,0.6)]"
                animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#3DB36B]" />
              </motion.div>

              {/* Gentle horizontal scan telemetry ray */}
              <motion.div
                className="absolute inset-x-0 h-4 bg-gradient-to-b from-transparent via-emerald-400/15 to-transparent pointer-events-none"
                animate={{ top: ["-10%", "110%"] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: "linear" }}
              />
            </div>

            {/* Aerodynamic lateral acoustic sensor pods */}
            <div className="absolute -left-2 sm:-left-2.5 top-1/2 -translate-y-1/2 w-3 sm:w-3.5 h-10 sm:h-12 rounded-full bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 dark:from-slate-700 dark:via-slate-900 dark:to-slate-950 border border-slate-300 dark:border-white/10 shadow-sm">
              <div className="absolute inset-y-2 left-0.5 sm:left-1 w-1 rounded-full bg-emerald-400/40" />
            </div>
            <div className="absolute -right-2 sm:-right-2.5 top-1/2 -translate-y-1/2 w-3 sm:w-3.5 h-10 sm:h-12 rounded-full bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 dark:from-slate-700 dark:via-slate-900 dark:to-slate-950 border border-slate-300 dark:border-white/10 shadow-sm">
              <div className="absolute inset-y-2 right-0.5 sm:right-1 w-1 rounded-full bg-emerald-400/40" />
            </div>

            {/* Integrated micro-comm link on top */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 sm:-top-2 w-8 sm:w-10 h-2 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-white/15 flex items-center justify-center">
              <div className="w-3 sm:w-4 h-1 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_#3DB36B]" />
            </div>
          </div>

          {/* ===== MAGNETIC ARTICULATED COLLAR ===== */}
          <div
            className="absolute left-1/2 top-[148px] sm:top-[166px] md:top-[174px] -translate-x-1/2 w-12 sm:w-14 h-3.5 sm:h-4 rounded-md bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 dark:from-slate-700 dark:to-slate-900 border-x border-slate-300 dark:border-white/10"
            style={{ transform: "translateZ(18px)" }}
          />

          {/* ===== CHASSIS BODY ===== */}
          <div
            className="absolute left-1/2 top-[162px] sm:top-[182px] md:top-[192px] -translate-x-1/2 w-[128px] sm:w-[145px] md:w-[154px] h-[105px] sm:h-[118px] md:h-[126px] rounded-[32px] sm:rounded-[38px] bg-gradient-to-b from-white via-slate-100 to-slate-200 dark:from-slate-800 dark:via-[#11161f] dark:to-slate-950 border border-slate-300/80 dark:border-white/15 shadow-[inset_0_2px_4px_rgba(255,255,255,0.9),inset_0_-4px_10px_rgba(0,0,0,0.06),0_15px_35px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.15),inset_0_-8px_16px_rgba(0,0,0,0.8),0_18px_40px_rgba(0,0,0,0.5)] flex items-center justify-center"
            style={{ transformStyle: "preserve-3d", transform: "translateZ(26px)" }}
          >
            {/* Luminous Central Neural Core */}
            <motion.div
              className="relative w-12 sm:w-14 h-12 sm:h-14 rounded-full bg-slate-900 dark:bg-[#080d11] border border-emerald-500/40 flex items-center justify-center"
              animate={{
                boxShadow: [
                  "0 0 16px 2px rgba(61,179,107,0.3)",
                  "0 0 32px 6px rgba(61,179,107,0.6)",
                  "0 0 16px 2px rgba(61,179,107,0.3)",
                ],
              }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* Rotating inner gyroscopic ring */}
              <motion.div
                className="absolute inset-1 rounded-full border border-dashed border-emerald-400/50"
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              />
              {/* Pulsing core orb */}
              <motion.div
                className="w-4 sm:w-5 h-4 sm:h-5 rounded-full bg-gradient-to-tr from-[#18713C] via-[#3DB36B] to-[#8B6FD8] shadow-[0_0_12px_#3DB36B]"
                animate={{ scale: [0.92, 1.08, 0.92] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          </div>

          {/* ===== FLOATING MAGNETIC STABILIZER WINGS (AERODYNAMIC) ===== */}
          {/* Left Wing */}
          <motion.div
            className="absolute left-[-4px] sm:left-[0px] md:left-[2px] top-[174px] sm:top-[194px] md:top-[204px] w-6 sm:w-7 md:w-8 h-20 sm:h-24 md:h-26 rounded-[18px] sm:rounded-[22px] bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 dark:from-slate-700 dark:via-slate-900 dark:to-slate-950 border border-slate-300 dark:border-white/15 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_25px_rgba(0,0,0,0.5)] origin-top"
            style={{
              transformStyle: "preserve-3d",
              transform: "translateZ(14px)",
              rotateZ: isMobile ? 6 : wingTiltLeft,
            }}
          >
            {/* Wing accent light ribbon */}
            <div className="absolute top-3 sm:top-4 bottom-3 sm:bottom-4 right-1 sm:right-1.5 w-1 rounded-full bg-gradient-to-b from-[#18713C] to-[#48357B] dark:from-[#3DB36B] dark:to-[#8B6FD8] shadow-[0_0_6px_rgba(61,179,107,0.7)]" />
          </motion.div>

          {/* Right Wing */}
          <motion.div
            className="absolute right-[-4px] sm:right-[0px] md:right-[2px] top-[174px] sm:top-[194px] md:top-[204px] w-6 sm:w-7 md:w-8 h-20 sm:h-24 md:h-26 rounded-[18px] sm:rounded-[22px] bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 dark:from-slate-700 dark:via-slate-900 dark:to-slate-950 border border-slate-300 dark:border-white/15 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_25px_rgba(0,0,0,0.5)] origin-top"
            style={{
              transformStyle: "preserve-3d",
              transform: "translateZ(14px)",
              rotateZ: isMobile ? -6 : wingTiltRight,
            }}
          >
            {/* Wing accent light ribbon */}
            <div className="absolute top-3 sm:top-4 bottom-3 sm:bottom-4 left-1 sm:left-1.5 w-1 rounded-full bg-gradient-to-b from-[#18713C] to-[#48357B] dark:from-[#3DB36B] dark:to-[#8B6FD8] shadow-[0_0_6px_rgba(61,179,107,0.7)]" />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Responsive Ground Levitation Shadow */}
      <motion.div
        className="absolute -bottom-3 sm:-bottom-4 left-1/2 -translate-x-1/2 w-[150px] sm:w-[200px] md:w-[220px] h-[26px] sm:h-[32px] rounded-[50%] bg-[#18713C]/12 dark:bg-[#3DB36B]/15 blur-lg pointer-events-none"
        animate={{
          scaleX: [0.85, 1.1, 0.85],
          opacity: [0.4, 0.7, 0.4],
        }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}


