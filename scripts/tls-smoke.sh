#!/bin/sh
# Smoke-checks a running TLS stack (`npm run compose:tls`) against
# https://localhost:8443 (and :8080 for the optional redirect check).
# Prints one line per check (✓/✗/-) and exits 1 if anything failed.
#
# Usage:
#   npm run compose:tls
#   npm run tls:smoke
#
#   SMOKE_EMAIL=... SMOKE_PASSWORD=... npm run tls:smoke   # also checks # pragma: allowlist secret
#                                                           # Secure cookies
#   NGINX_FORCE_HTTPS=true npm run compose:tls \
#     && NGINX_FORCE_HTTPS=true npm run tls:smoke           # also checks
#                                                            # the redirect
#
# set -u, not -e: every check should run and report, even if an earlier
# one failed.
set -u

BASE_HTTPS="https://localhost:8443"
BASE_HTTP="http://localhost:8080"
FAILURES=0

# Bounds every network/openssl call below, so a stack that's down (or
# hung) fails fast with a report instead of hanging the whole script.
# GNU coreutils' `timeout` ships on Linux/CI (ubuntu-latest); macOS has
# no built-in equivalent — `gtimeout` (via `brew install coreutils`) is
# used if present, otherwise the call runs unbounded.
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT="timeout 10"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT="gtimeout 10"
else
  TIMEOUT=""
fi

pass() {
  echo "✓ $1"
}

fail() {
  echo "✗ $1: $2"
  FAILURES=$((FAILURES + 1))
}

skip() {
  echo "- $1 skipped ($2)"
}

# Minimal JSON string escaping (backslash, then double-quote) — enough
# for the email/password this script itself constructs a request body
# from, without adding jq as a dependency.
json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# 1. Health over HTTPS
body="$(curl -skf --max-time 5 "$BASE_HTTPS/healthz" 2>&1)"
curl_status=$?
if [ "$curl_status" -eq 0 ] && printf '%s' "$body" | grep -q '"ok":true'; then
  pass "health over HTTPS"
else
  fail "health over HTTPS" "curl exit=$curl_status, body=$body"
fi

# 2. TLS 1.2 accepted. Checked by looking for the negotiated protocol in
# the session output, not the exit code: macOS's bundled LibreSSL exits
# non-zero with a client-side "poll error" on stdin EOF even after a
# handshake that fully succeeded (confirmed via -tls1_2's own "Protocol"
# line in the SSL-Session block), so the exit code alone is unreliable.
tls12_probe="$($TIMEOUT openssl s_client -connect localhost:8443 -tls1_2 </dev/null 2>&1)"
if printf '%s' "$tls12_probe" | grep -q 'Protocol *: *TLSv1\.2'; then
  pass "TLS 1.2 accepted"
else
  fail "TLS 1.2 accepted" "handshake failed: $(printf '%s' "$tls12_probe" | tail -3 | tr '\n' ' ')"
fi

# 3. TLS 1.3 accepted — same output-based check as #2, same reason.
tls13_probe="$($TIMEOUT openssl s_client -connect localhost:8443 -tls1_3 </dev/null 2>&1)"
if printf '%s' "$tls13_probe" | grep -q 'Protocol *: *TLSv1\.3'; then
  pass "TLS 1.3 accepted"
else
  fail "TLS 1.3 accepted" "handshake failed: $(printf '%s' "$tls13_probe" | tail -3 | tr '\n' ' ')"
fi

# 4. TLS 1.1 rejected. Needs `-cipher 'DEFAULT@SECLEVEL=0'` so the CLIENT
# actually attempts a TLS 1.1 handshake instead of refusing the protocol
# itself at OpenSSL 3's default security level — without it this check
# would "pass" without proving nginx rejects anything. Some builds (e.g.
# macOS's bundled LibreSSL) don't understand the SECLEVEL cipher syntax at
# all and fail before even opening a connection; detect that and skip
# rather than report a false pass. CI runs real OpenSSL, where this always
# runs for real.
#
# Not exit-code based (unreliable, same as #2/#3), and not just a
# "Protocol: TLSv1.1" grep either: openssl prints that line with the
# protocol it *attempted*, even on a handshake nginx rejects outright —
# the reliable tell is the negotiated cipher, which stays the null
# cipher ("Cipher   : 0000") when the server sends a protocol-version
# alert instead of completing the handshake.
tls11_probe="$($TIMEOUT openssl s_client -connect localhost:8443 -tls1_1 -cipher 'DEFAULT@SECLEVEL=0' </dev/null 2>&1)"
if printf '%s' "$tls11_probe" | grep -qi 'error setting cipher list\|unknown option\|no cipher match'; then
  skip "TLS 1.1 rejected" "this openssl build can't attempt TLS 1.1 at a lowered security level"
