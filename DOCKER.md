# Running in Docker

This repo ships as **one image**: the BFF (`server/`, Fastify) serves the
built UI (root, Vite/React SPA) as static files and proxies `/api/*`, so
the whole client stack — UI + BFF — is a single container. Redis is a
separate service, wired in via `docker-compose.yml`.

The upstream ContextForge/mcpgateway FastAPI API is **not** part of this
repo or this compose file — it's expected to already be running somewhere
you point `FASTAPI_URL` at.

## Quick start

```bash
cp .env.docker.example .env
# edit .env: at minimum set FASTAPI_URL to your gateway's address
docker compose up --build
```

Visit `http://localhost:3000/` — redirects to `/app/login`. `GET /healthz`
returns `{"ok":true}`.

By default this boots with `COOKIE_SECURE=false` and an in-process
(`memory://`) session store — good enough to poke at the UI, but sessions
are lost on restart and won't work across multiple replicas. See below to
opt into the `redis` service this compose file already starts.

## Environment variables

Full reference: `.env.docker.example` (each var has an inline comment).
Summary, grouped the same way:

| Group | Vars | Notes |
|---|---|---|
| Works out of the box | `COOKIE_SECURE=false` | Required (or set `PUBLIC_ORIGIN`/`TRUST_PROXY`) for a zero-config boot — `server/src/config.ts` fails closed otherwise. |
| Must be set | `FASTAPI_URL` | No safe default reaches your gateway from inside the container. **No boot-time check catches a missing/wrong value** — it just fails every `/api/*` call at request time. Top thing to check if API calls all connection-refuse. |
| Fine as-is for dev | `PORT`, `HOST`, `FASTAPI_AUTH_HEADER_NAME`, `SESSION_TTL_SECONDS`, `REDIS_KEY_PREFIX`, `COOKIE_DOMAIN`, `TRUST_PROXY`, `PUBLIC_ORIGIN`, `SSE_SESSION_RECHECK_SECONDS`, `LOG_LEVEL` | Defaults match `server/src/config.ts`. |

The image itself (`Dockerfile`) sets **none** of these — it ships
respecting `config.ts`'s own defaults untouched. All configuration comes
from the environment at run time.

## Opting into real Redis

`docker-compose.yml` always starts a `redis` service, but the app doesn't
use it unless told to — this keeps the default `docker compose up` path as
frictionless as running `npm run dev` locally. To back sessions with the
real Redis container instead of the in-process fallback:

```bash
# in .env
REDIS_URL=redis://redis:6379/0
```

```bash
docker compose up -d --build
```

Confirm it took: the `memory-redis` warning line should be gone from
`docker compose logs app`, and:

```bash
docker compose exec redis redis-cli KEYS 'bff:*'
```

should show keys once you've hit the login route. Sessions now survive
`docker compose restart app`.

## Production checklist

Before this leaves a laptop:

- `COOKIE_SECURE=true`
- `REDIS_URL=redis://...` pointing at a real, persistent Redis (not `memory://`)
- `PUBLIC_ORIGIN=https://your-domain.example.com`, or `TRUST_PROXY=true` if
  directly TLS-terminated with no reverse proxy in front
- `FASTAPI_URL` pointing at your real gateway

Get any of the first two wrong and the container won't boot at all —
`server/src/config.ts` throws at startup rather than serving traffic
insecurely. That's intentional; don't work around it by setting
`NODE_ENV=production` or similar in the image itself.

## Joining an existing stack / network

The provided `docker-compose.yml` is a standalone reference stack (app +
redis). If you already have your own Redis, network, or reverse proxy:

**Option A — run the image directly**, pointing at your own infra:

```bash
docker build -t contextforge-web-ui .
docker run -p 3000:3000 \
  --network your-existing-network \
  -e COOKIE_SECURE=true \
  -e REDIS_URL=redis://your-redis-host:6379/0 \
  -e FASTAPI_URL=http://your-gateway:4444 \
  -e PUBLIC_ORIGIN=https://your-domain.example.com \
  contextforge-web-ui
```

**Option B — override compose**, attaching to an external network instead
of the bundled `redis` service:

```yaml
# docker-compose.override.yml
services:
  app:
    networks: [external_net]
    environment:
      REDIS_URL: redis://your-existing-redis:6379/0

networks:
  external_net:
    external: true
```

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

## Troubleshooting

- **Every `/api/*` request fails / connection refused**: `FASTAPI_URL` is
  unset or unreachable from inside the container. There's no boot-time
  check for this — the app starts fine either way.
- **Container crash-loops on startup**: check `docker compose logs app` —
  `config.ts` throws a specific error for each fail-closed case
  (`memory://` Redis with `COOKIE_SECURE=true`, or `COOKIE_SECURE=true`
  with neither `PUBLIC_ORIGIN` nor `TRUST_PROXY` set). The message tells
  you exactly which var to set.
- **Multi-arch builds** (e.g. building on Apple Silicon for an amd64
  target): `docker buildx build --platform linux/amd64,linux/arm64 -t contextforge-web-ui .`
  — the UI stage's native dependency (`lightningcss`, via
  `@tailwindcss/vite`) ships prebuilt musl binaries for both architectures,
  so no Dockerfile changes should be needed.
