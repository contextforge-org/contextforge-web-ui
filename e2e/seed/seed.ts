/**
 * Bootstraps docker-compose.e2e.yml's gateway: waits for healthy, then
 * clears the bootstrap admin's forced password-change. Run between
 * `docker compose up` and `playwright test` — see `npm run e2e:docker`.
 */

// Not CONTEXTFORGE_URL — that's "how `app` reaches the gateway" (internal), not this host script's (published port).
const GATEWAY_URL = process.env.E2E_GATEWAY_URL ?? "http://localhost:4444";
const AUTH_HEADER_NAME = process.env.CONTEXTFORGE_AUTH_HEADER_NAME ?? "Authorization";
const EMAIL = process.env.E2E_TEST_EMAIL;
const BOOTSTRAP_PASSWORD = process.env.E2E_BOOTSTRAP_PASSWORD ?? "changeme-e2e-bootstrap-pwd1"; //pragma: allowlist secret
const NEW_PASSWORD = process.env.E2E_TEST_PASSWORD; //pragma: allowlist secret
const SSO_SEED_REALM = process.env.SSO_SEED_REALM ?? "mcp-gateway";
const SSO_SEED_API_AUDIENCE = process.env.SSO_SEED_API_AUDIENCE ?? "mcp-gateway-api";

const HEALTH_RETRIES = 30;
const HEALTH_RETRY_DELAY_MS = 2000;

async function waitForHealthy(): Promise<void> {
  for (let attempt = 1; attempt <= HEALTH_RETRIES; attempt++) {
    try {
      const res = await fetch(`${GATEWAY_URL}/health`);
      if (res.ok) return;
    } catch {
      // gateway not accepting connections yet — retry.
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_DELAY_MS));
  }
  throw new Error(`Gateway at ${GATEWAY_URL} never became healthy.`);
}

async function upstreamLogin(
  path: string,
  email: string,
  password: string,
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: await res.text() };
}

