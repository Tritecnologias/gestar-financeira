# syntax=docker/dockerfile:1.7
# Exact Node/runtime digest. Updates require a reviewed Linux build and smoke test.
FROM node:20.20.2-alpine3.23@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
COPY . .
ARG SOURCE_COMMIT
ARG SOURCE_BRANCH=homologacao
ENV NEXT_TELEMETRY_DISABLED=1
RUN node node_modules/prisma/build/index.js generate
RUN SOURCE_COMMIT="$SOURCE_COMMIT" SOURCE_BRANCH="$SOURCE_BRANCH" node scripts/secure-build/metadata.mjs
# A non-routable build-only URL is not a credential and is not persisted as ENV.
RUN DATABASE_URL=postgresql://build@127.0.0.1:1/build npm run build
RUN node node_modules/typescript/bin/tsc --noEmit

# Assemble and verify BEFORE any app artifact is copied into the runtime layers.
FROM builder AS artifact
RUN mkdir /runtime && cp -a .next/standalone/. /runtime/ && \
    mkdir -p /runtime/.next && cp -a .next/static /runtime/.next/static && \
    mkdir -p /runtime/public /runtime/prisma && \
    cp -a public/. /runtime/public/ && cp -a prisma/. /runtime/prisma/ && \
    cp build-metadata.json /runtime/build-metadata.json
# Keep the existing Prisma CLI/adapter deployment capability, prune development deps.
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund && \
    rm -rf /runtime/node_modules && cp -a node_modules /runtime/node_modules
RUN node scripts/secure-build/verify-artifact.mjs /runtime

FROM node:20.20.2-alpine3.23@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner
WORKDIR /app
ARG SOURCE_COMMIT
ARG SOURCE_BRANCH=homologacao
LABEL org.opencontainers.image.source="https://github.com/Tritecnologias/gestar-financeira" \
      org.opencontainers.image.revision="$SOURCE_COMMIT" \
      com.dezsolucoes.source.branch="$SOURCE_BRANCH" \
      org.opencontainers.image.version="0.1.0"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
ENV SOURCE_COMMIT=$SOURCE_COMMIT SOURCE_BRANCH=$SOURCE_BRANCH
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=artifact --chown=nextjs:nodejs /runtime/ ./
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
