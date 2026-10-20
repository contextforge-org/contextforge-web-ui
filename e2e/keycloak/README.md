# e2e Keycloak realm

`realm-export.json` is a self-contained Keycloak realm for `docker-compose.e2e.yml`'s
`keycloak` service, used by the real-backend SSO e2e suite. It's modeled on (not synced
with, and not symlinked to) `mcp-context-forge`'s own `infra/keycloak/realm-export.json` —
this repo's e2e suite never needs a sibling-repo checkout.

It seeds two clients (`mcp-gateway`, for the real gateway image; `contextforge-web-ui`, for
this repo's own BFF) and one test user.

The `contextforge-web-ui` client allows the BFF callback on `http://localhost:3000` (default
`npm run e2e:docker`) and `https://localhost:8443` (TLS variant). Keycloak redirect URIs allow
a wildcard only at the end of the path, so a custom `PORT` needs its own entry in
`redirectUris` and `webOrigins`.

**Dev/test only — never use these values in production.** Every secret and password here
(`keycloak-dev-secret`, `contextforge-web-ui-e2e-secret`, the admin password set on the
`keycloak` service, the test user's password) is fixed, plaintext, and committed to this
repo. Change every one of them before this realm, or any client registered against it, is
anywhere near a real deployment.
