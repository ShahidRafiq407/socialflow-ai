import type { Metadata } from "next";
import { MessageCircle, Mail, Globe2, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us — PostloomAI",
  description:
    "Get in touch with the PostloomAI team (SMB Robotics). Reach us on WhatsApp at +92 343 5219710 or email siteosia@gmail.com. We usually reply within a few hours.",
};

const CHANNELS = [
  {
    icon: MessageCircle,
    title: "WhatsApp",
    value: "+92 343 5219710",
    desc: "Fastest way to reach us — chat directly with the team.",
    href: "https://wa.me/923435219710?text=Hi%20SMB%20Robotics%20team!%20I%20have%20a%20question%20about%20PostloomAI.",
    cta: "Chat on WhatsApp",
    color: "#3DB36B",
  },
  {
    icon: Mail,
    title: "Email",
    value: "siteosia@gmail.com",
    desc: "For support, partnerships and business inquiries.",
    href: "mailto:siteosia@gmail.com?subject=PostloomAI%20Inquiry",
    cta: "Send Email",
    color: "#8B6FD8",
  },
];

export default function ContactPage() {
  return (
    <div className="bg-[#0A0D0B] text-white">
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[420px] h-[420px] bg-[#48357B]/25 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[380px] h-[380px] bg-[#18713C]/20 rounded-full blur-[130px] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#18713C]/10 border border-[#3DB36B]/30 text-[#5CC489] text-xs font-semibold tracking-widest uppercase mb-6">
            <MessageCircle className="w-3.5 h-3.5" /> Contact Us
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Let&apos;s{" "}
            <span className="bg-gradient-to-r from-[#3DB36B] to-[#8B6FD8] bg-clip-text text-transparent">
              Talk
            </span>
          </h1>
          <p className="text-lg text-stone-400 leading-relaxed max-w-2xl mx-auto">
            Questions about PostloomAI, pricing or partnerships? The SMB Robotics team
            is here — we usually reply within a few hours.
          </p>
        </div>
      </section>

      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-6">
          {CHANNELS.map((c) => (
            <a
              key={c.title}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-3xl border border-white/10 bg-white/[0.04] p-8 hover:border-white/25 hover:-translate-y-1.5 transition-all duration-300 block"
            >
              <c.icon className="w-10 h-10 mb-5" style={{ color: c.color }} />
              <h2 className="text-xl font-bold mb-1">{c.title}</h2>
              <p className="text-lg font-semibold mb-3" style={{ color: c.color }}>
                {c.value}
              </p>
              <p className="text-sm text-stone-500 leading-relaxed mb-6">{c.desc}</p>
              <span className="inline-flex items-center text-sm font-bold text-white group-hover:gap-2.5 gap-1.5 transition-all">
                {c.cta} →
              </span>
            </a>
          ))}
        </div>

        {/* extra info */}
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-6 mt-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 flex gap-4 items-start">
            <Clock className="w-6 h-6 text-[#5CC489] shrink-0 mt-1" />
            <div>
              <h3 className="font-bold mb-1">Response Time</h3>
              <p className="text-sm text-stone-500 leading-relaxed">
                WhatsApp: usually within a few hours. Email: within 24 hours on business days.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 flex gap-4 items-start">
            <Globe2 className="w-6 h-6 text-[#8B6FD8] shrink-0 mt-1" />
            <div>
              <h3 className="font-bold mb-1">SMB Robotics</h3>
              <p className="text-sm text-stone-500 leading-relaxed">
                PostloomAI is a product of SMB Robotics. Learn more at{" "}
                <a href="https://smbrobotic.com" target="_blank" rel="noopener noreferrer" className="text-[#5CC489] hover:underline">
                  smbrobotic.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
