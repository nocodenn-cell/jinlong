# Relatório Consolidado Pós-Certificação Operacional
## Sincronismo de Governança | Sprint PDV Certificação — 2026-07-31

---

## Visão Executiva

**Sprint de Certificação Operacional completada** com 6 riscos críticos resolvidos. O código está pronto para go-live do **núcleo PDV**, mas o caminho até o cliente real permanece bloqueado por **9 pendências infra/governança** e **3 pendências de código (fiscal)**. Esta análise consolida os documentos de governança para deixar claro o que muda de prioridade a partir de agora.

---

## 1. O QUE FOI EFETIVAMENTE CONCLUÍDO

### Nesta Sprint (2026-07-31)
✅ **Sprint Certificação Operacional** — 6 riscos eliminados, todos validados, mergeados em main
- P0-1: Venda duplicada após F5 → Chave persistida em localStorage
- P0-2: Timeout sem recuperação → Modal + verificação pós-timeout
- P0-3: Máquina de estados → `handleNovoCupom` é ponto de estrangulamento
- P1: Sangria duplicada → Chave estável entre reenvios
- P1: Caixa ABERTO duplicado → Índice parcial único no banco (migration 288)
- P2: Venda em espera orfã → Pedido persiste até venda realmente concluir
- **UX:** Painel de extrato removido da tela principal

**Validação:** typecheck ✓ | lint ✓ | 106 testes caixa ✓ | 180 testes core ✓ | build prod ✓

---

### Anteriormente (Histórico)
✅ **Fase 1 (até 2026-07-23):** Hardening de banco, RLS, migrations 1–277  
✅ **BL-1 reconciliação (parcial):** Código pronto, aguardando validação infra  
✅ **CI/CD Phase A:** Remediar apagão de Actions (congelado em P0-1)  
✅ **Operações base:** Autenticação, autorização, SSOT de preço

---

## 2. O QUE AINDA BLOQUEIA O GO-LIVE

### Bloqueadores de Infraestrutura/Governança (9 itens)
Consolidado de `docs/GO_LIVE_BLOCKERS.md` + `docs/GO_LIVE_RESUMO_EXECUTIVO.md`

#### Crítica — Bloqueia produção em operação (5 itens)

| Bloqueador | Classe | Ação necessária | Responsável | Desbloqueador |
|---|---|---|---|---|
| **B-1** | INFRA | Restaurar GitHub Actions runners — billing/spending limit | Admin GitHub | GitHub → Settings → Billing |
| **B-2** | GOV | Habilitar required status checks (build, lint, test, typecheck) | Owner repo | GitHub → Settings → Branches / Rulesets |
| **B-3** | GOV | Remover bypass list — qualquer regra de proteção é decorativa enquanto ativa | Owner repo | GitHub → Settings → Branches |
| **B-4** | OPS | Produção defasada: `dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU` (23/07) ← main está à frente | Admin Vercel | Vercel → Deployments (redeploy ou `vercel deploy --prod`) |
| **B-6** | OPS | `FISCAL_PROVIDER_TYPE` em `mock` (dev) — trocar para provider real de emissão | Admin Supabase | Supabase → Edge Functions → Secrets |

#### Criativa — Bloqueia módulo fiscal (4 itens, não bloqueia PDV puro)

| Bloqueador | Descrição | Ordem obrigatória |
|---|---|---|
| **D-1** | RPC `fiscal_reprocessar_documento` sem verificação de perfil | 1º (pré-requisito) |
| **D-2** | Migration 092 não aplicada — máquina de estados fiscal faltando | 2º |
| **D-3** | Sem reaper de `EM_PROCESSAMENTO` — documentos órfãos sem retry | 3º |
| **B-5** | Worker fiscal inativo — Vault sem credenciais, 120 execuções do cron sem requisição HTTP | Após D-1→D-2→D-3 |

**Nota:** Ordem é OBRIGATÓRIA. Inverter causa documentos emitidos com chaves falsas.

---

### Bloqueadores de Operação (3 itens)

