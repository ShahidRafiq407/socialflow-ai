import type { Metadata } from "next";
import { PolicyPage } from "@/components/marketing/policy-page";

export const metadata: Metadata = {
  title: "Data Processing & GDPR — PostloomAI",
  description: "How PostloomAI processes personal data under GDPR and other international privacy laws: legal bases, your rights, data storage and sub-processors.",
};

export default function DataProcessingPage() {
  return (
    <PolicyPage
      title="Data Processing & GDPR"
      updated="August 30, 2026"
      intro="This page explains how SMB Robotics (the company behind PostloomAI) processes personal data as a data controller for account data and as a data processor for content you create. It applies to users worldwide, with specific rights for EU/EEA, UK and other jurisdictions."
      sections={[
        {
          heading: "1. What Data We Process",
          list: [
            "Account data — name, email, authentication identifiers (via Clerk), billing status.",
            "Workspace data — connected social accounts, content you generate, schedules and analytics.",
            "Usage data — feature usage, logs and device/browser information for security and improvement.",
            "Payment data — processed by our payment processor; we store only billing status and receipts, never full card numbers.",
          ],
        },
        {
          heading: "2. Legal Bases (GDPR Art. 6)",
          list: [
            "Contract — to provide the service you signed up for.",
            "Legitimate interests — security, fraud prevention and product improvement.",
            "Consent — optional analytics and marketing communications, withdrawable at any time.",
            "Legal obligation — retaining invoices and transaction records where required by law.",
          ],
        },
        {
          heading: "3. Sub-Processors",
          paragraphs: [
            "We use carefully selected sub-processors to run the service: Clerk (authentication), Upstash (data storage/cache), our payment processor (billing), AI model providers (content generation) and Vercel (hosting). All sub-processors are bound by data protection agreements. A current list is available on request.",
          ],
        },
        {
          heading: "4. International Transfers",
          paragraphs: [
            "Data may be processed in countries other than yours, including the United States. Where required, transfers are protected by Standard Contractual Clauses or equivalent safeguards.",
          ],
        },
        {
          heading: "5. Your Rights",
          list: [
            "Access — request a copy of your personal data.",
            "Rectification — correct inaccurate data.",
            "Erasure — delete your account and associated data.",
            "Portability — receive your data in a machine-readable format.",
            "Objection & restriction — object to certain processing, such as marketing.",
            "Complaint — lodge a complaint with your local data protection authority.",
          ],
        },
        {
          heading: "6. Data Retention & Deletion",
          paragraphs: [
            "We keep account data while your account is active. When you delete your account, personal data is removed within 30 days, except data we must retain for legal, tax or security reasons. Generated content may be retained in backups for up to 90 days before full deletion.",
          ],
        },
        {
          heading: "7. Security",
          paragraphs: [
            "We apply encryption in transit (TLS), strict access controls, least-privilege access for staff and continuous monitoring. No system is perfectly secure, but we treat your data with the same care we expect from the services we rely on.",
          ],
        },
        {
          heading: "8. Contact & DPA",
          paragraphs: [
            "For data protection questions, to exercise your rights, or to request a Data Processing Agreement (DPA) for your organization, contact us via the Contact page — we respond within 30 days as required by GDPR.",
          ],
        },
      ]}
    />
  );
}
