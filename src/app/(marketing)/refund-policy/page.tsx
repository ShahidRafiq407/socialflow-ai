import type { Metadata } from "next";
import { PolicyPage } from "@/components/marketing/policy-page";

export const metadata: Metadata = {
  title: "Refund Policy — PostloomAI",
  description: "PostloomAI refund and billing policy: 30-day money-back guarantee, plan cancellations and payment terms for customers worldwide.",
};

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      title="Refund & Billing Policy"
      updated="August 30, 2026"
      intro="This policy explains how subscriptions, payments and refunds work for PostloomAI, a product of SMB Robotics. It applies to all paid plans worldwide."
      sections={[
        {
          heading: "1. 30-Day Money-Back Guarantee",
          paragraphs: [
            "If you are not satisfied with your first paid subscription, you may request a full refund within 30 days of your initial payment — no questions asked. This guarantee applies to your first billing cycle on any plan (Pro, Business or Enterprise).",
          ],
        },
        {
          heading: "2. Refunds After the First 30 Days",
          paragraphs: [
            "After the first 30 days, paid subscriptions are non-refundable for the current billing period. However, you can cancel at any time and you will retain access until the end of the period you already paid for. No partial or prorated refunds are issued for unused time in later cycles.",
          ],
        },
        {
          heading: "3. How to Request a Refund",
          list: [
            "Contact us through the Contact page or reply to your payment receipt.",
            "Include the email address tied to your account and the payment date.",
            "Approved refunds are returned to the original payment method within 5–10 business days, depending on your bank or card provider.",
          ],
        },
        {
          heading: "4. Payments & Billing",
          paragraphs: [
            "We accept major credit and debit cards (Visa, Mastercard, American Express) and other payment methods shown at checkout. Payments are processed securely by third-party payment processors (such as Stripe) — we never store your full card details on our servers.",
            "Subscriptions renew automatically at the end of each billing period (monthly or yearly) unless cancelled before the renewal date. Yearly plans shown with a discount are billed once per year in advance.",
          ],
        },
        {
          heading: "5. Failed Payments & Account Suspension",
          paragraphs: [
            "If a renewal payment fails, we will retry and notify you by email. If payment cannot be collected within 14 days, the account may be downgraded to the free Starter plan or suspended until the balance is settled.",
          ],
        },
        {
          heading: "6. Chargebacks",
          paragraphs: [
            "Please contact us before filing a chargeback with your bank — most issues can be resolved faster directly. Accounts with unresolved chargebacks may be suspended until the dispute is settled.",
          ],
        },
        {
          heading: "7. Taxes",
          paragraphs: [
            "Prices may exclude applicable taxes. Depending on your location, VAT, GST or sales tax may be added at checkout in accordance with local law.",
          ],
        },
      ]}
    />
  );
}
