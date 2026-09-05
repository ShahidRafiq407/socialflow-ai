import type { Metadata } from "next";
import { PolicyPage } from "@/components/marketing/policy-page";
import { ensureRuntimeConfig } from "@/lib/admin/runtimeConfig";
import { PLAN_CATALOG } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Refund Policy — PostloomAI",
  description:
    "PostloomAI refund and billing policy: how the 3-day trial, credits, top-ups, refunds and cancellations work on every plan.",
};

/**
 * Re-rendered every five minutes rather than baked at build.
 *
 * The page quotes prices, and a build artefact cannot know that the admin changed
 * one an hour later. Five minutes is short enough that a price edit reaches the
 * published policy quickly and long enough that a legal page is not a database read
 * per visitor.
 */
export const revalidate = 300;

/**
 * Why the guarantee is bounded by consumption rather than by time alone.
 *
 * Every paid plan is a credit grant, and a credit is spent on a model call we have
 * already paid a provider for. An unconditional "full refund within 30 days" on a
 * consumption product means a customer can spend an entire Agency grant — whose
 * worst-case provider cost is most of the plan's price — and then be refunded in
 * full. That is not a generous policy, it is an unpriced one, and the cost of it
 * lands on everybody else's price.
 *
 * So the refund is tied to what has been used: unspent means refundable, and the
 * 3-day trial is what carries the job of finding out whether the product works
 * before committing to a month. The window is 14 days rather than 30 because that
 * is long enough to decide and short enough to sit inside one billing period.
 */
export default async function RefundPolicyPage() {
  // A stated price is a promise, so it has to be the price this deployment charges.
  // The admin's overrides land on `PLAN_CATALOG` only after the settings are read;
  // this was a module constant, evaluated before any read and then never again.
  await ensureRuntimeConfig();
  const TRIAL = PLAN_CATALOG.TRIAL;
  const CONVERTS_TO = PLAN_CATALOG[TRIAL.convertsTo ?? "GO"];

  return (
    <PolicyPage
      title="Refund & Billing Policy"
      updated="September 4, 2026"
      intro="This policy explains how the trial, subscriptions, credits, payments and refunds work for PostloomAI, a product of SMB Robotics. It applies to all plans worldwide."
      sections={[
        {
          heading: "1. Try It Before You Commit",
          paragraphs: [
            `The Free plan does not expire and never asks for a card, so you can connect your accounts and publish before spending anything. To try the AI features, the ${TRIAL.name} is $${TRIAL.oneTimePrice} once and opens the whole product for ${TRIAL.trialDays} days — AI posts, images, a video, the CEO chat and an article.`,
            `Cancel inside those ${TRIAL.trialDays} days and nothing further is charged. If you do not cancel, the trial becomes a ${CONVERTS_TO.name} subscription at $${CONVERTS_TO.priceMonthly} a month, and we email you before that happens.`,
            `The trial is one per person. It is priced to cover the AI it gives you rather than to make money, which is why it cannot be taken twice.`,
          ],
        },
        {
          heading: "2. 14-Day Refund on Your First Paid Period",
          paragraphs: [
            "If you are not satisfied with your first paid subscription period on the Go, Pro or Agency plan, you may request a full refund within 14 days of that payment, provided you have used no more than 10% of the period's credit allowance.",
            "That condition exists because credits are spent on AI work we pay for the moment you run it. Your remaining balance is shown on the billing page at all times, so you can always see where you stand against it before deciding.",
          ],
        },
        {
          heading: "3. Refunds After That",
          paragraphs: [
            "Later billing periods are non-refundable, and a period in which more than 10% of the credit allowance has been used is non-refundable. You can cancel at any time and keep access until the end of the period you have already paid for — we do not cut service short on cancellation.",
            "No partial or prorated refunds are issued for unused time. Upgrading mid-period takes effect immediately and is prorated by Lemon Squeezy against what you have already paid; downgrading takes effect at the end of the current period, so nothing you paid for is lost.",
          ],
        },
        {
          heading: "4. Credits, Top-Ups and What Carries Over",
          list: [
            "Each plan includes a monthly credit allowance. Unused plan credits do not roll over — the allowance resets at the start of each billing period.",
            "Top-up packs are separate. They never expire, they carry across billing periods, and they are only spent after the period's allowance is gone, so buying one can never cost you credits you already had.",
            "An unspent top-up pack can be refunded in full within 14 days of purchase. Once credits from a pack have been spent, that portion is not refundable.",
            "Cancelling or downgrading does not delete top-up credits. They stay on the account and remain spendable on whatever plan you are on.",
            "Credits are not currency, cannot be transferred between accounts, and have no cash value outside the product.",
          ],
        },
        {
          heading: "5. How to Request a Refund",
          list: [
            "Contact us through the Contact page, or reply to the receipt Lemon Squeezy sent you.",
            "Include the email address on the account and the date of the payment.",
            "We answer refund requests within 2 business days.",
            "Approved refunds go back to the original payment method and take 5–10 business days to appear, depending on your bank or card provider.",
          ],
        },
        {
          heading: "6. Payments & Billing",
          paragraphs: [
            "Payments are processed by Lemon Squeezy, which acts as the merchant of record for every sale. Lemon Squeezy takes the payment, issues the receipt and holds the payment relationship, so your card details never reach our servers and we never store them.",
            "The checkout accepts credit and debit cards (Visa, Mastercard, American Express, Discover, Diners Club, JCB, China UnionPay), PayPal, Apple Pay, Google Pay, and bank debit and local methods such as Alipay and WeChat Pay where your country supports them. Which options appear depends on your country, currency and device.",
            "All transactions are processed in US dollars. If your card is denominated in another currency, your bank sets the conversion rate and may add its own fee — neither is set by us.",
            "Subscriptions renew automatically at the end of each period, monthly or yearly, unless cancelled before the renewal date. Yearly plans are billed once a year in advance and are shown at two months' discount against the monthly price.",
          ],
        },
        {
          heading: "7. Failed Payments",
          paragraphs: [
            "If a renewal payment fails, Lemon Squeezy retries it and emails you. While a payment is unresolved the account keeps working on the plan you had, on a short grace period.",
            "If payment still cannot be collected after that grace period, the account moves to the Free plan rather than being deleted. Your workspaces, connected accounts, posts and media stay where they are; the paid features and the credit allowance stop until the balance is settled. Top-up credits you already bought remain spendable.",
          ],
        },
        {
          heading: "8. Chargebacks",
          paragraphs: [
            "Please contact us before filing a chargeback — a refund is faster than a dispute and we would rather resolve it directly. Accounts with an open chargeback are suspended until the dispute is settled, and an account that has charged back a paid period is not eligible for the trial or for a further refund.",
          ],
        },
        {
          heading: "9. Taxes",
          paragraphs: [
            "Prices are shown excluding tax. As merchant of record, Lemon Squeezy calculates, collects and remits any VAT, GST or sales tax due in your jurisdiction, and it is added at checkout and itemised on your receipt. If you are a business with a valid VAT or tax ID, you can enter it at checkout so the correct treatment is applied.",
          ],
        },
        {
          heading: "10. Changes to Prices",
          paragraphs: [
            "If a plan's price changes, the new price applies from your next renewal and never retroactively. We give at least 30 days' notice by email, and you can cancel before the renewal if the new price does not work for you.",
          ],
        },
      ]}
    />
  );
}
