// Copyright 2026 agent-media contributors. Apache-2.0 license.

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const plans = [
  {
    name: 'Creator',
    price: '$39',
    videos: '~13',
    videoLabel: '10s UGC videos/month',
    credits: '3,900',
    desc: 'For creators shipping UGC content consistently.',
    features: [
      '3,900 credits/month',
      'Up to 10s videos',
    ],
    popular: false,
    cta: 'Get Started',
    ctaHref: '/login',
  },
  {
    name: 'Pro',
    price: '$69',
    videos: '~23',
    videoLabel: '10s UGC videos/month',
    credits: '6,900',
    desc: 'For professionals running production-scale content pipelines.',
    features: [
      '6,900 credits/month',
      'Up to 15s videos',
    ],
    popular: true,
    cta: 'Get Started',
    ctaHref: '/login',
  },
  {
    name: 'Pro Plus',
    price: '$129',
    videos: '~43',
    videoLabel: '10s UGC videos/month',
    credits: '12,900',
    desc: 'For high-volume teams and agencies.',
    features: [
      '12,900 credits/month',
      'Up to 15s videos',
      'Early access to improved UGC tools',
    ],
    popular: false,
    cta: 'Get Started',
    ctaHref: '/login',
  },
];

export function PricingCards() {
  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
              plan.popular
                ? 'border-[#121212] bg-[#121212] text-white shadow-xl'
                : 'border-[#d4d4d4] bg-white hover:shadow-md'
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-1 text-xs font-semibold text-[#121212]">
                Most Popular
              </span>
            )}
            <h3 className={`text-lg font-semibold ${plan.popular ? 'text-white' : 'text-[#121212]'}`}>
              {plan.name}
            </h3>
            <div className="mt-4">
              <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : 'text-[#121212]'}`}>
                {plan.price}
              </span>
              <span className={plan.popular ? 'text-white/60' : 'text-[#6b6b76]'}>/mo</span>
            </div>
            <div className="mt-2">
              <span className={`text-lg font-bold ${plan.popular ? 'text-white/80' : 'text-[#121212]'}`}>
                {plan.videos}
              </span>
              <span className={`ml-1 text-xs ${plan.popular ? 'text-white/60' : 'text-[#6b6b76]'}`}>
                {plan.videoLabel}
              </span>
            </div>
            <p className={`mt-3 text-sm ${plan.popular ? 'text-white/60' : 'text-[#6b6b76]'}`}>
              {plan.desc}
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className={`flex items-center gap-2 text-sm ${plan.popular ? 'text-white/70' : 'text-[#6b6b76]'}`}
                >
                  <Check className="h-4 w-4 shrink-0 text-green-400" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href={plan.ctaHref} className="mt-8">
              <Button
                size="lg"
                variant={plan.popular ? 'secondary' : 'outline'}
                className="w-full rounded-2xl"
              >
                {plan.cta}
              </Button>
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-[#6b6b76]">
        ~300 credits per 10s video (~$3) · Pay-as-you-go packs from $39
      </p>
    </div>
  );
}
