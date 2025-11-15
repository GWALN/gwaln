# Dockerfile
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends rsync \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install --include=dev && npm install -g .

LABEL org.opencontainers.image.source="https://github.com/doguabaris/civiclens-cli"
LABEL org.opencontainers.image.description="A CLI for comparing and annotating Grokipedia vs. Wikipedia articles."
LABEL org.opencontainers.image.licenses="Proprietary"

ENTRYPOINT ["civiclens-cli"]
