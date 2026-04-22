# Checklist Operacional Executável — Unificação de Fluxos (Web + PDV Local)

Objetivo: unificar o fluxo de venda entre `pdv-importados` e `pdv-local` com rollout seguro, sem quebra de produção.

Status final esperado: ambos os canais usam a mesma regra transacional canônica no Supabase, com segurança de desconto gerente equivalente.

### Auditoria código × checklist (implementação já no repo)

| Etapa (checklist) | No repositório hoje | Pendência típica |
|-------------------|---------------------|-------------------|
| **1.1** RPC canônica v2 | Migration `025_finalizar_venda_transacional_canonica_v2.sql` + evoluções (`061_*` idempotência, etc.) | Só **operação**: `db push` nos refs alvo |
| **1.2** `sync-outbox` + flags | `USE_UNIFIED_SALES_FLOW`, `CANARY_DEVICE_FINGERPRINTS`, `shouldUseUnifiedSalesFlow()`, RPC `finalizar_venda_transacional_canonica_v2` **ou** legado `registrar_venda_com_itens` + baixa | Definir **secrets** e cutover (canário → 100%) por ambiente |
| **1.3** Web | `pdv-importados/app/caixa/actions.ts` — `USE_UNIFIED_SALES_FLOW === 'true'` → RPC `finalizar_venda_transacional_canonica_v2` | — |
| **1.3** Desktop | Outbox → mesma Edge; ramo unificado em `processVenda` | **Evidência:** smoke real + fingerprint canário por PDV |
| **2.1** Desconto gerente | `STRICT_MANAGER_DISCOUNT_AUTH` na Edge + `GERENTE_TOKEN_OBRIGATORIO` em `processVenda` | Secret em cada projeto; token via `op=validar_gerente` no desktop |
| **3.x** Observabilidade / remoção legado | — | **Fora do código** (dashboards, política de release) até decisão de remover ramo legado |

Os itens marcados **`[x]`** nas secções abaixo refletem **entrega no Git**; itens **`[ ]`** permanecem quando dependem de **SRE/QA/produção** ou ainda não existem (ex.: suíte Deno dedicada na pasta `backend`).

---

## Donos sugeridos

- **BE**: Backend/Supabase (RPCs, Edge Functions, migrations)
- **FE-WEB**: Time `pdv-importados`
- **FE-DESK**: Time `pdv-local` (Tauri/Rust)
- **SRE/DevOps**: deploy, flags, observabilidade, rollback
- **QA**: teste funcional e regressão
- **Sec**: validações de segurança

---

## Etapa 1 — Unificar regra transacional em RPC canônica

### 1.1 Criar RPC canônica versionada (`v2`) sem remover legado

- [x] **Item:** Criar RPC canônica única para venda (web + sync local)
  - **Owner:** BE
  - **Arquivo:** `backend/supabase/migrations/025_finalizar_venda_transacional_canonica_v2.sql` (e migrations subsequentes que ajustam a RPC)
  - **Comando:**
    - `cd C:\Naturecode\fastproduct\backend`
    - `npx supabase db push --linked`
  - **Métrica:** RPC nova disponível e executável com payload de teste, sem alterar contrato atual em produção
  - **Rollback:** não apontar chamadores para `v2`; manter uso da RPC atual

- [x] **Item:** Garantir idempotência e consistência de estoque na RPC canônica
  - **Owner:** BE
  - **Arquivo:** evoluções em `backend/supabase/migrations/` (ex.: `061_finalizar_venda_canonica_v2_idempotencia.sql`, `055_round_abnt_finalize_v2.sql`)
  - **Comando:** `npx supabase db push --linked`
  - **Métrica:** repetição do mesmo `venda_id` não duplica baixa/itens
  - **Rollback:** manter execução no caminho antigo

### 1.2 Adaptar `sync-outbox` para chamar a RPC canônica via flag

