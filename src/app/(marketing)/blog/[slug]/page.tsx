import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POSTS, getPost, type Block } from "@/lib/blog/posts";
import { TrendingUp, Workflow, LineChart, ArrowLeft, ArrowUpRight } from "lucide-react";
import React from "react";

const ICONS = { trend: TrendingUp, workflow: Workflow, growth: LineChart };

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} | PostloomAI Blog`,
    description: post.description,
    keywords: post.keywords,
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.date },
  };
}

/** Renders [label](href) markdown-style links inside text. Internal links are
 *  relative paths, so they keep working even if the domain changes. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
        const [, label, href] = m;
        if (href.startsWith("http")) {
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="mkt-accent-text underline decoration-[#3DB36B]/40 hover:decoration-[#3DB36B] underline-offset-4">
              {label}
            </a>
          );
        }
        return (
          <Link key={i} href={href} className="mkt-accent-text underline decoration-[#3DB36B]/40 hover:decoration-[#3DB36B] underline-offset-4">
            {label}
          </Link>
        );
      })}
    </>
  );
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "h2":
      return <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-14 mb-5">{block.text}</h2>;
    case "h3":
      return <h3 className="text-xl font-bold mt-10 mb-4 mkt-accent-text">{block.text}</h3>;
    case "p":
      return <p className="mkt-muted leading-[1.85] mb-6 text-[17px]"><RichText text={block.text} /></p>;
    case "list":
      return (
        <ul className="space-y-3 mb-8 ml-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 mkt-muted leading-relaxed">
              <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-[#18713C] shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="my-10 rounded-2xl border-l-4 border-[#3DB36B] bg-[#18713C]/10 px-7 py-6">
          <p className="text-lg font-semibold italic leading-relaxed">&ldquo;{block.text}&rdquo;</p>
          {block.author && <footer className="mt-3 text-sm mkt-faint">— {block.author}</footer>}
        </blockquote>
      );
    case "links":
      return (
        <div className="mt-14 rounded-2xl border mkt-border mkt-surface p-7">
          <h3 className="font-bold mb-4">{block.title}</h3>
          <ul className="space-y-3">
            {block.links.map((l) =>
              l.external ? (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="mkt-accent-text hover:underline inline-flex items-center gap-1.5">
                    {l.label} <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </li>
              ) : (
                <li key={l.href}>
                  <Link href={l.href} className="mkt-accent-text hover:underline">{l.label}</Link>
                </li>
              )
            )}
          </ul>
        </div>
      );
  }
}
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const Icon = ICONS[post.icon];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: "SMB Robotics", url: "https://smbrobotic.com" },
    publisher: { "@type": "Organization", name: "PostloomAI" },
    keywords: post.keywords.join(", "),
  };

  return (
    <div className="mkt-bg mkt-text">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero with cover image */}
      <section className="relative pt-20 pb-0 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm mkt-muted hover:mkt-accent-text transition-colors mb-10">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>
          <div className="flex items-center gap-3 text-xs mb-5">
            <span className="px-3 py-1 rounded-full bg-[#18713C]/15 border border-[#3DB36B]/30 mkt-accent-text font-bold">{post.tag}</span>
            <span className="mkt-faint">
              {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · {post.readTime}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-6">
            {post.title}
          </h1>
          <p className="text-lg mkt-muted leading-relaxed mb-10">{post.description}</p>
        </div>
        <div style={{ backgroundColor: post.gradient }} className="relative max-w-4xl mx-auto h-64 sm:h-80 rounded-3xl flex items-center justify-center overflow-hidden mb-14">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:36px_36px]" />
          <Icon className="w-24 h-24 text-white/80" />
        </div>
      </section>

      {/* Article body */}
      <article className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-3xl mx-auto">
          {post.blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}

          {/* CTA */}
          <div className="mt-16 rounded-3xl border mkt-border mkt-glass p-10 text-center">
            <h3 className="text-2xl font-black mb-3">Put this into practice</h3>
            <p className="mkt-muted mb-7 max-w-md mx-auto">
              Try PostloomAI free — Loom, our AI marketing robot, does everything you just read about.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center px-8 py-3.5 font-bold rounded-2xl bg-[#18713C] text-white hover:scale-[1.04] transition-transform"
            >
              Start Free <ArrowUpRight className="ml-2 w-4 h-4" />
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}

