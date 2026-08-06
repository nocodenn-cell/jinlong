# Auditoria de drift de migrations — produção × repositório (2026-08-06)

> **Diagnóstico. Nada foi alterado no banco nem no histórico do Git durante esta investigação.**
> Nenhuma migration foi criada, renomeada ou reescrita aqui.

**Projeto:** `jinlong` (`kbabmewnahysfvlybiak`) · **Repo:** `nocodenn-cell/fastproduct` · **Base:** `origin/main` (`1b0dfdf`)
**Fontes:** `supabase_migrations.schema_migrations`, catálogo `pg_*`, `git log --all`, `git for-each-ref`, logs de CI.

---

## 1. Resumo executivo

| Métrica | Valor |
|---|---:|
| Migrations registradas em produção | **257** |
| Arquivos `.sql` em `backend/supabase/migrations/` | **241** |
| Versões em produção sem arquivo correspondente no repo | **24** |
| — destas, **realmente ausentes de todo o Git** | **14** |
| — destas, presentes em **branch não mergeado** | **2** |
| — destas, **divergência só de nomenclatura** (conteúdo existe em `main`) | **4** |
| — destas, **introduzidas por esta própria sessão** | **4** |
| Pares fora de ordem (repo aplica antes, produção aplicou depois) | **2.932** |
| — destes, que **quebram de fato** a reconstrução | **3** |
| — destes, que são no-op silencioso sem divergência | **1** |

> **A conclusão mais acionável de toda a auditoria:** as 2.932 inversões de ordem soam
> catastróficas, mas **um único rename destrava a reconstrução inteira** —
> `248_devolver_ou_trocar_venda.sql` → `20260717031500_248_devolver_ou_trocar_venda.sql`.
> Esse rename **já existe, pronto e com conteúdo byte-idêntico**, no branch
> `origin/chore/node22-alignment`.

---

## 2. Migrations em produção e ausentes do repositório

### 2.1 Grupo A — realmente ausentes de todo o Git (14) 🔴 **CRÍTICO**

Busca feita em **todos os 272 refs** (258 branches remotas + 12 tags), não só em `main`:

```
git log --all --oneline --name-only --diff-filter=A -- 'backend/supabase/migrations/*<padrão>*'
→ 0 resultados para cada um dos 14 padrões abaixo
```

| Versão | Nome registrado no banco | Tamanho do SQL |
|---|---|---:|
| `20260805151822` | `289_hardening_autorizacao_rpcs_p0` | 12.834 B |
| `20260805185445` | `291_estoque_baixas_integridade` | 10.371 B |
| `20260805185458` | `293_documentos_fiscais_dlq_enable_rls` | 1.676 B |
| `20260805190920` | `294_fornecedores_multi_tenant` | 12.809 B |
| `20260805193920` | `295_ordem_compra_conferencia` | 9.411 B |
| `20260805213357` | `296_nfe_conferencia` | 31.519 B |
| `20260806000032` | `297_configuracoes_gerais_whitelist` | 1.309 B |
| `20260806002522` | `298_br01_limite_credito_por_modo_loja` | 27.350 B |
| `20260806002925` | `299_tb07_pagamento_contas_pagar_limite_saldo` | 5.398 B |
| `20260806004637` | `300_br03_custo_unitario_snap_servidor` | 23.493 B |
| `20260806005804` | `301_revoke_anon_execute_finalizar_venda_v4_pos_br01` | 1.445 B |
| `20260806011719` | `302_f1_05_formas_pagamento_parametrizavel` | 25.140 B |
| `20260806090414` | `303_ssot04_kardex_cancelamento_devolucao` | 16.097 B |
| `20260806090531` | `304_ssot04_drop_baixar_estoque_venda` | 725 B |

**~178 KB de DDL sem nenhum rastro em Git.** Aplicadas entre 2026-08-05 15:18 e 2026-08-06 09:05 UTC.
Corroborado de forma independente por `npm run guard:migrations`, que reporta
`gaps de numeração: … 289–304 …`.

Pelos nomes, o conteúdo é regra de negócio central: multi-tenant de fornecedores, conferência
de recebimento/OC/NF-e, limite de crédito por modo de loja, snapshot de custo unitário no
servidor, formas de pagamento parametrizáveis e kardex de cancelamento/devolução.

