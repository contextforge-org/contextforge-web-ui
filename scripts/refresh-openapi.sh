#!/usr/bin/env bash
# Regenerates openapi.json from a sibling mcp-context-forge checkout, pins it
# to the commit it came from, updates the README references and generated
# API client, and opens a PR with the result.
#
# Usage:
#   scripts/refresh-openapi.sh [path-to-mcp-context-forge]
#   scripts/refresh-openapi.sh --dry-run [path-to-mcp-context-forge]
#
# --dry-run stops after writing the local file changes so you can inspect
# `git diff` yourself; it does not commit, push, or open a PR.
#
# Env vars:
#   OPENAPI_SOURCE_DIR   overrides the sibling repo path (same as the
#                        positional argument; the argument wins if both are set)
set -euo pipefail

DRY_RUN=0
API_DIR_ARG=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) API_DIR_ARG="$arg" ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${API_DIR_ARG:-${OPENAPI_SOURCE_DIR:-$(dirname "$REPO_ROOT")/mcp-context-forge}}"

if [[ ! -d "$API_DIR/.git" ]]; then
  echo "error: $API_DIR is not a git checkout of mcp-context-forge" >&2
  echo "  pass its path as an argument, or set OPENAPI_SOURCE_DIR" >&2
  exit 1
fi

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "error: $REPO_ROOT has uncommitted changes, aborting" >&2
  exit 1
fi

if [[ -n "$(git -C "$API_DIR" status --porcelain)" ]]; then
  echo "error: $API_DIR has uncommitted changes, refusing to touch it" >&2
  exit 1
fi

echo "==> Updating $API_DIR"
git -C "$API_DIR" checkout main --quiet
git -C "$API_DIR" pull --ff-only --quiet

API_COMMIT="$(git -C "$API_DIR" rev-parse HEAD)"
API_COMMIT_SHORT="${API_COMMIT:0:6}"

VENV_PY="$API_DIR/.venv/bin/python"
if [[ -x "$VENV_PY" ]]; then
  PYTHON="$VENV_PY"
else
  echo "warning: no venv at $API_DIR/.venv, falling back to python3 on PATH" >&2
  PYTHON="python3"
fi

echo "==> Generating openapi.json from $API_COMMIT_SHORT"
TMP_SPEC="$(mktemp)"
trap 'rm -f "$TMP_SPEC"' EXIT

(cd "$API_DIR" && "$PYTHON" -c "
import json, sys
from mcpgateway.main import app
json.dump(app.openapi(), open(sys.argv[1], 'w'), indent=2)
" "$TMP_SPEC")

API_VERSION="$(python3 -c "import json; print(json.load(open('$TMP_SPEC'))['info']['version'])")"
PINNED_VERSION="${API_VERSION}+${API_COMMIT_SHORT}"

echo "==> Pinning info.version to $PINNED_VERSION"
python3 - "$TMP_SPEC" "$PINNED_VERSION" <<'PY'
import json, sys
path, version = sys.argv[1], sys.argv[2]
with open(path) as f:
    spec = json.load(f)
spec["info"]["version"] = version
with open(path, "w") as f:
    json.dump(spec, f, indent=2)
    f.write("\n")
PY

if diff -q "$TMP_SPEC" "$REPO_ROOT/openapi.json" >/dev/null 2>&1; then
  echo "==> openapi.json is already at $PINNED_VERSION, nothing to do"
  exit 0
fi

cp "$TMP_SPEC" "$REPO_ROOT/openapi.json"

echo "==> Updating README references"
if ! grep -qE "targets \*\*ContextForge API v[0-9.]+\*\*" "$REPO_ROOT/README.md"; then
  echo "warning: couldn't find the 'targets ContextForge API vX.Y.Z' line in README.md, skipping" >&2
else
  sed -i.bak -E "s/targets \*\*ContextForge API v[0-9.]+\*\*/targets **ContextForge API v${API_VERSION}**/" "$REPO_ROOT/README.md"
fi
if ! grep -qE "pinned to API v[0-9.]+," "$REPO_ROOT/README.md"; then
  echo "warning: couldn't find the 'pinned to API vX.Y.Z,' line in README.md, skipping" >&2
else
  sed -i.bak -E "s/pinned to API v[0-9.]+,/pinned to API v${API_VERSION},/" "$REPO_ROOT/README.md"
fi
rm -f "$REPO_ROOT/README.md.bak"

echo "==> Regenerating API client"
(cd "$REPO_ROOT" && npm run generate)

if [[ "$DRY_RUN" == "1" ]]; then
  echo "==> --dry-run set: left openapi.json, README.md and src/generated updated locally."
  echo "    Review with 'git diff' and commit/branch/PR yourself when ready."
  exit 0
fi

BRANCH="chore/openapi-${API_VERSION}-${API_COMMIT_SHORT}"
echo "==> Creating branch $BRANCH"
git -C "$REPO_ROOT" checkout -B "$BRANCH"
git -C "$REPO_ROOT" add openapi.json README.md
git -C "$REPO_ROOT" commit -m "chore: refresh openapi.json to API v${PINNED_VERSION}

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"

echo "==> Pushing and opening PR"
git -C "$REPO_ROOT" push -u origin "$BRANCH"
gh pr create \
  --repo contextforge-org/contextforge-web-ui \
  --title "chore: refresh openapi.json to API v${PINNED_VERSION}" \
  --body "Regenerated from [IBM/mcp-context-forge@${API_COMMIT_SHORT}](https://github.com/IBM/mcp-context-forge/commit/${API_COMMIT})."
