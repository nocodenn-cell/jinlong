# 📊 Dashboard Executivo — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[00_DASHBOARD_PROJETO]] (2026-07-10)
> Última atualização: 2026-07-10 | [[Home]]

---

## Estado Atual

| Sistema | Status | Observação |
|---|---|---|
| **Produção (Vercel)** | 🟢 Deploy ativo | Branch `main` → Vercel auto-deploy |
| **Build (CI)** | 🟢 Passando | Lint + Vitest + Next build no PR |
| **Deploy (pipeline)** | 🟢 Funcional | SSRA pós-deploy + `/api/health` |
| **Banco (Supabase)** | 🟡 Pré-piloto | 187+ migrations; drift histórico capturado em `255`; migration `256` (diagnóstico) local |
| **PDV (web)** | 🟢 Piloto-ready* | Fluxo normal validado; diagnóstico pré-produção entregue (*ambiente alvo pendente) |
| **PDV (desktop)** | 🟢 Completo | Tauri 2 + SQLite + sync outbox |
| **Cadastro Produto** | 🟢 Completo | CRUD + imagens + fiscal + tiers atacado |
| **Estoque** | 🟡 Parcial | Kardex avançado + devolução pós-venda pendentes |
| **Financeiro** | 🟡 Parcial | `/admin/financeiro` unificado; contas a pagar gerente em andamento |
| **Admin v2** | 🟢 Consolidação | SSoT entidades (`88f2e64a`) + `/admin/diagnostico-caixa` |
| **Fiscal** | 🟡 Parcial | Fila implementada; NFC-e Focus real **pendente** |
| **Auditoria** | 🟢 Completo | Ledger de eventos + trilha no kardex |
| **Design System** | 🟡 Parcial | Tokens `--fp-*` definidos; inconsistências ainda existem |
| **Permissões (RLS)** | 🟢 Completo | Todas as tabelas com RLS + matrix documentada |

---

## ⚠️ Atenção Hoje

1. **Feature Freeze ativo** — nenhuma nova feature entra sem aprovação explícita do sponsor. Foco: pilotar 1º cliente.
2. **Checklist pré-produção PDV** — executar `/admin/diagnostico-caixa` ou `verify_p0_producao.sql` no Supabase do ambiente alvo antes do go-live.
3. **P0 Checklist T1–T12** não foi completamente verificado em produção — `docs/P0_CHECKLIST_OPERACIONAL.md`.
4. **Migration drift** — Migration 255 documenta GRANT aplicado manualmente; ambientes novos precisam `255` + `256`.
5. **Smoke de venda real** — pendente no ambiente alvo (operador → `/caixa` → admin vendas).
6. **Fiscal Focus** não está contratado para D0 do piloto — confirmar com cliente antes de ativar.

---

## 🚧 Bloqueadores

| Bloqueador | Impacto | Responsável |
|---|---|---|
| NFC-e Focus real não configurado | Piloto sem nota fiscal eletrônica | Time + cliente |
| P0 Checklist T1–T12 incompleto | Não apto para produção real | Dev ops |
| ADR-PDV-001 sem sign-off | Governança de pipeline bip informal | Tech lead |
| Matriz offline web × desktop não documentada (`MATRIZ_OFFLINE_PDV.md` ausente) | Risco operacional em queda de rede | Time |
| Venda em Espera (hardening) | RPCs `255` existem; E2E/RLS pendentes | Time (congelado) |

---

## 📋 Últimas Decisões

| Data | Decisão | Arquivo |
|---|---|---|
| 2026-07-10 | Diagnóstico pré-produção PDV como gate de piloto | `256_pdv_diagnostico_pre_producao.sql`, `/admin/diagnostico-caixa` |
| 2026-07-10 | `VendaCancelarModal` exige `VendaListRow` — mapear na tabela, não passar `VendaLinha` cru | `VendasTable.tsx` |
| 2026-07-09 | Consolidação admin com SSoT de entidades (produto, cliente, estoque) | commit `88f2e64a` |
| 2026-07-08 | Feature Freeze até encerrar Fase 4 (1º cliente) | `docs/FEATURE_FREEZE_PILOTO.md` |
| 2026-07-08 | Canal do piloto = **web only** (sem desktop no D0) | `docs/FEATURE_FREEZE_PILOTO.md` |
| 2026-07-08 | Fiscal = mock/stub no D0, NFC-e Focus só se contrato exigir | `docs/FEATURE_FREEZE_PILOTO.md` |
| Recente | Bloquear overloads legados v2/v3 de `finalizar_venda` | migrations `20260619…`/`20260620…` |
| Recente | RPC canônica v4 como padrão de finalização | migration `243` |
| Recente | Fonte única de `variantesChaveLeitura` em `shared-core` | `shared-core/src/caixa/` |
| Recente | GRANT baseline capturado em migration (não mais só no dashboard) | migration `255` |

---

## 🎯 Próximas Entregas

| # | Entrega | Prioridade | Status |
|---|---|---|---|
| 1 | Executar P0 Checklist T1–T12 em staging | P0 | 🔴 Pendente |
| 2 | Contas a pagar (rota gerente) | P0 piloto | 🟡 Em andamento |
| 3 | Onboarding (loja + usuários + seed) para 1º cliente | P0 piloto | 🔴 Pendente |
| 4 | Homologação com evidência (staging → prod) | P0 piloto | 🔴 Pendente |
| 5 | Sign-off ADR-PDV-001 | P1 | 🔴 Pendente |
| 6 | Documentar MATRIZ_OFFLINE_PDV.md | P1 | 🔴 Pendente |
| 7 | Fiscal Focus (NFC-e real) | P2 | 🔴 Congelado |
| 8 | Venda em Espera (completar hardening) | P3 | 🟡 Parcial |

---

> Ver detalhes em [[Roadmap]] · [[Backlog]] · [[Próxima Sprint]]
