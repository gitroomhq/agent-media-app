# Copyright 2026 agent-media contributors. Apache-2.0 license.
#
# Dashboard image. Paths are relative to the REPO ROOT, matching the five
# backend service Dockerfiles — docker-compose.yml and the GHCR workflow both
# build with the repo root as context.
#
# This is the DASHBOARD only. The hosted marketing site is not part of this
# distribution; `/` redirects straight to /dashboard.

FROM node:22-slim AS builder
WORKDIR /app

RUN corepack enable

# Manifests first so dependency install caches independently of source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile

COPY packages/types/ packages/types/
COPY packages/ui/ packages/ui/
COPY apps/web/ apps/web/

# Next bakes the image-optimizer allowlist at build time — everything else is
# read at runtime by the root layout. Override for your own storage host:
#   docker build --build-arg NEXT_PUBLIC_IMAGE_HOSTS=cdn.example.com
ARG NEXT_PUBLIC_IMAGE_HOSTS=""
ENV NEXT_PUBLIC_IMAGE_HOSTS=$NEXT_PUBLIC_IMAGE_HOSTS
# Never upload source maps from a downstream build.
ENV SENTRY_AUTH_TOKEN=""

WORKDIR /app/apps/web
RUN pnpm build

# ── Runtime ──────────────────────────────────────────────────────────────
# `output: 'standalone'` emits a minimal server plus only the node_modules it
# actually needs, so the runtime image carries no pnpm workspace and no toolchain.
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
