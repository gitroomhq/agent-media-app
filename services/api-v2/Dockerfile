FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy workspace config files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./

# Copy only the packages and services needed
COPY packages/schema/ packages/schema/
COPY services/api-v2/ services/api-v2/

# Install dependencies for schema + api-v2 only
RUN pnpm install --frozen-lockfile --filter @agentmedia/schema --filter api-v2

# Build schema first, then api-v2
RUN pnpm --filter @agentmedia/schema build
RUN pnpm --filter api-v2 build

WORKDIR /app/services/api-v2

EXPOSE 3001

# Preload Sentry via --import so the Node http/express auto-instrumentation
# attaches before the app loads (proper tracing + per-request isolation scopes
# for request_id tagging). server.ts also imports it (idempotent) so local
# runs without --import still initialise Sentry.
CMD ["node", "--import", "./dist/instrument.js", "dist/server.js"]
