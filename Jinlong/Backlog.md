# 📋 Backlog — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[06_ROADMAP]] (2026-07-10)
> [[Home]] | [[Dashboard]] | [[Roadmap]]

---

## 🔄 Em Andamento

| Item | Responsável | Prioridade | Arquivo |
|---|---|---|---|
| Contas a pagar (rota gerente) | Time | P0 | `app/gerente/financeiro/` |
| Homologação staging com evidências (T1–T12) | Dev ops | P0 | `docs/CHECKLIST_P0_STAGING.md` |
| Pipeline bip: sign-off ADR-PDV-001 | Tech lead | P1 | `docs/adr/ADR-PDV-centro-de-gravidade.md` |
| Onboarding script 1º cliente | Time | P0 | `docs/RUNBOOK_PRIMEIRO_CLIENTE.md` |

---

## 📌 A Fazer

### P0 — Bloqueadores de Go-Live

- [ ] **Executar P0 Checklist T1–T12 em staging** — `docs/P0_CHECKLIST_OPERACIONAL.md`
  - T1: `supabase link` para projeto correto
  - T2: `migration list` sem lacunas
  - T3: `p0-migration-status.mjs` → saída ALINHADO
  - T4: `db push` se drift
- [ ] **Executar checklist pré-produção PDV no ambiente alvo** — `/admin/diagnostico-caixa` · `npm run check:caixa-pre-producao` · `verify_p0_producao.sql` · migration `256`
  - T6: Smoke 023 (desconto gerente por token)
  - T7: Deploy `sync-outbox` + `validar-gerente` + `fiscal-worker`
  - T8: Secrets configurados (SYNC_KEY, FISCAL_*)
  - T9: `.env.local` / Vercel com `NEXT_PUBLIC_*` corretos
  - T11: Smoke de venda web (sem desktop no D0)
  - T12: Evidências no `CHECKLIST_P0_STAGING.md`

- [ ] **Script de onboarding do 1º cliente** — criar loja, usuários OPERADOR/GERENTE/DONO, seed catálogo mínimo, validar caixa

- [ ] **Homologação formal** — `docs/DONE_DEFINITION_PILOTO.md` §4.3 e §7

### P1 — Qualidade Pós-Piloto

- [ ] **Documentar MATRIZ_OFFLINE_PDV.md** — comportamento esperado web × desktop em queda de rede
- [ ] **E2E mutadores gerente** — Playwright: cancelar venda, ajuste estoque
- [ ] **RPC única de devolução/troca pós-venda** — evitar buracos no kardex
- [ ] **Acessibilidade ARIA Fase 3.2** — aria-live, confirmações, foco pós-modal

### P2 — Expansão

- [ ] **NFC-e Focus real** — ativar adaptador Focus em `fiscal-worker`, configurar secrets, homologar
  - Arquivo: `backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.ts`
  - Roteiro: `docs/CHECKLIST_ATIVACAO_FOCUS_1_DIA.md`
- [ ] **Bling adapter** — TODO explícito no código: `fiscal-provider-adapter.ts:TODO: Implementar integração específica com Bling`
- [ ] **Kardex avançado** — painel/export, materialized view, refresh policy
- [ ] **Auditoria de arredondamento** — verificar `Math.round`/`toFixed` fora do motor de preço
- [ ] **Unificação de tokens design system** — eliminar cores hardcoded

### P3 — Longo Prazo

- [ ] **Venda em Espera** — parked sale persistida no banco (`docs/PLANO_FASE_2_VALOR_PERCEBIDO.md` §1)
- [ ] **Auto-update Tauri** — updater automático de versões desktop
- [ ] **Multi-loja / filiais** — relatórios consolidados, transferências entre lojas
- [ ] **Conciliação bancária** — integração com extratos PIX/débito/crédito
- [ ] **Operação web offline** — clarificar escopo (hoje é online-first); revisar mensagens de marketing antigas
- [ ] **Observabilidade desktop** — métricas e logs estruturados do Tauri

---

## ✅ Concluído

### Core PDV
- [x] Carrinho com varejo/atacado automático
- [x] Finalização transacional idempotente (RPC canônica v4)
- [x] Split de pagamento (2–3 parcelas: dinheiro, PIX, débito, crédito)
- [x] Cancelamento de venda com estorno de estoque e auditoria
- [x] Caixa: abertura, sangria/suprimento com aprovação, fechamento cego e atômico
- [x] Desconto de gerente com token e rate-limit
- [x] Pipeline de scan bip com máquina de estados (`useCaixaScanPipeline`)
- [x] Anti-fraude de preço (recálculo autoritativo no servidor)
- [x] Telemetria de scan no caixa

### Auth + Segurança
- [x] Autenticação Supabase com perfis (OPERADOR/GERENTE/DONO/ADMIN)
- [x] RLS em todas as tabelas
- [x] Middleware por perfil (OPERADOR → `/caixa`; GERENTE → `/gerente`; ADMIN → `/admin`)
- [x] Anti-replay HMAC + nonce para sync outbox
- [x] Token de desconto gerente com revogação

