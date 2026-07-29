// Copyright 2026 agent-media contributors. Apache-2.0 license.

export const metadata = {
  title: 'Privacy Policy | agent-media',
  description: 'Privacy Policy for the agent-media platform and CLI.',
};

export default function PrivacyPage() {
  return (
    <div data-legal-slab className="w-screen" style={{ marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)', backgroundColor: '#FFFFFF', color: '#121212' }}>
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-[#121212]">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-[#6b6b76]">
        Effective: February 17, 2026
      </p>

      <div className="mt-12 space-y-10 text-sm leading-relaxed text-[#6b6b76]">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            1. Information We Collect
          </h2>
          <p>We collect minimal personal information to provide the Service:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>
              <strong className="text-[#121212]">Email address</strong> &mdash;
              collected during account registration for authentication and
              service communications.
            </li>
            <li>
              <strong className="text-[#121212]">Authentication data</strong> &mdash;
              session tokens and OAuth identifiers (Google) to maintain your
              login state.
            </li>
            <li>
              <strong className="text-[#121212]">Usage data</strong> &mdash;
              generation job metadata (model used, credit cost, timestamps) to
              provide the Service and display your gallery and usage history.
            </li>
            <li>
              <strong className="text-[#121212]">Payment information</strong> &mdash;
              processed and stored by Stripe. We do not store your credit card
              details.
            </li>
          </ul>
          <p className="mt-3">
            We do not collect names, phone numbers, physical addresses, or any
            other personally identifiable information beyond what is listed
            above.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            2. How We Use Your Information
          </h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>Account creation, authentication, and session management</li>
            <li>Processing AI generation requests and tracking credit usage</li>
            <li>Billing and subscription management via Stripe</li>
            <li>Service communications (account-related emails only)</li>
            <li>Improving the Service and diagnosing technical issues</li>
          </ul>
          <p className="mt-3">
            We do not send marketing emails without your explicit consent.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            3. Data Sharing
          </h2>
          <p>
            <strong className="text-[#121212]">
              We do not sell or share your personal data with third parties for
              marketing purposes.
            </strong>
          </p>
          <p className="mt-3">
            We share data only with the following service providers, solely for
            the purpose of operating the Service:
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>
              <strong className="text-[#121212]">Supabase</strong> &mdash; database,
              authentication, and file storage (
              <a
                href="https://supabase.com/privacy"
                className="text-[#121212] underline transition-colors hover:text-[#121212]/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                privacy policy
              </a>
              )
            </li>
            <li>
              <strong className="text-[#121212]">Stripe</strong> &mdash; payment
              processing (
              <a
                href="https://stripe.com/privacy"
                className="text-[#121212] underline transition-colors hover:text-[#121212]/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                privacy policy
              </a>
              )
            </li>
            <li>
              <strong className="text-[#121212]">Third-party AI providers</strong> &mdash;
              AI model providers for video and image generation, subject to
              their respective privacy policies
            </li>
            <li>
              <strong className="text-[#121212]">Vercel</strong> &mdash; web hosting
              and edge delivery (
              <a
                href="https://vercel.com/legal/privacy-policy"
                className="text-[#121212] underline transition-colors hover:text-[#121212]/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                privacy policy
              </a>
              )
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            4. Generated Content
          </h2>
          <p>
            When you use the Service to generate video or images, your prompts
            and any uploaded reference images are sent to third-party AI
            providers for processing. Generated outputs are stored in your
            account gallery. You may delete generated content at any time from
            your gallery.
          </p>
          <p className="mt-3">
            We do not use your prompts, reference images, or generated outputs
            to train AI models.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            5. Cookies and Tracking
          </h2>
          <p>
            We use essential cookies for authentication and session management.
            We do not use third-party tracking cookies or advertising pixels.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            6. Data Retention
          </h2>
          <p>
            We retain your personal data for as long as your account is active.
            Usage logs and generation job metadata are retained for billing
            reconciliation purposes. You may request deletion of your account
            and associated data at any time by contacting us.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            7. Your Rights
          </h2>
          <p>
            Depending on your jurisdiction, you may have the right to:
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate personal data</li>
            <li>Request deletion of your personal data</li>
            <li>Object to processing of your personal data</li>
            <li>Request a portable copy of your data</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, contact us at{' '}
            <a
              href="mailto:privacy@agent-media.ai"
              className="text-[#121212] underline transition-colors hover:text-[#121212]/80"
            >
              privacy@agent-media.ai
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            8. Children&apos;s Privacy
          </h2>
          <p>
            The Service is not intended for children under 13. We do not
            knowingly collect personal information from children under 13. If
            you believe a child has provided us with personal information,
            please contact us for removal.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            9. Security
          </h2>
          <p>
            We implement reasonable technical and organizational measures to
            protect your personal data, including encryption in transit (TLS),
            row-level security on database tables, and secure credential
            storage. However, no method of transmission or storage is 100%
            secure.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            10. Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of material changes by updating the effective date at the top of
            this page. Continued use of the Service after changes constitutes
            acceptance.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[#121212]">
            11. Contact
          </h2>
          <p>
            For questions about this Privacy Policy, contact us at{' '}
            <a
              href="mailto:privacy@agent-media.ai"
              className="text-[#121212] underline transition-colors hover:text-[#121212]/80"
            >
              privacy@agent-media.ai
            </a>
            .
          </p>
        </section>
      </div>
    </div>
    </div>
  );
}
