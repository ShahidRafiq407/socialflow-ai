import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <Link href="/" className="font-bold text-xl tracking-tight">
              SocialFlow AI
            </Link>
          </div>
          
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Link href="/#features" className="hover:text-blue-600 transition-colors">Features</Link>
            <Link href="/#pricing" className="hover:text-blue-600 transition-colors">Pricing</Link>
            <Link href="/#testimonials" className="hover:text-blue-600 transition-colors">Customers</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium hover:text-blue-600 transition-colors hidden md:block">
              Log in
            </Link>
            <Link href="/sign-up">
              <Button>Get Started Free</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-12 mt-24">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <span className="font-bold text-lg">SocialFlow AI</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 pr-4">
              The autonomous AI marketing employee that runs your social media on autopilot.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              © {new Date().getFullYear()} SocialFlow AI. All rights reserved.
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4 text-slate-900 dark:text-slate-100">Product</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li><Link href="/#features" className="hover:text-blue-600 transition-colors">Features</Link></li>
              <li><Link href="/#pricing" className="hover:text-blue-600 transition-colors">Pricing</Link></li>
              <li><Link href="#" className="hover:text-blue-600 transition-colors">Integrations</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-slate-900 dark:text-slate-100">Company</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li><Link href="#" className="hover:text-blue-600 transition-colors">About Us</Link></li>
              <li><Link href="#" className="hover:text-blue-600 transition-colors">Contact</Link></li>
              <li><Link href="#" className="hover:text-blue-600 transition-colors">Blog</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-slate-900 dark:text-slate-100">Legal</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li><Link href="/privacy-policy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms-of-service" className="hover:text-blue-600 transition-colors">Terms of Service</Link></li>
              <li><Link href="#" className="hover:text-blue-600 transition-colors">Cookie Policy</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
