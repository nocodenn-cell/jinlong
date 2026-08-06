# Drift de migrations — produção à frente do repositório (2026-08-06)

> **Achado novo, classificado P0 (Single Source of Truth).** Encontrado ao verificar o
> estado real do banco antes de executar os itens D-1/D-2/D-3. Não é reincidência do
> achado de *ordenação* de migrations (`GO_LIVE_CERTIFICATION_REPORT.md` §5) — é um
> problema diferente: **16 migrations existem em produção e em nenhum lugar do Git.**

**Projeto:** `jinlong` (`kbabmewnahysfvlybiak`) · **Repo:** `nocodenn-cell/fastproduct`
**Método:** 100% leitura. `supabase_migrations.schema_migrations` × `git log --all`.

---

## 1. O achado

`main` (`1b0dfdf`, 2026-07-31) é o commit mais recente do repositório. Entre 2026-08-01 e
2026-08-06 foram aplicadas **16 migrations em produção** cujo arquivo `.sql` **não existe
em nenhuma branch, tag ou commit** do repositório.

| # | Versão aplicada | Nome registrado | Tamanho do SQL |
|---|---|---|---:|
| 1 | `20260801090000` | `v_estoque_ledger_divergencia` | 2.133 B |
| 2 | `20260801120000` | `recebimento_conferencia_explicita` | 9.113 B |
| 3 | `20260805151822` | `289_hardening_autorizacao_rpcs_p0` | 12.834 B |
| 4 | `20260805185445` | `291_estoque_baixas_integridade` | 10.371 B |
| 5 | `20260805185458` | `293_documentos_fiscais_dlq_enable_rls` | 1.676 B |
| 6 | `20260805190920` | `294_fornecedores_multi_tenant` | 12.809 B |
| 7 | `20260805193920` | `295_ordem_compra_conferencia` | 9.411 B |
| 8 | `20260805213357` | `296_nfe_conferencia` | 31.519 B |
| 9 | `20260806000032` | `297_configuracoes_gerais_whitelist` | 1.309 B |
| 10 | `20260806002522` | `298_br01_limite_credito_por_modo_loja` | 27.350 B |
| 11 | `20260806002925` | `299_tb07_pagamento_contas_pagar_limite_saldo` | 5.398 B |
| 12 | `20260806004637` | `300_br03_custo_unitario_snap_servidor` | 23.493 B |
| 13 | `20260806005804` | `301_revoke_anon_execute_finalizar_venda_v4_pos_br01` | 1.445 B |
| 14 | `20260806011719` | `302_f1_05_formas_pagamento_parametrizavel` | 25.140 B |
| 15 | `20260806090414` | `303_ssot04_kardex_cancelamento_devolucao` | 16.097 B |
| 16 | `20260806090531` | `304_ssot04_drop_baixar_estoque_venda` | 725 B |
| | | **Total** | **~190 KB de DDL** |

### Evidências

1. **Aplicadas em produção** — `supabase_migrations.schema_migrations` lista as 16 versões
   acima com `statements` não vazio.
2. **Ausentes do Git** — busca em **todos** os refs, não só em `main`:
   ```
   git log --all --oneline --name-only -- \
     'backend/supabase/migrations/*ssot04*' \
     'backend/supabase/migrations/*br01*' \
     'backend/supabase/migrations/*hardening_autorizacao*'
   → 0 resultados
   ```
3. **Confirmado pelo guard do próprio projeto** — `npm run guard:migrations` reporta
   `gaps de numeração: … 289–304 …`, ou seja, a faixa que existe no banco é exatamente a
   que falta no repositório.
4. **`main` não avançou** — `git fetch origin main` → `origin/main == 1b0dfdf`, o mesmo
   commit de 2026-07-31.

---

## 2. Por que é P0

O conteúdo dessas migrations, pelos nomes, é regra de negócio central e não hardening
periférico: multi-tenant de fornecedores, conferência de recebimento/OC/NF-e, limite de
crédito por modo de loja, snapshot de custo unitário no servidor, formas de pagamento
parametrizáveis e kardex de cancelamento/devolução.

