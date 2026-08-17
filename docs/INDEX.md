# Documentation Index — FastProduct

Welcome to the fastproduct documentation hub. Find guides for development, operations, and system architecture.

---

## 🚀 Quick Start

**New to fastproduct?**
- Start: [`README.md`](../README.md) (root level)
- Develop: [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- Deploy: [`GO-LIVE-RUNBOOK.md`](./GO-LIVE-RUNBOOK.md)

**Key URLs**:
- **Web App**: https://fastproduct.vercel.app
- **Sentry**: https://sentry.io/projects/fastproduct/
- **Vercel**: https://vercel.com/jinlong/pdv-importados
- **Supabase**: https://supabase.com/dashboard

---

## 📚 Documentation Map

- [**Go-Live — Primeiro Cliente Pagante**](./go-live/00-README.md) — plano completo com 12 documentos, checklists e troubleshooting

### **👨‍💻 For Developers**

| Document | Purpose | Audience |
|----------|---------|----------|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Development standards, git workflow, code review | All engineers |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flows, security model | Architects, senior engineers |
| [adr/](./adr/) | **ADRs vigentes** (ADR-005…011 + ADR-PDV, ADR-CAIXA) | Architects, leads |
| [contracts/v1/](./contracts/v1/) | Contratos de RPC versionados | Architects, backend |

### **🚀 For Operations & Deployment**

| Document | Purpose | Audience |
|----------|---------|----------|
| [GO-LIVE-RUNBOOK.md](./GO-LIVE-RUNBOOK.md) | Production deployment procedures, smoke tests, rollback | Ops, release manager |
| [GO_LIVE_CERTIFICATION_REPORT.md](../GO_LIVE_CERTIFICATION_REPORT.md) | **Canônico** — certificação GO 2026-08-09 + evidências | Release manager, CTO |
| [GO_LIVE_EXECUTIVO_RESUMO.md](../GO_LIVE_EXECUTIVO_RESUMO.md) | **Canônico** — decisão executiva PRONTO PARA GO-LIVE | Dono, CTO |
| [GO_LIVE_STATUS_ATUAL.md](./GO_LIVE_STATUS_ATUAL.md) | Snapshot curto do status (aponta aos canônicos) | Todos |
| [GO_LIVE_STATUS_FINAL.md](./GO_LIVE_STATUS_FINAL.md) | **Passo 7** — snapshot final READY FOR GO-LIVE + gates | Release manager, CTO |
| [POST-DEPLOY-MONITORING.md](./POST-DEPLOY-MONITORING.md) | Monitoring checklist, alert thresholds, 24h post-launch | Ops, on-call engineer |

### **🏗️ For Workspace Setup**

Each workspace has its own README:

- **pdv-importados** (Next.js): [`pdv-importados/README.md`](../pdv-importados/README.md)
- **pdv-local** (Tauri): [`pdv-local/README.md`](../pdv-local/README.md)
- **backend** (Supabase): [`backend/README.md`](../backend/README.md)
- **shared-core** (Business logic): `shared-core/` — sem README próprio; ver `shared-core/src/`

---

## 🎯 Common Tasks

### "I want to add a new feature"
1. Read: `CONTRIBUTING.md` (branch naming, testing)
2. Implement in appropriate workspace
3. Write tests (unit + E2E if UI-facing)
4. Open PR, get reviewed

### "I need to deploy to production"
1. Read: `GO-LIVE-RUNBOOK.md` (pre-deploy checklist)
2. Run: `npm run pre-deploy:check`
3. Execute: Smoke tests (7 tests, 24 min)
4. Monitor: Post-deployment for 24h

### "There's an error in production"
1. Check: `https://sentry.io/projects/fastproduct/`
2. Read: `POST-DEPLOY-MONITORING.md` (escalation guide)
3. Diagnose: Edge logs, database logs, browser console
4. Rollback: See `GO-LIVE-RUNBOOK.md` → Rollback Procedure

### "What was the reasoning behind [decision]?"
1. Read: `ARCHITECTURE.md` (high-level)
2. Search: `docs/adr/` (ADRs vigentes)
3. Check: Git commit messages (linked to issues)

### "How do I set up my dev environment?"
1. Root: `README.md` (prerequisites, npm install)
2. Workspace: Specific README (`pdv-importados/README.md`, etc.)
3. Docs: Workspace-specific setup guides

---

## 📖 Full Document List

### Root Level
- [`README.md`](../README.md) — Project overview, quick start
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — Development standards
- [`package.json`](../package.json) — Scripts, dependencies
- [`.github/CODEOWNERS`](../.github/CODEOWNERS) — Code review assignments

### Docs Directory (`/docs`)
- `INDEX.md` ← **You are here**
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System design, data flows
- [`adr/`](./adr/) — Architectural decisions (ADRs) vigentes
- [`GO-LIVE-RUNBOOK.md`](./GO-LIVE-RUNBOOK.md) — Deployment procedures
- [`POST-DEPLOY-MONITORING.md`](./POST-DEPLOY-MONITORING.md) — Monitoring checklist
- [`AUTHORIZATION_MATRIX.md`](./AUTHORIZATION_MATRIX.md) — Modelo de autorização / RLS por recurso e RPC

### Workspace READMEs
- [`pdv-importados/README.md`](../pdv-importados/README.md) — Next.js web app
- [`pdv-local/README.md`](../pdv-local/README.md) — Tauri desktop app
- [`backend/README.md`](../backend/README.md) — Supabase setup
- `shared-core/src/` — Business logic library (sem README próprio)

### Configuration
- [`next.config.js`](../pdv-importados/next.config.js) — Next.js build config
- [`vitest.config.ts`](../pdv-importados/vitest.config.ts) — Test setup
- [`playwright.config.ts`](../pdv-importados/playwright.config.ts) — E2E setup
- [`.env.example`](../.env.example) — Environment variable template

---

## 🔍 Search by Topic

### Authentication & Security
- `ARCHITECTURE.md` → "Security Architecture"
- `CONTRIBUTING.md` → "Code Review Checklist"
- `.github/CODEOWNERS` → Path-based reviewers

### Deployment & Infrastructure
- `GO-LIVE-RUNBOOK.md` → Full deployment guide
- `POST-DEPLOY-MONITORING.md` → Monitoring template
- `ARCHITECTURE.md` → "Deployment & Release"

### Data & Database
- `ARCHITECTURE.md` → "Core Data Flows"
- `backend/README.md` → Database schema
- `adr/` → fronteiras de domínio; `ARCHITECTURE.md` → Sync via HMAC + Outbox

### Testing
- `CONTRIBUTING.md` → "Testing Requirements"
- `GO-LIVE-RUNBOOK.md` → "7 Smoke Tests"
- `pdv-importados/e2e/README.md` → E2E setup

### Performance & Monitoring
- `POST-DEPLOY-MONITORING.md` → Metrics & thresholds
- `ARCHITECTURE.md` → "Observability"
- `GO-LIVE-RUNBOOK.md` → "Alert Thresholds"

---

## 🤔 FAQ

### Q: Which workspace should I put my code in?
**A**: See `CONTRIBUTING.md` → "Monorepo Structure" (rule of thumb: most specific workspace possible, shared-core only for genuine reuse)

### Q: How do I get my PR reviewed?
**A**: Commits must follow format in `CONTRIBUTING.md`. `.github/CODEOWNERS` auto-assigns reviewers based on changed paths.

### Q: What's the sync architecture?
**A**: See `ARCHITECTURE.md` → "Sync Mechanism (HMAC + Outbox)"

### Q: What do I do if production is down?
**A**: Follow `GO-LIVE-RUNBOOK.md` → "Rollback Procedure" (section on critical failures)

### Q: How do I monitor after deploying?
**A**: Use `POST-DEPLOY-MONITORING.md` checklist (30min health checks, hourly review, daily recap)

### Q: Where's the database schema?
**A**: See `backend/README.md` and Supabase dashboard (project → SQL Editor)

---

## 📅 Document Maintenance

### Last Updated
- INDEX.md (this file): Jul 23, 2026
- CONTRIBUTING.md: Jul 23, 2026
- ARCHITECTURE.md: Jul 23, 2026
- GO-LIVE-RUNBOOK.md: Jul 23, 2026
- POST-DEPLOY-MONITORING.md: Jul 23, 2026

### Update Schedule
- **CONTRIBUTING.md**: Update when standards change
- **ARCHITECTURE.md**: Update on major design changes
- **docs/adr/**: Novo arquivo por decisão (numeração contínua)
- **GO-LIVE-RUNBOOK.md**: Update before each deployment
- **POST-DEPLOY-MONITORING.md**: Update based on lessons learned

### How to Contribute Documentation
1. Follow `CONTRIBUTING.md` workflow (branch, commit, PR)
2. Update relevant `.md` file(s)
3. Update `INDEX.md` if adding new document
4. Get review from @tech-lead
5. Merge to main

---

## 🔗 External Links

- **GitHub Issues**: https://github.com/nocodenn-cell/fastproduct/issues
- **GitHub Discussions**: https://github.com/nocodenn-cell/fastproduct/discussions
- **Slack**: #fastproduct (internal team only)
- **Sentry Dashboard**: https://sentry.io/projects/fastproduct/
- **Vercel Dashboard**: https://vercel.com/jinlong/pdv-importados
- **Supabase Dashboard**: https://supabase.com/dashboard

---

## 📞 Getting Help

| Question | Where to Go |
|----------|-------------|
| How do I [technical thing]? | Check CONTRIBUTING.md or workspace README |
| Why was [decision] made? | Check `docs/adr/` (ADRs) |
| How do I deploy? | GO-LIVE-RUNBOOK.md |
| What do I monitor after deploy? | POST-DEPLOY-MONITORING.md |
| Who reviews my PR? | .github/CODEOWNERS (auto-assigned) |
| System design discussion | GitHub Discussions or Slack |
| Bug report | GitHub Issues |

---

## 📋 Checklists

### Before Committing
- [ ] Read `CONTRIBUTING.md` → Git Workflow
- [ ] Run `npm run lint`, `npm run test`, `npm run build` (locally)
- [ ] Write tests for new code
- [ ] Follow commit message format

### Before Deploying
- [ ] Run `npm run pre-deploy:check`
- [ ] Have `GO-LIVE-RUNBOOK.md` handy
- [ ] Alert team in Slack
- [ ] Have on-call engineer available

### After Deploying
- [ ] Execute 7 smoke tests from `GO-LIVE-RUNBOOK.md`
- [ ] Monitor using `POST-DEPLOY-MONITORING.md` (24h)
- [ ] Check Sentry for unexpected errors
- [ ] Gather team feedback

---

**Welcome to fastproduct! 🚀**

*For questions or suggestions about documentation, open an issue or contact the tech lead.*

---

**Navigation**:
- Up: [`README.md`](../README.md) (project root)
- Related: [`CONTRIBUTING.md`](../CONTRIBUTING.md) (development standards)
- Next: [`GO-LIVE-RUNBOOK.md`](./GO-LIVE-RUNBOOK.md) (deployment procedures)