- [x] **Item:** Introduzir chave de rollout no `sync-outbox` (`USE_UNIFIED_SALES_FLOW`)
  - **Owner:** BE
  - **Arquivo:** `backend/supabase/functions/sync-outbox/index.ts`
  - **Comando:**
    - `npx supabase functions deploy sync-outbox --project-ref <ref> --no-verify-jwt`
    - `npx supabase secrets set USE_UNIFIED_SALES_FLOW="false"`
  - **Métrica:** deploy sem erro e logs mostrando rota antiga quando flag `false`
  - **Rollback:** manter `USE_UNIFIED_SALES_FLOW="false"`

- [x] **Item:** Implementar strategy de chamada (legado x canônico) no `sync-outbox`
  - **Owner:** BE
  - **Arquivo:** `backend/supabase/functions/sync-outbox/index.ts`
  - **Comando:** deploy da função
  - **Métrica:** com flag `true`, `sync-outbox` chama apenas RPC canônica
  - **Rollback:** voltar flag para `false`

### 1.3 Validar web e desktop contra a mesma regra

- [x] **Item:** Garantir que web finalize venda pela RPC canônica
  - **Owner:** FE-WEB + BE
  - **Arquivo:** `pdv-importados/app/caixa/actions.ts` (`USE_UNIFIED_SALES_FLOW` → `finalizar_venda_transacional_canonica_v2`)
  - **Comando:** `npm run test` (em `pdv-importados`)
  - **Métrica:** teste de finalização passando e venda persistida corretamente
  - **Rollback:** manter chamada na RPC atual até estabilizar

- [ ] **Item:** Garantir que desktop sincronize vendas via RPC canônica (indireto pelo `sync-outbox`)
  - **Owner:** FE-DESK + BE
  - **Arquivo:** `pdv-local/src-tauri/src/db.rs`, `backend/supabase/functions/sync-outbox/index.ts` — **ramo unificado já na Edge**; falta **evidência** por loja/dispositivo (`cargo test` + smoke sync com `USE_UNIFIED_SALES_FLOW` / canário)
  - **Comando:** `cargo test` (em `pdv-local/src-tauri`) + smoke de sync
  - **Métrica:** venda local sincronizada com mesmos campos/validações da web
  - **Rollback:** flag `USE_UNIFIED_SALES_FLOW="false"`

---

## Etapa 2 — Igualar segurança de desconto gerente (web e local)

### 2.1 Tornar autorização de desconto gerente equivalente

- [x] **Item:** Exigir prova de autorização de gerente no fluxo local (compatível com web)
  - **Owner:** BE + Sec
  - **Arquivo:** `backend/supabase/functions/sync-outbox/index.ts` (`STRICT_MANAGER_DISCOUNT_AUTH` + `GERENTE_TOKEN_OBRIGATORIO` quando há desconto gerente sem token)
  - **Comando:** deploy function + `db push`
  - **Métrica:** desconto privilegiado sem token/prova retorna erro de autorização
  - **Rollback:** `STRICT_MANAGER_DISCOUNT_AUTH="false"` temporariamente

- [x] **Item:** Adicionar flag de endurecimento (`STRICT_MANAGER_DISCOUNT_AUTH`)
  - **Owner:** SRE/DevOps
  - **Arquivo:** Secrets da Edge Function `sync-outbox` (nome documentado; valor por ambiente)
  - **Comando:** `npx supabase secrets set STRICT_MANAGER_DISCOUNT_AUTH="false"`
  - **Métrica:** modo dual ativo (aceita legado + novo durante transição)
  - **Rollback:** manter `false` até remediação

### 2.2 Cobertura de testes de segurança

- [ ] **Item:** Unitários de autorização (com e sem token válido)
  - **Owner:** QA + BE
  - **Arquivo:** testes backend/edge
  - **Comando:** suíte de testes do backend
  - **Métrica:** cenários negativos bloqueados (token inválido/expirado/reutilizado)
  - **Rollback:** não subir `STRICT=true`

