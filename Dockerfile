# Builds the UI (Vite/React SPA) and the BFF (Fastify) into one runtime
# image. The BFF serves the built SPA as static files — see
# server/src/plugins/static.ts and vite.config.ts's `build.outDir`.
#
# Deliberately sets no NODE_ENV/COOKIE_SECURE/REDIS_URL here: server/src/config.ts
# owns those defaults (and fails closed on insecure combinations by design).
# Supply the right values at `docker run -e` / compose time instead.

# Red Hat UBI9 Node.js 22 — public, unauthenticated registry (no `docker
# login` needed to pull), published for linux/amd64, linux/arm64,
# linux/s390x and linux/ppc64le. Runs as non-root (UID 1001, group 0) by
# default, WORKDIR /opt/app-root/src pre-owned for that user — no manual
# addgroup/adduser/chown needed, unlike the node:*-alpine images this
# replaced. Pinned by digest for reproducibility; refresh periodically
# (e.g. via Renovate/Dependabot) or override with
# --build-arg NODEJS_IMAGE=... to point at an internal mirror (air-gapped/
# FIPS environments).
ARG NODEJS_IMAGE=registry.access.redhat.com/ubi9/nodejs-22@sha256:d1f88101a85776886e459995eacdd7ebaa97c6e0c80b35c5a07a8a7b938ea9a3

# ---- UI dependencies ----
FROM ${NODEJS_IMAGE} AS ui-deps
WORKDIR /opt/app-root/src
COPY --chown=1001:0 package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- UI build ----
# npm run build = "npm run generate && tsc -b && vite build". `generate`
# runs orval against the committed openapi.json (no network call). vite's
# outDir is "server/public", so output lands at
# /opt/app-root/src/server/public here.
FROM ui-deps AS ui-build
WORKDIR /opt/app-root/src
COPY --chown=1001:0 openapi.json orval.config.ts index.html vite.config.ts build-constants.ts ./
COPY --chown=1001:0 tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY --chown=1001:0 public ./public
COPY --chown=1001:0 src ./src
RUN npm run build

# ---- BFF dependencies ----
# Full (non-prod) install here — tsc is a devDependency needed to build.
FROM ${NODEJS_IMAGE} AS bff-deps
WORKDIR /opt/app-root/src
COPY --chown=1001:0 server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- BFF build ----
FROM bff-deps AS bff-build
WORKDIR /opt/app-root/src
COPY --chown=1001:0 server/tsconfig.json ./
COPY --chown=1001:0 server/src ./src
RUN npm run build

# ---- Runtime ----
FROM ${NODEJS_IMAGE} AS runtime
WORKDIR /opt/app-root/src
COPY --chown=1001:0 server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=bff-build --chown=1001:0 /opt/app-root/src/dist ./dist
COPY --from=ui-build --chown=1001:0 /opt/app-root/src/server/public ./public
USER 1001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
