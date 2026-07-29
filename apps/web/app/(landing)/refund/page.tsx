// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund Policy | agent-media',
  description: 'Refund and cancellation policy for agent-media subscriptions and credit packs.',
  alternates: {
    canonical: 'https://agent-media.ai/refund',
  },
};

export default function RefundPage() {
  return (
    <div data-legal-slab className="w-screen" style={{ marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)', backgroundColor: '#FFFFFF', color: '#121212' }}>
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-[#121212]">
        Refund Policy
      </h1>
      <p className="mt-2 text-sm text-[#6b6b76]">
        Effective: February 25, 2026
      </p>

      <div className="mt-12 space-y-10 text-sm leading-relaxed text-[#6b6b76]">

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            1. Overview
          </h2>
          <p>
            agent-media provides AI-powered video and UGC generation services. Because each generation
            request immediately consumes compute resources, third-party AI provider costs, and credits,
            all purchases are <strong className="text-[#121212]">generally non-refundable</strong> once
            processing has begun. By completing a purchase — whether a subscription plan or a
            pay-as-you-go credit pack — you acknowledge and agree to this policy.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            2. Digital Services & Waiver of Withdrawal Rights
          </h2>
          <p>
            Our services constitute digital content and software-as-a-service under applicable law.
            To the maximum extent permitted by law, by using credits or initiating a generation you
            expressly consent to the immediate performance of the service and waive any applicable
            statutory withdrawal or cooling-off rights (including under the EU Consumer Rights
            Directive 2011/83/EU and UK Consumer Rights Act 2015) once performance has begun.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            3. Subscription Plans
          </h2>
          <p className="mb-4">
            Monthly credits are allocated at the start of each billing cycle and are consumed as
            you generate content. The following rules apply:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-[#121212]">No refunds</strong> are issued for unused monthly
              credits at the end of a billing cycle. Credits do not roll over.
            </li>
            <li>
              Subscriptions may be <strong className="text-[#121212]">cancelled at any time</strong>{' '}
              via the CLI (<code className="rounded bg-[#f0f0f3] px-1 font-mono text-[#121212]">agent-media subscribe --manage</code>)
              or the web dashboard. Cancellation stops future charges; it does not refund the
              current billing period.
            </li>
            <li>
              <strong className="text-[#121212]">Billing disputes</strong> must be raised within
              30 days of the charge. Disputes raised after 30 days will not be considered.
            </li>
            <li>
              If you believe you were charged in error (e.g., duplicate charge, system fault),
              contact <a href="mailto:hello@agent-media.ai" className="text-[#121212] underline">hello@agent-media.ai</a>{' '}
              within 7 days of the charge with your account email and transaction ID.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            4. Pay-As-You-Go Credit Packs
          </h2>
          <p className="mb-4">
            Credit packs are one-time purchases of non-expiring credits.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Credit packs are <strong className="text-[#121212]">strictly non-refundable</strong>{' '}
              once purchased and added to your account.
            </li>
            <li>
              Unused credits in a credit pack remain valid as long as your account is active.
            </li>
            <li>
              If you close your account, any remaining purchased credits are forfeited and are
              not eligible for a cash refund.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            5. Failed or Errored Generations
          </h2>
          <p className="mb-4">
            We automatically refund credits to your account when a generation fails due to a
            platform error on our end. Specifically:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              If a job fails and is not recoverable, credits deducted for that job are
              <strong className="text-[#121212]"> automatically returned</strong> to your balance.
            </li>
            <li>
              You can verify refunded credits with{' '}
              <code className="rounded bg-[#f0f0f3] px-1 font-mono text-[#121212]">agent-media credits history</code>.
            </li>
            <li>
              Credit refunds are applied within minutes of failure detection. If a credit refund
              does not appear after 24 hours, contact support.
            </li>
            <li>
              Credits are <strong className="text-[#121212]">not refunded</strong> for generations
              that complete successfully but do not meet your creative expectations. AI output
              is inherently variable.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            6. Exceptions & Goodwill
          </h2>
          <p>
            We may, at our sole discretion, issue partial credit refunds (as account credits,
            not cash) in exceptional circumstances — for example, extended platform outages
            affecting your ability to use the service. Such goodwill adjustments are not a
            right and do not set a precedent. Cash refunds to the original payment method are
            not available except where required by applicable law.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            7. Chargebacks
          </h2>
          <p>
            Filing a chargeback without first contacting us constitutes a breach of this policy.
            We reserve the right to permanently terminate accounts that initiate fraudulent
            chargebacks and to report such activity to payment processors. If you have a
            legitimate concern, please email us first — we are happy to resolve issues directly.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            8. Account Termination by Us
          </h2>
          <p>
            If we terminate your account for a violation of our{' '}
            <Link href="/terms" className="text-[#121212] underline">Terms of Use</Link>, no refund will
            be issued for any remaining credits or subscription period. If we terminate your
            account for reasons other than policy violations, we will provide a pro-rated credit
            refund for unused subscription days in the current billing cycle.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            9. Governing Law
          </h2>
          <p>
            This Refund Policy is governed by the laws of the State of Delaware, United States,
            without regard to conflict of law principles. Nothing in this policy limits statutory
            rights you may have under the law of your country of residence.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            10. Contact
          </h2>
          <p>
            For billing questions or to report a platform error affecting your credits, contact us
            at{' '}
            <a href="mailto:hello@agent-media.ai" className="text-[#121212] underline">
              hello@agent-media.ai
            </a>
            . Please include your account email, the transaction date, and a description of the
            issue. We respond within 2 business days.
          </p>
        </section>

      </div>
    </div>
    </div>
  );
}
