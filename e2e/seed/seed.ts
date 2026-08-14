/**
 * Bootstraps the `testing` profile's gateway: waits for healthy, then
 * clears the bootstrap admin's forced password-change. Run between
 * `docker compose up` and `playwright test` — see `npm run e2e:docker`.
 */

// Not CONTEXTFORGE_URL — that's "how `app` reaches the gateway" (internal), not this host script's (published port).
const GATEWAY_URL = process.env.E2E_GATEWAY_URL ?? "http://localhost:4444";
const AUTH_HEADER_NAME = process.env.CONTEXTFORGE_AUTH_HEADER_NAME ?? "Authorization";
const EMAIL = process.env.E2E_TEST_EMAIL;
const BOOTSTRAP_PASSWORD = process.env.E2E_BOOTSTRAP_PASSWORD ?? "changeme-e2e-bootstrap-pwd1";
const NEW_PASSWORD = process.env.E2E_TEST_PASSWORD;

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

// Clears the bootstrap admin's password_change_required flag; returns a bearer token either way.
async function clearForcedPasswordChange(): Promise<string> {
  if (!EMAIL || !NEW_PASSWORD) {
    throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set (see .env.example).");
  }

  const precondition = await upstreamLogin("/auth/email/login", EMAIL, BOOTSTRAP_PASSWORD);
  if (precondition.status === 200) {
    console.log("Bootstrap admin already past the forced password change — nothing to do.");
    return (JSON.parse(precondition.body) as { access_token: string }).access_token;
  }
  if (precondition.status !== 403) {
    throw new Error(`Unexpected precondition check: ${precondition.status} ${precondition.body}`);
  }

  const bypass = await upstreamLogin("/auth/login", EMAIL, BOOTSTRAP_PASSWORD);
  if (bypass.status !== 200) {
    throw new Error(`Bypass login failed: ${bypass.status} ${bypass.body}`);
  }
  const { access_token: bypassToken } = JSON.parse(bypass.body) as { access_token: string };

  const changeRes = await fetch(`${GATEWAY_URL}/auth/email/change-password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [AUTH_HEADER_NAME]: `Bearer ${bypassToken}`,
    },
    body: JSON.stringify({ old_password: BOOTSTRAP_PASSWORD, new_password: NEW_PASSWORD }),
  });
  if (!changeRes.ok) {
    throw new Error(`Password change failed: ${changeRes.status} ${await changeRes.text()}`);
  }

  const confirm = await upstreamLogin("/auth/email/login", EMAIL, NEW_PASSWORD);
  if (confirm.status !== 200) {
    throw new Error(`Post-change login failed: ${confirm.status} ${confirm.body}`);
  }
  return (JSON.parse(confirm.body) as { access_token: string }).access_token;
}

// TODO(follow-up): seed real servers/tools/etc. here once the still-mocked
// suites get rewritten to assert on real data. v1.0.8's role bootstrap logs
// "team_admin role not found" and 422s team-scoped creates — check that's fixed upstream first.

async function main() {
  console.log(`Waiting for gateway at ${GATEWAY_URL}...`);
  await waitForHealthy();
  console.log("Gateway healthy. Clearing bootstrap admin's forced password change...");
  await clearForcedPasswordChange();
  console.log("Seed OK — admin can log in with E2E_TEST_EMAIL/PASSWORD.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