### Estoque
- [x] Baixa atômica/idempotente anti-oversell (`decrementar_estoque_seguro`)
- [x] Estoque por loja (base multi-loja)
- [x] Transferência entre lojas segura e idempotente
- [x] Ajuste manual com trilha no kardex
- [x] Kardex unificado (view) e imutabilidade
- [x] Ordens de compra e recebimento
- [x] Importação de NF-e de compra (com draft)
- [x] Impressão de etiquetas

### Cadastro de Produtos
- [x] CRUD com filtros avançados e paginação server-side
- [x] Marcas, imagens (Storage), tags, categorias
- [x] Preço atacado por faixas (tiers)
- [x] Guarda de margem negativa
- [x] Status de publicação / rascunho
- [x] Unicidade de código por loja
- [x] Campos fiscais (NCM/CFOP/CSOSN/CEST/CST)

### Painel Gerente
- [x] Produtos, estoque, vendas, caixas, relatórios
- [x] Export CSV em todas as telas
- [x] Contas a receber

### Relatórios
- [x] Vendas por dia/período com timezone IANA
- [x] Top produtos por período
- [x] Dashboard gerente com KPIs
- [x] Margem por venda
- [x] Estoque baixo

### Desktop (Tauri)
- [x] PDV local-first com SQLite
- [x] Outbox sync com retry/backoff/DLQ
- [x] UI de reprocessamento de vendas com falha
- [x] Reuso de `core/` via alias `@core`
- [x] Paridade de leitura de código de barras web × desktop

### Fiscal (base)
- [x] Fila `documentos_fiscais_pendentes`
- [x] Edge Function `fiscal-worker` com adaptadores
- [x] Enfileiramento automático pós-venda (configurável)
- [x] Import de NF-e de compra

### Admin v2
- [x] Consolidação SSoT de telas admin (`88f2e64a`)
- [x] Diagnóstico pré-produção PDV (`5ce33a6d`) — `/admin/diagnostico-caixa`, migration `256`, CLI
- [x] Cancelamento vendas admin — `VendaDetailSheet` + `VendasTable` com `VendaListRow`
- [x] AdminV2Shell, SidebarNav, MetricCard, PageHeader

### Qualidade
- [x] CI: Lint + Vitest + build Next no PR
- [x] E2E: venda, multi-pagamento, sangria, fechamento, sync gerente
- [x] SSRA pós-deploy com validação de produção
- [x] **Frente CI/CD e Deploy — CONCLUÍDA (2026-07-25).** Mecanismo único de deploy (Vercel nativa), SSRA desacoplado em `deployment_status`, `fiscal-cron.yml` e `e2e-playwright-only.yml` removidos, duplicação push+PR eliminada. Canônico: `docs/CICD_FINAL_STATE.md`

> **Pendências desta frente NÃO retornam ao backlog técnico.** São **[INFRA]** (billing de Actions), **[GOV]** (required checks e bypass) e **[OPS]** (Vault fiscal, alias de produção da Vercel, env vars do Sentry) — ações de console, sem código. Ver `docs/CICD_FINAL_STATE.md` §5.
>
> ~~Permanecem como desenvolvimento apenas: migration `092`, remoção do overload `fiscal_reprocessar_documento(uuid,text)` e reaper de `EM_PROCESSAMENTO`.~~ **Os três foram fechados em 2026-08-06**, na ordem obrigatória D-1 → D-2 → D-3, pelas migrations `305`, `306` e `307`. **Não resta pendência de código nesta frente** — o módulo fiscal agora depende só de console: B-6 (provider real) e depois B-5 (Vault + reagendar o cron do worker). Ver `docs/GO_LIVE_BLOCKERS.md` §3.
>
> **Aberto em 2026-08-06 (novo, GOV):** **D-6** — 14 migrations (`289`-`304`, ~178 KB) aplicadas em produção em 05-06/08 **não existem em nenhum dos 272 refs do Git**. Depende do dono publicar o branch de origem. **D-7** — a reconstrução do banco quebra em 3 pontos de mesma raiz (`248_devolver_ou_trocar_venda.sql` fora de ordem); a correção **já existe pronta** em `origin/chore/node22-alignment`, basta abrir PR. Diagnóstico completo em `docs/AUDITORIA_DRIFT_MIGRATIONS_20260806.md`.
- [x] Acessibilidade ARIA Fase 3.1 (FormField, landmarks, sr-only, skip-link)
- [x] i18n PT/ZH manual sem next-intl

---

## ❌ Cancelado

| Item | Motivo |
|---|---|
| Squash histórico de migrations | Feature Freeze — só reconcilar para ambiente do piloto |
| Redesign visual completo / unificação total de tokens | Feature Freeze — congelado |
| Refatoração do núcleo `finalizar_venda_*` | Feature Freeze — v4 é suficiente para piloto |

---

> Prioridades detalhadas em [[Roadmap]] · Execução imediata em [[Próxima Sprint]]
