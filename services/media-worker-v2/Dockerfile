FROM node:20-slim

# System deps:
#   ffmpeg + fonts-liberation — video encoding + subtitle rendering
#   python3 + numpy + opencv — required by scripts/chroma-laptop.py for the
#     laptop-ugc pipeline's per-frame chroma-key composite
#   libgl1 + libglib2.0-0 — runtime libs cv2 dlopens at import time
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg fonts-liberation \
      python3 python3-numpy python3-opencv \
      libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Repo-root-relative paths — Railway's build context is the WHOLE repo
# (confirmed via build logs: archive contains services/api-v2/Dockerfile
# alongside services/media-worker-v2/Dockerfile). RAILWAY_DOCKERFILE_PATH
# is set to services/media-worker-v2/Dockerfile.
COPY services/media-worker-v2/package.json services/media-worker-v2/package-lock.json ./
RUN npm ci --production

COPY services/media-worker-v2/src/ ./src/
COPY services/media-worker-v2/scripts/ ./scripts/

EXPOSE 3000

CMD ["node", "src/server.js"]
