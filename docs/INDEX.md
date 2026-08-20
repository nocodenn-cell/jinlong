# Documentation Index — FastProduct

Welcome to the fastproduct documentation hub. Find guides for development, operations, and system architecture.

---

## 🚀 Quick Start

**New to fastproduct?**
- Start: [`README.md`](../README.md) (root level)
- Develop: [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- Deploy: [`go-live/00-README.md`](./go-live/00-README.md) — **fonte canônica**

**Key URLs**:
- **Web App**: https://pdv-importados.vercel.app
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
| [go-live/](./go-live/00-README.md) | **CANÔNICO** — plano completo de Go-Live: pré-requisitos, deploy, validação, dia do GO, pós, onboarding, troubleshooting | Ops, release manager |
| [go-live/CHECKLIST-FINAL.md](./go-live/CHECKLIST-FINAL.md) | Checklist para imprimir, com assinaturas | Ops, dono |
| ~~[GO-LIVE-RUNBOOK.md](./GO-LIVE-RUNBOOK.md)~~ | ⛔ **DEPRECIADO em 2026-08-17 — depreciação COMPLETA.** Todo o conteúdo útil foi portado para `go-live/` com as correções. Mantido apenas como registro histórico; **não consultar** | — |
| [GO_LIVE_CERTIFICATION_REPORT.md](../GO_LIVE_CERTIFICATION_REPORT.md) | **Canônico** — certificação GO 2026-08-09 + evidências | Release manager, CTO |
| [GO_LIVE_EXECUTIVO_RESUMO.md](../GO_LIVE_EXECUTIVO_RESUMO.md) | **Canônico** — decisão executiva PRONTO PARA GO-LIVE | Dono, CTO |
| [GO_LIVE_STATUS_ATUAL.md](./GO_LIVE_STATUS_ATUAL.md) | Snapshot curto do status (aponta aos canônicos) | Todos |
| [GO_LIVE_STATUS_FINAL.md](./GO_LIVE_STATUS_FINAL.md) | **Passo 7** — snapshot final READY FOR GO-LIVE + gates | Release manager, CTO |
| [POST-DEPLOY-MONITORING.md](./POST-DEPLOY-MONITORING.md) | Monitoring checklist, alert thresholds, 24h post-launch | Ops, on-call engineer |
| [FASE_6_GATE_FINANCEIRO_VALIDACAO.md](./FASE_6_GATE_FINANCEIRO_VALIDACAO.md) | **Fase 6 (bloco financeiro)** — gate 6/6 reproduzível do zero, achado de RLS, pendências e recomendação sobre a janela crítica | Release manager, backend, CTO |
| [STATUS_PROJETO_PRE_TREINAMENTO.md](./STATUS_PROJETO_PRE_TREINAMENTO.md) | **Consolidado pré-treinamento cliente #1** — status geral, pendências priorizadas, riscos, recomendação final | Dono, CTO, release manager |
| [ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md](./ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md) | Teste ao vivo dos 5 recibos de impressão (venda, suprimento, sangria, fechamento, devolução) | QA, backend |
| [TESTE_ATACADO_VAREJO_2026-08-20.md](./TESTE_ATACADO_VAREJO_2026-08-20.md) | Teste de preço atacado/varejo, múltiplas faixas, paridade online×offline | QA, backend |
| [DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md](./DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md) | Bug de reembolso/estoque duplicados no cancelamento pós-devolução — achado, correção e evidência de teste | Backend, release manager |
| [COMUNICADO_PROMOCOES_AUTOMATICAS.md](./COMUNICADO_PROMOCOES_AUTOMATICAS.md) | Alinhamento de expectativa: promoções automáticas ainda não existem | Comercial, implantação |

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
1. Read: [`go-live/00-README.md`](./go-live/00-README.md) → [`01-pre-requisitos.md`](./go-live/01-pre-requisitos.md)
2. Validate: [`06-validacao-pre-go-live.md`](./go-live/06-validacao-pre-go-live.md)
3. Execute: [`07-go-live-day.md`](./go-live/07-go-live-day.md) — **deploy coordenado banco↔app, loja fechada**
4. Monitor: [`08-pos-go-live.md`](./go-live/08-pos-go-live.md)

### "There's an error in production"
1. Check: `https://sentry.io/projects/fastproduct/`
2. Read: `POST-DEPLOY-MONITORING.md` (escalation guide)
3. Diagnose: [`go-live/10-troubleshooting.md`](./go-live/10-troubleshooting.md) · Edge logs, database logs, browser console
4. Rollback: [`go-live/07-go-live-day.md`](./go-live/07-go-live-day.md) §4 — ⚠️ **nunca reverter só a aplicação**

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
- [`go-live/`](./go-live/00-README.md) — **Plano canônico de Go-Live** (12 documentos)
- ~~[`GO-LIVE-RUNBOOK.md`](./GO-LIVE-RUNBOOK.md)~~ — ⛔ depreciado, ver `go-live/`
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
- [`go-live/`](./go-live/00-README.md) → **Plano canônico de Go-Live**
- `POST-DEPLOY-MONITORING.md` → Monitoring template
- `ARCHITECTURE.md` → "Deployment & Release"

### Data & Database
- `ARCHITECTURE.md` → "Core Data Flows"
- `backend/README.md` → Database schema
- `adr/` → fronteiras de domínio; `ARCHITECTURE.md` → Sync via HMAC + Outbox

### Testing
- `CONTRIBUTING.md` → "Testing Requirements"
- [`go-live/06-validacao-pre-go-live.md`](./go-live/06-validacao-pre-go-live.md) → sequência completa de validação e os **7 smoke tests** (§3.1)
- `pdv-importados/e2e/README.md` → E2E setup

### Performance & Monitoring
- `POST-DEPLOY-MONITORING.md` → Metrics & thresholds
- `ARCHITECTURE.md` → "Observability"
- [`go-live/08-pos-go-live.md`](./go-live/08-pos-go-live.md) → monitoramento, **Sentry** (§2.6), **limiares de alerta** (§2.7), escalonamento (§6), post-mortem (§7)

---

## 🤔 FAQ

### Q: Which workspace should I put my code in?
**A**: See `CONTRIBUTING.md` → "Monorepo Structure" (rule of thumb: most specific workspace possible, shared-core only for genuine reuse)

### Q: How do I get my PR reviewed?
**A**: Commits must follow format in `CONTRIBUTING.md`. `.github/CODEOWNERS` auto-assigns reviewers based on changed paths.

### Q: What's the sync architecture?
**A**: See `ARCHITECTURE.md` → "Sync Mechanism (HMAC + Outbox)"

### Q: What do I do if production is down?
**A**: [`go-live/10-troubleshooting.md`](./go-live/10-troubleshooting.md) para o sintoma, e
[`go-live/07-go-live-day.md`](./go-live/07-go-live-day.md) §4 para o rollback.
⚠️ **Não** siga o "Rollback Procedure" do `GO-LIVE-RUNBOOK.md`: reverter só a aplicação derruba
AR/AP para toda a base.

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
- go-live/ (canônico): Aug 17, 2026
- GO-LIVE-RUNBOOK.md: Jul 23, 2026 — ⛔ depreciado em Aug 17, 2026
- POST-DEPLOY-MONITORING.md: Jul 23, 2026

### Update Schedule
- **CONTRIBUTING.md**: Update when standards change
- **ARCHITECTURE.md**: Update on major design changes
- **docs/adr/**: Novo arquivo por decisão (numeração contínua)
- **docs/go-live/**: Atualizar antes de cada implantação de cliente
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
| How do I deploy? | [go-live/00-README.md](./go-live/00-README.md) |
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
- [ ] Have [`go-live/CHECKLIST-FINAL.md`](./go-live/CHECKLIST-FINAL.md) handy
- [ ] Alert team in Slack
- [ ] Have on-call engineer available

### After Deploying
- [ ] Execute os **7 smoke tests** de [`go-live/06-validacao-pre-go-live.md`](./go-live/06-validacao-pre-go-live.md) §3.1
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
- Next: [`go-live/00-README.md`](./go-live/00-README.md) (plano canônico de Go-Live)
