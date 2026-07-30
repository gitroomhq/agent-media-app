FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg fonts-liberation && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Paths are relative to the REPO ROOT, matching the other four service
# Dockerfiles. Both docker-compose.yml and .github/workflows/build-containers.yml
# build every service with the repo root as context, so a service-relative
# `COPY src/` here resolved to /src at the root and failed the build.
COPY services/subtitle-worker/package.json ./
RUN npm install --production

COPY services/subtitle-worker/src/ ./src/

EXPOSE 3000

CMD ["node", "src/server.js"]
