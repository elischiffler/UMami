# syntax=docker/dockerfile:1
FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2
ARG VCS_REF
LABEL org.opencontainers.image.source="https://github.com/Calpoly-Yelp/UMami" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="UMami local fixture service"
WORKDIR /app
COPY server.mjs ./
USER node
EXPOSE 54321
CMD ["node", "server.mjs"]
