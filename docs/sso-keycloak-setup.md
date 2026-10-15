# SSO (Keycloak) Setup

How to turn on Keycloak single sign-on for this BFF, end to end: registering
the BFF as its own OIDC client, the BFF-side env vars, and the one gateway-side
step that has no env var.

This is **not** a Keycloak tutorial — for realm creation, role mappers, and
general Keycloak concepts, see `mcp-context-forge`'s own
[`docs/docs/manage/sso-keycloak-tutorial.md`](https://github.com/IBM/mcp-context-forge/blob/main/docs/docs/manage/sso-keycloak-tutorial.md).
This doc only covers what's specific to deploying _this_ BFF in front of a
gateway that already has Keycloak SSO working. For how the login/callback/
refresh/logout flow actually works once it's set up, see
[`SSO.md`](./SSO.md).

## Why a second client

mcpgateway has its own `/auth/sso/*` flow, but it isn't usable directly from
this SPA — the gateway and the BFF are typically on different origins, and
the gateway's flow isn't designed to hand a session back to a third party.
This BFF runs its own, independent OIDC (Authorization Code + PKCE) client
against the same Keycloak realm. You end up with two Keycloak clients against
one realm: the gateway's own (already set up per the tutorial above) and this
BFF's (set up below).

## 1. Register the BFF as a Keycloak client

In the Keycloak admin console, under the realm the gateway already uses,
create a new client:

| Setting                            | Value                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Client ID                          | anything, e.g. `contextforge-web-ui`                                                         |
| Client authentication              | **On** (confidential client)                                                                 |
| Authentication flow                | **Standard flow** only — leave Direct access grants, Implicit flow, and Service accounts off |
| Valid redirect URIs                | `<your BFF's public origin>/auth/sso/callback` — see the gotcha below                        |
| Proof Key for Code Exchange (PKCE) | **S256** — the BFF always sends `code_challenge_method=S256`; it's required, not optional    |

Save, then copy the client's **Client ID** and **Client secret** (Credentials
tab) — you'll need both below.

### The redirect-URI gotcha

The BFF computes its own redirect URI as:

```
<PUBLIC_ORIGIN or trusted-proxy-derived origin>/auth/sso/callback
```

Keycloak requires an **exact** match against what you registered above —
scheme, host, port, and path all have to agree character-for-character. Two
common ways this breaks:

- **Trailing slash / missing port**: `https://app.example.com/auth/sso/callback`
  vs `https://app.example.com:443/auth/sso/callback`, or a trailing slash like
  `https://app.example.com/auth/sso/callback/`, are different strings to
  Keycloak even though they're the same URL to a browser.
- **`PUBLIC_ORIGIN` unset behind a proxy you haven't declared trusted**: the
  BFF derives its origin from `request.protocol`/`request.host` unless
  `PUBLIC_ORIGIN` is set (see `.env.example`). With `TRUST_PROXY=true` and a
  proxy that correctly sets `X-Forwarded-Proto`/`X-Forwarded-Host`, that
  derived origin is already correct. Set `PUBLIC_ORIGIN` explicitly instead
  when the proxy isn't trusted via `TRUST_PROXY=true` — same rule the OAuth
  redirect URI follows, see [`OAUTH.md`](./OAUTH.md).

If login redirects to Keycloak but comes back with a generic error before
ever showing the login form, this is the first thing to check.

## 2. BFF environment variables

Set these in `.env` (native/dev) or your deployment's env (prod) — see
`.env.example`/`.env.prod.example` for the inline reference:

