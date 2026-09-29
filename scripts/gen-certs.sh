#!/bin/sh
# Generates a self-signed TLS certificate + key for local development
# (the TLS compose stack, `npm run compose:tls`).
#
# Idempotent:
#   - both cert.pem and key.pem already present -> no-op, exit 0
#   - only one present                          -> fail without touching
#     anything, so a user-supplied cert already placed in the target dir
#     is never overwritten
#   - neither present                           -> generate both
#
# Usage: scripts/gen-certs.sh [target-dir]   (default: ./certs)
#
# NOTE: when run via the `cert_init` compose service (as root, inside an
# Alpine container), the files land root-owned on Linux hosts. Acceptable
# for now; revisit if a later service (e.g. Keycloak, running as UID 1000)
# can't read key.pem.
set -eu

TARGET_DIR="${1:-./certs}"
CERT="$TARGET_DIR/cert.pem"
KEY="$TARGET_DIR/key.pem"
SAN="DNS:localhost,DNS:app,DNS:keycloak,DNS:gateway,DNS:nginx,IP:127.0.0.1"

mkdir -p "$TARGET_DIR"

cert_exists=0
key_exists=0
[ -f "$CERT" ] && cert_exists=1
[ -f "$KEY" ] && key_exists=1

if [ "$cert_exists" = 1 ] && [ "$key_exists" = 1 ]; then
  echo "gen-certs: using existing certs in $TARGET_DIR"
  exit 0
fi

if [ "$cert_exists" = 1 ] || [ "$key_exists" = 1 ]; then
  echo "gen-certs: $TARGET_DIR has only one of cert.pem/key.pem — refusing to overwrite either file. Remove both, or restore the missing one, and re-run." >&2
  exit 1
fi

echo "gen-certs: generating a new self-signed cert in $TARGET_DIR"

# `-addext` needs OpenSSL >=1.1.1. macOS ships LibreSSL as /usr/bin/openssl,
# which doesn't support it — fall back to a temporary -config file there
# instead of failing, still with no new dependencies.
if openssl req -help 2>&1 | grep -q -- '-addext'; then
  openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=$SAN"
else
  CONF="$(mktemp)"
  trap 'rm -f "$CONF"' EXIT
  cat >"$CONF" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost

[v3_req]
subjectAltName = $SAN
EOF
  openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
    -keyout "$KEY" -out "$CERT" \
    -config "$CONF"
fi

chmod 644 "$CERT"
chmod 640 "$KEY"

echo "gen-certs: wrote $CERT and $KEY"
