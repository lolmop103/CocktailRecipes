# ---------------------------------------------------------------------------
# Stage 1: builder — full install, build every workspace, then prune to prod
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Needed to compile the better-sqlite3 native module.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Manifests first so the install layer caches independently of the sources.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
# The shared workspace is copied whole: its `prepare` hook builds it during
# install, so its sources have to be present already.
COPY packages/ ./packages/

RUN npm ci

COPY server/ ./server/
COPY client/ ./client/

RUN npm run build --workspace=@cocktail/shared
RUN npm run build --workspace=client
RUN npm run build --workspace=server

# Strip devDependencies in place. This happens here, rather than in a separate
# production-install stage, because npm re-runs the shared workspace's `prepare`
# hook on any tree mutation — and `prepare` needs tsc, which only exists while
# devDependencies are installed. Pruning after the build is the one ordering
# where that hook can still succeed.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage 2: runner — no compiler toolchain, no dev dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# The app writes its SQLite database here; the volume below is mounted at the
# same path so data survives container replacement even without an explicit
# DATA_DIR being passed in.
ENV DATA_DIR=/data

# npm hoists workspace dependencies to the root, so this single tree is the
# whole runtime: better-sqlite3 (already compiled in the builder), express,
# helmet, cors, http-errors and zod, plus the @cocktail/shared symlink.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/package.json ./
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