// Changes the admin's password away from BOOTSTRAP_PASSWORD using a token
// obtained with it, then confirms NEW_PASSWORD actually works.
async function rotatePassword(bootstrapToken: string): Promise<string> {
  const changeRes = await fetch(`${GATEWAY_URL}/auth/email/change-password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [AUTH_HEADER_NAME]: `Bearer ${bootstrapToken}`,
    },
    body: JSON.stringify({ old_password: BOOTSTRAP_PASSWORD, new_password: NEW_PASSWORD }), // pragma: allowlist secret
  });
  if (!changeRes.ok) {
    throw new Error(`Password change failed: ${changeRes.status} ${await changeRes.text()}`);
  }

  const confirm = await upstreamLogin("/auth/email/login", EMAIL!, NEW_PASSWORD!);
  if (confirm.status !== 200) {
    throw new Error(`Post-change login failed: ${confirm.status} ${confirm.body}`);
  }
  return (JSON.parse(confirm.body) as { access_token: string }).access_token;
}

// Clears the bootstrap admin's password_change_required flag (if set) and
// rotates its password to NEW_PASSWORD; returns a bearer token either way.
async function clearForcedPasswordChange(): Promise<string> {
  if (!EMAIL || !NEW_PASSWORD) {
    throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set (see .env.example).");
  }

  const precondition = await upstreamLogin("/auth/email/login", EMAIL, BOOTSTRAP_PASSWORD);
  if (precondition.status === 200) {
    // No forced change on this gateway/config -- password_change_required
    // was already false. Still need to rotate: this branch means the
    // password is still BOOTSTRAP_PASSWORD, not NEW_PASSWORD, and callers
    // (this script's own "Seed OK" log, e2e password-login tests) expect
    // E2E_TEST_EMAIL/PASSWORD to actually work.
    if (BOOTSTRAP_PASSWORD === NEW_PASSWORD) {
      console.log("Bootstrap admin already past the forced password change — nothing to do.");
      return (JSON.parse(precondition.body) as { access_token: string }).access_token;
    }
    const { access_token: bootstrapToken } = JSON.parse(precondition.body) as {
      access_token: string;
    };
    return await rotatePassword(bootstrapToken);
  }
  if (precondition.status === 401) {
    // Bootstrap password rejected (not "change required") — an interrupted prior run likely already rotated it.
    const already = await upstreamLogin("/auth/email/login", EMAIL, NEW_PASSWORD);
    if (already.status === 200) {
      console.log("Bootstrap admin already seeded by an interrupted prior run — nothing to do.");
      return (JSON.parse(already.body) as { access_token: string }).access_token;
    }
    throw new Error(
      `Neither bootstrap nor final password worked: ${already.status} ${already.body}`,
    );
  }
  if (precondition.status !== 403) {
    throw new Error(`Unexpected precondition check: ${precondition.status} ${precondition.body}`);
  }

  const bypass = await upstreamLogin("/auth/login", EMAIL, BOOTSTRAP_PASSWORD);
  if (bypass.status !== 200) {
    throw new Error(`Bypass login failed: ${bypass.status} ${bypass.body}`);
  }
  const { access_token: bypassToken } = JSON.parse(bypass.body) as { access_token: string };
  return await rotatePassword(bypassToken);
}

// TODO(follow-up): seed real servers/tools once mocked suites assert on real data — blocked on an upstream role-bootstrap bug (422s team-scoped creates).

interface SsoProviderSummary {
  id: string;
}

interface SsoProviderDetail {
  provider_metadata?: { realm?: string };
  issuer?: string;
  trusted_for_api_auth?: boolean;
  api_audience?: string;
}

// trusted_for_api_auth/api_audience have no env-var bootstrap on the gateway
// (confirmed in mcp-context-forge) -- same admin-API call as that repo's own
// `make compose-sso-seed-audience` Makefile target, ported to fetch. A no-op
// (not an error) when the provider list is empty.
async function seedSsoTrustedApiAuth(adminToken: string): Promise<void> {
  const api = `${GATEWAY_URL}/auth/sso/admin/providers`;
  const authHeader = { [AUTH_HEADER_NAME]: `Bearer ${adminToken}` };

  const listRes = await fetch(api, { headers: authHeader });
  if (!listRes.ok) {
    throw new Error(`Could not list SSO providers: ${listRes.status} ${await listRes.text()}`);
  }
  const providers = (await listRes.json()) as SsoProviderSummary[];
  if (providers.length === 0) {
    console.log("No SSO providers configured on this gateway — skipping.");
    return;
  }

  let matched: string | undefined;
  for (const { id } of providers) {
    const detailRes = await fetch(`${api}/${id}`, { headers: authHeader });
    if (!detailRes.ok) {
      throw new Error(
        `Could not read SSO provider '${id}': ${detailRes.status} ${await detailRes.text()}`,
      );
    }
    const detail = (await detailRes.json()) as SsoProviderDetail;
    const realmMatches =
      detail.provider_metadata?.realm === SSO_SEED_REALM ||
      (detail.issuer ?? "").endsWith(`/realms/${SSO_SEED_REALM}`);
    if (realmMatches) {
      matched = id;
      break;
    }
  }
  if (!matched) {
    throw new Error(
      `No SSO provider matches Keycloak realm '${SSO_SEED_REALM}' (found: ${providers.map((p) => p.id).join(", ")})`,
    );
  }

  const putRes = await fetch(`${api}/${matched}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeader },
    body: JSON.stringify({ trusted_for_api_auth: true, api_audience: SSO_SEED_API_AUDIENCE }),
  });
  if (!putRes.ok) {
    throw new Error(`Seeding trusted_for_api_auth failed: ${putRes.status} ${await putRes.text()}`);
  }

  const verifyRes = await fetch(`${api}/${matched}`, { headers: authHeader });
  if (!verifyRes.ok) {
    throw new Error(
      `Could not re-read SSO provider '${matched}': ${verifyRes.status} ${await verifyRes.text()}`,
    );
  }
  const verify = (await verifyRes.json()) as SsoProviderDetail;
  if (verify.trusted_for_api_auth !== true || verify.api_audience !== SSO_SEED_API_AUDIENCE) {
    throw new Error(
      `Provider '${matched}' did not keep trusted_for_api_auth=true / api_audience=${SSO_SEED_API_AUDIENCE}`,
    );
  }
  console.log(
    `SSO provider '${matched}' trusted for API auth (api_audience=${SSO_SEED_API_AUDIENCE}).`,
  );
}

async function main() {
  console.log(`Waiting for gateway at ${GATEWAY_URL}...`);
  await waitForHealthy();
  console.log("Gateway healthy. Clearing bootstrap admin's forced password change...");
  const adminToken = await clearForcedPasswordChange();
  console.log("Seed OK — admin can log in with E2E_TEST_EMAIL/PASSWORD.");

  console.log("Trusting Keycloak access tokens for API auth...");
  await seedSsoTrustedApiAuth(adminToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
