# ContextForge UI Client

React-based admin UI for ContextForge MCP Gateway.

This UI targets **ContextForge API v1.0.7**, matching [`openapi.json`](./openapi.json) committed at repo root.

## Tech Stack

- **React 18** with TypeScript
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **React Intl** - Internationalization (i18n)
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library

## Getting Started

> Running this in Docker instead? See [DOCKER.md](./DOCKER.md).

### Prerequisites

- Node.js 20+ and npm

### Installation

```bash
npm install
```

### Development

The app is split into three pieces that all must run for local dev:

- **ContextForge** (`mcpgateway`) — the upstream FastAPI gateway. It owns
  auth and all business data.
- **BFF** (`server/`) — a Fastify app that sits between the browser and
  ContextForge. It holds the session cookie/CSRF boundary and keeps the
  API's JWT off the browser (`server/src/index.ts`). The browser only ever
  talks to the BFF, never directly to ContextForge.
- **Client** (`src/`) — this React SPA, served as static files by the BFF
  (same-origin — the API client always calls relative paths, see
  `src/api/client.ts`).

Bring them up in this order:

1. **Start ContextForge** — the upstream `mcp-context-forge` repo. Follow
   its own quick-start guide:
   https://github.com/IBM/mcp-context-forge/issues/2503
   Note whatever port it ends up listening on for the next step.

2. **Configure and start the BFF** (terminal B, from the repo root):

   ```bash
   cp .env.example .env
   ```

   Edit `.env`:
   - `CONTEXTFORGE_URL` — point it at whatever host:port ContextForge is
     listening on from step 1 (`.env.example`'s default is `0.0.0.0:8000`;
     confirm against your ContextForge run rather than assuming).
   - `COOKIE_SECURE=false` — needed for local HTTP; the default (`true`) is
     for prod and silently drops the session cookie over plain HTTP.

   Other values (`PORT`, `REDIS_URL`, `SESSION_TTL_SECONDS`, etc.) have
   dev-safe defaults — see comments in `.env.example`. `REDIS_URL` is left
   unset, which falls back to an in-process store (no Redis process needed
   for local dev — state resets on restart).

   ```bash
   cd server
   npm install
   npm run dev   # :3000, tsx watch, reads ../.env
   ```

3. **Build the frontend for the BFF to serve**, from the repo root:

   ```bash
   npm install
   npm run build
   ```

   This builds the SPA into `server/public/`, which the already-running BFF
   serves directly. Re-run `npm run build` after any frontend change —
   there's no HMR dev server wired to the BFF, so this build step is the
   loop for local iteration against the real backend. (`npm run build:watch`
   reruns it automatically on file changes.)

4. **Use it.** Visit `http://localhost:3000/` — redirects to `/app/login`
   (unauthed) or `/app/` (authed). The login form posts through the BFF,
   which holds the ContextForge JWT server-side and hands the browser only
   an opaque session cookie.

   Default seeded admin: `admin@example.com` / `changeme` (first login
   forces a password change unless `PASSWORD_CHANGE_ENFORCEMENT_ENABLED=false`
   is set in ContextForge's `.env`).

> `npm run dev` (plain Vite dev server at `:5173`, no BFF in front) still
> works for UI-only iteration, but `/api/*` calls need the BFF — it won't
> reach ContextForge on its own.

#### Troubleshooting

- **`EADDRINUSE` on `:3000`** — stale `tsx watch` process:
  `lsof -ti:3000 | xargs kill`, then restart `npm run dev` in `server/`.
- **401 mid-session** — expected; the ContextForge token hard-expires per
  `TOKEN_EXPIRY` (default 20 min). The BFF auto-revokes the session and
  redirects to login.

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

TypeScript types and fetch clients under `src/generated/` come from [`openapi.json`](./openapi.json) via [Orval](./orval.config.ts). That file is committed and pinned to API v1.0.7 — not re-fetched at build time.

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

- **Vitest** - Fast unit test runner with jsdom environment
- **React Testing Library** - Component testing utilities
- **MSW (Mock Service Worker)** - API mocking

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

- **[`tsconfig.app.json`](./tsconfig.app.json)** - Includes `vitest/globals` and `@testing-library/jest-dom` types
- **[`src/vitest.d.ts`](./src/vitest.d.ts)** - Global type declarations for test utilities
- **[`vitest.config.ts`](./vitest.config.ts)** - Vitest configuration with jsdom environment

## End-to-End Testing

End-to-end tests live in [`e2e/`](./e2e/) and are written in TypeScript with
Playwright. They run against the Vite dev server and stub backend API calls
with `page.route()`, so no Python gateway is required.

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

Tests and linting run automatically on pull requests via [`.github/workflows/client-lint-test.yml`](../.github/workflows/client-lint-test.yml).
E2E tests run via [`.github/workflows/client-e2e.yml`](../.github/workflows/client-e2e.yml).

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
client/
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
└── server/               # BFF (Fastify): session/CSRF boundary in front of ContextForge
    ├── src/
    │   ├── index.ts       # Entrypoint
    │   ├── config.ts      # Env-driven config
    │   ├── plugins/       # cookie, redis, session, csrf, static
    │   └── routes/        # auth/, proxy/ (catch-all to ContextForge), sse/
    ├── public/            # Built SPA (npm run build output), served by BFF
    └── package.json
```

## Available Scripts

| Script                  | Description                      |
| ----------------------- | -------------------------------- |
| `npm run dev`           | Start development server         |
| `npm run build`         | Build for production             |
| `npm run generate`      | Regenerate API types from `openapi.json` |
| `npm run preview`       | Preview production build         |
| `npm run lint`          | Check for linting errors         |
| `npm run lint:fix`      | Auto-fix linting errors          |
| `npm run format`        | Format all files with Prettier   |
| `npm run format:check`  | Check formatting without changes |
| `npm run test`          | Run tests in watch mode          |
| `npm run test:run`      | Run tests once (CI mode)         |
| `npm run test:ui`       | Run tests with UI                |
| `npm run test:coverage` | Generate coverage report         |
| `npm run e2e`           | Run Playwright E2E tests         |
| `npm run e2e:ui`        | Playwright UI mode               |
| `npm run e2e:debug`     | Playwright Inspector             |
| `npm run e2e:install`   | Install Playwright browsers      |
| `npm run e2e:report`    | Open last Playwright report      |

## Internationalization (i18n)

The app supports multiple languages via React Intl:

- **English (en-US)** - Default
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
