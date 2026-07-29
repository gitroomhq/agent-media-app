// Copyright 2026 agent-media contributors. Apache-2.0 license.

export const metadata = {
  title: 'Terms of Use | agent-media',
  description: 'Terms of Use for the agent-media platform and CLI.',
};

export default function TermsPage() {
  return (
    <div data-legal-slab className="w-screen" style={{ marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)', backgroundColor: '#FFFFFF', color: '#121212' }}>
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-[#121212]">
        Terms of Use
      </h1>
      <p className="mt-2 text-sm text-[#6b6b76]">
        Effective: February 17, 2026
      </p>

      <div className="mt-12 space-y-10 text-sm leading-relaxed text-[#6b6b76]">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing or using the agent-media platform, CLI tool, API, or
            any related services (collectively, the &ldquo;Service&rdquo;), you
            agree to be bound by these Terms of Use. If you do not agree,
            please do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            2. Eligibility
          </h2>
          <p>
            You must be at least 13 years old to use the Service. If you are
            under 18, you must have your parent or guardian&apos;s consent.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            3. Account Registration
          </h2>
          <p>
            To use certain features of the Service, you must create an account
            using a valid email address or Google authentication. You are
            responsible for maintaining the confidentiality of your account
            credentials and for all activities that occur under your account.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            4. The Service
          </h2>
          <p>
            agent-media provides a unified interface for AI video and image
            generation through third-party AI model providers. The Service
            includes a command-line tool, web dashboard, and API. AI generation
            is performed by third-party providers and is subject to their
            respective terms and policies.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            5. Subscriptions and Credits
          </h2>
          <p>
            The Service operates on a subscription-based credit system. By
            subscribing, you agree to pay the applicable fees for your selected
            plan. Credits are allocated monthly based on your plan tier.
            Subscription fees are billed monthly via Stripe. You may cancel your
            subscription at any time through the billing portal; cancellation
            takes effect at the end of the current billing period.
          </p>
          <p className="mt-3">
            Pay-as-you-go credit packs are non-refundable once purchased.
            Subscription credits reset monthly and do not roll over.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            6. User Content
          </h2>
          <p>
            You retain ownership of content you upload (such as reference
            images). You grant agent-media a limited license to process your
            content solely for the purpose of providing the Service. Generated
            outputs belong to you, subject to the terms of the underlying AI
            model providers.
          </p>
          <p className="mt-3">
            You agree not to use the Service to generate content that is
            illegal, infringing, harmful, deceptive, or violates the rights of
            others.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            7. Prohibited Conduct
          </h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>Reverse engineering or attempting to access the Service&apos;s source code beyond what is publicly available</li>
            <li>Using the Service to generate illegal, abusive, or harmful content</li>
            <li>Circumventing rate limits, credit systems, or security measures</li>
            <li>Sharing account credentials or API keys with unauthorized parties</li>
            <li>Using automated tools to scrape or overload the Service</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            8. Third-Party Providers
          </h2>
          <p>
            The Service routes AI generation requests through third-party
            providers. Your use of generated content is additionally subject to
            the terms and policies of these providers. We are not responsible
            for the availability, accuracy, or output quality of third-party
            AI models.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            9. Intellectual Property
          </h2>
          <p>
            The agent-media name, logo, CLI tool, web platform, and all
            associated software, documentation, and design are the intellectual
            property of agent-media and its contributors. The open-source
            portions of the CLI are licensed under the Apache 2.0 license.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            10. Disclaimer of Warranties
          </h2>
          <p>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
            AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
            WE DO NOT GUARANTEE UNINTERRUPTED ACCESS, SPECIFIC AI MODEL
            AVAILABILITY, OR PARTICULAR OUTPUT QUALITY.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            11. Limitation of Liability
          </h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, AGENT-MEDIA SHALL NOT BE
            LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
            PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL
            LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID FOR THE SERVICE IN
            THE 12 MONTHS PRECEDING THE CLAIM.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            12. Termination
          </h2>
          <p>
            We may suspend or terminate your access to the Service at any time
            for violation of these Terms or for any other reason at our sole
            discretion. Upon termination, your right to use the Service ceases
            immediately. Any unused credits are forfeited upon termination for
            cause.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            13. Changes to Terms
          </h2>
          <p>
            We reserve the right to modify these Terms at any time. We will
            notify you of material changes by updating the effective date at the
            top of this page. Continued use of the Service after changes
            constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            14. Contact
          </h2>
          <p>
            For questions about these Terms, contact us at{' '}
            <a
              href="mailto:support@agent-media.ai"
              className="text-[#121212] underline transition-colors hover:text-[#121212]/80"
            >
              support@agent-media.ai
            </a>
            .
          </p>
        </section>
      </div>
    </div>
    </div>
  );
}