> **Nota:** os números `290` e `292` **não existem** em produção — a sequência do autor pulou
> os dois. Não são migrations perdidas.

### 2.2 Grupo B — presentes em branch não mergeado (2) 🟠 **ALTO**

| Versão | Nome | Onde está |
|---|---|---|
| `20260801090000` | `v_estoque_ledger_divergencia` | `origin/chore/dominio-onda0-onda-a` · `origin/chore/node22-alignment` (commit `5d18cbb2`) |
| `20260801120000` | `recebimento_conferencia_explicita` | mesmos branches (commit `1a423277`) |

Não estão perdidas — estão em branch. Basta publicar.

### 2.3 Grupo C — divergência só de nomenclatura (4) 🟡 **MÉDIO**

O conteúdo **está em `main`**; o que diverge é o prefixo de versão. Confirmado por hash de blob:
os arquivos renomeados no branch são **byte-idênticos** aos de `main`.

| Produção registrou | `main` tem o arquivo como | Rename já pronto em `node22-alignment` | Conteúdo |
|---|---|---|---|
| `20260707000000` `venda_eventos_ledger` | `228_venda_eventos_ledger.sql` | `20260707000000_venda_eventos_ledger.sql` | **IDÊNTICO** |
| `20260707010000` `gerente_venda_eventos_rpcs` | `231_gerente_venda_eventos_rpcs.sql` | `20260707010000_gerente_venda_eventos_rpcs.sql` | **IDÊNTICO** |
| `20260707020000` `consistencia_vendas_auditoria` | `244_consistencia_vendas_auditoria.sql` | `20260707020000_consistencia_vendas_auditoria.sql` | **IDÊNTICO** |
| `20260717031500` `248_devolver_ou_trocar_venda` | `248_devolver_ou_trocar_venda.sql` | `20260717031500_248_devolver_ou_trocar_venda.sql` | **IDÊNTICO** |

**Não representam risco para a produção atual** — o schema está correto. Representam risco de
reconstrução (§3) e ruído permanente no gate `migration-remote-drift`.

### 2.4 Grupo D — introduzidas por esta sessão (4) 🟡 **MÉDIO**

Divergência que **este PR criou** e que precisa ser registrada com honestidade: as migrations
D-1/D-2/D-3 e o hardening foram aplicadas via `apply_migration`, que atribuiu versão por
timestamp, enquanto os arquivos no repositório seguiram a convenção `NNN_` vigente.

| Produção registrou | Arquivo no repositório |
|---|---|
| `20260806134834` `305_d1_drop_fiscal_reprocessar_documento_overload` | `305_d1_drop_fiscal_reprocessar_documento_overload.sql` |
| `20260806135106` `306_d2_maquina_estados_fiscal` | `306_d2_maquina_estados_fiscal.sql` |
| `20260806135429` `307_d3_reaper_fiscal_em_processamento` | `307_d3_reaper_fiscal_em_processamento.sql` |
| `20260806140528` `308_hardening_tg_documentos_fiscais_estado` | `308_hardening_tg_documentos_fiscais_estado.sql` |

**Impacto real: baixo.** As quatro são idempotentes (`DROP … IF EXISTS`, `ADD COLUMN IF NOT
EXISTS`, `CREATE OR REPLACE`, `REVOKE`), então uma reaplicação em rebuild é segura. Mas é drift
do mesmo tipo que esta auditoria denuncia, e o correto é renomear os quatro arquivos para o
prefixo que produção gravou.

