# syntax=docker/dockerfile:1
#
# Build from the REPO ROOT, not apps/api. npm workspaces keep the lockfile
# there, and installing without it would give a different dependency tree than
# the one the tests ran against.
#
#   docker build -f apps/api/Dockerfile .

# Same major as .nvmrc so local, CI and production all match.
FROM node:24-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# --------------------------------------------------------------------------
# deps — everything, dev deps included, so TypeScript can compile.
#
# We copy only the package files first. Docker caches this layer on their
# contents, so editing source code doesn't re-run npm ci.
#
# --ignore-scripts is on purpose, for two reasons. The root `prepare` script
# installs git hooks, which is a local-machine thing and fails in an image with
# no lefthook. And skipping dependency scripts stops a compromised package from
# running code during the build. Nothing here needs a native build step.
# --------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @traffic-insights/api --include-workspace-root --ignore-scripts

# --------------------------------------------------------------------------
# build — type-check and write dist/
# --------------------------------------------------------------------------
FROM deps AS build
COPY apps/api apps/api
RUN npm run build --workspace @traffic-insights/api

# tsc only writes .js. The migrations and the seed are .sql files we read at
# runtime, so they have to be copied too. Otherwise the container starts, finds
# no migrations, and you get a healthy but empty database.
RUN cp -R apps/api/src/db/migrations apps/api/dist/db/migrations \
 && cp apps/api/src/db/seed.sql apps/api/dist/db/seed.sql

# --------------------------------------------------------------------------
# prod-deps — runtime deps only, in their own layer
# --------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @traffic-insights/api --include-workspace-root --omit=dev --ignore-scripts \
 && npm cache clean --force

# --------------------------------------------------------------------------
# runtime
# --------------------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

# Don't run as root. The official image already has a `node` user.
USER node
WORKDIR /app/apps/api

EXPOSE 3000

# No init wrapper needed. The process sets its own SIGTERM and SIGINT
# handlers, so it shuts down cleanly as PID 1. (A process only ignores those
# signals when it relies on the default handler, which PID 1 doesn't get.)
CMD ["node", "dist/server.js"]
