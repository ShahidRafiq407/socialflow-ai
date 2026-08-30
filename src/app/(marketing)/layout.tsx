import Link from "next/link";
import { Zap } from "lucide-react";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-[#030014] text-white">
      {/* Glassmorphic Header */}
      <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-[#030014]/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-[0_0_20px_-2px_rgba(139,92,246,0.7)] group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-lg tracking-tight">
              SocialFlow{" "}
              <span className="bg-gradient-to-r from-cyan-400 to-fuchsia-400 bg-clip-text text-transparent">
                AI
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <Link href="/#features" className="hover:text-cyan-300 transition-colors">Features</Link>
            <Link href="/#how-it-works" className="hover:text-cyan-300 transition-colors">How It Works</Link>
            <Link href="/#pricing" className="hover:text-cyan-300 transition-colors">Pricing</Link>
            <Link href="/#testimonials" className="hover:text-cyan-300 transition-colors">Customers</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors hidden sm:block"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center h-10 px-5 text-sm font-bold rounded-xl bg-gradient-to-r from-cyan-500 via-violet-600 to-fuchsia-600 shadow-[0_0_25px_-5px_rgba(139,92,246,0.8)] hover:scale-105 transition-transform duration-300"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
