# 06 — Roadmap

> Prioridades verificadas contra `docs/FEATURE_FREEZE_PILOTO.md` e código.
> **2026-08-27:** sprint proposta = estabilização operacional (`docs/piloto-d0/PROXIMA_SPRINT.md`).
> Fiscal Focus e WhatsApp **não** furam a fila.
> [[00_DASHBOARD_PROJETO]] · [[02_ESTADO_ATUAL]] · [[09_OPERACAO_PRIMEIRO_CLIENTE]]

---

## ✅ Concluído

### Core PDV
- [x] Carrinho varejo/atacado automático
- [x] Finalização RPC canônica v4 idempotente
- [x] Split pagamento (2–3 formas)
- [x] Cancelamento com estorno estoque
- [x] Caixa: abertura, sangria, fechamento cego/atômico
- [x] Desconto gerente com token + rate limit
- [x] Pipeline scan bip (`useCaixaScanPipeline`)
- [x] Anti-fraude preço (servidor)
- [x] Diagnóstico pré-produção PDV (`5ce33a6d`, migration `256`)

### Cadastro e Estoque
- [x] CRUD produto SSoT `/admin/catalogo`
- [x] Estoque por loja + transferência + kardex
- [x] Import NF-e de compra
- [x] Guard margem negativa

### Admin e Segurança
- [x] Consolidação admin SSoT (`88f2e64a`)
- [x] Auth + RLS completo
- [x] Anti-replay HMAC desktop
- [x] Bloqueio RPCs v2/v3
- [x] GRANT baseline capturado (`255_grant_baseline…`)

### Financeiro
- [x] Contas a receber em `/admin/financeiro`
- [x] Contas a pagar em `/admin/financeiro?tab=pagar`
- [x] Aba fiscal

### Desktop
- [x] PDV offline Tauri + outbox sync
- [x] DLQ com UI reprocessamento

### Qualidade
- [x] CI lint + Vitest + build
- [x] SSRA pós-deploy
- [x] ARIA Fase 3.1
- [x] i18n PT/ZH manual

---

## 🔄 Em Andamento

| Item | Prioridade | Evidência | Bloqueador? |
|---|---|---|---|
| Estabilização operacional (proposta) | P0 | `docs/piloto-d0/PROXIMA_SPRINT.md` | Não iniciada |
| Smoke na máquina da cliente | P0 | EXT-D0-004 | Acesso loja |
| Backup + restore ensaiado | P0 | D0-06 | Projeto temporário |
| P0 Checklist T1–T12 como NO-GO | — | julho | **OBSOLETO** para `e1327e62` |
| Reconciliar migration 255 duplicada | — | ADR-011 | **SUPERSEDED** como bloqueador de release |

---

## 📌 Próximo (pós go-live imediato)

| Item | Prioridade | Dependência |
|---|---|---|
| Sign-off ADR-PDV-001 | P1 | Nenhuma |
| Documentar `MATRIZ_OFFLINE_PDV.md` | P1 | Nenhuma |
| E2E mutadores gerente (Playwright) | P1 | Staging estável |
| RPC única devolução/troca pós-venda | P1 | Migration `048` |
| Acessibilidade ARIA Fase 3.2 | P1 | Fase 3.1 concluída |
| Auditoria arredondamento (`roundAbnt`) | P1 | Nenhuma |

---

## 🔮 Futuro (congelado — Feature Freeze)

### P2 — Expansão pós-1º cliente estável
- [ ] NFC-e Focus real (`docs/CHECKLIST_ATIVACAO_FOCUS_1_DIA.md`)
- [ ] Bling adapter fiscal
- [ ] Kardex avançado (painel + export + materialized view)
- [ ] Unificação tokens design system
- [ ] Observabilidade desktop (métricas Tauri)
- [ ] Sentry/APM produção

### P3 — Longo prazo
- [ ] Venda em espera — completar hardening (`TODO_auditoria_255.md`)
- [ ] Auto-update Tauri
- [ ] Multi-loja / filiais
- [ ] Conciliação bancária
- [ ] Programa fidelidade / CRM
- [ ] Desconto por cupom/voucher

---

## P0 Detalhado — Bloqueadores 1º Cliente

### P0.1 — Checklist Operacional
- Trilha T1–T12 de `docs/P0_CHECKLIST_OPERACIONAL.md`
- `migration list` sem lacunas
- `p0-migration-status.mjs` → ALINHADO
- `verify_p0_producao.sql` + migration `256`

### P0.2 — Financeiro
- ~~Contas a pagar rota gerente~~ → **Concluído** em `/admin/financeiro?tab=pagar`
- Validar fluxo pagar em staging

### P0.3 — Onboarding
- Criar loja, usuários OPERADOR/GERENTE/DONO
- Seed catálogo mínimo
- Validar caixa ao vivo

### P0.4 — Homologação
- Evidências em `docs/CHECKLIST_P0_STAGING.md`
- `docs/DONE_DEFINITION_PILOTO.md` §4.3 e §7

---

## O Que NÃO Entra (Feature Freeze OUT)

| Item | Motivo |
|---|---|
| Novas features ERP | Freeze formal |
| Refatoração núcleo `finalizar_venda_*` | v4 suficiente |
| Redesign visual completo | Congelado |
| Squash migrations | Só reconcile piloto |
| Fiscal Focus sem checklist | Congelado |

---

> Sprint imediata: [[Próxima Sprint]] · Backlog: [[Backlog]] · Legado: [[Roadmap]]
