# Production Launch Checklist

## Infrastructure

- [ ] Stripe test -> live key swap on Vercel
- [x] Supabase production project configured (ppwvarkmpffljlqxkjux)
- [x] Vercel production deploy verified
- [x] DNS configured for agent-media.ai
- [ ] SSL certificates active

## AI Provider

- [x] fal.ai as sole provider (switched from Kie.ai, commit f1fda7f)
- [x] FAL_KEY secret set in Supabase
- [x] All 7 models active: kling3, veo3, sora2, seedance1, flux2-pro, flux2-flex, grok-image
- [x] 40% margin on all model pricing
- [x] Image transfer to Supabase Storage (no CDN dependency)

## Monitoring & Observability

- [x] Public status page monitoring at /status
- [x] Health-status edge function responding
- [x] Circuit breaker on provider health
- [ ] Webhook endpoints configured for production
- [ ] Error tracking configured (Sentry/PostHog)

## Access & Onboarding

- [x] Subscription wall at /subscribe (3 plans)
- [ ] Invite codes BETA-001 through BETA-005 active
- [ ] Discord server channels configured

## Package & Distribution

- [x] npm package `agent-media-cli` v1.0.0 published on registry

## Edge Functions Deployed

- [x] generate (94kB)
- [x] poll-provider (59kB)
- [x] webhook-provider (65kB)
- [x] credits-check
- [x] checkout
- [x] job-status
- [x] device-token
- [x] upload-url
- [x] health-status
- [x] gallery-delete
- [x] stripe-portal