| Consequência | Detalhe |
|---|---|
| **Reconstrução do banco perde regra de negócio** | Um `db reset`/novo ambiente a partir do repositório produz um schema **sem** esses 16 objetos. Diferente do achado de ordenação (§5 da certificação), aqui o rebuild não falha — ele **passa e entrega um banco errado, silenciosamente**. |
| **Não há revisão** | Nenhuma dessas mudanças passou por PR, CI, guard ou revisão humana. `build-and-test` e a proteção de branch são irrelevantes para o que nunca entrou no Git. |
| **Não há rollback versionado** | Sem arquivo, não há `ROLLBACK` documentado nem diff para auditar. |
| **Quebra o SSOT declarado** | `docs/ARCHITECTURE.md` e `CONTRIBUTING.md` definem `backend/supabase/migrations/` como fonte única do schema. Hoje ela não é. |
| **Código consumidor também ausente** | As migrations sugerem telas/actions (conferência, formas de pagamento, limite de crédito) que também não existem em `main` — ou seja, há uma frente de trabalho inteira fora do repositório. |

---

## 3. Por que esta sessão **não** reconstruiu os arquivos

Extrair os `statements` do banco e gravá-los como `.sql` seria tecnicamente possível, e foi
descartado de propósito:

- **Criaria duplicata divergente.** As migrations foram claramente escritas por alguém, com
  cabeçalho, numeração própria (`289_`, `291_`, …) e blocos `DO $verify$` no mesmo estilo do
  projeto. Existe um branch de origem em algum lugar. Reconstruir por engenharia reversa e
  commitar em paralelo produziria dois arquivos para a mesma migration no dia em que esse
  branch subir.
- **Entregaria metade da mudança.** O código de aplicação que consome esse schema também
  está fora de `main`. Um repositório com as migrations e sem os consumidores é menos
  coerente, não mais.
- **Perderia a intenção.** Cabeçalho, justificativa, mapeamento de chamadores e plano de
  rollback — que este projeto exige em toda migration — não são recuperáveis do
  `pg_get_functiondef`.

**Isto é um bloqueio real que depende do dono do repositório**, não uma tarefa de código.

---

## 4. Resolução proposta (para o dono)

1. **Localizar a origem.** Identificar a sessão/branch/máquina que aplicou as 16 migrations
   entre 2026-08-01 e 2026-08-06 (os timestamps de `schema_migrations` dão a janela exata).
2. **Publicar o branch** com os arquivos `.sql` **e** o código de aplicação correspondente.
3. **Abrir PR** e submeter ao CI e aos guards como qualquer outra mudança.
4. **Reconciliar a numeração** antes do merge: o repositório está em `307` (D-1/D-2/D-3
   desta sessão ocuparam `305`–`307`); os números `289`–`304` estão livres no repositório e
   correspondem exatamente aos nomes já registrados no banco, então basta usá-los.
5. **Só então** declarar o schema reconciliado.

### Prevenção

Enquanto não houver um gate que compare `schema_migrations` com
`backend/supabase/migrations/`, este drift volta. `scripts/migration-sequence-guard.mjs` já
enxerga o buraco (`gaps de numeração`), mas trata como informativo porque não tem acesso ao
banco. Um passo de CI com credencial de leitura fecharia a lacuna — entra como item de
backlog próprio, não como correção desta rodada.

---

## 5. O que **não** é este achado

- **Não é** o achado de ordenação lexicográfica (`NNN_` × `YYYYMMDDHHMMSS_`) registrado em
  `GO_LIVE_CERTIFICATION_REPORT.md` §5. Aquele quebra o rebuild; este entrega um rebuild que
  passa com o schema errado. São independentes e ambos seguem abertos.
- **Não é** o drift de 2026-06-20 (`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`), que tratava de
  numeração colidente e conteúdo divergente para o mesmo número. Aqui não há colisão: os
  arquivos simplesmente não existem.
- **Não bloqueia** o que foi entregue nesta sessão: D-1, D-2 e D-3 foram verificados contra o
  banco vivo **depois** dessas 16 migrations, então o diagnóstico e as correções valem para o
  estado real de produção.
