export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-extrabold tracking-tight mb-8">Privacy Policy</h1>
      
      <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        
        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">1. Introduction</h2>
          <p>
            Welcome to SocialFlow AI. We respect your privacy and are committed to protecting your personal data. 
            This Privacy Policy will inform you as to how we look after your personal data when you visit our website 
            (regardless of where you visit it from) and tell you about your privacy rights and how the law protects you.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">2. Data We Collect</h2>
          <p>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together follows:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li><strong>Identity Data:</strong> includes first name, last name, username or similar identifier.</li>
            <li><strong>Contact Data:</strong> includes email address and telephone numbers.</li>
            <li><strong>OAuth &amp; Social Data:</strong> includes access tokens, profile pictures, and handles for connected platforms (Facebook, Instagram, LinkedIn, TikTok, YouTube, Pinterest) authorized via OAuth 2.0. We request specific scopes such as <code>pages_manage_posts</code> exclusively for publishing content on your behalf.</li>
            <li><strong>Technical Data:</strong> includes internet protocol (IP) address, your login data, browser type and version.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">3. How We Use Your Data</h2>
          <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li>Where we need to perform the contract we are about to enter into or have entered into with you (e.g., generating AI marketing campaigns).</li>
            <li>Where it is necessary for our legitimate interests (or those of a third party) and your interests and fundamental rights do not override those interests.</li>
            <li>To publish content to your connected social media channels based on your explicit commands.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">4. Facebook & Meta Integration Data</h2>
          <p>
            When you connect your Facebook or Instagram account, we request permissions such as <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, and <code>pages_show_list</code>. 
            This access is used strictly to automate your social media content workflow. 
            We do not sell this data, nor do we use it for targeted advertising. You can revoke our access at any time through your Meta Business settings.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">5. Data Security</h2>
          <p>
            We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered or disclosed. 
            OAuth tokens are encrypted at rest.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mt-8 mb-4">6. Contact Us</h2>
          <div className="mt-4">
            <p className="mb-4">
              If you have any questions about this Privacy Policy, please contact us via WhatsApp:
            </p>
            <a href="https://wa.me/923435219710" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M12.031 0C5.385 0 0 5.384 0 12.031c0 2.128.552 4.195 1.6 6.01L0 24l6.113-1.603c1.761.944 3.751 1.442 5.918 1.442 6.646 0 12.031-5.384 12.031-12.031C24 5.384 18.677 0 12.031 0zm3.844 17.15c-.19.53-1.077 1.026-1.503 1.076-.367.043-.847.115-2.736-.622-2.316-.906-3.791-3.267-3.906-3.421-.115-.154-.93-1.238-.93-2.361 0-1.123.582-1.675.787-1.895.176-.19.387-.238.517-.238.129 0 .259.004.37.009.117.005.275-.044.42.308.15.362.51 1.246.555 1.338.046.092.076.199.015.323-.06.123-.092.199-.184.307-.091.107-.194.234-.275.323-.09.098-.184.205-.078.388.106.184.472.782 1.015 1.267.701.626 1.282.818 1.465.91.183.092.29.076.398-.046.107-.123.463-.537.587-.722.124-.184.246-.153.414-.092.169.062 1.063.5 1.246.592.183.092.306.138.35.215.044.077.044.446-.145.976z"/>
              </svg>
              Chat on WhatsApp
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
