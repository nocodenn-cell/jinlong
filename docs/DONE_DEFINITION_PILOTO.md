# Done Definition — Piloto (FastProduct)

> **2026-08-27:** as caixas `[ ]` abaixo são o critério de **fechamento operacional
> longo** (loja/fiscal/smoke SQL). O GO de **release** `e1327e62` já ocorreu —
> [piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md](./piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md).
> Não interpretar este arquivo em branco como NO-GO da `main`.

Checklist de fechamento objetivo para encerrar ciclo técnico com baixo risco. **Processo + evidência:** tudo abaixo deve estar marcado e **rastreável** (PR, ticket ou cópia do [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md) com anexos).

**Relação com o P0 geral:** a [trilha T1–T12](./P0_CHECKLIST_OPERACIONAL.md#trilha-unificada-ordem-de-execução) cobre link, migrations, `sync-outbox`, web e testes §4/§4b. Este documento acrescenta **pacote mínimo de dados/loja**, **fila fiscal**, **smoke SQL longo** e **governança de release**.

---

## 1) Código e banco

| # | Critério | OK? | Evidência (link / anexo) |
|---|-----------|-----|---------------------------|
| 1.1 | **Migrations mínimas do pacote piloto** aplicadas no ambiente de homologação alvo: **032**–**038** (loja/estoque por loja, fiscal stub, fixes de RPC/estoque conforme histórico do repo). | [ ] | |
| 1.2 | **Sem lacunas:** `npx supabase migration list` (com `supabase link` no ref alvo) mostra coluna **Remote** alinhada a **todas** as migrations em `backend/supabase/migrations/` (incl. numeração **039+** e arquivos com **timestamp** no nome, se existirem no branch de release). | [ ] | |
| 1.3 | SQL Editor: `backend/supabase/scripts/verify_p0_producao.sql` executado **sem falha** no mesmo ref. | [ ] | |
| 1.4 | `fiscal-worker` **deployado** no projeto com **secrets válidos** para o modo escolhido (`mock` ou `http`). Ver [CHECKLIST_DEPLOY_SUPABASE.md §2–3](./CHECKLIST_DEPLOY_SUPABASE.md#2-edge-functions--deploy). | [ ] | |
| 1.5 | Sem erro de **lint / build / test** nos módulos que entram no release (ver §2 abaixo). | [ ] | |

> **Nota:** o intervalo **032–038** é o **pacote de referência** citado no piloto original (loja + fiscal + correções). O repositório pode exigir migrations **posteriores** para o build atual; o critério decisivo é **1.2** (sem lacunas) + **verify** + compatibilidade com as Edge deployadas.

---

## 2) Testes e compatibilidade

| # | Critério | OK? | Evidência |
|---|-----------|-----|-----------|
| 2.1 | `pdv-importados`: `npm test` verde. | [ ] | |
| 2.2 | `pdv-importados`: `npm run build` verde. | [ ] | |
| 2.3 | `pdv-local`: `npm test` verde (se desktop participar do piloto). | [ ] | |
| 2.4 | `pdv-local`: `npm run build` verde (se desktop participar do piloto). | [ ] | |
| 2.5 | Compatibilidade de **pricing / carrinho** validada entre web e desktop (registro manual ou teste cruzado acordado). | [ ] | |

---

## 3) Operação e evidências

| # | Critério | OK? | Evidência |
|---|-----------|-----|-----------|
| 3.1 | `backend/supabase/scripts/smoke_operacao_fluxo_completo.sql` executado **sem erro** no SQL Editor do ambiente de homologação (cria dados fictícios; não rodar em produção). | [ ] | |
| 3.2 | Gate operacional **GO / NO_GO** registrado, com **output** do smoke ou resumo SQL anexado. | [ ] | |
| 3.3 | Ata de homologação anexada no PR/ticket (ou referência ao arquivo de evidências do ciclo). | [ ] | |

**Pré-requisitos do smoke longo:** o script pressupõe migrations de **loja + estoque por loja** e dados mínimos (operador, produtos com estoque). Se o banco estiver vazio, prepare seed ou ajuste o ambiente antes de rodar — ver comentário no topo de `smoke_operacao_fluxo_completo.sql`.

**Automatização (opcional):** `cd backend` → `.\scripts\homologacao-p0-runner.ps1` — ver secção *Homologação automatizada* em [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md).

---

## 4) Decisão fiscal para demo

| # | Critério | OK? | Evidência |
|---|-----------|-----|-----------|
| 4.1 | Modo fiscal da demo **decidido e registrado:** `mock` controlado **ou** `http` real com provedor homologado. | [ ] | |
| 4.2 | Plano de **fallback** para demo documentado (ex.: voltar `FISCAL_PROVIDER_MODE=mock`, `FISCAL_DEFAULT_DOC_TYPE=NFC_E_STUB`, redeploy `fiscal-worker`, rollback do Next). | [ ] | |
| 4.3 | Se a decisão for **NFC-e/NFe real (Focus):** seguir ordem e gates de [CHECKLIST_ATIVACAO_FOCUS_1_DIA.md](./CHECKLIST_ATIVACAO_FOCUS_1_DIA.md) (Go/No-Go, H-0, testes A/B/C, evidências mínimas). | [ ] | |

---

## 5) Publicação e rollback

| # | Critério | OK? | Evidência |
|---|-----------|-----|-----------|
| 5.1 | Janela de publicação **definida** (data/hora + timezone). | [ ] | |
| 5.2 | Critérios de **rollback** definidos no release note (versões Edge/Next, `db push` reverso só se aplicável, rotação de secrets). | [ ] | |
| 5.3 | Responsável de **monitoramento pós-release** definido. | [ ] | |

---

## Registro no checklist de staging

Para um único artefato por ciclo, preencha também a **§7** em [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md) (tabela *Piloto: critério done*).

---

## Critério final

Somente marcar piloto como concluído quando **todos** os itens das tabelas §1–§5 estiverem `[x]` com evidência anexada.
