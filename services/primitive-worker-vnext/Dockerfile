FROM node:22-slim

# System deps for the subtitles primitive:
#   ffmpeg            — audio extraction + subtitle burn
#   fonts-liberation  — Liberation Sans Bold (referenced by ASS styles)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg fonts-liberation \
      ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install -g pnpm@9

# Workspace config (build context is the repo root).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./

# Bring in the workspace deps the worker actually needs.
COPY packages/schema/ packages/schema/
COPY services/primitive-worker-vnext/ services/primitive-worker-vnext/

RUN pnpm install --frozen-lockfile --filter @agentmedia/schema --filter primitive-worker-vnext

RUN pnpm --filter @agentmedia/schema build
RUN pnpm --filter primitive-worker-vnext build

WORKDIR /app/services/primitive-worker-vnext

CMD ["node", "dist/worker.js"]
