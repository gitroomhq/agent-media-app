FROM node:20-slim

# Playwright Chromium needs a handful of system libs (libnss3, libatk,
# libxss, fonts, etc). `npx playwright install --with-deps chromium`
# below pulls them via apt, but we install fonts/wget here so the
# screenshots are not glyph-substituted.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates wget \
      fonts-liberation fonts-noto fonts-noto-color-emoji && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Repo-root-relative paths so Railway can use this Dockerfile from the
# monorepo root build context.
COPY services/brand-extractor/package.json services/brand-extractor/package-lock.json* ./
RUN npm install --omit=dev

# Install Chromium + remaining system deps inside the image. This must
# happen after npm install so the playwright CLI is on disk.
RUN npx playwright install --with-deps chromium

COPY services/brand-extractor/src/ ./src/

EXPOSE 3000

CMD ["node", "src/server.js"]
