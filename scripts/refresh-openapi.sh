#!/usr/bin/env bash
# Regenerates openapi.json from a sibling mcp-context-forge checkout, pins it
# to the commit it came from, updates the README references and generated
# API client, and commits the result on a new branch.
#
# Usage:
#   scripts/refresh-openapi.sh [--dry-run] [--push] [path-to-mcp-context-forge]
#
# --dry-run stops after writing the local file changes so you can inspect
#   `git diff` yourself; it does not commit, branch, or push.
# --push    pushes the commit and opens a PR (via `gh`, if installed;
#           otherwise it prints the branch name and a compare URL so you can
#           open the PR by hand). Without this flag the script only commits
#           locally and leaves pushing/PR creation to you.
#
# Env vars:
#   OPENAPI_SOURCE_DIR   overrides the sibling repo path (same as the
#                        positional argument; the argument wins if both are set)
set -euo pipefail

DRY_RUN=0
PUSH=0
API_DIR_ARG=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --push) PUSH=1 ;;
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

REMOTE_OK=0
while read -r remote_name; do
  [[ -z "$remote_name" ]] && continue
  remote_url="$(git -C "$API_DIR" remote get-url "$remote_name" 2>/dev/null || true)"
  if [[ "$remote_url" =~ [:/][Ii][Bb][Mm]/mcp-context-forge(\.git)?$ ]]; then
    REMOTE_OK=1
    break
  fi
done < <(git -C "$API_DIR" remote)

if [[ "$REMOTE_OK" != 1 ]]; then
  echo "error: $API_DIR has no remote pointing at IBM/mcp-context-forge" >&2
  echo "  refusing to pull and execute code from an unverified checkout." >&2
  echo "  point OPENAPI_SOURCE_DIR/the path argument at a checkout of the canonical repo," >&2
  echo "  or add it as a remote, e.g.:" >&2
  echo "    git -C \"$API_DIR\" remote add upstream https://github.com/IBM/mcp-context-forge.git" >&2
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

if [[ -f "$API_DIR/.env" ]] && grep -q '__REPLACE_ME__' "$API_DIR/.env"; then
  echo "error: $API_DIR/.env still has unset __REPLACE_ME__ secret placeholders." >&2
  echo "  Run 'python -m mcpgateway.scripts.init_secrets' in that checkout" >&2
  echo "  (or 'make init-secrets-patch-env' to write them into .env), then re-run this script." >&2
  exit 1
fi

VENV_PY="$API_DIR/.venv/bin/python"
if [[ -x "$VENV_PY" ]]; then
  PYTHON="$VENV_PY"
else
  echo "warning: no venv at $API_DIR/.venv, falling back to python3 on PATH" >&2
  PYTHON="python3"
fi

echo "==> Generating openapi.json from $API_COMMIT_SHORT"
TMP_SPEC="$(mktemp)"
TMP_README="$(mktemp)"
trap 'rm -f "$TMP_SPEC" "$TMP_README"' EXIT

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

SPEC_CHANGED=0
if diff -q "$TMP_SPEC" "$REPO_ROOT/openapi.json" >/dev/null 2>&1; then
  echo "==> openapi.json is already at $PINNED_VERSION"
else
  SPEC_CHANGED=1
fi

echo "==> Checking README references"
cp "$REPO_ROOT/README.md" "$TMP_README"
if ! grep -qE "targets \*\*ContextForge API v[0-9.]+\*\*" "$TMP_README"; then
  echo "warning: couldn't find the 'targets ContextForge API vX.Y.Z' line in README.md, skipping" >&2
else
  sed -i.bak -E "s/targets \*\*ContextForge API v[0-9.]+\*\*/targets **ContextForge API v${API_VERSION}**/" "$TMP_README"
fi
if ! grep -qE "pinned to API v[0-9.]+," "$TMP_README"; then
  echo "warning: couldn't find the 'pinned to API vX.Y.Z,' line in README.md, skipping" >&2
else
  sed -i.bak -E "s/pinned to API v[0-9.]+,/pinned to API v${API_VERSION},/" "$TMP_README"
fi
rm -f "$TMP_README.bak"

README_CHANGED=0
if ! diff -q "$TMP_README" "$REPO_ROOT/README.md" >/dev/null 2>&1; then
  README_CHANGED=1
fi

if [[ "$SPEC_CHANGED" == 0 && "$README_CHANGED" == 0 ]]; then
  echo "==> Nothing to update, already at $PINNED_VERSION"
  exit 0
fi

# Write the generated files into the working tree. Deferred until here (and,
# for a real run, until after switching to the release branch below) so that
# switching branches never has to reconcile uncommitted local edits against
# origin/main's version of these files.
write_changes() {
  [[ "$SPEC_CHANGED" == 1 ]] && cp "$TMP_SPEC" "$REPO_ROOT/openapi.json"
  [[ "$README_CHANGED" == 1 ]] && cp "$TMP_README" "$REPO_ROOT/README.md"
  echo "==> Regenerating API client"
  (cd "$REPO_ROOT" && npm run generate)
}

if [[ "$DRY_RUN" == "1" ]]; then
  write_changes
  echo "==> --dry-run set: left openapi.json, README.md and src/generated updated locally."
  echo "    Review with 'git diff' and commit/branch/PR yourself when ready."
  exit 0
fi

git -C "$REPO_ROOT" fetch origin main --quiet
BRANCH="chore/openapi-${API_VERSION}-${API_COMMIT_SHORT}"
echo "==> Creating branch $BRANCH from origin/main"
git -C "$REPO_ROOT" checkout -B "$BRANCH" origin/main --quiet
write_changes
git -C "$REPO_ROOT" add openapi.json README.md
git -C "$REPO_ROOT" commit --signoff -m "chore: refresh openapi.json to API v${PINNED_VERSION}"

if [[ "$PUSH" != "1" ]]; then
  echo "==> Committed on $BRANCH. Re-run with --push to push and open a PR,"
  echo "    or push/open it yourself when you're ready."
  exit 0
fi

echo "==> Pushing $BRANCH"
git -C "$REPO_ROOT" push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create \
    --repo contextforge-org/contextforge-web-ui \
    --title "chore: refresh openapi.json to API v${PINNED_VERSION}" \
    --body "Regenerated from [IBM/mcp-context-forge@${API_COMMIT_SHORT}](https://github.com/IBM/mcp-context-forge/commit/${API_COMMIT})."
else
  echo "==> gh not found; open a PR for $BRANCH yourself:"
  echo "    https://github.com/contextforge-org/contextforge-web-ui/compare/main...${BRANCH}?expand=1"
fi
