import type { Metadata } from "next";
import { PolicyPage } from "@/components/marketing/policy-page";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { PLAN_CATALOG } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Terms of Service — PostloomAI",
  description:
    "The terms governing use of PostloomAI: your account, connected platforms, AI-generated content, subscriptions and credits, and how either side can end the agreement.",
};

/** Re-rendered every five minutes so an edited price reaches the published terms. */
export const revalidate = 300;

export default async function TermsOfServicePage() {
  // The prices below are a contractual statement, so they have to be the ones this
  // deployment charges. The admin's overrides are patched into `PLAN_CATALOG` once the
  // settings have been read, and these used to be module constants — evaluated at
  // import time, before any read, and then frozen at the code defaults for the life of
  // the process. Read inside the render, after the await, they follow the back office.
  await ensureRuntimeConfig();
  const TRIAL = PLAN_CATALOG.TRIAL;
  const CONVERTS_TO = PLAN_CATALOG[TRIAL.convertsTo ?? "GO"];

  return (
    <PolicyPage
      title="Terms of Service"
      updated="September 4, 2026"
      intro="These terms govern your use of PostloomAI, a product of SMB Robotics. By creating an account you agree to them. They cover what the service does, what you are responsible for, how paid plans and credits work, and how either of us can bring the agreement to an end."
      sections={[
        {
          heading: "1. The Agreement",
          paragraphs: [
            "By accessing or using PostloomAI (\"the Service\") you agree to these terms and to our Privacy Policy, Refund & Billing Policy, Acceptable Use Policy and Cookie Policy, each linked in the footer. If you are agreeing on behalf of a company, you confirm you are authorised to bind it.",
            "We may change these terms as the product changes. Material changes are announced by email at least 30 days before they take effect, and continuing to use the Service after that date means you accept them. If you do not, you can cancel and stop using the Service.",
            "You must be at least 16 years old, or the minimum age of digital consent where you live, to hold an account.",
          ],
        },
        {
          heading: "2. What the Service Does",
          paragraphs: [
            "PostloomAI is an AI marketing platform. It connects to your social media accounts by OAuth, generates copy, images and video from prompts and from your brand profile, schedules and publishes posts on your behalf, writes articles, and reports on what happened.",
            "The AI features run on third-party models, principally Google's Gemini family. Availability and behaviour of those models is outside our control, and we may change which model serves a feature in order to improve quality or cost. We do not guarantee that any specific model will remain in use.",
            "We aim for high availability but do not promise uninterrupted service. Scheduled maintenance, platform outages at a connected network, and third-party model outages can all delay or prevent a publish.",
          ],
        },
        {
          heading: "3. Your Account and Your Content",
          list: [
            "You are responsible for keeping your login secure and for everything done under your account, including by team members you invite.",
            "You keep ownership of what you upload and of what the AI generates for you. We claim no ownership over your posts, media, articles or brand data.",
            "You grant us the licence needed to run the Service on your behalf: to store your content, send it to the AI models that process it, and publish it to the accounts you have connected.",
            "You are responsible for what gets published. The AI drafts, you decide. Review output before it goes out, and make sure it complies with the rules of each network and with the law where you operate.",
            "AI output is not unique to you. A model may produce similar text or imagery for someone else, and we cannot warrant that generated content is original, accurate, or free of third-party rights. Check anything you intend to rely on.",
          ],
        },
        {
          heading: "4. Connected Platforms",
          paragraphs: [
            "Connecting an account at Facebook, Instagram, LinkedIn, YouTube, TikTok or Pinterest means you also agree to that platform's own terms. Each of them sets its own rules on automation, posting frequency and content, and each can restrict or ban an account for breaking them.",
            "We are not responsible for action a platform takes against your account, for content a platform removes, or for a publish that fails because a platform's API changed, rate-limited us, or revoked a token. Where a publish fails we surface the error and let you retry.",
          ],
        },
        {
          heading: "5. Acceptable Use",
          list: [
            "Do not use the Service to produce or publish hate speech, harassment, sexual content involving minors, or anything illegal where you or your audience are.",
            "Do not use it for spam, engagement manipulation, coordinated inauthentic behaviour, or to impersonate a person or brand you do not represent.",
            "Do not attempt to extract our prompts or models, resell access, or run the Service on behalf of undisclosed third parties as a reseller without a written agreement.",
            "Do not probe, scrape, overload or circumvent the Service's limits, including the credit system and the plan entitlements described below.",
            "Do not create multiple accounts to take the trial more than once, and do not use a VPN, proxy or disposable identity to do so.",
          ],
        },
        {
          heading: "6. Plans, Credits and Fair Use",
          paragraphs: [
            `The Free plan is available indefinitely without payment. The ${TRIAL.name} is a single payment of $${TRIAL.oneTimePrice} that opens the paid features for ${TRIAL.trialDays} days and is limited to one per person. It does not create a subscription and does not renew: when the ${TRIAL.trialDays} days end the account returns to Free, and moving on to ${CONVERTS_TO.name} at $${CONVERTS_TO.priceMonthly} a month or any other plan is a separate choice you make yourself. Paid plans, once started, renew automatically until cancelled.`,
            "AI work is metered in credits. Every plan includes a monthly credit allowance, each action has a published credit price shown in the app before you run it, and an action is refused when the balance cannot cover it. Plan allowances reset each period and do not roll over; top-up packs never expire. Credits are a unit of account for AI work, not money: they cannot be transferred, exchanged or redeemed for cash.",
            "Plan limits — workspaces, connected accounts, team members, storage and per-feature caps — are enforced by the Service, not by trust. Deliberately working around them, including by holding several accounts to multiply a free allowance, is a breach of these terms.",
            "Payment, refund, renewal, failed-payment and tax terms are set out in the Refund & Billing Policy, which forms part of this agreement. Payments are handled by Lemon Squeezy as merchant of record.",
          ],
        },
        {
          heading: "7. Data and Privacy",
          paragraphs: [
            "How we collect, use, store and delete personal data is set out in the Privacy Policy, and our role as processor for the workspace data you put into the Service is set out in the Data Processing terms. In short: your content is used to run the Service for you, and is not sold.",
            "Deleting your account removes your workspaces, content and connected-account tokens. Some records — payment receipts and the usage ledger behind your invoices — are retained where law requires it.",
          ],
        },
        {
          heading: "8. Warranties and Liability",
          paragraphs: [
            "The Service is provided \"as is\" and \"as available\". To the fullest extent permitted by law we disclaim implied warranties of merchantability, fitness for a particular purpose and non-infringement, and we do not warrant that AI output will be accurate, suitable or effective for your purpose.",
            "To the fullest extent permitted by law, neither party is liable for indirect, incidental, special or consequential loss, or for lost profits, revenue, goodwill or data. Our total liability for any claim relating to the Service is limited to the amount you paid us in the 12 months before the claim arose.",
            "Nothing in these terms excludes liability that cannot lawfully be excluded, including for fraud or for death or personal injury caused by negligence. Some jurisdictions do not allow certain exclusions, and in those places these limits apply only as far as the law permits.",
          ],
        },
        {
          heading: "9. Ending the Agreement",
          paragraphs: [
            "You can cancel a paid plan at any time from the billing page and keep access until the end of the period you have paid for. You can delete your account at any time from settings.",
            "We may suspend or terminate an account for breach of these terms or the Acceptable Use Policy, for non-payment after the grace period described in the Refund & Billing Policy, or where we are required to by law. Except where the breach is serious or where law prevents it, we will tell you what the problem is and give you a chance to fix it before terminating.",
            "On termination for breach, no refund is due. On termination for any other reason, unused paid time is handled as described in the Refund & Billing Policy.",
          ],
        },
        {
          heading: "10. General",
          paragraphs: [
            "These terms, together with the policies referenced in them, are the entire agreement between us. If any part is found unenforceable, the rest continues to apply. Our not enforcing a term is not a waiver of it.",
            "You may not assign this agreement without our consent; we may assign it in connection with a merger, acquisition or sale of assets, on notice to you.",
            "These terms are governed by the laws applicable to SMB Robotics' place of establishment, without regard to conflict-of-laws rules, and the courts there have exclusive jurisdiction — except that either party may seek injunctive relief wherever necessary to protect its intellectual property.",
          ],
        },
      ]}
    />
  );
}
