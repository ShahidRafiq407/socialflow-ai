"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles, Bot, BarChart3, ArrowRight, Check, CalendarClock,
  Wand2, BrainCircuit, Rocket, Globe2, ShieldCheck, Star,
  MousePointerClick, LineChart, Layers, Minus,
} from "lucide-react";
import { Robot3D } from "./robot-3d";
import { PostloomLogo } from "./logo";
import { PLAN_CATALOG, yearlySavingPercent, type PlanConfig } from "@/lib/billing/plans";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

function SectionHeading({ badge, title, sub }: { badge: string; title: React.ReactNode; sub: string }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="text-center max-w-3xl mx-auto mb-16"
    >
      <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1E8A47]/10 border border-[#3DB36B]/30 mkt-accent-text text-xs font-semibold tracking-widest uppercase mb-6">
        <Sparkles className="w-3.5 h-3.5" /> {badge}
      </span>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6">{title}</h2>
      <p className="text-lg mkt-muted leading-relaxed">{sub}</p>
    </motion.div>
  );
}

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span className="mkt-accent-text">
      {children}
    </span>
  );
}

/**
 * The pricing section reads the same catalogue the billing tab and the entitlement
 * checks read. It is imported rather than retyped because this page is a promise:
 * a number here that the product does not enforce is a refund request, and a
 * feature listed here that the plan does not grant is a support ticket. `plans.ts`
 * has no imports of its own, so a client component can hold it.
 *
 * The trial is not in the grid. One payment, one clock, one per person is a
 * different kind of thing from a plan that renews, and drawing it as a fifth
 * column invites a buyer to compare $1 against $19 a month — which reads as a
 * ninety-five percent discount rather than as three days.
 */
const ONGOING_PLANS: PlanConfig[] = (["FREE", "GO", "PRO", "AGENCY"] as const).map(
  (tier) => PLAN_CATALOG[tier]
);
const TRIAL_PLAN: PlanConfig = PLAN_CATALOG.TRIAL;
const YEARLY_SAVING = yearlySavingPercent("PRO");


const TESTIMONIALS = [
  { name: "Sarah Kim", role: "Founder, GlowSkin Co.", quote: "We went from posting twice a week to daily on 4 platforms. Engagement is up 312% and I haven't touched a scheduler in months." },
  { name: "David Osei", role: "Marketing Lead, Finlytics", quote: "The AI agent pipeline is insane — it literally shows you its reasoning. Our content output tripled with the same team." },
  { name: "Amna Raza", role: "Content Creator, 480K followers", quote: "Loom understands my voice better than most humans I've hired. It's like having a full agency in my pocket." },
];

const FOOTER_COLS: { title: string; links: { label: string; href: string; badge?: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "How It Works", href: "#how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms-of-service" },
      { label: "Refund Policy", href: "/refund-policy" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "Acceptable Use", href: "/acceptable-use" },
      { label: "Data Processing (GDPR)", href: "/data-processing" },
    ],
  },
];

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-3 h-12 px-4 rounded-xl bg-[#18713C]/15 border border-[#3DB36B]/40 text-sm mkt-accent-text">
        <Check className="w-4 h-4 shrink-0" />
        You&apos;re subscribed! Check your inbox soon.
      </div>
    );
  }

  return (
    <form className="flex gap-2" onSubmit={onSubmit}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="flex-1 h-12 px-4 rounded-xl mkt-surface border mkt-border text-sm placeholder:text-stone-600 focus:outline-none focus:border-[#6D54A8]/60 focus:ring-2 focus:ring-[#5A4591]/20 transition"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="h-12 px-5 rounded-xl text-sm font-bold bg-[#18713C] text-white hover:scale-[1.03] transition-transform shadow-[0_8px_25px_-8px_rgba(24,113,60,0.7)] disabled:opacity-60"
      >
        {state === "loading" ? "..." : state === "error" ? "Retry" : "Subscribe"}
      </button>
    </form>
  );
}