elif printf '%s' "$tls11_probe" | grep -q 'Protocol *: *TLSv1\.1' &&
  ! printf '%s' "$tls11_probe" | grep -q 'Cipher *: *0000'; then
  fail "TLS 1.1 rejected" "handshake succeeded, should have been refused"
else
  pass "TLS 1.1 rejected"
fi

# 5. No Strict-Transport-Security header
headers="$(curl -skI --max-time 5 "$BASE_HTTPS/" 2>&1)"
if printf '%s' "$headers" | grep -qi '^strict-transport-security:'; then
  fail "no HSTS header" "Strict-Transport-Security was present"
else
  pass "no HSTS header"
fi

# 6. Force-HTTPS redirect — only meaningful when the stack was brought up
# with NGINX_FORCE_HTTPS=true; otherwise :8080 proxies instead of
# redirecting, and that's correct, not a failure.
if [ "${NGINX_FORCE_HTTPS:-false}" = "true" ]; then
  redirect_headers="$(curl -sI --max-time 5 "$BASE_HTTP/" 2>&1)"
  status_line="$(printf '%s' "$redirect_headers" | head -n1)"
  location="$(printf '%s' "$redirect_headers" | tr -d '\r' | grep -i '^location:')"
  # -F: BASE_HTTPS is matched as a literal string, not a regex — a `.`
  # in a real hostname would otherwise match any character and could
  # produce a false pass.
  if printf '%s' "$status_line" | grep -q ' 301' && printf '%s' "$location" | grep -qiF "$BASE_HTTPS/"; then
    pass "force-HTTPS redirect"
  else
    fail "force-HTTPS redirect" "expected 301 to $BASE_HTTPS/, got: $status_line / $location"
  fi
else
  skip "force-HTTPS redirect" "NGINX_FORCE_HTTPS is not true"
fi

# 7. Secure cookies via a real login — needs a reachable upstream gateway
# (CONTEXTFORGE_URL) and a valid user, so it only runs when both
# SMOKE_EMAIL and SMOKE_PASSWORD are supplied.
if [ -n "${SMOKE_EMAIL:-}" ] && [ -n "${SMOKE_PASSWORD:-}" ]; then # pragma: allowlist secret
  email_json="$(json_escape "$SMOKE_EMAIL")"
  password_json="$(json_escape "$SMOKE_PASSWORD")"
  login_response="$(curl -sk --max-time 10 -D - -o /dev/null \
    -X POST "$BASE_HTTPS/auth/login" \
    -H "Origin: $BASE_HTTPS" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email_json\",\"password\":\"$password_json\"}" 2>&1)"
  login_status="$(printf '%s' "$login_response" | head -n1 | tr -d '\r')"

  if ! printf '%s' "$login_status" | grep -q ' 200'; then
    fail "Secure cookies (bff_sid, bff_csrf)" "login did not return 200 ($login_status)"
  else
    sid_secure=0
    csrf_secure=0
    printf '%s' "$login_response" | grep -qi '^set-cookie: *bff_sid=.*secure' && sid_secure=1
    printf '%s' "$login_response" | grep -qi '^set-cookie: *bff_csrf=.*secure' && csrf_secure=1
    if [ "$sid_secure" -eq 1 ] && [ "$csrf_secure" -eq 1 ]; then
      pass "Secure cookies (bff_sid, bff_csrf)"
    else
      fail "Secure cookies (bff_sid, bff_csrf)" "missing Secure on bff_sid and/or bff_csrf"
    fi
  fi
else
  skip "Secure cookies" "SMOKE_EMAIL/SMOKE_PASSWORD not set"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "tls-smoke: all checks passed"
  exit 0
else
  echo "tls-smoke: $FAILURES check(s) failed"
  exit 1
fi
