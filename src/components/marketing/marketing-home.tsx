"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles, Bot, Zap, BarChart3, ArrowRight, Check, CalendarClock,
  Wand2, BrainCircuit, Rocket, Globe2, ShieldCheck, Star,
  MousePointerClick, LineChart, Layers,
} from "lucide-react";
import { Robot3D } from "./robot-3d";

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
      <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-semibold tracking-widest uppercase mb-6">
        <Sparkles className="w-3.5 h-3.5" /> {badge}
      </span>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6">{title}</h2>
      <p className="text-lg text-slate-400 leading-relaxed">{sub}</p>
    </motion.div>
  );
}

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
      {children}
    </span>
  );
}

const PLANS = [
  {
    name: "Starter", price: "$0", period: "forever", tagline: "Test the waters",
    features: ["1 social account", "10 AI posts / month", "Basic analytics", "Community support"],
    cta: "Start Free", highlight: false,
  },
  {
    name: "Pro", price: "$29", period: "/month", tagline: "For creators & solopreneurs",
    features: ["5 social accounts", "Unlimited AI posts", "AI image studio", "Smart auto-scheduling", "Advanced analytics"],
    cta: "Start 14-Day Trial", highlight: true,
  },
  {
    name: "Business", price: "$79", period: "/month", tagline: "For growing brands",
    features: ["15 social accounts", "Everything in Pro", "AI video studio", "3 team seats", "Approval workflows", "Priority support"],
    cta: "Start 14-Day Trial", highlight: false,
  },
  {
    name: "Enterprise", price: "Custom", period: "", tagline: "For agencies & teams",
    features: ["Unlimited accounts", "Custom AI brand models", "Unlimited seats", "API access & SSO", "Dedicated success manager"],
    cta: "Talk to Sales", highlight: false,
  },
];

const TESTIMONIALS = [
  { name: "Sarah Kim", role: "Founder, GlowSkin Co.", quote: "We went from posting twice a week to daily on 4 platforms. Engagement is up 312% and I haven't touched a scheduler in months." },
  { name: "David Osei", role: "Marketing Lead, Finlytics", quote: "The AI agent pipeline is insane — it literally shows you its reasoning. Our content output tripled with the same team." },
  { name: "Amna Raza", role: "Content Creator, 480K followers", quote: "Flo understands my voice better than most humans I've hired. It's like having a full agency in my pocket." },
];

