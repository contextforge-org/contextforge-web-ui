# Builds the UI (Vite/React SPA) and the BFF (Fastify) into one runtime
# image. The BFF serves the built SPA as static files — see
# server/src/plugins/static.ts and vite.config.ts's `build.outDir`.
#
# Deliberately sets no NODE_ENV/COOKIE_SECURE/REDIS_URL here: server/src/config.ts
# owns those defaults (and fails closed on insecure combinations by design).
# Supply the right values at `docker run -e` / compose time instead.

# ---- UI dependencies ----
FROM node:22-alpine AS ui-deps
WORKDIR /ui
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- UI build ----
# npm run build = "npm run generate && tsc -b && vite build". `generate`
# runs orval against the committed openapi.json (no network call). vite's
# outDir is "server/public", so output lands at /ui/server/public here.
FROM ui-deps AS ui-build
WORKDIR /ui
COPY openapi.json orval.config.ts index.html vite.config.ts ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- BFF dependencies ----
# Full (non-prod) install here — tsc is a devDependency needed to build.
FROM node:22-alpine AS bff-deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- BFF build ----
FROM bff-deps AS bff-build
WORKDIR /app
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=bff-build /app/dist ./dist
COPY --from=ui-build /ui/server/public ./public
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
