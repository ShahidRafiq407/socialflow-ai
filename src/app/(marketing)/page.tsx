import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles, Bot, Zap, BarChart, Users } from "lucide-react";

export default async function MarketingHomePage() {
  const { userId } = await auth();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Background blobs for the entire page */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/20 blur-[120px]" />
      </div>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 text-center max-w-5xl mx-auto flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Sparkles className="w-4 h-4" />
          <span>The Next Generation of Social Media Automation</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
          Your Autonomous <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">AI Marketing Team</span>
        </h1>
        
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
          Stop managing social media manually. SocialFlow AI designs campaigns, writes viral copy, generates premium visuals, and auto-publishes across 8 platforms while you sleep.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
          {!userId ? (
            <>
              <Link href="/sign-up">
                <Button size="lg" className="h-14 px-8 text-lg font-semibold rounded-full shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-105">
                  Start for Free
                </Button>
              </Link>
              <Link href="#features">
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-semibold rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                  See how it works
                </Button>
              </Link>
            </>
          ) : (
            <Link href="/dashboard">
              <Button size="lg" className="h-14 px-8 text-lg font-semibold rounded-full shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-105">
                Go to Dashboard
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Partners / Supported Platforms */}
      <section className="py-10 border-y border-slate-200/50 dark:border-slate-800/50 bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-6">Seamlessly integrates with your favorite platforms</p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-70">
            <div className="flex items-center gap-2 font-bold text-xl"><span className="w-2 h-2 rounded-full bg-pink-500"></span> Instagram</div>
            <div className="flex items-center gap-2 font-bold text-xl"><span className="w-2 h-2 rounded-full bg-blue-600"></span> LinkedIn</div>
            <div className="flex items-center gap-2 font-bold text-xl"><span className="w-2 h-2 rounded-full bg-sky-500"></span> Twitter</div>
            <div className="flex items-center gap-2 font-bold text-xl"><span className="w-2 h-2 rounded-full bg-red-600"></span> YouTube</div>
          </div>
        </div>
      </section>

      {/* Features Section (Bento Grid) */}
      <section id="features" className="py-24 px-4 container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Everything you need to go viral</h2>
          <p className="text-lg text-slate-600 dark:text-slate-400">A complete suite of AI tools designed for modern creators and brands.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="col-span-1 md:col-span-2 rounded-3xl p-8 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 backdrop-blur-xl hover:border-blue-500/50 transition-all duration-300 hover:-translate-y-1 group overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Bot className="w-12 h-12 text-blue-600 mb-6" />
            <h3 className="text-2xl font-bold mb-3">Multi-Agent Workflow</h3>
            <p className="text-slate-600 dark:text-slate-400 max-w-md">
              Our advanced LangChain architecture utilizes specialized AI agents: a Strategist, a Copywriter, and a Reviewer, working together to craft the perfect campaign for your brand.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-3xl p-8 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 backdrop-blur-xl hover:border-indigo-500/50 transition-all duration-300 hover:-translate-y-1 group relative">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Zap className="w-12 h-12 text-indigo-600 mb-6" />
            <h3 className="text-2xl font-bold mb-3">Lightning Fast</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Generate a month's worth of content in less than 60 seconds. Powered by Groq's ultra-fast LPU inference.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-3xl p-8 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 backdrop-blur-xl hover:border-pink-500/50 transition-all duration-300 hover:-translate-y-1 group relative">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <BarChart className="w-12 h-12 text-pink-600 mb-6" />
            <h3 className="text-2xl font-bold mb-3">Data-Driven Strategy</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Our AI analyzes real-time trends to ensure your content is always relevant and highly engaging.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="col-span-1 md:col-span-2 rounded-3xl p-8 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 backdrop-blur-xl hover:border-purple-500/50 transition-all duration-300 hover:-translate-y-1 group relative">
             <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Users className="w-12 h-12 text-purple-600 mb-6" />
            <h3 className="text-2xl font-bold mb-3">Visual Studio & Canva-Like Editor</h3>
            <p className="text-slate-600 dark:text-slate-400 max-w-md">
              Generate stunning, brand-aligned images via Pollinations AI. Preview how your posts will look exactly as they would appear on Instagram, LinkedIn, or Twitter.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 bg-slate-100/50 dark:bg-slate-900/50">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-lg text-slate-600 dark:text-slate-400">Start for free, upgrade when you need more power.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <div className="rounded-3xl p-8 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <p className="text-slate-500 mb-6">Perfect for individuals just getting started.</p>
              <div className="mb-6">
                <span className="text-5xl font-extrabold">$0</span>
                <span className="text-slate-500 font-medium">/month</span>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>3 AI campaigns per month</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Connect up to 2 social profiles</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Standard image generation</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Community support</span>
                </li>
              </ul>
              <Link href="/sign-up" className="w-full block">
                <Button variant="outline" className="w-full h-12 rounded-xl text-lg font-semibold">
                  Get Started Free
                </Button>
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="rounded-3xl p-8 bg-gradient-to-b from-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-500/20 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-white/20 px-4 py-1 rounded-bl-xl text-sm font-medium">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold mb-2">Professional</h3>
              <p className="text-blue-100 mb-6">For serious creators and marketing teams.</p>
              <div className="mb-6">
                <span className="text-5xl font-extrabold">$29</span>
                <span className="text-blue-200 font-medium">/month</span>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-200" />
                  <span>Unlimited AI campaigns</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-200" />
                  <span>Connect unlimited social profiles</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-200" />
                  <span>High-res premium image generation</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-200" />
                  <span>Priority email support</span>
                </li>
              </ul>
              <Link href="/sign-up" className="w-full block">
                <Button className="w-full h-12 rounded-xl text-lg font-semibold bg-white text-blue-600 hover:bg-slate-100">
                  Upgrade to Pro
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 text-center">
        <h2 className="text-4xl font-bold mb-6">Ready to put your marketing on autopilot?</h2>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">Join thousands of creators saving 10+ hours a week.</p>
        <Link href="/sign-up">
          <Button size="lg" className="h-14 px-8 text-lg font-semibold rounded-full shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-105">
            Create Your Free Account
          </Button>
        </Link>
      </section>
    </div>
  );
}
