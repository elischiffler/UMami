# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS dependencies
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM dependencies AS browser-dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium && chown -R node:node /ms-playwright

FROM dependencies AS api
COPY --chown=node:node . .
ARG VCS_REF
LABEL org.opencontainers.image.source="https://github.com/Calpoly-Yelp/UMami" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="UMami API"
ENV NODE_ENV=production
USER node
EXPOSE 3003
CMD ["node", "index.js"]

FROM browser-dependencies AS worker
COPY --chown=node:node . .
ARG VCS_REF
LABEL org.opencontainers.image.source="https://github.com/Calpoly-Yelp/UMami" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="UMami scraper worker"
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOME=/tmp
USER node
EXPOSE 3004
CMD ["node", "worker.js"]
