import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Sparkles,
  Bot,
  Zap,
  BarChart,
  Users,
  ArrowRight,
  TrendingUp,
  Clock,
  Shield,
  Lightbulb,
  Rocket,
  Target,
  PieChart,
} from "lucide-react";

export default async function MarketingHomePage() {
  const { userId } = await auth();

  return (
    <div className="flex flex-col min-h-screen bg-black text-white overflow-x-hidden">
      {/* Animated background with gradient mesh */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/30 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-600/30 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse delay-1000" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-purple-600/30 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse delay-500" />
      </div>

      {/* Hero Section - Premium */}
      <section className="relative pt-40 pb-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 hover:border-blue-500/60 transition-colors">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-300">The Future of AI-Powered Marketing</span>
              <ArrowRight className="w-3 h-3 text-blue-400 ml-2" />
            </div>
          </div>

          {/* Main Headline */}
          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter mb-8 text-center leading-tight">
            Your{" "}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Autonomous
            </span>
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent">
              AI Marketing
            </span>{" "}
            Team
          </h1>

          {/* Subheading */}
          <p className="text-center text-xl sm:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
            Generate viral campaigns, premium visuals, and engaging copy in seconds. 
            <span className="block text-gray-400 mt-2">Save 20+ hours weekly with AI agents that work 24/7.</span>
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            {!userId ? (
              <>
                <Link href="/sign-up" className="group inline-flex items-center justify-center h-14 px-8 text-lg font-bold rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/50 hover:shadow-blue-500/75 transition-all duration-300 hover:scale-105 w-full sm:w-auto text-white">
                  Start Free
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="#features" className="group inline-flex items-center justify-center h-14 px-8 text-lg font-bold rounded-lg border-2 border-gray-700 hover:border-blue-500 hover:bg-blue-500/10 w-full sm:w-auto transition-all duration-300 text-white">
                  See Demo
                  <Sparkles className="ml-2 w-5 h-5" />
                </Link>
              </>
            ) : (
              <Link href="/dashboard" className="group inline-flex items-center justify-center h-14 px-8 text-lg font-bold rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/50 hover:shadow-blue-500/75 transition-all duration-300 hover:scale-105 w-full sm:w-auto text-white">
                Go to Dashboard
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>

          {/* Trust Badges */}
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-center text-sm text-gray-400">
            <div className="flex flex-col items-center gap-2">
              <div className="text-2xl font-bold text-blue-400">10K+</div>
              <div>Active Users</div>
            </div>
            <div className="flex flex-col items-center gap-2 border-l border-r border-gray-700">
              <div className="text-2xl font-bold text-purple-400">50M+</div>
              <div>Posts Generated</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="text-2xl font-bold text-pink-400">99.9%</div>
              <div>Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Integration Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-widest mb-8">Works with your favorite platforms</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 items-center justify-center">
            {[
              { name: "Instagram", color: "from-pink-500 to-rose-500" },
              { name: "LinkedIn", color: "from-blue-600 to-blue-700" },
              { name: "X (Twitter)", color: "from-gray-700 to-gray-800" },
              { name: "YouTube", color: "from-red-600 to-red-700" },
            ].map((platform) => (
              <div key={platform.name} className="flex items-center justify-center p-4 rounded-lg bg-gray-900/50 border border-gray-800 hover:border-gray-700 transition-colors">
                <div className={`bg-gradient-to-r ${platform.color} p-2 rounded-lg mr-3`}>
                  <div className="w-6 h-6 bg-gray-900 rounded" />
                </div>
                <span className="font-medium text-gray-300">{platform.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="features" className="py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-20">
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 tracking-tight">
              Everything You Need to
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Dominate Social Media
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Powerful AI tools designed for creators, agencies, and growing brands.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 - Large */}
            <div className="md:col-span-2 group relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-blue-500/50 p-8 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-blue-500/20 border border-blue-500/30 mb-6">
                  <Bot className="w-7 h-7 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Multi-Agent AI Workflow</h3>
                <p className="text-gray-400 leading-relaxed">
                  Our advanced LangChain-powered system deploys 3 specialized AI agents: a Strategist who analyzes trends, a Copywriter who crafts viral content, and a Reviewer ensuring brand alignment. All working in perfect harmony.
                </p>
                <div className="mt-6 flex gap-2">
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-300">LangChain</span>
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-300">AI Agents</span>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-indigo-500/50 p-8 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-indigo-500/20 border border-indigo-500/30 mb-6">
                  <Zap className="w-7 h-7 text-indigo-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Lightning Fast</h3>
                <p className="text-gray-400 leading-relaxed">
                  Generate a month of content in 60 seconds. Powered by Groq's hyper-fast LPU inference technology.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-pink-500/50 p-8 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-pink-500/20 border border-pink-500/30 mb-6">
                  <PieChart className="w-7 h-7 text-pink-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Data-Driven Strategy</h3>
                <p className="text-gray-400 leading-relaxed">
                  Real-time trend analysis ensures your content stays relevant, engaging, and perfectly timed.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-purple-500/50 p-8 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-purple-500/20 border border-purple-500/30 mb-6">
                  <Lightbulb className="w-7 h-7 text-purple-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Visual Studio Pro</h3>
                <p className="text-gray-400 leading-relaxed">
                  Canva-like editor with AI image generation. Preview exactly how posts appear on each platform.
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-yellow-500/50 p-8 transition-all duration-300 hover:shadow-xl hover:shadow-yellow-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-yellow-500/20 border border-yellow-500/30 mb-6">
                  <Target className="w-7 h-7 text-yellow-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Smart Scheduling</h3>
                <p className="text-gray-400 leading-relaxed">
                  Post at optimal times across all platforms. Maximize reach and engagement automatically.
                </p>
              </div>
            </div>

            {/* Feature 6 - Large */}
            <div className="md:col-span-2 group relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-cyan-500/50 p-8 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-cyan-500/20 border border-cyan-500/30 mb-6">
                  <TrendingUp className="w-7 h-7 text-cyan-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Advanced Analytics & Insights</h3>
                <p className="text-gray-400 leading-relaxed">
                  Track performance across all platforms. Get actionable insights on what resonates with your audience. A/B test content variants automatically and optimize in real-time.
                </p>
                <div className="mt-6 flex gap-2">
                  <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-medium text-cyan-300">Analytics</span>
                  <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-medium text-cyan-300">A/B Testing</span>
                  <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-medium text-cyan-300">Insights</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-32 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent border-t border-b border-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-5xl sm:text-6xl font-black text-center mb-20 tracking-tight">
            How It
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Works
            </span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Connect Your Profiles",
                description: "Link your Instagram, LinkedIn, X, YouTube and other social accounts in seconds.",
                icon: Clock,
              },
              {
                step: "02",
                title: "Define Your Strategy",
                description: "Tell our AI your brand voice, target audience, and content pillars.",
                icon: Target,
              },
              {
                step: "03",
                title: "AI Generates Content",
                description: "Watch as our agents create viral-worthy copy and stunning visuals.",
                icon: Rocket,
              },
              {
                step: "04",
                title: "Schedule & Publish",
                description: "Preview, customize, and auto-schedule across all platforms.",
                icon: CheckCircle2,
              },
            ].map((item, index) => {
              const IconComponent = item.icon;
              return (
                <div key={index} className="relative">
                  {/* Connector line */}
                  {index < 3 && (
                    <div className="hidden md:block absolute top-24 left-[calc(100%+16px)] w-8 h-0.5 bg-gradient-to-r from-blue-500/50 to-transparent" />
                  )}
                  
                  <div className="rounded-2xl bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 p-8">
                    <div className="text-4xl font-black text-gray-700 mb-4">{item.step}</div>
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-500/20 border border-blue-500/30 mb-6">
                      <IconComponent className="w-6 h-6 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { stat: "20+", label: "Hours Saved Weekly", icon: Clock },
              { stat: "99.9%", label: "Uptime Guaranteed", icon: Shield },
              { stat: "10K+", label: "Active Creators", icon: Users },
              { stat: "1M+", label: "Posts This Month", icon: TrendingUp },
            ].map((item, index) => {
              const IconComponent = item.icon;
              return (
                <div key={index} className="group text-center p-8 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-blue-500/50 transition-all hover:shadow-xl hover:shadow-blue-500/20">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-blue-500/20 border border-blue-500/30 mb-6 mx-auto group-hover:scale-110 transition-transform">
                    <IconComponent className="w-7 h-7 text-blue-400" />
                  </div>
                  <div className="text-4xl font-black mb-2">{item.stat}</div>
                  <div className="text-gray-400">{item.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section - Premium */}
      <section id="pricing" className="py-32 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 tracking-tight">
              Simple, Transparent
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Pricing
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Start free, scale as you grow. No credit card required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter Plan */}
            <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-gray-700 transition-all flex flex-col">
              <div className="p-8 pb-6">
                <h3 className="text-2xl font-bold mb-2">Starter</h3>
                <p className="text-gray-400 text-sm mb-8">Perfect for individuals exploring AI.</p>
                
                <div className="mb-8">
                  <span className="text-5xl font-black">$0</span>
                  <span className="text-gray-400 ml-2">/month</span>
                </div>

                <Link href="/sign-up" className="block w-full mb-8 inline-flex items-center justify-center h-12 rounded-lg border-2 border-gray-700 hover:border-blue-500 hover:bg-blue-500/10 font-medium text-white transition-colors">
                  Get Started Free
                </Link>

                <div className="space-y-4">
                  {[
                    "3 AI campaigns/month",
                    "2 social profiles",
                    "Basic image generation",
                    "Community support",
                    "Analytics dashboard",
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      <span className="text-sm text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Professional Plan - Featured */}
            <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 relative md:scale-105 flex flex-col shadow-2xl shadow-blue-500/50">
              <div className="absolute -top-4 right-6 bg-gradient-to-r from-yellow-400 to-orange-400 px-4 py-2 rounded-full text-xs font-bold text-black">
                MOST POPULAR
              </div>
              
              <div className="p-8 pb-6">
                <h3 className="text-2xl font-bold mb-2">Professional</h3>
                <p className="text-blue-100 text-sm mb-8">For serious creators & teams.</p>
                
                <div className="mb-8">
                  <span className="text-5xl font-black">$29</span>
                  <span className="text-blue-100 ml-2">/month</span>
                </div>

                <Link href="/sign-up" className="block w-full mb-8 inline-flex items-center justify-center h-12 rounded-lg bg-white text-blue-600 font-bold hover:bg-gray-50 transition-all">
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>

                <div className="space-y-4">
                  {[
                    "Unlimited AI campaigns",
                    "Unlimited social profiles",
                    "Premium image generation",
                    "Priority email support",
                    "Advanced analytics",
                    "Content calendar",
                    "A/B testing",
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-blue-200 flex-shrink-0" />
                      <span className="text-sm text-white font-medium">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Enterprise Plan */}
            <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 hover:border-gray-700 transition-all flex flex-col">
              <div className="p-8 pb-6">
                <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
                <p className="text-gray-400 text-sm mb-8">For agencies & large teams.</p>
                
                <div className="mb-8">
                  <span className="text-5xl font-black">Custom</span>
                </div>

                <Link href="mailto:hello@socialflow.ai" className="block w-full mb-8 inline-flex items-center justify-center h-12 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-bold text-white transition-all">
                  Contact Sales
                </Link>

                <div className="space-y-4">
                  {[
                    "Everything in Pro",
                    "Advanced customization",
                    "Dedicated account manager",
                    "API access",
                    "Custom integrations",
                    "SLA guarantee",
                    "Team training",
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                      <span className="text-sm text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Note */}
          <div className="text-center mt-16">
            <p className="text-gray-400 mb-4">All plans include 14-day free trial. No credit card required.</p>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-32 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-5xl sm:text-6xl font-black text-center mb-16 tracking-tight">
            Trusted by Creators &
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Marketing Teams
            </span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: "Alex Chen",
                role: "Content Creator",
                text: "SocialFlow AI saved me 15+ hours per week. I went from posting 3x/week to daily, and my engagement doubled.",
                avatar: "AC",
              },
              {
                name: "Sarah Mitchell",
                role: "Marketing Manager",
                text: "The AI agents are incredibly smart. They understand our brand voice and generate content that actually converts.",
                avatar: "SM",
              },
              {
                name: "James Rodriguez",
                role: "Agency Owner",
                text: "Incredible tool for scaling client accounts. My team's productivity increased 5x. Worth every penny.",
                avatar: "JR",
              },
            ].map((testimonial, index) => (
              <div key={index} className="rounded-2xl bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 p-8 hover:border-blue-500/30 transition-all">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-bold text-white">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-bold">{testimonial.name}</div>
                    <div className="text-sm text-gray-400">{testimonial.role}</div>
                  </div>
                </div>
                <p className="text-gray-300 leading-relaxed italic">"{testimonial.text}"</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-32 px-4 sm:px-6 lg:px-8 border-t border-gray-800 text-center">
        <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-8 tracking-tight">
          Ready to Transform
          <br />
          Your Social Media?
        </h2>
        <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
          Join 10,000+ creators and brands automating their marketing. Start free today.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/sign-up" className="group inline-flex items-center justify-center h-14 px-8 text-lg font-bold rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/50 hover:shadow-blue-500/75 transition-all duration-300 hover:scale-105 text-white">
            Get Started Free
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link href="https://cal.com/your-calendar" target="_blank" className="group inline-flex items-center justify-center h-14 px-8 text-lg font-bold rounded-lg border-2 border-gray-700 hover:border-blue-500 hover:bg-blue-500/10 transition-colors text-white">
            Book a Demo
            <Sparkles className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-4 sm:px-6 lg:px-8 border-t border-gray-800 bg-gradient-to-b from-transparent to-gray-950/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="#features" className="hover:text-blue-400 transition">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-blue-400 transition">Pricing</Link></li>
                <li><Link href="#" className="hover:text-blue-400 transition">Roadmap</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="#" className="hover:text-blue-400 transition">Blog</Link></li>
                <li><Link href="#" className="hover:text-blue-400 transition">About</Link></li>
                <li><Link href="#" className="hover:text-blue-400 transition">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="#" className="hover:text-blue-400 transition">Privacy</Link></li>
                <li><Link href="#" className="hover:text-blue-400 transition">Terms</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Follow Us</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="#" className="hover:text-blue-400 transition">Twitter</Link></li>
                <li><Link href="#" className="hover:text-blue-400 transition">LinkedIn</Link></li>
                <li><Link href="#" className="hover:text-blue-400 transition">Instagram</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
            <p>&copy; 2024 SocialFlow AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}