| Var                                | Required                           | Notes                                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SSO_ENABLED`                      | —                                  | `false` by default. Set `true` to turn this all on.                                                                                                                                                                                            |
| `SSO_KEYCLOAK_BASE_URL`            | when enabled                       | Server-to-server base URL (discovery/token/JWKS calls never leave the BFF). May be plain `http://` on a private/Docker network.                                                                                                                |
| `SSO_KEYCLOAK_PUBLIC_BASE_URL`     | only if it differs from `BASE_URL` | Browser-facing base, if Keycloak's internal and public hostnames differ (e.g. a Docker service name vs. a public hostname). **Must be `https://`** if set (`http:` only allowed for `localhost`/`127.0.0.1`) — the BFF validates this at boot. |
| `SSO_KEYCLOAK_REALM`               | when enabled                       |                                                                                                                                                                                                                                                |
| `SSO_KEYCLOAK_CLIENT_ID`           | when enabled                       | The client ID from step 1.                                                                                                                                                                                                                     |
| `SSO_KEYCLOAK_CLIENT_SECRET`       | when enabled                       | The client secret from step 1.                                                                                                                                                                                                                 |
| `SSO_KEYCLOAK_SCOPES`              | no                                 | Defaults to `openid profile email`.                                                                                                                                                                                                            |
| `SSO_LOGIN_STATE_TTL_SECONDS`      | no                                 | Defaults to `300`. How long a PKCE verifier/state/nonce survives before the login attempt expires.                                                                                                                                             |
| `SSO_TOKEN_REFRESH_LEEWAY_SECONDS` | no                                 | Defaults to `30`. Refreshes a session's Keycloak tokens this many seconds before they'd actually expire.                                                                                                                                       |

`SSO_ENABLED=true` with any of `BASE_URL`/`REALM`/`CLIENT_ID`/`CLIENT_SECRET`
missing fails at **boot**, not at the first login attempt — the error names
exactly which vars are missing.

## 3. Trust Keycloak tokens for the gateway's REST API

This BFF forwards the Keycloak-issued access token it receives (not a
gateway-issued one) as the bearer token on every proxied `/api/*` call. For
the gateway to accept that token, two things both have to be true on the
gateway side.

### 3.1 Enable bearer-token auth on the gateway

Set `SSO_API_TOKEN_AUTH_ENABLED=true` in the gateway's own env. It defaults
to `false` (internal-JWT-only behavior), and **this has no effect on its
own** — it only lets the gateway consider external-IdP tokens at all; which
tokens it actually accepts is still controlled per-provider by step 3.2
below.

### 3.2 Mark the provider trusted for API auth

The gateway's SSO provider record for this realm must be marked
`trusted_for_api_auth` with a matching `api_audience`. **This has no
environment variable** — it's an admin-API-only setting. Do this once, after
the gateway has booted and auto-created the provider row from its own
`SSO_KEYCLOAK_*` env. The admin token used below needs the
`admin.sso_providers:read` and `admin.sso_providers:update` permissions.

```bash
# Confirm the provider id -- the gateway's Keycloak bootstrap always uses the
# fixed id `keycloak`, not a realm/client slug:
curl -s -H "Authorization: Bearer <gateway admin token>" \
  <gateway-url>/auth/sso/admin/providers

# Mark it trusted, with an audience specific to this BFF client (configure an
# Audience protocol mapper on the Keycloak client if it doesn't have one yet
# -- reusing a shared audience like `mcp-gateway` across clients weakens the
# confused-deputy protection `api_audience` is meant to provide):
curl -s -X PUT -H "Authorization: Bearer <gateway admin token>" \
  -H "Content-Type: application/json" \
  -d '{"trusted_for_api_auth": true, "api_audience": "<your audience>"}' \
  <gateway-url>/auth/sso/admin/providers/keycloak
```

Without **both** of these, login succeeds (you land authenticated in the
SPA), but every proxied API call the dashboard makes 401s — the gateway
rejects the Keycloak token outright. If you only see this symptom, check
`SSO_API_TOKEN_AUTH_ENABLED` first, then the provider's
`trusted_for_api_auth`/`api_audience`.

## Verification checklist

1. Visit the SPA's login page — a "Sign in with Keycloak" button appears.
2. Click it, log in against a real Keycloak user — you land back in the SPA,
   authenticated.
3. A protected page loads real data (proves the proxied-call round trip from
   section 3 above is actually working, not just that a BFF session cookie
   exists).
4. `/app/login` is inaccessible while authenticated (redirects to the app).
5. Log out — the session cookie is cleared, a direct API call 401s, and
   logging in again shows Keycloak's own login form rather than silently
   re-authenticating (proves the back-channel logout actually ended
   Keycloak's session too, not just the BFF's).
