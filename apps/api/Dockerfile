# syntax=docker/dockerfile:1.7
# SchoolOS API (docs/10). Build from the repo root:
#   docker build -f apps/api/Dockerfile --target api     -t schoolos-api .
#   docker build -f apps/api/Dockerfile --target migrate -t schoolos-migrate .
# The same `api` image runs as the HTTP API, and — with RUN_WORKERS=true — as the job worker
# (lean mode runs both in one service). `migrate` runs `prisma migrate deploy` + RLS policies.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- 1. A pruned copy of the monorepo with only what the API needs (turbo prune, docs: Docker guide)
FROM base AS prepare
RUN npm install -g turbo@2.11.7
COPY . .
RUN turbo prune @schoolos/api --docker

# ---- 2. Install everything and build (contracts, permissions, Prisma client, API)
FROM base AS builder
COPY --from=prepare /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
RUN pnpm turbo run build --filter=@schoolos/api

# ---- 3. Production dependencies only
FROM base AS prod-deps
COPY --from=prepare /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter "@schoolos/api..."

# ---- Runtime: Node + Chromium (PDF report cards, receipts, exports) + Indian-script fonts
FROM node:${NODE_VERSION}-bookworm-slim AS api
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-ui-core fonts-noto-color-emoji ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080 CHROMIUM_PATH=/usr/bin/chromium PDF_RENDERER=chromium
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/ ./
COPY --from=builder --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chown=node:node /app/packages/permissions/dist ./packages/permissions/dist
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
USER node
WORKDIR /app/apps/api
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/main.js"]

# ---- Migrations (Cloud Run Job): owner role via DATABASE_URL
FROM builder AS migrate
ENV NODE_ENV=production
WORKDIR /app/apps/api
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node scripts/apply-sql.mjs"]
