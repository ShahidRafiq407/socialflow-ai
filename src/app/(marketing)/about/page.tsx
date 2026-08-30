import type { Metadata } from "next";
import Link from "next/link";
import { PostloomLogo } from "@/components/marketing/logo";
import { ArrowRight, Building2, Bot, Globe2, Heart } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us — PostloomAI by SMB Robotics",
  description:
    "PostloomAI is an autonomous AI marketing platform built by SMB Robotics. Learn about our mission, our story and the team behind Loom — your AI marketing robot.",
};

export default function AboutPage() {
  return (
    <div className="bg-[#0A0D0B] text-white">
      {/* Hero */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute top-0 left-1/3 w-[420px] h-[420px] bg-[#18713C]/20 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[380px] h-[380px] bg-[#48357B]/25 rounded-full blur-[130px] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#18713C]/10 border border-[#3DB36B]/30 text-[#5CC489] text-xs font-semibold tracking-widest uppercase mb-6">
            <Building2 className="w-3.5 h-3.5" /> About Us
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Built by{" "}
            <span className="bg-gradient-to-r from-[#3DB36B] to-[#8B6FD8] bg-clip-text text-transparent">
              SMB Robotics
            </span>
          </h1>
          <p className="text-lg text-stone-400 leading-relaxed max-w-2xl mx-auto">
            PostloomAI is a product of <strong className="text-white">SMB Robotics</strong> —
            a technology company on a mission to put intelligent automation in the hands of
            every business, not just the giants.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8">
            <Building2 className="w-10 h-10 text-[#5CC489] mb-5" />
            <h2 className="text-2xl font-bold mb-4">The Parent Company — SMB Robotics</h2>
            <p className="text-stone-400 leading-relaxed mb-4">
              SMB Robotics builds practical AI and automation products for small and
              medium businesses. From robotics-inspired automation workflows to AI agents,
              everything we ship is designed to save real hours for real teams.
            </p>
            <p className="text-stone-400 leading-relaxed">
              When you talk to us — on WhatsApp, email or social media — you&apos;ll see the
              SMB Robotics name and logo. Don&apos;t be confused: <strong className="text-white">PostloomAI
              is our product</strong>, and SMB Robotics is the company behind it. Same team,
              same support, same commitment.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8">
            <Bot className="w-10 h-10 text-[#8B6FD8] mb-5" />
            <h2 className="text-2xl font-bold mb-4">The Product — PostloomAI</h2>
            <p className="text-stone-400 leading-relaxed mb-4">
              PostloomAI was born from a simple observation: small businesses and creators
              can&apos;t afford a full marketing team, but they deserve one. So we built
              Loom — an AI marketing robot that plans, writes, designs and publishes
              content across every platform, 24/7.
            </p>
            <p className="text-stone-400 leading-relaxed">
              Today, PostloomAI helps marketers save 20+ hours a week while growing their
              audience faster than ever. And we&apos;re just getting started.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">What We Believe</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: Globe2, title: "Automation for Everyone", desc: "Powerful AI shouldn't be locked behind enterprise budgets. We build for the 99%." },
              { icon: Heart, title: "Humans Stay in Control", desc: "AI does the heavy lifting — you always have the final say before anything goes live." },
              { icon: Bot, title: "Honest AI", desc: "Our agent pipeline shows its reasoning live. No black boxes, no magic claims." },
            ].map((v) => (
              <div key={v.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center">
                <v.icon className="w-8 h-8 mx-auto mb-4 text-[#5CC489]" />
                <h3 className="font-bold mb-2">{v.title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 text-center">
        <div className="flex justify-center"><PostloomLogo size={56} /></div>
        <h2 className="text-3xl sm:text-4xl font-black mt-6 mb-4">Want to say hello?</h2>
        <p className="text-stone-400 mb-8 max-w-xl mx-auto">
          We reply fast — usually within a few hours on WhatsApp.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center px-8 py-3.5 font-bold rounded-2xl bg-gradient-to-r from-[#1E8A47] to-[#48357B] shadow-[0_0_35px_-8px_rgba(24,113,60,0.8)] hover:scale-[1.04] transition-transform"
          >
            Contact Us <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
          <a
            href="https://smbrobotic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-8 py-3.5 font-semibold rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
          >
            Visit smbrobotic.com
          </a>
        </div>
      </section>
    </div>
  );
}