import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "@/lib/blog/posts";
import { TrendingUp, Workflow, LineChart, ArrowRight, Newspaper } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog — AI Marketing Insights | PostloomAI",
  description:
    "Practical guides on AI social media marketing, automation workflows and content strategy for small businesses — from the PostloomAI team at SMB Robotics.",
};

const ICONS = { trend: TrendingUp, workflow: Workflow, growth: LineChart };

export default function BlogIndexPage() {
  return (
    <div className="mkt-bg mkt-text">
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[420px] h-[420px] bg-[#18713C]/20 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[380px] h-[380px] bg-[#48357B]/25 rounded-full blur-[130px] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#18713C]/10 border border-[#3DB36B]/30 mkt-accent-text text-xs font-semibold tracking-widest uppercase mb-6">
            <Newspaper className="w-3.5 h-3.5" /> The PostloomAI Blog
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            AI Marketing,{" "}
            <span className="mkt-accent-text">
              Explained Simply
            </span>
          </h1>
          <p className="text-lg mkt-muted leading-relaxed max-w-2xl mx-auto">
            Practical guides, trending strategies and workflows to grow your brand with
            AI — no fluff, no jargon.
          </p>
        </div>
      </section>

      <section className="pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {POSTS.map((post) => {
            const Icon = ICONS[post.icon];
            return (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-3xl mkt-glass overflow-hidden hover:mkt-border hover:-translate-y-2 transition-all duration-300 flex flex-col"
              >
                {/* cover image */}
                <div style={{ backgroundColor: post.gradient }} className="relative h-44 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
                  <Icon className="w-16 h-16 text-white/80 group-hover:scale-110 transition-transform duration-300" />
                  <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/40 backdrop-blur text-xs font-bold text-white">
                    {post.tag}
                  </span>
                </div>
                <div className="p-7 flex flex-col flex-1">
                  <div className="text-xs mkt-faint mb-3">
                    {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · {post.readTime}
                  </div>
                  <h2 className="text-xl font-bold mb-3 leading-snug group-hover:mkt-accent-text transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-sm mkt-faint leading-relaxed flex-1">{post.excerpt}</p>
                  <span className="inline-flex items-center gap-1.5 mt-5 text-sm font-bold mkt-accent-text">
                    Read article <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}


