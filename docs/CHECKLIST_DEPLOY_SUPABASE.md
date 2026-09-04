# Checklist — deploy e operação Supabase (fastproduct)

Objetivo: **ordem segura** para subir ou atualizar o backend Supabase (Postgres + Edge Functions) sem esquecer secrets, alinhamento com a web e com o PDV desktop.

Documentos relacionados: [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) (trilha T1–T12), [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md) (evidências por ciclo), [AMBIENTES_E_RELEASE.md](./AMBIENTES_E_RELEASE.md) (gates), [DONE_DEFINITION_PILOTO.md](./DONE_DEFINITION_PILOTO.md) (fechamento piloto), [backend/supabase/README.md](../backend/supabase/README.md), [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md), [pdv-importados/docs/SUPABASE_ENV.md](../pdv-importados/docs/SUPABASE_ENV.md).

### Ordem mestra (resumo)

1. **Link + migrations:** §1 deste documento (`link` → `migration list` → `db push` se preciso → `verify_p0_producao.sql`).  
2. **Edge:** §2–3 — deploy `sync-outbox` (sempre que houver desktop/outbox); `validar-gerente` e `fiscal-worker` conforme escopo (tabela **§2b** em [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md)).  
3. **Web / desktop:** §4–5 — `NEXT_PUBLIC_*`, `FISCAL_*` no Next; `SYNC_*` no Tauri.  
4. **Smoke:** §6 — login + fluxo crítico; opcional `smoke_operacao_fluxo_completo.sql` em homologação ([DONE_DEFINITION_PILOTO.md](./DONE_DEFINITION_PILOTO.md)).  
5. **Evidências:** registrar no [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md) antes de promover staging → prod.

---

## Antes de começar

| # | Verificação |
|---|-------------|
| A.1 | Supabase CLI instalado (`npx supabase --version`) e login (`npx supabase login`) se for usar deploy via CLI |
| A.2 | **Project ref** anotado (Dashboard → Project Settings → General → Reference ID) |
| A.3 | Senha do banco à mão (Database password) para `supabase link` |

---

## 1. Banco (migrations)

Execute sempre a partir da pasta **`backend`** (raiz do módulo Supabase deste monorepo).

| # | Ação | Comando / nota |
|---|------|------------------|
| 1.1 | Vincular o projeto (uma vez por máquina ou ao trocar de ref) | `cd backend` → `npx supabase link --project-ref <REF>` |
| 1.2 | Conferir drift local vs remoto | `npx supabase migration list` — coluna **Remote** sem lacunas em relação a **Local** |
| 1.3 | Aplicar migrations pendentes | `npx supabase db push` |
| 1.4 | Verificação SQL recomendada | SQL Editor: executar `backend/supabase/scripts/verify_p0_producao.sql` |
| 1.5 | Após migrations **058** (RPC `pdv_config_para_caixa_web`), **059** (cancelamento split) e **060** (view `v_kardex_unificado`): confirmar `db push` **antes** de publicar build Next que já depende das RPCs 058+ |

> **1.4b (opcional – validação da migration 069)**  
> Após rodar `npx supabase db push` com a migration 069, execute o script `backend/supabase/scripts/smoke_fiscal_enqueue_069_service_role.sql` no SQL Editor do Supabase (ou via psql). O script confirma que a função `fiscal_enfileirar_documento_venda` aceita a role `service_role` sem erros de permissão.

Se o repositório tiver `node scripts/p0-migration-status.mjs`, use também para um resumo rápido de alinhamento (ver [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md)).

---

## 2. Edge Functions — deploy

Funções neste repositório: **`sync-outbox`**, **`validar-gerente`**, **`fiscal-worker`**.

| # | Ação | Comando |
|---|------|---------|
| 2.1 | Deploy (após migrations alinhadas ao código que as Functions esperam) | `cd backend` → `npx supabase functions deploy sync-outbox` (repita para `validar-gerente` e `fiscal-worker`) |

Ordem prática: aplique **1** antes de **2** quando houver mudanças em RPC/tabelas usadas pelas Functions.

---

## 3. Secrets das Edge Functions

Defina no Dashboard (**Edge Functions → Secrets**) ou via CLI (`npx supabase secrets set NOME=valor --project-ref <REF>`). **Não** versionar valores reais; use o exemplo em `pdv-importados/scripts/supabase-edge-secrets.example.ps1`.

### 3.1 — Todas as functions que falam com o Postgres

| Secret | Onde usa |
|--------|----------|
| `SUPABASE_URL` | URL `https://<ref>.supabase.co` do **mesmo** projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role do **mesmo** projeto (só servidor / Edge) |

### 3.2 – Enfileiramento automático de notas fiscais a partir do PDV desktop (sync-outbox)

- **Comportamento padrão**:  
  O secret `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE` **não está definido** por padrão. Nenhuma venda do PDV desktop é enfileirada para emissão de nota.  
- **Quando ativado**:  
  Defina o secret como `true` ou `1`. A Edge Function `sync-outbox`, após persistir a venda com sucesso, chamará a RPC `fiscal_enfileirar_documento_venda` com payload compatível ao caixa web (`origem: "pdv_local_sync"`).  
- **Falha no enfileiramento**:  
  Apenas um **log estruturado** (`level: "warn"`, estágio `fiscal_enqueue_sync`) é gravado; o batch de outbox **não** é interrompido (mesma filosofia do caixa web, que usa `console.error` no servidor Next em falha de RPC).  