- [ ] **Item:** Regressão anti-replay no sync
  - **Owner:** QA + Sec
  - **Arquivo:** `backend/scripts/sync-outbox-anti-replay-diagnostic.ps1`
  - **Comando:**
    - `cd C:\Naturecode\fastproduct\backend`
    - `.\scripts\sync-outbox-anti-replay-diagnostic.ps1 -OutputJson -OutputFile ".\artifacts\anti-replay-report.json"`
    - Opcional (inclui `POST ?op=validar_gerente`): definir `SYNC_DIAG_GERENTE_SENHA` no ambiente ou `-ValidarGerenteSenha` (não versionar; em CI usar secret do pipeline).
  - **Métrica:** `summary.success = true` (6/6 checks base; 8/8 se `validar_gerente` habilitado)
  - **Rollback:** bloquear promoção de ambiente até sucesso

---

## Etapa 3 — Cutover gradual + flags + observabilidade + limpeza de legado

### 3.1 Rollout progressivo (canário -> 10–20% -> 100%)

- [ ] **Item:** Canário (1 loja/dispositivo) com fluxo unificado
  - **Owner:** SRE/DevOps + QA
  - **Arquivo:** configuração de ambiente + playbook operacional
  - **Comando:** setar `USE_UNIFIED_SALES_FLOW="true"` apenas no alvo canário
  - **Métrica:** 0 erro crítico de venda por 24h
  - **Rollback:** `USE_UNIFIED_SALES_FLOW="false"` no canário

- [ ] **Item:** Expandir para 10–20%
  - **Owner:** SRE/DevOps
  - **Arquivo:** configuração de rollout
  - **Comando:** ampliar escopo de flag
  - **Métrica:** taxa de erro da RPC dentro do baseline definido
  - **Rollback:** reduzir para canário imediatamente

- [ ] **Item:** 100% da base
  - **Owner:** SRE/DevOps + BE
  - **Arquivo:** configuração global
  - **Comando:** ativação total da flag
  - **Métrica:** 7 dias estáveis sem divergência de fechamento
  - **Rollback:** flag global `false`

### 3.2 Observabilidade obrigatória

- [ ] **Item:** Dashboard de erro da RPC canônica
  - **Owner:** SRE/DevOps
  - **Arquivo:** painel/queries operacionais
  - **Comando:** publicar dashboard + alerta
  - **Métrica:** alertas ativos para erro > baseline
  - **Rollback:** n/a (item de suporte)

- [ ] **Item:** Alerta de divergência de totais (web x local)
  - **Owner:** BE + SRE/DevOps
  - **Arquivo:** query de reconciliação
  - **Comando:** agendar job de verificação
  - **Métrica:** divergência = 0 nos lotes de conferência
  - **Rollback:** bloquear promoção de etapa

- [ ] **Item:** Alerta de segurança de sync (`REPLAY_DETECTED`, `INVALID_SIGNATURE`, `TIMESTAMP_OUT_OF_WINDOW`)
  - **Owner:** Sec + SRE/DevOps
  - **Arquivo:** logs/alertas do `sync-outbox`
  - **Comando:** criar regras de alerta por erro
  - **Métrica:** taxa de falhas anômala detectada em < 5 min
  - **Rollback:** isolar origem e rotacionar `SYNC_KEY` se necessário

### 3.3 Limpeza de legado após estabilização

- [ ] **Item:** Remover caminho antigo de venda no `sync-outbox`
  - **Owner:** BE
  - **Arquivo:** `backend/supabase/functions/sync-outbox/index.ts`
  - **Comando:** deploy da função após remoção
  - **Métrica:** código legado removido sem regressão
  - **Rollback:** restaurar versão anterior da função

- [ ] **Item:** Desativar feature flags transitórias
  - **Owner:** SRE/DevOps
  - **Arquivo:** secrets/config
  - **Comando:** fixar `USE_UNIFIED_SALES_FLOW="true"` e `STRICT_MANAGER_DISCOUNT_AUTH="true"`
  - **Métrica:** ambiente sem dependência de modo dual
  - **Rollback:** reativar modo dual temporariamente