> **Não renomeados aqui por instrução explícita** desta tarefa ("não recrie, renomeie ou
> reescreva migrations"). Fica como o item de menor esforço e menor risco da lista — quatro
> `git mv`, zero mudança de conteúdo.

---

## 3. Ordem cronológica × ordem lexicográfica

A aplicação local (`supabase start` / `db reset`) é **lexicográfica pelo nome do arquivo**.
Como `"205_" > "2026"` (o terceiro caractere `5` > `2`), **todos os arquivos `NNN_` com
N ≥ 205 ordenam depois de todos os arquivos com prefixo de timestamp** — o oposto da ordem
real de criação.

Comparando a ordem de aplicação registrada no banco com a ordem lexicográfica do repositório:

```
pares invertidos (repo aplica antes, produção aplicou depois): 2.932
arquivos com 76 inversões cada: os 13 arquivos 2026-07/2026-08 de prefixo timestamp
```

### 3.1 Divergências que **impedem** a reconstrução 🔴 **CRÍTICO** (3)

Só quebram os casos em que um arquivo faz `GRANT`/`REVOKE`/`ALTER`/`CREATE POLICY|INDEX|
TRIGGER` sobre um objeto criado por arquivo que ordena **depois**. Varredura exaustiva sobre
os 241 arquivos encontrou exatamente **3 quebras reais**, todas com a **mesma raiz**:

| Arquivo que falha | Referência | Objeto criado só em |
|---|---|---|
| `20260717031639_248_fix_anon_grant_drift.sql` | `REVOKE … ON FUNCTION devolver_ou_trocar_venda` | `248_devolver_ou_trocar_venda.sql` |
| `20260717031919_248_fix_quantidade_devolvida_grant.sql` | `GRANT … ON FUNCTION quantidade_devolvida_item_venda` | `248_devolver_ou_trocar_venda.sql` |
| `20260717031938_248_fix_quantidade_devolvida_anon_grant.sql` | `REVOKE … ON FUNCTION quantidade_devolvida_item_venda` | `248_devolver_ou_trocar_venda.sql` |

**Evidência de execução real** — CI job `Supabase local RLS smoke`,
[run 31109336512](https://github.com/nocodenn-cell/fastproduct/actions/runs/31109336512):

```
Applying migration 20260717031639_248_fix_anon_grant_drift.sql...
ERROR: function public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb,
       numeric, text, uuid, uuid) does not exist (SQLSTATE 42883)
```

O stack local nunca sobe (`No such container: supabase_db_fastproduct`), o que derruba em
cascata os jobs `Supabase local RLS smoke` e `Test RLS scope by profile`.

> **Um único rename resolve as três.** Mover `248_devolver_ou_trocar_venda.sql` para
> `20260717031500_248_devolver_ou_trocar_venda.sql` o coloca antes dos três dependentes
> (`031500` < `031639` < `031919` < `031938`) **e** alinha com o que produção registrou.
> Isso explica por que a tentativa anterior (certificação §5) "corrigiu um ponto e outro
> apareceu": os três pontos são o mesmo arquivo mal posicionado, e renomear os vizinhos
> errados só move o sintoma.

### 3.2 Divergência que **não** impede a reconstrução 🟢 **BAIXO** (1)

| Arquivo | Referência | Objeto criado só em |
|---|---|---|
| `20260618011821_113_rls_audit_fixes.sql` | `ALTER TABLE IF EXISTS public.venda_eventos ENABLE ROW LEVEL SECURITY` | `228_venda_eventos_ledger.sql` |

Usa `IF EXISTS`, logo **não falha** — vira no-op silencioso. E **não gera divergência de
schema**: `228_venda_eventos_ledger.sql` já habilita RLS e cria a policy por conta própria
(linhas 33 e 39). Confirmado em produção: `relrowsecurity = true`, 1 policy ativa.

Atenção: o rename do Grupo C **não corrige** este caso (`20260618011821` continua ordenando
antes de `20260707000000`) — e não precisa corrigir, porque o efeito final é idêntico.

### 3.3 As outras ~2.928 inversões 🟢 **BAIXO**

São reordenações entre migrations sem dependência direta entre si (índices, policies, RPCs
independentes, seeds). Produzem um schema final equivalente. **Não bloqueiam nada** e não
justificam, por si, uma renumeração completa do histórico.

---

## 4. Onde estão as migrations e como reintegrá-las

### 4.1 Branch de origem localizado

**`origin/chore/node22-alignment`** — último commit `b10b4c22` (2026-08-02),
8 commits à frente de `main` e **0 commits de `main` ausentes** (superconjunto estrito).

```
b10b4c22 docs: add supabase migration repair audit
ec6f966c fix: align supabase migrations and revoke operator product creation
8b490a7c chore: remove orphaned Claude worktree gitlink
0ffef76c chore(ci): align Node version to 22
416842a7 chore(repo): add root typecheck script
1a423277 feat(recebimento): conferencia como etapa obrigatoria (Onda B)
5d18cbb2 feat(estoque): detector de divergencia entre saldo e ledger (Onda A)
27e56c85 refactor(dominio): autoridade unica de invalidacao de cache e de escrita de estoque
```

Contém: os **4 renames do Grupo C** (byte-idênticos) e as **2 migrations do Grupo B**.
Traz também a auditoria completa do reparo já executado:
`backend/docs/auditoria/supabase-migration-repair-20260802/` (10 arquivos, incluindo
`remote_schema.sql` e os `migration_status_*.txt` de antes e depois).

O procedimento documentado ali usou `supabase migration repair` e criou backup do histórico —
**confirmado vivo no banco**: a tabela `public._backup_schema_migrations_20260802` existe.

`origin/chore/dominio-onda0-onda-a` (commit `416842a7`, 2026-08-02) contém apenas as 2
migrations do Grupo B — é um subconjunto de `node22-alignment`.

### 4.2 Procedimento recomendado

1. **Publicar `origin/chore/node22-alignment` em PR próprio.** Fecha de uma vez o Grupo B
   (2 migrations), o Grupo C (4 renames) e — por consequência do rename do `248` — **as 3
   quebras críticas de reconstrução**. Como o branch é superconjunto de `main` e os renames
   são byte-idênticos, o diff é pequeno e auditável.
2. **Validar** com o gate que hoje falha: `Supabase local RLS smoke` deve passar a subir o
   stack. É a prova objetiva de que a reconstrução voltou a funcionar.
3. **Localizar o autor das 14 do Grupo A** (janela 2026-08-05 15:18 → 2026-08-06 09:05 UTC,
   por `schema_migrations`) e publicar o branch com os `.sql` **e** o código de aplicação que
   os consome. Os números `289`–`304` estão livres no repositório e batem com os nomes já
   gravados no banco.
4. **Só então** declarar o schema reconciliado.

### 4.3 Por que o Grupo A não foi reconstruído por engenharia reversa

Extrair `statements` de `schema_migrations` e gravar como `.sql` é possível, e foi descartado:

- **Criaria duplicata divergente** — as migrations têm cabeçalho, numeração própria e blocos
  `DO $verify$` no estilo do projeto; existe um autor e provavelmente um branch. Dois arquivos
  para a mesma migration no dia em que esse branch subir é pior que a ausência.
- **Entregaria metade da mudança** — o código de aplicação que consome esse schema também
  está fora de `main`.
- **Perderia a intenção** — justificativa, mapeamento de chamadores e plano de rollback, que
  este projeto exige em toda migration, não são recuperáveis de `pg_get_functiondef`.

---

## 5. Classificação final por impacto

| # | Divergência | Impacto | Bloqueia reconstrução? | Afeta produção hoje? |
|---|---|---|:---:|:---:|
| 1 | 14 migrations do Grupo A ausentes de todo o Git | 🔴 **Crítico** | **Sim** — rebuild passa e entrega schema **sem** essas regras, silenciosamente | Não — produção tem o schema |
| 2 | 3 quebras de dependência por ordem (raiz: `248_devolver_ou_trocar_venda.sql`) | 🔴 **Crítico** | **Sim** — erro duro `SQLSTATE 42883`, stack não sobe | Não |
| 3 | 2 migrations do Grupo B em branch não mergeado | 🟠 **Alto** | Sim, parcialmente | Não |
| 4 | 4 divergências de nomenclatura do Grupo C | 🟡 **Médio** | Indiretamente (o `248` é a raiz do item 2) | Não |
| 5 | 4 divergências de nomenclatura do Grupo D (desta sessão) | 🟡 **Médio** | Não — as 4 são idempotentes | Não |
| 6 | `20260618011821` → `venda_eventos` (`ALTER TABLE IF EXISTS`) | 🟢 **Baixo** | Não — no-op, e o `228` já habilita RLS | Não |
| 7 | ~2.928 inversões restantes sem dependência | 🟢 **Baixo** | Não | Não |

**Nenhuma das 7 divergências afeta a operação da produção atual.** O schema de produção está
íntegro porque foi construído incrementalmente, cada migration na sua ordem real. Todas as 7
são risco de **reconstrução, auditoria e governança** — que é exatamente o que se cobra num
cenário de disaster recovery ou de criação do ambiente de staging (bloqueador P0-3).