type SocialIcon = (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;

const SOCIALS: { label: string; href: string; Icon: SocialIcon }[] = [
  {
    label: "Website — smbrobotic.com",
    href: "https://smbrobotic.com",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" {...p}>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    label: "Facebook — SMB Robotics",
    href: "https://www.facebook.com/smbrobotics",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" {...p}>
        <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07" />
      </svg>
    ),
  },
  {
    label: "Reddit — u/SMB_ROBOTICS",
    href: "https://www.reddit.com/user/SMB_ROBOTICS",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" {...p}>
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 13.74c.02.1.03.2.03.31 0 1.6-2.26 2.9-5.04 2.9s-5.04-1.3-5.04-2.9c0-.1.01-.21.03-.31a1.3 1.3 0 1 1 1.35-1.99 6.2 6.2 0 0 1 3.06-.69l.55-2.6a.23.23 0 0 1 .28-.18l1.83.4a.94.94 0 1 1 .08.44l-1.67-.37-.5 2.33a6.2 6.2 0 0 1 3.02.67 1.3 1.3 0 1 1 1.37 1.99zM9.53 12.8a.94.94 0 1 0 .94.94.94.94 0 0 0-.94-.94zm4.94 0a.94.94 0 1 0 .94.94.94.94 0 0 0-.94-.94zm-4.5 3.53a.2.2 0 0 1 .28-.02 2.45 2.45 0 0 0 1.75.5 2.45 2.45 0 0 0 1.75-.5.2.2 0 1 1 .26.3 2.85 2.85 0 0 1-2.01.58 2.85 2.85 0 0 1-2.01-.58.2.2 0 0 1-.02-.28z" />
      </svg>
    ),
  },
  {
    label: "Instagram — @smbrobotics",
    href: "https://www.instagram.com/smbrobotics",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" {...p}>
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "LinkedIn — Shahid Rafiq",
    href: "https://www.linkedin.com/in/shahid407",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" {...p}>
        <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12M7.12 20.45H3.55V9h3.57zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0" />
      </svg>
    ),
  },
  {
    label: "YouTube — @shahidrafiq407",
    href: "https://www.youtube.com/@shahidrafiq407",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" {...p}>
        <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81M9.55 15.57V8.43L15.82 12z" />
      </svg>
    ),
  },
];

