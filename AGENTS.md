# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Brazilian POS (PDV) monorepo using npm workspaces + Turborepo. See `README.md` for full structure.

### Key commands (run from repo root)

| Task | Command |
|------|---------|
| Install deps | `npm ci` |
| Lint | `npm run lint` |
| Test (web + shared-core) | `npx turbo run test --filter=pdv-importados --filter=@fastproduct/shared-core` |
| Typecheck web | `npx turbo run typecheck --filter=pdv-importados` |
| Typecheck Edge Functions | `npm run check` |
| Build (Next.js) | `npm run build` |
| Dev server (web) | `npm run dev:web` |

### Environment variable gotcha

The `NEXT_PUBLIC_SUPABASE_URL` secret injected by the cloud agent may lack the `https://` prefix and `.supabase.co` suffix. Next.js reads actual shell env vars **before** `.env.local`, so you must ensure the shell env var has the full URL format (`https://<ref>.supabase.co`) or unset it and rely on `.env.local`.

To fix before running `build` or `dev:web`:

```bash
# Construct full URL from the injected ref
export NEXT_PUBLIC_SUPABASE_URL="https://${NEXT_PUBLIC_SUPABASE_URL}.supabase.co"
```

If the value already starts with `https://`, skip the override.

### pdv-local (desktop/Tauri) tests

`pdv-local` tests require `@swc/core-linux-x64-gnu` native binding which is not installed by default in cloud agent VMs (it's a Tauri/desktop workspace). Skip with `--filter=!pdv-local` or run only the web + shared-core workspaces.

### Test credentials

- **Gerente**: `demo@jinlong.com` / `Demo@2025`
- **Operador**: `operador.test@example.com` / `senha123`

Login at `/login`. The gerente account accesses the full manager panel (`/gerente`). The operador account accesses the POS cashier (`/caixa`).

### Notes

- The `npm run test` root script runs all workspaces; `pdv-local` will fail in cloud VMs (SWC native binding). Use the filtered commands above.
- Build requires valid Supabase env vars because static pages call `assertSupabasePublicEnv()` during prerender.
- The dev server (`next dev`) starts on port 3000 and redirects unauthenticated users to `/login`.