| Bloqueador | Ação necessária | Responsável |
|---|---|---|
| **P0-3** | Criar projeto Supabase staging (Free, US$ 0) para separar Preview/Prod | Owner | 
| **P0-4** | Remover contas de teste de produção (`cloudagenttest@mailinator.com`) | Owner |
| **P0-6** | Assinar GitHub Pro (US$ 4/mês) para habilitar branch protection | Owner |

---

### Resumo de Bloqueadores

```
INFRA:  1 bloqueador (B-1 billing)
GOV:    2 bloqueadores (B-2 required checks, B-3 bypass list)
OPS:    4 bloqueadores (B-4 produção defasada, B-6 provider fiscal, P0-3/4/6 saneamento)
DEV:    3 bloqueadores (D-1/D-2/D-3 fiscal + ordem obrigatória)
────────────────────────────────────────────────────────────────
TOTAL:  9 bloqueadores críticos (nenhum gerado pela sprint de certificação)
        4 adicionais de operação (saneamento, não código)
```

**Caminho mínimo para Go-Live do núcleo PDV (sem fiscal):**
1. B-4 (restaurar produção) ← urgente, cliente agora
2. B-1 (restaurar runners) ← desbloqueia validação
3. D-4 (corrigir build-and-test que está vermelho) ← pré-req de B-2
4. B-2 (habilitar required checks)
5. B-3 (esvaziar bypass)

**Módulo fiscal (adicional):** D-1 → D-2 → D-3 → B-6 → B-5

---

## 3. QUAIS ITENS DO BACKLOG MUDARAM DE PRIORIDADE APÓS ESTA SPRINT

### Antes (2026-07-24 — `BACKLOG_PRIORIZADO_PROXIMA_SPRINT.md`)
```
P0: BL-1 (reconciliação RPC v4)
P1: BL-2 (promoções automáticas)
P2: BL-3 (enqueue fiscal), BL-4 (guard de drift de RPC)
P3: BL-5 (limite de desconto reflete config)
```

### Depois (2026-07-31 — Pós-Certificação)

**MUDANÇA CRÍTICA:** BL-1 deixa de ser o *primeiro* P0. Motivo: não é bloqueador de go-live do núcleo PDV puro (só de descontos auditados).

#### Nova Priorização

