export default function TermsOfService() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">Terms of Service</h1>
      
      <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        
        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">1. Acceptance of Terms</h2>
          <p>
            By accessing and using SocialFlow AI ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">2. Description of Service</h2>
          <p>
            SocialFlow AI provides an AI-powered marketing automation platform that connects to your social media accounts via OAuth 2.0 to generate and publish content on your behalf.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">3. User Responsibilities</h2>
          <p>
            You are responsible for the content published through your connected accounts. While AI generates the content, you are expected to review and ensure it aligns with platform guidelines (e.g., Meta's Community Standards). 
            You agree not to use the Service to generate hate speech, spam, or illegal content.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">4. Third-Party Platform Rules</h2>
          <p>
            By connecting third-party platforms (like Facebook, LinkedIn, X), you also agree to their respective Terms of Service. 
            We are not responsible for any account bans or restrictions placed on your social accounts by these third-party platforms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">5. Termination</h2>
          <p>
            We may terminate or suspend your access to the Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
          </p>
        </section>
      </div>
    </div>
  );
}
