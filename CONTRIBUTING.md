# Contributing Guide

Contributing to fastproduct follows clear conventions to maintain code quality, consistency, and effective collaboration across the monorepo.

---

## 🏗️ Monorepo Structure

```
fastproduct/
├── pdv-importados/      Next.js web app (cashier + manager dashboard)
├── pdv-local/           Tauri desktop app (offline-first PDV)
├── backend/             Supabase Edge Functions (sync, fiscal, etc.)
├── shared-core/         TypeScript business logic (pricing, inventory, etc.)
└── docs/                Operational documentation & runbooks
```

**Key Rule**: Code belongs to the most specific workspace. Use `shared-core` only for logic that's genuinely reused (not "might be reused someday").

---

## 🌱 Getting Started

### Prerequisites
- Node.js >= 20.0.0 < 25.0.0
- npm >= 10.9.2
- Supabase CLI (for backend work)
- Tauri prerequisites (for desktop app)

### Setup
```bash
# Clone repo
git clone https://github.com/nocodenn-cell/fastproduct.git
cd fastproduct

# Install dependencies
npm install

# Copy env template
cp pdv-importados/.env.example pdv-importados/.env.local
cp pdv-local/.env.example pdv-local/.env.local

# Start dev server (choose one)
npm run dev:web       # Next.js on localhost:3000
npm run dev:desktop   # Tauri dev mode
```

---

## 🔀 Git Workflow

### Branch Naming
```
feat/[description]          New feature
fix/[description]           Bug fix
refactor/[description]      Code refactoring (no behavior change)
docs/[description]          Documentation
test/[description]          Tests only
perf/[description]          Performance optimization
chore/[description]         Tooling, dependencies, etc.
```

**Examples**:
- `feat/caixa-sangria-modal` — New sangria (withdraw) modal
- `fix/sync-replay-attack` — Fix HMAC nonce validation
- `docs/go-live-runbook` — Add deployment runbook
- `perf/reduce-bundle-size` — Optimize build output

### Commit Messages

Format: `type(scope): subject`

```
feat(caixa): adiciona modal de sangria

- Novo componente SangriaModal com validação de valor
- Integra com modal service do caixa
- Testes: 3 cases (valid amount, empty, negative)

Closes #123
```

**Rules**:
- Subject: max 50 chars, imperative mood ("add" not "added")
- Scope: workspace or feature area (`caixa`, `sync`, `fiscal`, etc.)
- Body: optional, max 72 chars per line
- Footer: `Closes #123` if fixes an issue
- No `Co-Authored-By` unless explicitly collaborative

### Pull Requests

1. **Create branch** from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make changes** with frequent commits:
   ```bash
   git commit -m "feat(scope): description"
   ```

3. **Push to GitHub**:
   ```bash
   git push origin feat/your-feature
   ```

4. **Open PR** on GitHub:
   - Title: same as commit subject
   - Description: what, why, testing
   - Link issues: "Closes #123"

5. **Get reviewed**: Code review required before merge

6. **Merge**: Squash or rebase (keep history clean)

---

## ✅ Code Review Checklist

### Before Requesting Review
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (new tests added)
- [ ] `npm run build` succeeds
- [ ] No console.log or debug code left
- [ ] Commit messages follow format
- [ ] No hardcoded secrets/credentials

### Reviewer Responsibilities
- [ ] Code does what PR claims
- [ ] Tests cover happy path + edge cases
- [ ] No regressions in related features
- [ ] Performance impact assessed
- [ ] Security implications reviewed
- [ ] Commit messages are clear

### Common Feedback
- **Simplification**: Can this be done more simply? (Three similar lines → abstract if pattern emerges)
- **Testing**: What happens if [edge case]?
- **Naming**: Is this name clear to someone unfamiliar?
- **Performance**: Will this scale to [expected volume]?

---

## 🧪 Testing Requirements

### Unit Tests (Vitest)
```bash
npm run test              # Run all tests
npm run test -- --watch  # Watch mode
npm run test -- --coverage
```

**Coverage Targets** (upcoming):
- Lines: 60%
- Branches: 40%
- Functions: 60%

