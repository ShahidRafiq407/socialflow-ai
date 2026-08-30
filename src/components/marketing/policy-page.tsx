import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export interface PolicySection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export function PolicyPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: PolicySection[];
}) {
  return (
    <div className="mkt-bg mkt-text">
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-sm mkt-muted hover:mkt-accent-text transition-colors mb-10">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#18713C]/10 border border-[#18713C]/30 mkt-accent-text text-xs font-semibold tracking-widest uppercase mb-6">
            <ShieldCheck className="w-3.5 h-3.5" /> Legal
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">{title}</h1>
          <p className="text-sm mkt-faint mb-8">Last updated: {updated}</p>
          <p className="text-lg mkt-muted leading-relaxed mb-12">{intro}</p>

          <div className="space-y-12">
            {sections.map((s) => (
              <div key={s.heading}>
                <h2 className="text-2xl font-bold mb-4">{s.heading}</h2>
                {s.paragraphs?.map((p, i) => (
                  <p key={i} className="mkt-muted leading-[1.85] mb-4 text-[16px]">{p}</p>
                ))}
                {s.list && (
                  <ul className="space-y-2.5 ml-1">
                    {s.list.map((item, i) => (
                      <li key={i} className="flex gap-3 mkt-muted leading-relaxed">
                        <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-[#18713C] shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="mt-14 rounded-2xl mkt-glass p-7">
            <h3 className="font-bold mb-2">Questions about this policy?</h3>
            <p className="text-sm mkt-muted mb-4">
              Contact the SMB Robotics team and we&apos;ll help you out.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center h-11 px-6 text-sm font-bold rounded-full bg-[#18713C] text-white hover:bg-[#1E8A47] transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