| Ordem | Item | Classe | Razão |
|---|---|---|---|
| **1º** | **[NOVO] Bloqueadores infra (B-1, B-4, B-2, B-3)** | P0-INFRA | Bloqueia cliente acessar produção agora |
| **2º** | **[NOVO] Saneamento operacional (P0-3, P0-4, P0-6)** | P0-OPS | Pré-requisitos para aceitar cliente |
| **3º** | BL-1 (reconciliação RPC v4) | P0-DEV | Desconto auditado (MVF #2 completo) |
| **4º** | D-1/D-2/D-3 (máquina fiscal) | P0-DEV-FISCAL | Emissão fiscal (opcional para MVP piloto) |
| **5º** | BL-2 (promoções) | P1-DEV | Recurso novo, não crítico |
| **6º** | BL-3 + BL-4 | P2-DEV | Melhoria + guarda de regressão |

---

### O que Não Mudou
- ✅ Certificação operacional foi **adicional** — não impactou priorização existente de BL-1..BL-5
- ✅ Bug fixes de operação (duplicação, timeout, caixa) **não são bloqueadores** porque só afetam operador, não cliente/negócio (estoque, financeiro)
- ✅ Roadmap de funcionalidades (contas, devoluções, promoções) continua válido pós-go-live

---

## 4. QUAL DEVE SER EXATAMENTE O OBJETIVO DA PRÓXIMA SPRINT

### Escopo Explícito

**Sprint: Go-Live Infrastructure + Financial Domain (BL-1)**

**Objetivo:** Destravar o cliente real — resolver os 9 bloqueadores de infra/Gov + iniciar BL-1 (reconciliação de desconto) para preparar go-live do **núcleo PDV com auditoria de desconto completa**.

---

### Breakdown por Responsável

#### OWNER (você) — Ações administrativas
- [ ] **GitHub:** Restaurar billing Actions (B-1) — `Settings → Billing → Spending limits` ou `gh auth token` escopo insuficiente
- [ ] **GitHub:** Habilitar required status checks (B-2) — `Settings → Branches → Rulesets` ou `Branch Protection`
- [ ] **GitHub:** Remover bypass list (B-3) — `Settings → Branches → Edit`
- [ ] **Vercel:** Restaurar produção (B-4) — redeploy ou `vercel deploy --prod` via console
- [ ] **Supabase:** Criar projeto staging (P0-3) — `Create new project` (free tier)
- [ ] **Supabase:** Saneamento de contas de teste (P0-4) — DELETE `cloudagenttest@mailinator.com` da prod
- [ ] **GitHub:** Assinar Pro (P0-6) — `github.com/settings/billing` (US$ 4/mês)

**Estimativa:** 2–4 horas (admin + 1 janela de deploy)

---

#### DEV (código) — BL-1 Reconciliação

**Item:** `finalizar_venda_transacional_canonica_v4` — restaurar PASSO 5 + auditoria de desconto

**Descrição:** 
- Restaurar `SET usado=true` no token desconto gerente
- Restaurar `INSERT descontos_venda` (auditoria: operador_id, aplicado_em, motivo)
- Adicionar parametrização de motivo desconto (ENUM + coluna livre)
- Via migration única contra estado vivo

**Validação:**
- tsc ✓ | lint ✓ | testes SQL + integração + E2E ✓
- Regressão com split payment + contas_receber ✓
- E2E de auditoria (token reutilizável, rejeição de `OUTROS` sem descritivo)

**Estimativa:** 1–1,5 dia  
**Dependência:** Confirmação de ambiente (prod vs staging)  
**Bloqueador:** Nenhum (código pronto, só aguarda execução)

---

#### OPCIONAL (paralelo) — P1 Promoções (BL-2)
Se schedule permitir:
- [ ] Estender `calcular_preco_produto` para ler `regras_preco` tipo `PROMOCAO`
- [ ] Espelhar em `calcularPrecoCanonico.ts`
- [ ] Testes de equivalência online/offline

**Estimativa:** 2–3 dias  
**Dependência:** BL-1 concluído  
**Racional:** Habilita recurso novo, complementa MVF #3

---

### Critério de Sucesso
1. ✅ Bloqueadores infra/Gov destrancados (B-1..B-3, P0-3/4/6 executados)
2. ✅ Produção restaurada e acessível (B-4)
3. ✅ BL-1 código mergeado, validado, deployado em staging
4. ✅ E2E de auditoria de desconto passando
5. ✅ Zero regressão em split payment ou contas_receber

### Timeline Recomendada
```
Dia 1: Admin (B-1..B-6, P0-3/4/6) + iniciar BL-1 código
Dia 2-3: BL-1 código + validação + E2E
Dia 4: Buffer + opcional BL-2 ou redocs
Fim: Merge + deploy staging
```

---

## Apêndice: Matriz de Sincronismo (antes vs depois)

### Documentos revisados
| Documento | Última atualização | Relevância pós-sprint |
|---|---|---|
| GO_LIVE_BLOCKERS.md | 2026-07-25 | ✅ Válido — bloqueadores ainda presentes, sprint não tocou neles |
| BACKLOG_PRIORIZADO_PROXIMA_SPRINT.md | 2026-07-24 | 🔶 **Parcialmente obsoleto** — BL-1 não é mais 1º, infra toma prioridade |
| GO_LIVE_RESUMO_EXECUTIVO.md | 2026-07-29 | ✅ Válido — lista exaustiva de P0-P3 |
| BACKLOG_TECNICO.md | nd | ✅ Válido — itens pós-go-live |
| SPRINT_CERTIFICACAO_OPERACIONAL_CONCLUSAO.md | 2026-07-31 | ✅ Novo — captura estado atual |

### Próxima atualização necessária
Arquivo: `BACKLOG_PRIORIZADO_PROXIMA_SPRINT.md` → **renomear para `BACKLOG_INFRAESTRUTURA_E_BL1.md`** ou criar novo `SPRINT_PROXIMA_INFRAESTRUTURA_BL1.md` com sequência correta.

---

**Compilado por:** Auditoria de governança pós-sprint  
**Data:** 2026-07-31  
**Status:** Pronto para próxima sprint
