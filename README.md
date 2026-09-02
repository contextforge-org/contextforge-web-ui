# ContextForge Web UI

The web interface for ContextForge, the open source AI gateway that federates
tools, agents, and APIs into one endpoint.

The backing service is a separate process in a separate repository
([IBM/mcp-context-forge](https://github.com/IBM/mcp-context-forge)).
This repository holds the BFF and client that sit in front of it. The table below also documents the API for naming reference, though it lives in a separate repo:

| Component            | Lives in      | Role                                                              |
| -------------------- | ------------- | ----------------------------------------------------------------- |
| **ContextForge API** | separate repo | FastAPI service that owns auth and all business data              |
| **BFF**              | `server/`     | Fastify app holding the session/CSRF boundary in front of the API |
| **Client**           | `src/`        | React SPA, served as static files by the BFF                      |

Throughout this README, "the API", "the BFF", and "the client" refer to those
three. The browser only ever talks to the BFF, never directly to the API.

This UI targets **ContextForge API v1.0.7**, matching [`openapi.json`](./openapi.json) committed at repo root.

## Tech Stack

- **React 18** with TypeScript
- **Vite**: build tool and dev server
- **React Router**: client-side routing
- **React Intl**: internationalization (i18n)
- **Tailwind CSS**: utility-first styling
- **shadcn/ui**: component library

## Getting Started

> Running this in Docker instead? See [DOCKER.md](./DOCKER.md).

### Prerequisites

- Node.js 20+ and npm

### Installation

```bash
npm install
```

### Development

All three components must be running for local dev. Beyond the roles above:
the BFF keeps the API's JWT off the browser (`server/src/index.ts`), and the
client is served same-origin by the BFF, so its requests are always relative
paths (`src/api/client.ts`).

Bring them up in this order:

1. **Start the ContextForge API** (terminal A). It is a separate service in
   its own clone, not part of this repository. Follow its own quick-start
   guide for first-time setup:
   https://github.com/IBM/mcp-context-forge/issues/2503

   ```bash
   cd /path/to/mcp-context-forge
   make dev   # listens on :8000, matching .env.example's default below
   ```

   (`make serve` runs it in production mode on `:4444` instead.) Note
   whichever port yours ends up on; step 2 needs it.

2. **Configure and start the BFF** (terminal B, from the repo root):

   ```bash
   cp .env.example .env
   ```

   Edit `.env`:
   - `CONTEXTFORGE_URL`: point it at whatever host:port the API is
     listening on from step 1 (`.env.example`'s default is `0.0.0.0:8000`,
     which matches `make dev`; confirm against your actual run rather than
     assuming).
   - `COOKIE_SECURE=false`: needed for local HTTP; the default (`true`) is
     for prod and silently drops the session cookie over plain HTTP.

   Other values (`PORT`, `REDIS_URL`, `SESSION_TTL_SECONDS`, etc.) have
   dev-safe defaults; see comments in `.env.example`. `REDIS_URL` is left
   unset, which falls back to an in-process store (no Redis process needed
   for local dev; state resets on restart).

   ```bash
   cd server
   npm install
   npm run dev   # :3000, tsx watch, reads ../.env
   ```

   Iterating on the frontend with HMR (step 3)? Start this with
   `VITE_DEV_SERVER_URL=http://localhost:5173 npm run dev` instead — see
   step 3 for why. Or skip steps 2 and 3 entirely and run `npm run dev:all`
   from the repo root, which starts both with that already set.

3. **Start the frontend** (terminal C, from the repo root):

   ```bash
   npm install
   npm run dev   # :5173
   ```

   Don't visit `:5173` directly — keep visiting the BFF on `:3000` (step
   4). With `VITE_DEV_SERVER_URL` set (step 2), the BFF reverse-proxies
   everything it doesn't own itself (SPA shell, JS/CSS modules, HMR) to
   this Vite dev server (`server/src/plugins/vite-dev-proxy.ts`), so the
   browser only ever talks to one origin (`:3000`) and gets real HMR
   instead of the rebuild-and-refresh `build:watch` loop. `/api/*`,
   `/auth/*`, etc. stay handled by the BFF itself, unaffected by the proxy.

   Terminals B and C can be replaced with one: `npm run dev:all` runs both
   via `concurrently` (already sets `VITE_DEV_SERVER_URL` for you). The API
   (terminal A) still needs its own terminal since it's a separate repo.

4. **Use it.** Visit `http://localhost:3000/`: redirects to `/app/login`
   (unauthed) or `/app/` (authed). The login form posts through the BFF,
   which holds the API's JWT server-side and hands the browser only
   an opaque session cookie.

   Default seeded admin: `admin@example.com` / `changeme` (first login
   forces a password change unless `PASSWORD_CHANGE_ENFORCEMENT_ENABLED=false`
   is set in the API's `.env`).

> Testing the exact BFF-served bundle (no Vite dev server, no HMR)? Run
> `npm run build` (or `npm run build:watch` to rebuild on change) instead of
> step 3, and start the BFF in step 2 with plain `npm run dev` (no
> `VITE_DEV_SERVER_URL`) — you're still visiting `http://localhost:3000/`
> either way.

#### Troubleshooting

- **`EADDRINUSE` on `:3000`**: stale `tsx watch` process:
  `lsof -ti:3000 | xargs kill`, then restart `npm run dev` in `server/`.
- **401 mid-session**: expected; the API token hard-expires per
  `TOKEN_EXPIRY` (default 20 min). The BFF auto-revokes the session and
  redirects to login.
- **`:3000` doesn't reflect frontend changes / no HMR**: the BFF wasn't
  started with `VITE_DEV_SERVER_URL=http://localhost:5173` (step 2), so
  it's serving the last `server/public/` build instead of proxying to
  Vite. Use `npm run dev:all`, or set the env var yourself.
- **502/connection error on `:3000` for non-API paths**: `VITE_DEV_SERVER_URL`
  is set but the Vite dev server (step 3) isn't actually running yet — the
  BFF proxies to it lazily per-request, so start Vite first (or use
  `npm run dev:all`, which starts both).

### Build

```bash
npm run build
```

Builds the SPA into `server/public/`, for the BFF to serve.

### Preview Production Build

```bash
npm run preview
```

## API Types

TypeScript types and fetch clients under `src/generated/` come from [`openapi.json`](./openapi.json) via [Orval](./orval.config.ts). That file is committed and pinned to API v1.0.7, not re-fetched at build time.

```bash
npm run generate   # regenerate src/generated/ from ./openapi.json
```

To bump the API version, replace `openapi.json` with the new spec, update the version note above, then run `npm run generate`.

## Code Quality

### Linting

ESLint is configured with TypeScript support and Prettier integration.

```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors
npm run lint:fix
```

**Configuration:** [`eslint.config.js`](./eslint.config.js)

### Formatting

Prettier is configured for consistent code formatting.

```bash
# Format all files
npm run format

# Check formatting without changes
npm run format:check
```

**Configuration:** [`.prettierrc`](./.prettierrc)

**Key Settings:**

- Trailing commas: `all` (including function calls)
- Semicolons: `true`
- Single quotes: `false` (use double quotes)
- Print width: `100`

## Testing

### Test Framework

- **Vitest**: Fast unit test runner with jsdom environment
- **React Testing Library**: Component testing utilities
- **MSW (Mock Service Worker)**: API mocking

### Running Tests

```bash
# Run tests in watch mode
npm run test

# Run tests once (CI mode)
npm run test:run

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Test Structure

```
src/
├── test/
│   ├── setup.ts              # Global test setup (MSW, matchers, mocks)
│   ├── setup.d.ts            # TypeScript declarations for jest-dom
│   ├── test-utils.tsx        # Custom render with providers (I18nProvider)
│   └── mocks/
│       ├── server.ts         # MSW server setup
│       └── handlers.ts       # API request handlers
└── **/*.test.tsx             # Test files (co-located with components)
```

### Writing Tests

Tests use React Testing Library with jest-dom matchers:

```typescript
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./test/test-utils";
import { MyComponent } from "./MyComponent";

describe("MyComponent", () => {
  it("renders and handles user interaction", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyComponent />);

    const button = screen.getByRole("button", { name: /click me/i });
    await user.click(button);

    expect(screen.getByText(/success/i)).toBeInTheDocument();
  });
});
```

**Key Points:**

- Use `renderWithProviders()` instead of `render()` to wrap components with I18nProvider
- Use `userEvent` for simulating user interactions (more realistic than `fireEvent`)
- Use `screen` queries with accessible roles and names
- MSW automatically mocks API requests defined in `src/test/mocks/handlers.ts`

### Mocking API Endpoints

Add handlers to `src/test/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/users", () => {
    return HttpResponse.json([
      { id: 1, name: "John Doe" },
      { id: 2, name: "Jane Smith" },
    ]);
  }),

  http.post("/api/users", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 3, ...body }, { status: 201 });
  }),
];
```

### TypeScript Configuration

Test-specific TypeScript configuration:

- **[`tsconfig.app.json`](./tsconfig.app.json)**: includes `vitest/globals` and `@testing-library/jest-dom` types
- **[`src/vitest.d.ts`](./src/vitest.d.ts)**: global type declarations for test utilities
- **[`vitest.config.ts`](./vitest.config.ts)**: Vitest configuration with jsdom environment

## End-to-End Testing

End-to-end tests live in [`e2e/`](./e2e/) and are written in TypeScript with
Playwright. They run against the Vite dev server and stub backend API calls
with `page.route()`, so no running ContextForge API is required.

```bash
npm run e2e:install   # Install Playwright browsers (one-time)
npm run e2e           # Headless run
npm run e2e:ui        # Interactive UI mode
npm run e2e:debug     # Playwright Inspector
npm run e2e:report    # Open the last HTML report
```

See [`e2e/README.md`](./e2e/README.md) for layout, fixtures, and guidelines.

## CI/CD

### GitHub Actions

Tests and linting run automatically on pull requests via [`.github/workflows/client-lint-test.yml`](./.github/workflows/client-lint-test.yml).
E2E tests run via [`.github/workflows/client-e2e.yml`](./.github/workflows/client-e2e.yml).

**Workflow Steps:**

1. Install dependencies
2. Run Prettier format check
3. Run ESLint
4. Run Vitest tests

**Triggers:**

- Push to `main` or `epic/ui-rewrite` branches
- Pull requests to `main` or `epic/ui-rewrite` branches

## Project Structure

```
contextforge-web-ui/
├── src/
│   ├── api/              # API client and types
│   ├── auth/             # Authentication context and hooks
│   ├── components/       # Reusable UI components
│   │   ├── layout/       # Layout components (Header, Sidebar, etc.)
│   │   └── ui/           # shadcn/ui components
│   ├── hooks/            # Custom React hooks
│   ├── i18n/             # Internationalization
│   │   └── locales/      # Translation files (en-US, es-ES, pt-BR)
│   ├── pages/            # Page components (Dashboard, Gateways, etc.)
│   ├── router/           # React Router configuration
│   ├── test/             # Test utilities and mocks
│   ├── App.tsx           # Root component
│   └── main.tsx          # Application entry point
├── public/               # Static assets
├── .prettierrc           # Prettier configuration
├── .prettierignore       # Prettier ignore patterns
├── eslint.config.js      # ESLint configuration
├── vitest.config.ts      # Vitest configuration
├── tsconfig.json         # TypeScript base config
├── tsconfig.app.json     # TypeScript app config
├── vite.config.ts        # Vite configuration (builds to server/public/)
├── package.json          # Dependencies and scripts
├── .env.example          # Shared BFF config — copy to .env (see Getting Started)
├── .env.prod.example     # Production-ready template — copy to .env
├── Dockerfile / docker-compose.yml / DOCKER.md  # see DOCKER.md
└── server/               # BFF (Fastify): session/CSRF boundary in front of the API
    ├── src/
    │   ├── index.ts       # Entrypoint
    │   ├── config.ts      # Env-driven config
    │   ├── plugins/       # cookie, redis, session, csrf, static
    │   └── routes/        # auth/, proxy/ (catch-all to the API), sse/
    ├── public/            # Built SPA (npm run build output), served by BFF
    └── package.json
```

## Available Scripts

Run from the repo root unless noted. Visit the app on the BFF's port
(`:3000`) either way — see [Getting Started](#getting-started) for the full
dev setup.

| Script                       | Description                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`                | Vite dev server (`:5173`) — not visited directly; the BFF proxies to it for HMR                   |
| `npm run dev` (in `server/`) | **Start the BFF (`:3000`)** — serves the SPA (or proxies to Vite) and proxies `/api/*` to the API |
| `npm run dev:all`            | Both of the above together (via `concurrently`), `VITE_DEV_SERVER_URL` already set                |
| `npm run build`              | Build the SPA into `server/public/`, which the BFF serves directly (no Vite dev server)           |
| `npm run build:watch`        | Rebuild on change — for iterating without HMR, against the BFF-served build                       |
| `npm run generate`           | Regenerate API types from `openapi.json`                                                          |
| `npm run preview`            | Preview production build                                                                          |
| `npm run lint`               | Check for linting errors                                                                          |
| `npm run lint:fix`           | Auto-fix linting errors                                                                           |
| `npm run format`             | Format all files with Prettier                                                                    |
| `npm run format:check`       | Check formatting without changes                                                                  |
| `npm run test`               | Run tests in watch mode                                                                           |
| `npm run test:run`           | Run tests once (CI mode)                                                                          |
| `npm run test:ui`            | Run tests with UI                                                                                 |
| `npm run test:coverage`      | Generate coverage report                                                                          |
| `npm run e2e`                | Run Playwright E2E tests                                                                          |
| `npm run e2e:ui`             | Playwright UI mode                                                                                |
| `npm run e2e:debug`          | Playwright Inspector                                                                              |
| `npm run e2e:install`        | Install Playwright browsers                                                                       |
| `npm run e2e:report`         | Open last Playwright report                                                                       |

## Internationalization (i18n)

The app supports multiple languages via React Intl:

- **English (en-US)** (default)
- **Spanish (es-ES)**
- **Portuguese (pt-BR)**

Translation files are located in `src/i18n/locales/`.

### Adding Translations

1. Add keys to `src/i18n/locales/{locale}/[domain].json`
2. Use in components:

```typescript
import { useIntl } from "react-intl";

function MyComponent() {
  const intl = useIntl();
  return <h1>{intl.formatMessage({ id: "navigation.dashboard" })}</h1>;
}
```

## Troubleshooting

### Tests Failing with "toBeInTheDocument is not a function"

Ensure TypeScript types are properly configured:

- Check `tsconfig.app.json` includes `"types": ["vitest/globals", "@testing-library/jest-dom"]`
- Verify `src/vitest.d.ts` exists with proper type references

### MSW Not Intercepting Requests

- Verify handlers are defined in `src/test/mocks/handlers.ts`
- Check that paths match exactly (e.g., `/app/auth/login` not `/api/auth/login`)
- Ensure MSW server is started in `src/test/setup.ts`

### window.matchMedia Errors in Tests

The test setup includes a mock for `window.matchMedia` in `src/test/setup.ts`. If you see errors, verify the mock is properly configured.

## Contributing

1. Follow the existing code style (enforced by ESLint and Prettier)
2. Write tests for new features
3. Ensure all tests pass: `npm run test:run`
4. Ensure linting passes: `npm run lint`
5. Ensure formatting is correct: `npm run format:check`
