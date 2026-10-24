# syntax=docker/dockerfile:1.7
# Bastaa web (Next.js standalone, docs/10). Build from the repo root:
#   docker build -f apps/web/Dockerfile -t schoolos-web .

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS prepare
RUN npm install -g turbo@2.11.7
COPY . .
RUN turbo prune @schoolos/web --docker

FROM base AS builder
COPY --from=prepare /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
RUN pnpm turbo run build --filter=@schoolos/web

FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
