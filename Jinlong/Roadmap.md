# 🗺️ Roadmap — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[06_ROADMAP]] (2026-07-10)
> [[Home]] | [[Dashboard]] | [[Backlog]]

---

## P0 — Bloqueadores de Produção (1º Cliente)

> **Contexto:** Feature Freeze ativo. Só entram correções de integridade e bloqueadores absolutos.

### P0.1 — P0 Checklist Operacional Completo
- **Descrição:** Executar trilha T1–T12 de `docs/P0_CHECKLIST_OPERACIONAL.md` para staging e produção
- **Impacto:** Sem isso o sistema não é seguro para produção real — migrations podem estar faltando, secrets errados, edge functions desatualizadas
- **Dependências:** Acesso ao Supabase CLI + projeto linkado + secrets configurados
- **Status:** 🔴 Pendente
- **Arquivos:** `docs/P0_CHECKLIST_OPERACIONAL.md`, `docs/CHECKLIST_DEPLOY_SUPABASE.md`

### P0.2 — Contas a Pagar (Rota Gerente)
- **Descrição:** Rota `/gerente/financeiro/contas-pagar` com CRUD básico
- **Impacto:** Funcionalidade comprometida com o cliente no escopo D0
- **Dependências:** Painel gerente existente; migrations de financeiro
- **Status:** 🟡 Em andamento
- **Arquivos:** `pdv-importados/app/gerente/financeiro/`

### P0.3 — Onboarding do 1º Cliente
- **Descrição:** Script/roteiro de onboarding: criar loja, usuários, seed de catálogo, teste de caixa
- **Impacto:** Sem onboarding estruturado, implantação manual é frágil e lenta
- **Dependências:** P0.1 concluído
- **Status:** 🔴 Pendente
- **Arquivos:** `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`, `docs/ROTEIRO_DEMO.md`

### P0.4 — Homologação Formal com Evidências
- **Descrição:** Registrar evidências de T1–T12 em `docs/CHECKLIST_P0_STAGING.md`; executar `verify_p0_producao.sql`; smoke de venda em staging
- **Impacto:** Gate obrigatório antes de promover para produção
- **Dependências:** P0.1, P0.2, P0.3
- **Status:** 🔴 Pendente
- **Arquivos:** `docs/CHECKLIST_P0_STAGING.md`, `docs/DONE_DEFINITION_PILOTO.md`

---

## P1 — Qualidade e Governança (Pós-piloto D0, Pré-expansão)

### P1.1 — Sign-off ADR-PDV-001
- **Descrição:** Assinar off o ADR sobre o pipeline de bip (scan → carrinho → finalizar) com máquina de estados
- **Impacto:** Sem sign-off, mudanças no pipeline podem quebrar invariantes sem revisão formal
- **Dependências:** Nenhuma
- **Status:** 🔴 Pendente
- **Arquivos:** `docs/adr/ADR-PDV-centro-de-gravidade.md`

### P1.2 — Matriz Offline PDV (MATRIZ_OFFLINE_PDV.md)
- **Descrição:** Documentar comportamento esperado web × desktop em queda de rede, degradação parcial, reconexão
- **Impacto:** Risco operacional real — sem matriz, o time não sabe o que é tolerado vs. bug
- **Dependências:** Nenhuma (apenas documentação)
- **Status:** 🔴 Pendente (arquivo não existe)
- **Arquivos:** `docs/MATRIZ_OFFLINE_PDV.md` (a criar)

### P1.3 — Cobertura E2E Mutadores Gerente
- **Descrição:** Playwright: fluxos de cancelar venda, ajuste de estoque, ajuste financeiro manual
- **Impacto:** Testes críticos faltando — rota gerente não tem cobertura de mutação
- **Dependências:** Ambiente de staging com seed estável
- **Status:** 🔴 Pendente
- **Arquivos:** `pdv-importados/e2e/gerente.spec.ts`