**What to Test**:
- Business logic (pricing, inventory, sales)
- Error scenarios (invalid input, network failures)
- Edge cases (zero amounts, concurrent operations)

### E2E Tests (Playwright)
```bash
npm run test:e2e:critical     # Critical path tests
npx playwright test e2e/[file].spec.ts
npx playwright test --ui      # Interactive mode
```

**Critical Paths** (must pass):
- `caixa-venda.spec.ts` — Sale flow
- `caixa-fluxos-criticos.spec.ts` — Cash register cycle
- `sync-fluxo-gerente.spec.ts` — Desktop→Web sync

---

## 📐 Code Style

### TypeScript
- Strict mode enabled (`strict: true` in tsconfig)
- No `any` without good reason (use `unknown` then narrow)
- Use explicit types for function signatures
- Prefer `const` over `let`

### Naming Conventions
- Components: PascalCase (`CaixaModal.tsx`)
- Utilities: camelCase (`calculatePriceWithDiscount()`)
- Constants: UPPER_SNAKE_CASE (`MAX_DISCOUNT_PERCENT`)
- Private methods: `_prefixed` (if needed)

### React Patterns
- Functional components only (no class components)
- Hooks for state management
- Avoid prop drilling (use Context for app-wide state)
- Memo components sparingly (measure first)

### Database
- Snake_case for column names (`venda_id`, `total_bruto`)
- Plural table names (`vendas`, `itens`, `usuarios`)
- Foreign keys: `[table]_id` format
- Timestamps: `created_at`, `updated_at` (UTC timezone)

---

## 🚀 Release & Deployment

### Version Bumping
- Semantic versioning: MAJOR.MINOR.PATCH
- Update version in `package.json`
- Create git tag: `v1.2.3`

### Pre-Deployment Checklist
```bash
npm run pre-deploy:check  # Automated validation
npm run test              # All tests pass
npm run lint              # No linting errors
npm run build             # Production build succeeds
```

### Deployment Process
1. Merge PR to `main`
2. Tag release: `git tag v1.2.3 && git push --tags`
3. Vercel auto-deploys on push to main
4. Execute POST-DEPLOY-MONITORING.md checklist
5. Monitor Sentry dashboard for 24h

See `docs/GO-LIVE-RUNBOOK.md` for detailed deployment procedures.

---

## 📚 Documentation

### When to Write Docs
- New features or APIs
- Architecture decisions (novo arquivo em `docs/adr/`)
- Runbooks for operational procedures
- Setup/onboarding guides

### Where Docs Live
- `/docs/*.md` — Operational guides, runbooks, architecture
- Workspace READMEs — Development guides per workspace
- Code comments — **Only** for non-obvious WHY (not WHAT)
- Git commits — Link to issues/decisions

### Comment Rules
- No comments explaining WHAT (code should be self-explanatory)
- DO comment on WHY (hidden constraints, trade-offs, workarounds)
- NO multi-line comment blocks (prefer inline)
- Example: `// Ensure sync nonce is UUID to prevent injection attacks`

---

## 🐛 Debugging & Troubleshooting

### Local Development
```bash
# Start with logging
DEBUG=* npm run dev:web

# VS Code: Open Run & Debug, select "Chrome"
# Chrome DevTools for React inspection
# React DevTools browser extension recommended
```

### Production Issues
1. Check Sentry dashboard: https://sentry.io/projects/fastproduct/
2. Check Vercel logs: https://vercel.com/jinlong/pdv-importados
3. Check database: Supabase dashboard → Logs tab
4. Check sync health: Review `sync_request_nonces` table for replay attacks

See `docs/GO-LIVE-RUNBOOK.md` for incident response procedures.

---

## ❓ Questions?

- **Technical architecture**: Check `/docs/ARCHITECTURE.md`
- **Decision rationale**: Check `/docs/adr/`
- **Deployment**: Check `/docs/GO-LIVE-RUNBOOK.md`
- **Team comms**: Slack #fastproduct or #engineering

---

## 📋 Contributor License Agreement

By contributing, you agree that:
- Your contribution is original work
- You have permission to contribute
- The contribution is licensed under the project's license

---

**Last Updated**: Jul 23, 2026  
**Maintainer**: @tech-lead  
**Questions?** Open an issue or ask in Slack
