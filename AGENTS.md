# AGENTS.md

## Cursor Cloud specific instructions

### Repository overview

Monorepo (npm workspaces + Turborepo) for **FastProduct** — a Brazilian POS system for imported goods stores with bilingual UI (Portuguese + Mandarin). See `README.md` for full structure.

| Workspace | Tech | Dev command | Port |
|---|---|---|---|
| `pdv-importados` | Next.js 15 / React 19 | `npm run dev:web` | 3000 |
| `pdv-local` | Tauri 2 / Vite / React 19 | `npm run dev:desktop` | 4173 |
| `backend` | Supabase Edge Functions (Deno) | `npm run check` (type-check only) | N/A |
| `shared-core` | Pure TS lib | N/A | N/A |

### Running services

- **Web (pdv-importados):** `npm run dev:web` from the repo root. Opens at `http://localhost:3000`. Login route: `/login`. Requires Supabase env vars in `pdv-importados/.env.local` (copy from `.env.example`).
- **Desktop UI (pdv-local):** `npm run dev:desktop` from the repo root. Opens at `http://localhost:4173` (Vite preview port, not 5173). Note: full Tauri desktop build requires Rust toolchain — the Vite-only mode is sufficient for frontend dev/testing.
- **Backend type-check:** `npm run check` validates all three Edge Functions (`sync-outbox`, `validar-gerente`, `fiscal-worker`) via Deno. No running service needed.

### Key commands (all from repo root)

Refer to `README.md` for the full table. Quick reference:

- `npm run lint` — ESLint across all workspaces
- `npm run test` — Vitest in pdv-importados + pdv-local
- `npm run build` — Next.js production build (pdv-importados only)
- `npm run check` — Deno type-check Edge Functions
- `npm run check:all` — check + lint + typecheck + test

### Known issues

- Two tests in `pdv-local/src/hooks/usePdvLocalOutboxSync.test.tsx` have pre-existing 5-second timeouts (async operations that never resolve). These are **not** caused by environment setup. The remaining 32 tests pass.
- The `pdv-local` Vite dev server binds to port **4173** (not 5173 as typical for Vite dev). This is the configured preview port.

### Environment variables

- Without real Supabase credentials, the web app loads the login page but cannot authenticate users. The POS and management features behind auth will not be accessible.
- For local dev without Supabase, copy `.env.example` files to `.env.local` (web) / `.env` (desktop) — placeholder values allow the app to start and render the login UI.

### Gotchas

- The package manager is **npm** (not pnpm/yarn). The lockfile is `package-lock.json`.
- Node.js version: `.nvmrc` says 20, but engines allow `>=20.0.0 <25.0.0`. Node 22 works.
- Edge Function type-check downloads Deno 2.2.2 on first run via `npx -y deno@2.2.2`. This is normal and cached after first use.
- **`NEXT_PUBLIC_SUPABASE_URL` must be a full URL** (e.g. `https://abcdefgh.supabase.co`), not just the project reference ID. The app validates this at startup and throws if missing `https://`. If the secret is stored as just the ref ID, prefix it: `https://${NEXT_PUBLIC_SUPABASE_URL}.supabase.co`.
- **Login requires a confirmed user** in Supabase Auth **plus** a matching row in `public.usuarios`. Without `SUPABASE_SERVICE_ROLE_KEY`, you cannot seed test users programmatically. See `pdv-importados/docs/SEED_DEV_E2E.md` for details.
