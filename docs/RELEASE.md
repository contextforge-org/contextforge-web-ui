# Release Process

This repo tracks two independent version numbers:

- **UI version** — this repo's own semver, in [`package.json`](./package.json) and tagged as `vA.B.C` on `main`. Bumped every release.
- **Pinned API version** — the upstream [IBM/mcp-context-forge](https://github.com/IBM/mcp-context-forge) commit this UI was built and tested against, recorded as build metadata on [`openapi.json`](./openapi.json)'s `info.version` (e.g. `1.0.0+589c69`). Bumped only when you refresh `openapi.json` from a newer API checkout.

A release usually bumps both, but doesn't have to — a UI-only bugfix can ship a new UI version without touching the API pin.

## 1. Refresh the API contract

Skip this section if the API hasn't changed since the last release.

```bash
npm run openapi:refresh
```

This runs [`scripts/refresh-openapi.sh`](./scripts/refresh-openapi.sh), which:

1. Verifies the sibling checkout has a remote pointing at `IBM/mcp-context-forge`, then pulls `main` there (default location: `../mcp-context-forge`; override with `OPENAPI_SOURCE_DIR` or a path argument).
2. Regenerates `openapi.json` from it and pins `info.version` to `<API version>+<first 6 chars of the commit hash>` — [semver build metadata](https://semver.org/#spec-item-10), no spaces or parentheses (e.g. `1.0.0+589c69`).
3. Updates the two places the README quotes that same pin (the `This UI targets **ContextForge API vX.Y.Z**` line and the codegen note further down).
4. Runs `npm run generate` to regenerate the API client.
5. Commits on a new `chore/openapi-...` branch (based on `origin/main`).

Run with `--dry-run` to stop after step 4 and inspect `git diff` yourself before committing anything. Both the API checkout and this repo must have a clean working tree before you run it.

By default the script stops after committing locally — push the branch and open the PR yourself, or re-run with `--push` to have it push and open the PR for you (via `gh` if installed; otherwise it prints a compare URL).

The sibling checkout needs real secrets in its `.env` (not the `__REPLACE_ME__` placeholders) to boot the app and produce the spec — run `python -m mcpgateway.scripts.init_secrets` or `make init-secrets-patch-env` there first if you haven't.

Fix any type errors from the client regeneration (`npm run build`) before merging the PR it opens.

## 2. Bump the UI version

On a branch off `main`, bump [`package.json`](./package.json)'s `version` following semver:

- **patch** — bug fixes, no API pin change
- **minor** — new UI functionality, or an API pin bump that only adds endpoints/fields
- **major** — breaking UI change, or an API pin bump with breaking changes

## 3. PR and merge

Open a PR with the `openapi.json` / README / generated-client changes (if any) and the `package.json` bump. Get it reviewed and merged like any other change — no direct pushes to `main`.

## 4. Tag the release

```bash
git checkout main && git pull
git tag vA.B.C   # must match the package.json version from step 2
git push origin vA.B.C
```

## 5. Publish the GitHub release

1. Go to the [tags page](https://github.com/contextforge-org/contextforge-web-ui/tags).
2. On the new tag's `...` menu, click **Create release**.
3. Click **Generate release notes** to populate the changelog from merged PRs.
4. If the release isn't production-ready (e.g. an early cut for testing), check **Set as a pre-release**.
5. Click **Publish release**.

## Rolling back a bad tag

If a tag was pushed by mistake and the release hasn't been publicised yet:

```bash
git push --delete origin vA.B.C
git tag -d vA.B.C
```

Delete the corresponding GitHub release (if one was published) from its page as well. Once a release has been announced or consumed, prefer shipping a new patch version over deleting history.
