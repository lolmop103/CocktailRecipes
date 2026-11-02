# ---------------------------------------------------------------------------
# Stage 1: builder — full install, build every workspace, then deploy the
# server's production dependencies into a folder of their own
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder

# Needed to compile the better-sqlite3 native module.
RUN apk add --no-cache python3 make g++

# Corepack reads `packageManager` from package.json, so the pnpm version is
# typed in one place only.
RUN corepack enable

WORKDIR /app

# Manifests first so the install layer caches independently of the sources.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY client/package.json ./client/
# The shared workspace is copied whole: its `prepare` hook builds it during
# install, so its sources have to be present already.
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile

COPY server/ ./server/
COPY client/ ./client/

RUN pnpm --filter @cocktail/shared build
RUN pnpm --filter cocktail-client build
RUN pnpm --filter cocktail-server build

# The server's production dependencies only (better-sqlite3 already compiled,
# @cocktail/shared with its built dist), without the dev tools or the other
# workspaces' dependencies.
RUN pnpm --filter cocktail-server deploy --prod /deploy

# ---------------------------------------------------------------------------
# Stage 2: runner — no compiler toolchain, no dev dependencies
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# The app writes its SQLite database here; the volume below is mounted at the
# same path so data survives container replacement even without an explicit
# DATA_DIR being passed in.
ENV DATA_DIR=/data

COPY --from=builder /deploy/node_modules ./server/node_modules
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# The database directory must be writable by the unprivileged runtime user.
RUN mkdir -p /data && chown -R node:node /data /app

USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