### P1.4 — Devolução/Troca Pós-Venda (RPC Única)
- **Descrição:** Criar RPC canônica para devolução de estoque fora do cancelamento de venda
- **Impacto:** Sem isso, ajuste manual cria buracos no kardex
- **Dependências:** Migrations de estoque (048 existe mas incompleta)
- **Status:** 🟡 Parcial (`048_devolucoes.sql` existe mas sem RPC completa)
- **Arquivos:** `backend/supabase/migrations/048_devolucoes.sql`

### P1.5 — Acessibilidade ARIA Fase 3.2
- **Descrição:** `aria-live` para mensagens dinâmicas, confirmações de ação, foco pós-modal
- **Impacto:** Conformidade WCAG 2.1 AA incompleta
- **Dependências:** Fase 3.1 concluída (já está)
- **Status:** 🔴 Pendente

---

## P2 — Expansão e Escala (Pós-1º cliente estável)

### P2.1 — NFC-e / NF-e Real (Focus ou Bling)
- **Descrição:** Ativar `fiscal-worker` com adaptador Focus real, configurar secrets, homologar em staging fiscal
- **Impacto:** Habilita clientes que precisam de nota fiscal eletrônica
- **Dependências:** Contrato com Focus; P0 concluído; `docs/CHECKLIST_ATIVACAO_FOCUS_1_DIA.md`
- **Status:** 🔴 Congelado (Feature Freeze)
- **Arquivos:** `backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.ts`

### P2.2 — Kardex Avançado (Painel + Export + Materialized View)
- **Descrição:** Painel de kardex completo no gerente com export CSV e materialized view otimizada
- **Impacto:** Gestão de estoque profissional; rastreabilidade completa
- **Dependências:** `060_v_kardex_unificado.sql` (já existe como base)
- **Status:** 🔴 Backlog
- **Arquivos:** `docs/BACKLOG_TECNICO.md` item 1

### P2.3 — Unificação de Tokens do Design System
- **Descrição:** Eliminar uso de cores hardcoded; padronizar todos componentes com tokens `--fp-*`
- **Impacto:** Consistência visual e facilidade de theming/white-label
- **Dependências:** Nenhuma
- **Status:** 🟡 Em andamento (congelado por Feature Freeze)

### P2.4 — Observabilidade Desktop
- **Descrição:** Métricas e logs estruturados do Tauri para monitoramento de sync e performance
- **Impacto:** Visibilidade do comportamento offline
- **Dependências:** Nenhuma
- **Status:** 🔴 Opcional

---

## P3 — Visão de Longo Prazo

### P3.1 — Multi-loja / Filiais
- **Descrição:** Suporte a múltiplas lojas por CNPJ, transferências entre filiais, relatórios consolidados
- **Impacto:** Expansão de mercado (atacarejos com filiais)
- **Dependências:** Base de multi-loja já existe parcialmente (migration 032, 036)
- **Status:** 🔴 Backlog

### P3.2 — Venda em Espera (Parked Sale)
- **Descrição:** Pausar uma venda em andamento e retomar depois sem perder o carrinho
- **Impacto:** Feature solicitada por clientes com múltiplos atendimentos simultâneos
- **Dependências:** Mudança no store do carrinho + nova tabela
- **Status:** 🔴 Congelado (Feature Freeze)
- **Arquivos:** `docs/PLANO_FASE_2_VALOR_PERCEBIDO.md` §1

### P3.3 — Auto-update do App Tauri
- **Descrição:** Atualizações automáticas do PDV desktop via Tauri updater
- **Impacto:** Eliminar intervenção manual em atualizações de clientes desktop
- **Dependências:** Infraestrutura de distribuição de builds
- **Status:** 🔴 Backlog

### P3.4 — Conciliação Bancária
- **Descrição:** Integração com extratos bancários para conciliar pagamentos PIX/débito/crédito
- **Impacto:** Módulo financeiro completo
- **Dependências:** P0 piloto estável
- **Status:** 🔴 Fora do escopo D0

---

> Ver execução imediata em [[Próxima Sprint]] · Estado atual em [[Dashboard]]