export function MarketingHome({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="relative mkt-bg mkt-text overflow-x-clip">
      {/* Global background fx */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(180,140,90,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(180,140,90,0.05)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-[#3A2B63]/20 rounded-full blur-[140px]" />
        <div className="absolute top-[30%] right-[-5%] w-[450px] h-[450px] bg-[#1E8A47]/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-[#48357B]/15 rounded-full blur-[140px]" />
      </div>


      {/* ================= HERO ================= */}
      <section className="relative pt-16 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="text-center lg:text-left">
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full mkt-surface border mkt-border backdrop-blur-md text-sm mkt-accent-text mb-8">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DB36B] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#3DB36B]" />
                </span>
                Meet Loom — Your Autonomous AI Marketing Robot
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp} initial="hidden" animate="show" custom={1}
              className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[1.05] mb-6"
            >
              Marketing That
              <br />
              Runs <GradientText>Itself</GradientText>
              <br />
              While You Sleep
            </motion.h1>

            <motion.p
              variants={fadeUp} initial="hidden" animate="show" custom={2}
              className="text-lg sm:text-xl mkt-muted max-w-xl mx-auto lg:mx-0 leading-relaxed mb-10"
            >
              PostloomAI plans, creates, schedules and publishes scroll-stopping
              content across every platform — powered by a team of AI agents that
              work 24/7 so you don&apos;t have to.
            </motion.p>

            <motion.div
              variants={fadeUp} initial="hidden" animate="show" custom={3}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link
                href={isLoggedIn ? "/dashboard" : "/sign-up"}
                className="group relative inline-flex items-center justify-center h-14 px-8 text-lg font-bold rounded-2xl bg-[#18713C] text-white shadow-[0_0_40px_-5px_rgba(24,113,60,0.7)] hover:shadow-[0_0_60px_-5px_rgba(24,113,60,0.9)] transition-all duration-300 hover:scale-[1.04]"
              >
                {isLoggedIn ? "Open Dashboard" : "Start Free — No Card Needed"}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center h-14 px-8 text-lg font-semibold rounded-2xl border mkt-border mkt-surface backdrop-blur-md hover:mkt-surface2 hover:border-[#3DB36B]/40 transition-all duration-300"
              >
                <MousePointerClick className="mr-2 w-5 h-5 mkt-accent-text" />
                See How It Works
              </Link>
            </motion.div>

            <motion.div
              variants={fadeUp} initial="hidden" animate="show" custom={4}
              className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-8 gap-y-3 text-sm mkt-faint"
            >
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Free plan, no card</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Cancel anytime</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 10,000+ marketers</span>
            </motion.div>
          </div>

          {/* Right 3D robot */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative hidden md:flex justify-center"
          >
            <Robot3D />
          </motion.div>
        </div>

        {/* Mobile 3D robot (scaled down, fully visible on phones) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex md:hidden justify-center mt-8 origin-top scale-[0.62] h-[280px]"
        >
          <Robot3D />
        </motion.div>

        {/* stats strip */}
        <motion.div
          variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="max-w-5xl mx-auto mt-24 grid grid-cols-2 md:grid-cols-4 gap-px rounded-3xl overflow-hidden mkt-glass"
        >
          {[
            { value: "10K+", label: "Active Marketers" },
            { value: "2.4M", label: "Posts Generated" },
            { value: "20 hrs", label: "Saved Weekly / User" },
            { value: "4.9★", label: "Average Rating" },
          ].map((s) => (
            <div key={s.label} className="bg-[#0D120E]/80 px-6 py-8 text-center">
              <div className="text-3xl sm:text-4xl font-black mkt-accent-text">
                {s.value}
              </div>
              <div className="text-xs sm:text-sm mkt-muted mt-1">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="relative py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            badge="Superpowers"
            title={<>Everything You Need, <GradientText>Nothing You Don&apos;t</GradientText></>}
            sub="A full AI marketing department packed into one beautiful platform."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: BrainCircuit, title: "AI Content Engine", desc: "Generate captions, hooks, hashtags and full campaigns tuned to your brand voice in seconds.", color: "#18713C" },
              { icon: Wand2, title: "`AI Image & Video Studio", desc: "Create stunning visuals, product shots and short-form videos without a designer.", color: "#48357B" },
              { icon: CalendarClock, title: "`Smart Auto-Scheduling", desc: "Loom picks the perfect posting time per platform and publishes automatically.", color: "#48357B" },
              { icon: BarChart3, title: "Deep Analytics", desc: "Know exactly what's working with AI-powered insights, not just vanity metrics.", color: "#48357B" },
              { icon: Globe2, title: "Every Platform, One Place", desc: "Instagram, TikTok, X, LinkedIn, Facebook & YouTube — connected in one dashboard.", color: "#18713C" },
              { icon: ShieldCheck, title: "Brand-Safe by Default", desc: "Approval flows, brand guardrails and human-in-the-loop controls built in.", color: "#48357B" },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i % 3}
                whileHover={{ y: -10, rotateX: 4, rotateY: -4 }}
                style={{ transformStyle: "preserve-3d", perspective: 800 }}
                className="group relative rounded-3xl mkt-glass p-8 hover:mkt-border transition-colors"
              >
                <div style={{ backgroundColor: f.color }} className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-[0.08] transition-opacity duration-500" />
                <div style={{ backgroundColor: f.color }} className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                  <f.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                <p className="mkt-muted leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how-it-works" className="relative py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            badge="How It Works"
            title={<>Live in <GradientText>3 Simple Steps</GradientText></>}
            sub="From signup to your first AI-generated campaign in under 5 minutes."
          />
          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-[#48357B]/50" />
            {[
              { icon: Layers, step: "01", title: "Connect Your Brand", desc: "Link your social accounts and tell Loom about your brand voice, audience and goals." },
              { icon: Bot, step: "02", title: "AI Agents Get to Work", desc: "Watch the agent pipeline research trends, write copy and design creatives — with live reasoning." },
              { icon: Rocket, step: "03", title: "Approve & Autopilot", desc: "Review with one click, then let Loom schedule and publish everywhere, 24/7." },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}
                className="relative text-center"
              >
                <div className="relative inline-flex mb-8">
                  <div className="w-24 h-24 rounded-3xl mkt-surface border mkt-border flex items-center justify-center shadow-[0_0_40px_-10px_rgba(24,113,60,0.6)]">
                    <s.icon className="w-10 h-10 mkt-accent-text" />
                  </div>
                  <span className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-[#18713C] text-sm font-black flex items-center justify-center shadow-lg">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-2xl font-bold mb-3">{s.title}</h3>
                <p className="mkt-muted leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section id="pricing" className="relative py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            badge="Pricing"
            title={<>Simple Plans, <GradientText>Serious Results</GradientText></>}
            sub={`Every account starts on Free and stays there until you choose otherwise. Paid plans run on credits you can see being spent, and yearly billing is two months on us — ${YEARLY_SAVING}% off.`}
          />

          {/* The trial, on its own. A dollar for three days is the honest way to find
              out whether the AI is any good, so it sits above the grid where a buyer
              reads it before choosing a monthly commitment. The dollar is stated as
              charged today, not as a formality: a trial that surprises someone with a
              charge has bought a chargeback rather than a customer. */}
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}
            className="rounded-3xl mkt-glass !bg-[#48357B]/10 border-[#48357B]/40 p-8 mb-10 flex flex-col lg:flex-row lg:items-center gap-8"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 rounded-full bg-[#48357B] text-[11px] font-black tracking-wide uppercase">
                  {TRIAL_PLAN.badge}
                </span>
                <h3 className="text-2xl font-bold">{TRIAL_PLAN.name}</h3>
              </div>
              <p className="mkt-muted leading-relaxed max-w-2xl">{TRIAL_PLAN.blurb}</p>
              <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-5">
                {TRIAL_PLAN.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm mkt-muted">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 mkt-accent2-text" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:w-64 shrink-0 text-center lg:text-right">
              <div className="mb-1">
                <span className="text-5xl font-black">${TRIAL_PLAN.oneTimePrice}</span>
                <span className="mkt-muted ml-1">once</span>
              </div>
              <p className="text-sm mkt-faint mb-6">
                Charged today · {TRIAL_PLAN.trialDays} days · cancel any time · one per person
              </p>
              <Link
                href={isLoggedIn ? "/dashboard/billing" : "/sign-up"}
                className="inline-flex items-center justify-center w-full h-12 rounded-xl font-bold bg-[#18713C] text-white shadow-[0_0_30px_-5px_rgba(24,113,60,0.8)] transition-all duration-300 hover:scale-[1.03]"
              >
                {TRIAL_PLAN.ctaLabel}
              </Link>
            </div>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {ONGOING_PLANS.map((p, i) => (
              <motion.div
                key={p.id}
                variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}
                whileHover={{ y: -12 }}
                className={`relative rounded-3xl p-8 flex flex-col mkt-glass transition-colors ${
                  p.highlight
                    ? "!bg-[#48357B]/10 border-[#48357B]/50 shadow-[0_0_60px_-15px_rgba(72,53,123,0.6)] lg:scale-[1.05] z-10"
                    : "hover:border-[#18713C]/40"
                }`}
              >
                {p.badge && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-[#48357B] text-xs font-black tracking-wide uppercase shadow-lg whitespace-nowrap">
                    {p.badge}
                  </span>
                )}
                <h3 className="text-lg font-bold mkt-muted">{p.name}</h3>
                <div className="mt-4 mb-1">
                  <span className="text-5xl font-black">${p.priceMonthly}</span>
                  <span className="mkt-muted ml-1">{p.priceMonthly === 0 ? "forever" : "/month"}</span>
                </div>
                <p className="text-sm mkt-faint mb-2">{p.tagline}</p>
                <p className="text-xs mkt-faint mb-8 h-4">
                  {p.priceYearly > 0 && `or $${p.priceYearly} a year — ${YEARLY_SAVING}% off`}
                </p>
                <ul className="space-y-3.5 mb-6 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm mkt-muted">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? "mkt-accent2-text" : "text-[#3DB36B]"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                {/* Where the plan stops, not only where it starts. A buyer who finds
                    this out after paying asks for their money back. */}
                {p.notIncluded && p.notIncluded.length > 0 && (
                  <ul className="space-y-2 mb-8 pt-5 border-t mkt-border">
                    {p.notIncluded.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-sm mkt-faint">
                        <Minus className="w-4 h-4 mt-0.5 shrink-0 opacity-60" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href={isLoggedIn ? "/dashboard/billing" : "/sign-up"}
                  className={`inline-flex items-center justify-center h-12 rounded-xl font-bold transition-all duration-300 hover:scale-[1.03] ${
                    p.highlight
                      ? "bg-[#18713C] text-white shadow-[0_0_30px_-5px_rgba(24,113,60,0.8)]"
                      : "border mkt-border mkt-surface hover:mkt-surface2"
                  }`}
                >
                  {p.ctaLabel}
                </Link>
              </motion.div>
            ))}
          </div>
          <p className="text-center text-sm mkt-faint mt-10 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Cancel any time · Remove your card any time · No hidden fees · Refundable while your
            credits are unspent
          </p>
        </div>
      </section>


      {/* ================= TESTIMONIALS ================= */}
      <section id="testimonials" className="relative py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            badge="Loved by Marketers"
            title={<>Don&apos;t Take Our <GradientText>Word For It</GradientText></>}
            sub="Real results from real teams running on PostloomAI."
          />
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}
                whileHover={{ y: -8 }}
                className="rounded-3xl mkt-glass p-8 hover:mkt-border transition-colors"
              >
                <div className="flex gap-1 mb-5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-[#3DB36B] text-[#3DB36B]" />
                  ))}
                </div>
                <p className="mkt-muted leading-relaxed mb-8">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-[#18713C] flex items-center justify-center font-black text-sm">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="font-bold text-sm">{t.name}</div>
                    <div className="text-xs mkt-faint">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="relative py-28 px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="relative max-w-5xl mx-auto rounded-[40px] border mkt-border mkt-glass backdrop-blur-xl p-12 sm:p-20 text-center overflow-hidden"
        >
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-[#7A5CC9]/25 blur-[100px] rounded-full" />
          <Bot className="w-14 h-14 mx-auto mb-6 mkt-accent-text" />
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Ready to Put Marketing<br />on <GradientText>Autopilot?</GradientText>
          </h2>
          <p className="text-lg mkt-muted mb-10 max-w-2xl mx-auto">
            Join 10,000+ creators and brands growing with PostloomAI. Your first campaign is free.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={isLoggedIn ? "/dashboard" : "/sign-up"}
              className="group inline-flex items-center justify-center h-14 px-10 text-lg font-bold rounded-2xl bg-[#18713C] text-white shadow-[0_0_40px_-5px_rgba(24,113,60,0.8)] hover:scale-[1.04] transition-all duration-300"
            >
              Get Started Free
              <Rocket className="ml-2 w-5 h-5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="#pricing"
              className="inline-flex items-center justify-center h-14 px-10 text-lg font-semibold rounded-2xl border mkt-border mkt-surface hover:mkt-surface2 transition-all duration-300"
            >
              <LineChart className="mr-2 w-5 h-5 mkt-accent-text" />
              Compare Plans
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="relative border-t mkt-border mkt-bg2 pt-20 pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* top row: brand + newsletter */}
          <div className="flex flex-col lg:flex-row justify-between gap-10 pb-14 border-b mkt-border">
            <div className="max-w-sm">
              <Link href="/" className="flex items-center gap-3 mb-5 group w-fit">
                <PostloomLogo size={44} />
                <div className="leading-none">
                  <span className="block font-black text-xl tracking-tight">
                    Postloom<span className="mkt-accent-text">AI</span>
                  </span>
                  <span className="block text-[10px] font-medium tracking-[0.22em] uppercase mkt-faint mt-1">
                    Marketing on Autopilot
                  </span>
                </div>
              </Link>
              <p className="text-sm mkt-faint leading-relaxed mb-6">
                The autonomous AI marketing platform that plans, creates and publishes
                content that grows your brand — 24/7.
              </p>
              <div className="flex gap-3">
                {SOCIALS.map(({ Icon, label, href }) => (
                  <a
                    key={label}
                    aria-label={label}
                    title={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-xl border mkt-border mkt-surface flex items-center justify-center mkt-muted hover:text-white hover:border-[#6D54A8]/50 hover:bg-[#5A4591]/10 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </a>
                ))}
              </div>
            </div>
            <div className="max-w-md w-full">
              <h4 className="font-bold text-sm tracking-wide uppercase mkt-muted mb-2">
                Stay in the loop
              </h4>
              <p className="text-sm mkt-faint mb-4">
                Monthly growth tactics, product updates and AI marketing playbooks. No spam.
              </p>
              <NewsletterForm />
            </div>
          </div>

          {/* link columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 py-14">
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <h4 className="font-bold mb-5 text-xs tracking-[0.18em] uppercase mkt-muted">
                  {col.title}
                </h4>
                <ul className="space-y-3 text-sm mkt-faint">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="hover:mkt-accent-text transition-colors inline-flex items-center gap-2"
                      >
                        {l.label}
                        {"badge" in l && l.badge && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#5A4591]/15 mkt-accent2-text border border-[#6D54A8]/20">
                            {l.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* bottom bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t mkt-border pt-8 text-sm text-stone-600">
            <p>© {new Date().getFullYear()} PostloomAI, Inc. All rights reserved.</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              All systems operational
            </div>
            <div className="flex gap-6 text-xs">
              <Link href="/privacy-policy" className="hover:mkt-accent-text transition">Privacy</Link>
              <Link href="/terms-of-service" className="hover:mkt-accent-text transition">Terms</Link>
              <Link href="/cookie-policy" className="hover:mkt-accent-text transition">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}




