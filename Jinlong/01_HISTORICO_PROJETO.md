# 01 — Histórico do Projeto

> Linha do tempo reconstruída a partir de migrations, commits Git e documentação existente.
> [[00_DASHBOARD_PROJETO]] · [[99_LOG_ATUALIZACOES]]

---

## Marcos Principais

| Data | Marco | Evidência |
|---|---|---|
| 2026-01 | MVP inicial — schema, auth, caixa web | `migrations/001_schema_inicial.sql`, `app/caixa/` |
| 2026-01/02 | Painel gerente + relatórios básicos | `app/gerente/`, migrations `011-013` |
| 2026-02 | Sync desktop + anti-replay HMAC | `migrations/024`, Edge `sync-outbox` |
| 2026-02 | RPC canônica v2 de finalização | `migrations/025` |
| 2026-03 | Motor de preço atacado (tiers) | `migrations/033`, `076`, `077` |
| 2026-03 | Anti-fraude de preço no servidor | `migrations/123`, `234` |
| 2026-03 | Fiscal — fila + worker | `migrations/062`, `fiscal-worker/` |
| 2026-04 | Estoque por loja + transferência | `migrations/032`, `034`, `082`, `094` |
| 2026-04 | Split de pagamento (2–3 formas) | `migrations/051-053`, E2E |
| 2026-04 | Idempotência de vendas | `migrations/061`, `20260419013345` |
| 2026-04 | Guard de margem negativa | `migrations/124`, `125` |
| 2026-05 | Acessibilidade ARIA Fase 3.1 | `FASE_3_EXECUTIVE_SUMMARY.md` |
| 2026-05-12 | ADR-PDV-001 proposto | `docs/adr/ADR-PDV-centro-de-gravidade.md` |
| 2026-06 | Painel Admin v2 (13 rotas) | `pdv-importados/app/admin/` |
| 2026-06 | RPC canônica v4 + bloqueio v2/v3 | `migrations/243`, `20260619…`, `20260620…` |
| 2026-06 | GRANT baseline capturado | `migrations/255_grant_baseline_tabelas_authenticated.sql` |
| 2026-06 | Pricing version governance | `migrations/249`, `250`, `254` |
| 2026-07-03 | Confirmação drift GRANT em produção | Comentário em migration `255_grant_baseline…` |
| 2026-07-08 | Feature Freeze piloto 1º cliente | `docs/FEATURE_FREEZE_PILOTO.md` |
| 2026-07-08 | Governança PMO | `docs/GOVERNANCA_PMO_JINLONG.md` |
| 2026-07-08 | RPC canônica v4 documentada | `migrations/243_finalizar_venda_canonica_v4_captura.sql` |
| 2026-07-09 | Consolidação admin + SSoT entidades | `88f2e64a` |
| 2026-07-10 | Diagnóstico pré-produção PDV | `5ce33a6d`, migration `256` |
| 2026-07-10 | Reestruturação Home MD (Obsidian) | `f2fca536` |

---

## Commits Relevantes (Git)

| Hash | Data | Mensagem | Impacto |
|---|---|---|---|
| `88f2e64a` | 2026-07-09 | `feat: consolidate admin screens and enforce domain ssot` | SSoT produto/cliente/estoque; vendas admin com cancelamento |
| `5ce33a6d` | 2026-07-10 | `feat(pdv): adiciona diagnóstico pré-produção do caixa` | Migration `256`, `/admin/diagnostico-caixa`, CLI |
| `f2fca536` | 2026-07-10 | `fix(admin): resolve VendasTable merge, typecheck diagnóstico e docs Jinlong` | Merge conflitos; typecheck; docs Obsidian |
| `e6d40de3` | 2026-06 | `feat(release): SSRA gate + E2E como sistema de risco` | Gate pós-deploy com `/api/health` |
| `4a594af5` | 2026-06 | `feat(admin): unify Admin V2 dark cockpit` | Consolidação visual admin |