- [x] **Item:** Atualizar documentação operacional
  - **Owner:** BE + QA
  - **Arquivo:** `docs/P0_CHECKLIST_OPERACIONAL.md`, `docs/AMBIENTES_E_RELEASE.md`, `docs/CHECKLIST_P0_STAGING.md`, **este** `CHECKLIST_UNIFICACAO_FLUXO_VENDAS.md` (auditoria código × checklist)
  - **Comando:** revisão + commit de docs
  - **Métrica:** trilhas P0/deploy e unificação refletem o estado do repo; remoção do ramo legado no **código** da Edge continua pendente até decisão de release (item 3.3 anterior)
  - **Rollback:** n/a

---

## Testes obrigatórios (gate de promoção por etapa)

- [ ] **Unitários:** cálculos, validações e autorização
  - **Owner:** QA
  - **Comando:** `npm run test` (`pdv-importados`), `cargo test` (`pdv-local/src-tauri`)
  - **Métrica:** 100% da suíte crítica passando

- [ ] **Integração:** web + `sync-outbox` chamando a mesma RPC
  - **Owner:** QA + BE
  - **Comando:** suíte de integração / smoke com banco remoto
  - **Métrica:** mesmo resultado para cenários equivalentes

- [ ] **E2E crítico:** venda com/sem desconto, estoque insuficiente, idempotência de reprocessamento
  - **Owner:** QA
  - **Comando:** roteiro E2E do projeto
  - **Métrica:** todos cenários críticos aprovados

- [ ] **Regressão de segurança:** replay, assinatura inválida, timestamp drift
  - **Owner:** QA + Sec
  - **Comando:** script anti-replay com artefato JSON
  - **Métrica:** `summary.success = true`

---

## Critério de aceite final (go-live unificado)

- [ ] `USE_UNIFIED_SALES_FLOW="true"` em produção
- [ ] `STRICT_MANAGER_DISCOUNT_AUTH="true"` em produção
- [ ] 7 dias de operação com erro dentro do baseline
- [ ] Sem divergência de fechamento entre canais
- [ ] Sem incidentes críticos de segurança no sync

---

## Runbook — Canário real (1 dispositivo)

### Ativação segura (somente canário)

```powershell
cd C:\Naturecode\fastproduct\backend
# Troque SEU_PROJECT_REF pelo ref do projeto no Dashboard (Settings → General).
npx supabase secrets set USE_UNIFIED_SALES_FLOW="false" --project-ref SEU_PROJECT_REF
npx supabase secrets set STRICT_MANAGER_DISCOUNT_AUTH="false" --project-ref SEU_PROJECT_REF
npx supabase secrets set CANARY_DEVICE_FINGERPRINTS="loja-01-caixa-01" --project-ref SEU_PROJECT_REF
```

### Monitoração (primeiras 24h)

- Métrica 1: taxa de erro de sync-outbox (`event_failed` / total batch) <= baseline.
- Métrica 2: erros de segurança (`REPLAY_DETECTED`, `INVALID_SIGNATURE`, `TIMESTAMP_OUT_OF_WINDOW`) sem pico anômalo.
- Métrica 3: reconciliação de vendas do canário sem divergência de totais.
- Evidência: exportar JSON do diagnóstico anti-replay para artefato CI.

```powershell
cd C:\Naturecode\fastproduct\backend
$env:SYNC_ENDPOINT = "https://SEU-REF.supabase.co/functions/v1/sync-outbox"
$env:SYNC_KEY = "COLE_AQUI_SYNC_KEY"
# Opcional: dois checks extras (senha válida + senha inválida rejeitada)
# $env:SYNC_DIAG_GERENTE_SENHA = "(senha de teste; não commite)"
.\scripts\sync-outbox-anti-replay-diagnostic.ps1 -OutputJson -OutputFile ".\artifacts\sync-outbox-anti-replay-report.json"
```

### Rollback imediato (sem redeploy)

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase secrets set CANARY_DEVICE_FINGERPRINTS="" --project-ref SEU_PROJECT_REF
npx supabase secrets set USE_UNIFIED_SALES_FLOW="false" --project-ref SEU_PROJECT_REF
npx supabase secrets set STRICT_MANAGER_DISCOUNT_AUTH="false" --project-ref SEU_PROJECT_REF
```

Resultado esperado do rollback: todo tráfego volta para caminho legado no próximo request da função.