export function MarketingHome({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="relative bg-[#030014] text-white overflow-x-clip">
      {/* Global background fx */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(120,119,198,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(120,119,198,0.05)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute top-[-10%] left-1/4 w-[500px] h-[500px] bg-violet-700/20 rounded-full blur-[140px]" />
        <div className="absolute top-[30%] right-[-5%] w-[450px] h-[450px] bg-cyan-500/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-fuchsia-600/15 rounded-full blur-[140px]" />
      </div>


      {/* ================= HERO ================= */}
      <section className="relative pt-36 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="text-center lg:text-left">
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-sm text-cyan-300 mb-8">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400" />
                </span>
                Meet Flo — Your Autonomous AI Marketing Robot
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
              className="text-lg sm:text-xl text-slate-400 max-w-xl mx-auto lg:mx-0 leading-relaxed mb-10"
            >
              SocialFlow AI plans, creates, schedules and publishes scroll-stopping
              content across every platform — powered by a team of AI agents that
              work 24/7 so you don&apos;t have to.
            </motion.p>

            <motion.div
              variants={fadeUp} initial="hidden" animate="show" custom={3}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link
                href={isLoggedIn ? "/dashboard" : "/sign-up"}
                className="group relative inline-flex items-center justify-center h-14 px-8 text-lg font-bold rounded-2xl bg-gradient-to-r from-cyan-500 via-violet-600 to-fuchsia-600 shadow-[0_0_40px_-5px_rgba(139,92,246,0.7)] hover:shadow-[0_0_60px_-5px_rgba(139,92,246,0.9)] transition-all duration-300 hover:scale-[1.04]"
              >
                {isLoggedIn ? "Open Dashboard" : "Start Free — No Card Needed"}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center h-14 px-8 text-lg font-semibold rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-cyan-400/40 transition-all duration-300"
              >
                <MousePointerClick className="mr-2 w-5 h-5 text-cyan-300" />
                See How It Works
              </Link>
            </motion.div>

            <motion.div
              variants={fadeUp} initial="hidden" animate="show" custom={4}
              className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-8 gap-y-3 text-sm text-slate-500"
            >
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 14-day free trial</span>
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

        {/* stats strip */}
        <motion.div
          variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="max-w-5xl mx-auto mt-24 grid grid-cols-2 md:grid-cols-4 gap-px rounded-3xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl"
        >
          {[
            { value: "10K+", label: "Active Marketers" },
            { value: "2.4M", label: "Posts Generated" },
            { value: "20 hrs", label: "Saved Weekly / User" },
            { value: "4.9★", label: "Average Rating" },
          ].map((s) => (
            <div key={s.label} className="bg-[#06021c]/80 px-6 py-8 text-center">
              <div className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">
                {s.value}
              </div>
              <div className="text-xs sm:text-sm text-slate-400 mt-1">{s.label}</div>
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
              { icon: BrainCircuit, title: "AI Content Engine", desc: "Generate captions, hooks, hashtags and full campaigns tuned to your brand voice in seconds.", color: "from-cyan-400 to-blue-500" },
              { icon: Wand2, title: "AI Image & Video Studio", desc: "Create stunning visuals, product shots and short-form videos without a designer.", color: "from-violet-400 to-purple-600" },
              { icon: CalendarClock, title: "Smart Auto-Scheduling", desc: "Flo picks the perfect posting time per platform and publishes automatically.", color: "from-fuchsia-400 to-pink-600" },
              { icon: BarChart3, title: "Deep Analytics", desc: "Know exactly what's working with AI-powered insights, not just vanity metrics.", color: "from-emerald-400 to-teal-500" },
              { icon: Globe2, title: "Every Platform, One Place", desc: "Instagram, TikTok, X, LinkedIn, Facebook & YouTube — connected in one dashboard.", color: "from-amber-400 to-orange-500" },
              { icon: ShieldCheck, title: "Brand-Safe by Default", desc: "Approval flows, brand guardrails and human-in-the-loop controls built in.", color: "from-sky-400 to-indigo-500" },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i % 3}
                whileHover={{ y: -10, rotateX: 4, rotateY: -4 }}
                style={{ transformStyle: "preserve-3d", perspective: 800 }}
                className="group relative rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 hover:border-white/25 transition-colors"
              >
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${f.color} opacity-0 group-hover:opacity-[0.08] transition-opacity duration-500`} />
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                  <f.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                <p className="text-slate-400 leading-relaxed">{f.desc}</p>
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
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-cyan-400/50 via-violet-400/50 to-fuchsia-400/50" />
            {[
              { icon: Layers, step: "01", title: "Connect Your Brand", desc: "Link your social accounts and tell Flo about your brand voice, audience and goals." },
              { icon: Bot, step: "02", title: "AI Agents Get to Work", desc: "Watch the agent pipeline research trends, write copy and design creatives — with live reasoning." },
              { icon: Rocket, step: "03", title: "Approve & Autopilot", desc: "Review with one click, then let Flo schedule and publish everywhere, 24/7." },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}
                className="relative text-center"
              >
                <div className="relative inline-flex mb-8">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#0b0530] to-[#150a45] border border-white/15 flex items-center justify-center shadow-[0_0_40px_-10px_rgba(139,92,246,0.6)]">
                    <s.icon className="w-10 h-10 text-cyan-300" />
                  </div>
                  <span className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-sm font-black flex items-center justify-center shadow-lg">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-2xl font-bold mb-3">{s.title}</h3>
                <p className="text-slate-400 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
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
            sub="Start free. Upgrade when you're ready to scale. 20% off on yearly billing."
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {PLANS.map((p, i) => (
              <motion.div
                key={p.name}
                variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}
                whileHover={{ y: -12 }}
                className={`relative rounded-3xl p-8 flex flex-col backdrop-blur-xl border transition-colors ${
                  p.highlight
                    ? "bg-gradient-to-b from-violet-600/20 to-fuchsia-600/10 border-violet-400/50 shadow-[0_0_60px_-15px_rgba(139,92,246,0.8)] lg:scale-[1.05] z-10"
                    : "bg-white/[0.04] border-white/10 hover:border-white/25"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-xs font-black tracking-wide uppercase shadow-lg">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-slate-300">{p.name}</h3>
                <div className="mt-4 mb-1">
                  <span className="text-5xl font-black">{p.price}</span>
                  {p.period && <span className="text-slate-400 ml-1">{p.period}</span>}
                </div>
                <p className="text-sm text-slate-500 mb-8">{p.tagline}</p>
                <ul className="space-y-3.5 mb-10 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-slate-300">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.highlight ? "text-fuchsia-400" : "text-cyan-400"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={isLoggedIn ? "/dashboard" : "/sign-up"}
                  className={`inline-flex items-center justify-center h-12 rounded-xl font-bold transition-all duration-300 hover:scale-[1.03] ${
                    p.highlight
                      ? "bg-gradient-to-r from-cyan-500 via-violet-600 to-fuchsia-600 shadow-[0_0_30px_-5px_rgba(139,92,246,0.8)]"
                      : "border border-white/15 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {p.cta}
                </Link>
              </motion.div>
            ))}
          </div>
          <p className="text-center text-sm text-slate-500 mt-10 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            30-day money-back guarantee · No hidden fees · Cancel anytime
          </p>
        </div>
      </section>

      {/* ================= TESTIMONIALS ================= */}
      <section id="testimonials" className="relative py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            badge="Loved by Marketers"
            title={<>Don&apos;t Take Our <GradientText>Word For It</GradientText></>}
            sub="Real results from real teams running on SocialFlow AI."
          />
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}
                whileHover={{ y: -8 }}
                className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 hover:border-white/25 transition-colors"
              >
                <div className="flex gap-1 mb-5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 leading-relaxed mb-8">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center font-black text-sm">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="font-bold text-sm">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.role}</div>
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
          className="relative max-w-5xl mx-auto rounded-[40px] border border-white/10 bg-gradient-to-br from-violet-700/25 via-[#0b0530] to-cyan-700/20 backdrop-blur-xl p-12 sm:p-20 text-center overflow-hidden"
        >
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-fuchsia-500/25 blur-[100px] rounded-full" />
          <Bot className="w-14 h-14 mx-auto mb-6 text-cyan-300" />
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Ready to Put Marketing<br />on <GradientText>Autopilot?</GradientText>
          </h2>
          <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto">
            Join 10,000+ creators and brands growing with SocialFlow AI. Your first campaign is free.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={isLoggedIn ? "/dashboard" : "/sign-up"}
              className="group inline-flex items-center justify-center h-14 px-10 text-lg font-bold rounded-2xl bg-gradient-to-r from-cyan-500 via-violet-600 to-fuchsia-600 shadow-[0_0_40px_-5px_rgba(139,92,246,0.8)] hover:scale-[1.04] transition-all duration-300"
            >
              Get Started Free
              <Rocket className="ml-2 w-5 h-5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="#pricing"
              className="inline-flex items-center justify-center h-14 px-10 text-lg font-semibold rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all duration-300"
            >
              <LineChart className="mr-2 w-5 h-5 text-cyan-300" />
              Compare Plans
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-white/10 py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-black text-lg">SocialFlow AI</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              The autonomous AI marketing robot that grows your brand 24/7.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-sm tracking-wide uppercase text-slate-300">Product</h4>
            <ul className="space-y-2.5 text-sm text-slate-500">
              <li><Link href="#features" className="hover:text-cyan-300 transition">Features</Link></li>
              <li><Link href="#pricing" className="hover:text-cyan-300 transition">Pricing</Link></li>
              <li><Link href="#how-it-works" className="hover:text-cyan-300 transition">How It Works</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-sm tracking-wide uppercase text-slate-300">Legal</h4>
            <ul className="space-y-2.5 text-sm text-slate-500">
              <li><Link href="/privacy-policy" className="hover:text-cyan-300 transition">Privacy Policy</Link></li>
              <li><Link href="/terms-of-service" className="hover:text-cyan-300 transition">Terms of Service</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-sm tracking-wide uppercase text-slate-300">Get Started</h4>
            <ul className="space-y-2.5 text-sm text-slate-500">
              <li><Link href="/sign-up" className="hover:text-cyan-300 transition">Create Account</Link></li>
              <li><Link href="/sign-in" className="hover:text-cyan-300 transition">Log In</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto border-t border-white/10 pt-8 text-center text-sm text-slate-600">
          © {new Date().getFullYear()} SocialFlow AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
