# ---------------------------------------------------------------------------
# Stage 1: builder — install all deps, build client and server
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Build tools needed to compile the better-sqlite3 native module.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy workspace manifests first for layer-cache efficiency.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
# The shared workspace is copied whole: its `prepare` hook builds it during
# install, so the sources must already be present.
COPY packages/ ./packages/

RUN npm ci

COPY server/ ./server/
COPY client/ ./client/

RUN npm run build --workspace=@cocktail/shared
RUN npm run build --workspace=client
RUN npm run build --workspace=server

# ---------------------------------------------------------------------------
# Stage 2: deps — production node_modules, built once with the toolchain
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY packages/ ./packages/

# The shared workspace's `prepare` hook runs tsc, which is a devDependency and
# so absent here — npm runs prepare even with --omit=dev, which would fail the
# build. Lifecycle scripts are skipped and the one native module that genuinely
# needs compiling is rebuilt explicitly. The shared package's dist is copied
# from the builder stage, so nothing is lost by not building it here.
RUN npm ci --omit=dev --ignore-scripts && npm rebuild better-sqlite3

# ---------------------------------------------------------------------------
# Stage 3: runner — no compiler toolchain, no dev dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# The app writes its SQLite database here; the volume below is mounted at the
# same path so data survives container replacement even without an explicit
# DATA_DIR being passed in.
ENV DATA_DIR=/data

# Pre-built native modules come from the deps stage, so the ~150MB compiler
# toolchain never reaches the final image.
# npm hoists workspace dependencies to the root, so this single tree is the
# whole runtime: better-sqlite3, express, helmet, cors, http-errors and zod all
# live here, alongside the @cocktail/shared symlink into packages/.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY packages/shared/package.json ./packages/shared/
COPY package.json ./
COPY server/package.json ./server/

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
