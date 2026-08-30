import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PostloomLogo } from "@/components/marketing/logo";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#testimonials", label: "Customers" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0B0A08] text-white">
      {/* Announcement bar */}
      <div className="fixed top-0 z-50 w-full bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 text-center text-[13px] font-semibold py-1.5 px-4">
        <Link href="/#pricing" className="inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity">
          ✦ New: AI Video Studio is live — create scroll-stopping videos in seconds
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Premium Header */}
      <header className="fixed top-[33px] z-50 w-full border-b border-white/[0.08] bg-[#0B0A08]/75 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#0B0A08]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
              <PostloomLogo size={42} />
              <div className="absolute inset-0 rounded-[13px] bg-orange-500/40 blur-lg -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div className="leading-none">
              <span className="block font-black text-[19px] tracking-tight">
                Postloom<span className="bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">AI</span>
              </span>
              <span className="block text-[10px] font-medium tracking-[0.22em] uppercase text-stone-500 mt-1">
                Marketing on Autopilot
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="relative px-4 py-2 rounded-full text-stone-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-stone-300 hover:text-white px-4 py-2 rounded-full hover:bg-white/[0.06] transition-colors hidden sm:block"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="group inline-flex items-center justify-center h-11 px-6 text-sm font-bold rounded-full bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 shadow-[0_8px_30px_-8px_rgba(249,115,22,0.7)] hover:shadow-[0_8px_40px_-6px_rgba(249,115,22,0.9)] hover:scale-[1.04] active:scale-95 transition-all duration-300"
            >
              Get Started Free
              <ArrowRight className="ml-1.5 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </header>

      {/* spacer for fixed header */}
      <div className="h-[105px]" />

      {/* Main Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
