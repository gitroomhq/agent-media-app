// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'AI UGC Videos for Education Apps: Promotional Videos at Scale | agent-media',
  description:
    'Generate testimonial-style promotional videos for education apps, online courses, and learning platforms. Student and teacher perspectives. $3 per video.',
  keywords: [
    'education app video',
    'AI UGC for education',
    'course promotional video',
    'edtech marketing video',
    'student testimonial video',
    'teacher review video',
    'agent-media education',
    'learning app promotion',
    'education video ads',
    'online course UGC',
  ],
  openGraph: {
    title: 'AI UGC Videos for Education Apps: Promotional Videos at Scale',
    description:
      'Generate testimonial-style videos for education apps and courses. Student and teacher perspectives. $3 per video.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/education',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI UGC Videos for Education Apps | agent-media',
    description:
      'Testimonial-style promo videos for edtech. 200 AI actors. $3 per video.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/education',
  },
};

export default function EducationPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            AI UGC Videos for Education Apps
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Education apps, online courses, and learning platforms all face the
            same marketing problem: how do you show that your product actually
            works? Screenshots and feature lists do not convert. Testimonials
            do.{' '}
            <strong className="text-[#121212]">agent-media</strong> generates
            testimonial-style promotional videos from student and teacher
            perspectives. Write the script, pick an actor, get a finished video.
            $3 per video.{' '}
            <Link
              href="/pricing"
              className="text-[#121212] underline hover:no-underline"
            >
              See pricing
            </Link>
            .
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            The Problem: Education Products Need Social Proof
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Parents download a spelling app because another parent said it
              helped their kid. Teachers try a new platform because a colleague
              shared a video about it. Students sign up for a course because
              someone who finished it said it was worth the money. Social proof
              drives education purchases more than any other marketing channel.
            </p>
            <p>
              The challenge is getting that social proof on video. Real
              testimonials from students and teachers are hard to collect. You
              need releases, recording equipment, editing, and weeks of
              back-and-forth. Most education companies manage to collect a
              handful of text reviews and maybe one or two video testimonials
              per year.
            </p>
            <p>
              Meanwhile, competitors running video ads on Instagram, TikTok,
              and YouTube are capturing attention. A talking-head video of
              someone saying &quot;my students improved their reading scores by
              40%&quot; outperforms a static ad every time. But producing those
              videos at the pace social ads demand is not sustainable with real
              testimonials alone.
            </p>
            <p>
              Education companies also need to reach different audiences.
              Parents, teachers, school administrators, adult learners. Each
              audience responds to different messaging and different faces. One
              testimonial video does not cover all segments.
            </p>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            The Solution: Testimonial Videos on Demand
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">agent-media</strong> generates
              testimonial-style videos where an AI actor speaks directly to
              camera about your education product. The script is yours. You
              control the messaging, the tone, and the perspective.
            </p>
            <p>
              Want a teacher explaining how the app helped her classroom? Write
              that script. Want a parent describing their child&apos;s progress?
              Write that script. Want a college student reviewing an online
              course? Write that script. Each video gets a different actor, a
              different look, and a different story.
            </p>
            <p>
              The <code className="bg-purple-50 px-1 text-purple-700">--style impact</code> subtitle
              option adds bold animated captions that highlight key phrases.
              Perfect for grabbing attention in a feed. The{' '}
              <code className="bg-purple-50 px-1 text-purple-700">--tone confident</code> voice
              delivery makes the testimonial feel authoritative and trustworthy.{' '}
              <Link
                href="/login"
                className="text-[#121212] underline hover:no-underline"
              >
                Generate your first education video
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* CLI Workflow */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            Step-by-Step: Generate an Education Promo Video
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Write a testimonial script from the student or teacher perspective
            and generate a polished video in minutes.
          </p>

          <div className="mt-10 space-y-8">
            {/* Step 1 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Install and authenticate
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Install the{' '}
                  <strong className="text-[#121212]">agent-media</strong> CLI
                  and log in.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      terminal
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> npm install -g
                      agent-media-cli
                    </p>
                    <p className="mt-1 text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> agent-media
                      login
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Generate a teacher testimonial
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Write the script from the teacher&apos;s perspective. Use
                  impact subtitles to highlight key results like score
                  improvements.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      terminal
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> agent-media ugc
                      &quot;My students improved their spelling scores by 40
                      percent in just six weeks. I have never seen an app
                      engage them like this.&quot; \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--actor anna \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--style impact \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--tone confident \
                    </p>
                    <p className="text-[#6b6b76]">{'  '}--sync</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Generate a parent perspective
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Same product, different angle. A parent talking about their
                  child&apos;s experience reaches a completely different
                  audience.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      terminal
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> agent-media ugc
                      &quot;My daughter used to hate homework. Now she asks to
                      practice spelling every night. This app made learning
                      fun.&quot; \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--actor naomi \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--style impact \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--tone calm \
                    </p>
                    <p className="text-[#6b6b76]">{'  '}--sync</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Run both in your ad accounts
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Upload both videos to your ad platform. Target the teacher
                  video to educator audiences. Target the parent video to
                  parents with school-age children. Let the algorithm optimize.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Script Ideas */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Script Ideas for Education Products
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">The results story.</strong>{' '}
              &quot;My reading level went up two grades in one semester. I
              finally feel caught up.&quot; Focus on measurable outcomes. Use
              the <code className="bg-purple-50 px-1 text-purple-700">--template testimonial</code> for
              this format.
            </p>
            <p>
              <strong className="text-[#121212]">The skeptic convert.</strong>{' '}
              &quot;I did not think an app could replace a tutor. I was wrong.
              My son went from a C to an A in math.&quot; This format works
              especially well for parents who are unsure about edtech.
            </p>
            <p>
              <strong className="text-[#121212]">The daily routine.</strong>{' '}
              &quot;Every morning before class, my students spend 10 minutes on
              the app. Their quiz scores have gone through the roof.&quot; Show
              how the product fits into real life.
            </p>
            <p>
              <strong className="text-[#121212]">The comparison.</strong>{' '}
              &quot;I tried three different language apps. This is the only one
              that kept me practicing every day.&quot; Use the{' '}
              <code className="bg-purple-50 px-1 text-purple-700">--template problem-solution</code> for
              comparison-style scripts.
            </p>
            <p>
              <strong className="text-[#121212]">The course review.</strong>{' '}
              &quot;I finished this Python course in two weeks. The projects
              were practical and I used what I learned at work the same
              month.&quot; Perfect for online course platforms and bootcamps.
            </p>
          </div>
        </div>
      </section>

      {/* Cost */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            What It Costs
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Each 10-second video costs about $3 (300 credits). A Creator plan
              at $39/month gives you 13 videos. A Pro plan at $69/month gives
              you 23 videos. That is enough to test multiple scripts, actors,
              and audience angles every month.
            </p>
            <p>
              Compare that to hiring UGC creators: $150 to $500 per video, plus
              revision rounds and weeks of turnaround. Or compare it to doing
              nothing and running static image ads that get half the engagement.{' '}
              <Link
                href="/pricing"
                className="text-[#121212] underline hover:no-underline"
              >
                View full pricing
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Why agent-media */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Why <span className="text-purple-600">agent-media</span> for Education
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'Multiple perspectives',
                desc: 'Generate teacher, parent, student, and administrator testimonials from the same product. Different scripts, different actors, different audiences.',
              },
              {
                title: 'Impact subtitle style',
                desc: 'Bold animated captions that highlight key numbers and results. "40% improvement" pops on screen exactly when the actor says it.',
              },
              {
                title: 'Confident voice tone',
                desc: 'Authoritative delivery that builds trust. Education buyers need to believe the product works before they try it.',
              },
              {
                title: '200 AI actors',
                desc: 'Diverse faces, ages, and backgrounds. Match the actor to the audience: young actors for student perspectives, older actors for teacher testimonials.',
              },
              {
                title: 'Script templates',
                desc: 'Use testimonial, problem-solution, or listicle templates to structure your scripts. Each template formats the delivery differently.',
              },
              {
                title: 'CLI and API',
                desc: 'Generate from the terminal or trigger videos programmatically. Integrate into your marketing automation workflow.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-[#d4d4d4] p-5"
              >
                <h3 className="font-semibold text-[#121212]">{item.title}</h3>
                <p className="mt-2 text-sm text-[#6b6b76]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-links & CTA */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Related Pages</h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/use-cases/saas-review-videos"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              SaaS Review Videos <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/agencies"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Marketing Agencies <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/tiktok-ugc-ads"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              TikTok UGC Ads <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/compare/makeugc-alternative"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              MakeUGC Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/compare/arcads-alternative"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Arcads Alternative <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-[#121212] text-white hover:bg-[#333]"
              >
                {'>'} Start Making Education Videos
              </Button>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              View Pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-8 text-xs text-[#6b6b76]">
            Last updated: April 2026
          </p>
        </div>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline:
              'AI UGC Videos for Education Apps: Promotional Videos at Scale',
            description:
              'Generate testimonial-style promotional videos for education apps, online courses, and learning platforms. $3 per video.',
            url: 'https://agent-media.ai/use-cases/education',
            dateModified: '2026-04-01',
          }),
        }}
      />
    </div>
  );
}