---

## Grandes Mudanças Arquiteturais

### 1. Monorepo com `shared-core` (2026-01)
- Domínio puro compartilhado entre web e desktop
- Ver [[07_DECISOES_ARQUITETURAIS#DEC-001]] e [[07_DECISOES_ARQUITETURAIS#DEC-012]]

### 2. Supabase como único backend (2026-01)
- PostgreSQL + Auth + RLS + PostgREST + Edge Functions
- Ver [[07_DECISOES_ARQUITETURAIS#DEC-002]]

### 3. RPC canônica v4 como padrão (2026-06/07)
- Evolução: v1 (legada desktop) → v2 → v3 → **v4** (padrão)
- v2/v3 bloqueadas para `authenticated`
- Ver [[07_DECISOES_ARQUITETURAIS#DEC-006]]

### 4. Consolidação Admin v2 + SSoT (2026-06/07)
- Telas oficiais: `/admin/catalogo`, `/admin/clientes`, `/admin/estoque`, etc.
- Regra documentada em `.cursor/rules/entity-ssot.mdc`
- Commit `88f2e64a`

### 5. Feature Freeze para piloto (2026-07-08)
- Canal D0 = web only; fiscal mock; sem desktop
- Ver [[07_DECISOES_ARQUITETURAIS#DEC-010]] e [[07_DECISOES_ARQUITETURAIS#DEC-013]]

### 6. Financeiro unificado no admin (2026-07)
- `/admin/financeiro` com abas receber / pagar / fiscal
- Rota legada `/gerente/financeiro/contas-pagar` → redirect

---

## Principais Decisões (resumo)

| ID | Decisão | Data |
|---|---|---|
| DEC-001 | Monorepo npm workspaces + Turborepo | 2026-01 |
| DEC-002 | Supabase como backend | 2026-01 |
| DEC-004 | PDV desktop Tauri 2 + SQLite | 2026-01 |
| DEC-005 | Sync outbox HMAC + nonce | 2026-02 |
| DEC-006 | RPC canônica v4 | 2026-06 |
| DEC-009 | Preço autoritativo no servidor | 2026-03 |
| DEC-010 | Feature Freeze piloto | 2026-07-08 |
| DEC-013 | Piloto web only (sem desktop D0) | 2026-07-08 |

Detalhes completos: [[07_DECISOES_ARQUITETURAIS]]

---

## Problemas Resolvidos (histórico)

| Problema | Solução | Commit/Migration |
|---|---|---|
| Oversell de estoque | `decrementar_estoque_seguro` FOR UPDATE + version | `016`, `029`, `038` |
| Venda duplicada (retry desktop) | HMAC + nonce anti-replay | `024` |
| Divergência `variantesChaveLeitura` | Fonte única em `shared-core` | branch atual |
| RPCs legadas v2/v3 acessíveis | Bloqueio por migrations | `20260619…`, `20260620…` |
| Campos fiscais ausentes em produção | Migration `210` | drift corrigido |
| Drift GRANT em produção | `255_grant_baseline_tabelas_authenticated.sql` | 2026-06/07 |
| Typecheck diagnóstico caixa | Guard `status === 'ambiguo'` | `f2fca536` |
| Conflito merge `VendasTable.tsx` | `toVendaListRow()` para `VendaCancelarModal` | `f2fca536` |

Mais detalhes: [[08_PROBLEMAS_E_SOLUCOES]]

---

## Fases do Projeto

```
Fase 1 (2026-01/02)  MVP PDV + Gerente + Auth/RLS
Fase 2 (2026-03/04)  Preço atacado + Fiscal base + Estoque avançado
Fase 3 (2026-05/06)  Acessibilidade + Admin v2 + RPC v4
Fase 4 (2026-07→)    Piloto 1º cliente (Feature Freeze)
```

---

> Estado atual: [[02_ESTADO_ATUAL]] · Roadmap: [[06_ROADMAP]]
