import type { Metadata } from "next";
import { PolicyPage } from "@/components/marketing/policy-page";

export const metadata: Metadata = {
  title: "Cookie Policy — PostloomAI",
  description: "How PostloomAI uses cookies and similar technologies, including essential, analytics and preference cookies, and how to control them.",
};

export default function CookiePolicyPage() {
  return (
    <PolicyPage
      title="Cookie Policy"
      updated="August 30, 2026"
      intro="This policy explains how PostloomAI (operated by SMB Robotics) uses cookies and similar technologies when you visit our website or use our platform."
      sections={[
        {
          heading: "1. What Are Cookies?",
          paragraphs: [
            "Cookies are small text files stored on your device by your browser. They help websites remember your preferences, keep you signed in and understand how the site is used. We also use similar technologies such as local storage and session storage.",
          ],
        },
        {
          heading: "2. Types of Cookies We Use",
          list: [
            "Essential cookies — required for the site to function: authentication sessions (Clerk), security and load balancing. These cannot be disabled.",
            "Preference cookies — remember your choices, such as dark or light theme, so you don't have to set them again.",
            "Analytics cookies — help us understand which pages are visited and how features are used, so we can improve the product.",
            "Billing cookies — set by our payment processor during checkout to prevent fraud and process payments securely.",
          ],
        },
        {
          heading: "3. Third-Party Cookies",
          paragraphs: [
            "Some pages may set cookies from trusted third parties: Clerk (authentication), our payment processor (billing) and analytics providers. These parties process data under their own privacy policies, and we only use providers that offer appropriate data protection guarantees.",
          ],
        },
        {
          heading: "4. Managing Cookies",
          paragraphs: [
            "You can control or delete cookies through your browser settings. Blocking essential cookies may prevent you from signing in or using parts of the platform. Most browsers also offer a 'Do Not Track' setting, which we respect for analytics where technically possible.",
          ],
        },
        {
          heading: "5. International Users",
          paragraphs: [
            "For visitors from the EU/EEA, UK and other regions with cookie consent laws, non-essential cookies are only set after you give consent where required. See our Data Processing page for details on your GDPR rights.",
          ],
        },
      ]}
    />
  );
}