- **Pré-requisito obrigatório antes de ativar em produção**:  
  A migration **069** deve estar aplicada na base (senão a Edge com `service_role` falhará com `FISCAL_ENQUEUE_AUTH`).  
- **Alinhamento de tipo de documento**:  
  No **desktop**, o tipo vem do secret **`FISCAL_DEFAULT_DOC_TYPE`** na Edge `sync-outbox` (`NFC_E_STUB` se omitido). No **caixa web**, a mesma variável pode existir no Next (`pdv-importados`); valide paridade entre ambientes se quiser o mesmo tipo (`NFC_E_STUB`, `NFCE` ou `NFE`).

#### Demais secrets — `sync-outbox` (PDV local → nuvem + catálogo)

| Secret | Nota |
|--------|------|
| `SYNC_KEY` | Mesmo valor configurado em `pdv-local/.env` (nunca no bundle Next público) |
| `USE_UNIFIED_SALES_FLOW` | Alinhar com `pdv-importados` (ex.: `true` em produção quando adotado) |
| `STRICT_MANAGER_DISCOUNT_AUTH` | Alinhar com a web |
| `SYNC_OUTBOX_EXPOSE_INTERNAL_ERRORS` | Produção: manter **desligado** ou `false` |
| `CANARY_DEVICE_FINGERPRINTS` | Opcional; só se usar rollout por fingerprint |
| `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE` | Ver **§3.2** (comportamento e pré-requisitos). |
| `FISCAL_DEFAULT_DOC_TYPE` | Secret opcional na Edge quando o enqueue do desktop está ativo; ver também alinhamento em **§3.2**. |

### 3.3 — `validar-gerente` (desconto gerente na web)

| Secret | Nota |
|--------|------|
| `VALIDAR_GERENTE_CORS_STRICT` | Produção: `true` |
| `VALIDAR_GERENTE_ALLOWED_ORIGINS` | Lista separada por vírgula (origens exatas do app), ex.: `https://app.seudominio.com` |

### 3.4 — `fiscal-worker` (fila fiscal)

| Secret | Nota |
|--------|------|
| `FISCAL_WORKER_KEY` | Mesmo valor que `FISCAL_WORKER_KEY` no servidor Next (`pdv-importados/.env` / Vercel), header `X-FISCAL-WORKER-KEY` |
| `FISCAL_PROVIDER_TYPE` | `mock` ou `http` |
| `FISCAL_PROVIDER_URL` / `FISCAL_PROVIDER_TOKEN` / `FISCAL_PROVIDER_TIMEOUT_MS` | Obrigatórios quando `FISCAL_PROVIDER_TYPE=http` |

---

## 4. Alinhamento com `pdv-importados` (Vercel ou host Next)

| # | Verificação |
|---|-------------|
| 4.1 | `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` do **mesmo** project ref que o passo 1 |
| 4.2 | `FISCAL_WORKER_ENDPOINT` aponta para `https://<ref>.supabase.co/functions/v1/fiscal-worker` |
| 4.3 | `FISCAL_WORKER_KEY` **igual** ao secret `FISCAL_WORKER_KEY` da Edge |
| 4.4 | Flags `USE_UNIFIED_SALES_FLOW` e `STRICT_MANAGER_DISCOUNT_AUTH` **iguais** às secrets do `sync-outbox` quando o fluxo depender delas |
| 4.5 | **Não** colocar `SYNC_KEY` na Vercel (só na Edge + `pdv-local`) |

Detalhe: [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md).

---

## 5. PDV desktop (`pdv-local`)

| # | Verificação |
|---|-------------|
| 5.1 | `SYNC_ENDPOINT` = `https://<ref>.supabase.co/functions/v1/sync-outbox` |
| 5.2 | `SYNC_KEY` **idêntico** ao secret `SYNC_KEY` da function `sync-outbox` |
| 5.3 | Reiniciar o app após alterar `.env` |

---

## 6. Pós-deploy (smoke rápido)

| # | Verificação |
|---|-------------|
| 6.1 | Web: login em `/login`, rota protegida redireciona sem sessão |
| 6.2 | Web: fluxo de caixa ou gerente que exercite RPCs críticas do piloto |
| 6.3 | Desktop (se em uso): «Sincronizar catálogo» sem **401** |
| 6.4 | Logs no Dashboard: Edge Functions sem erros de `MISSING_SUPABASE_ENV` |

Smoke SQL opcional: `backend/supabase/scripts/smoke_operacao_fluxo_completo.sql` (ambiente de teste; cria dados fictícios).

---

## 7. Se algo vazou ou foi commitado por engano

1. Rotacionar **service_role** no Dashboard (API → rotate).
2. Gerar novo **`SYNC_KEY`** e atualizar secrets da Edge + `pdv-local/.env`.
3. Gerar novo **`FISCAL_WORKER_KEY`** e alinhar Edge + Vercel.
4. Revisar histórico do Git e suporte Supabase conforme política da organização.

---

## Referência rápida — URLs das Functions

Substitua `<ref>` pelo Reference ID do projeto:

- `https://<ref>.supabase.co/functions/v1/sync-outbox`
- `https://<ref>.supabase.co/functions/v1/validar-gerente`
- `https://<ref>.supabase.co/functions/v1/fiscal-worker`
