# Validação do pipeline oficial de migrations — 2026-09-11

**Objetivo da sprint:** provar que o repositório reproduz o estado do banco pelo mecanismo
oficial do Supabase CLI, sem depender de aplicação manual por `psql`.

**Escopo:** as três migrations da frente Entrada → Compra → Recebimento → Estoque → Financeiro
(ver [documento canônico da frente](./FECHAMENTO_FLUXO_ENTRADA_COMPRA_ESTOQUE_FINANCEIRO.md)).

**Nada foi alterado em ambiente remoto.** Sem `migration repair`, sem `db push`, sem reset
remoto, sem `git pull`. Todas as consultas ao projeto remoto foram **somente leitura**.

Ambiente: Supabase CLI **v2.104.0**, stack local Docker (`supabase_db_fastproduct`).

---

## 1. Estado inicial — drift em duas direções

| | Antes |
|---|---|
| Arquivos em `backend/supabase/migrations/` | 368 |
| Registros em `supabase_migrations.schema_migrations` (local) | 366 |

Diff apurado com `comm` entre a lista de arquivos e a lista do ledger:

- **Arquivo sem registro (3):** `20260911120000`, `20260911130000`, `20260911140000` — as três
  da frente, aplicadas antes por `psql` direto. Era o alvo desta sprint.
- **Registro sem arquivo (1):** `20260909200000` — **não era drift real**, ver seção 2.

---

## 2. O bloqueio inicial e sua causa raiz

`npx supabase migration up --local` **recusou**:

```
Remote migration versions not found in local migrations directory.
Make sure your local git repo is up-to-date. If the error persists, try repairing
the migration history table:
supabase migration repair --status reverted 20260909200000
```

**`migration repair` foi deliberadamente NÃO executado.** Ele removeria o registro do ledger
enquanto o DDL continua fisicamente aplicado no banco — mascararia o drift em vez de resolvê-lo.

**Causa raiz apurada:** o working tree estava desatualizado.

```
main local:  6ab4c673
origin/main: 8bc56764
git rev-list --left-right --count main...origin/main  ->  0  1   (0 à frente, 1 atrás)
```

A única migration ausente era exatamente `20260909200000_cancelar_venda_saldo_caixa_insuficiente.sql`,
presente em `origin/main` pelo commit **`8bc56764`** — *"fix(caixa): cancelamento nao pode
descartar em silencio o estorno em dinheiro (#409)"*.

Para destravar o teste, o arquivo foi materializado temporariamente de `origin/main`
(byte-idêntico, md5 `5adb4cae52679e9a3605f763e25ef574`) e **removido ao final**. O repositório
terminou a sprint com os mesmos 368 arquivos com que começou.

---

## 3. `migration up --local` — validado

Com o conjunto de arquivos completo, o caminho oficial aplicou as três:

```
Applying migration 20260911120000_contas_pagar_numero_nfe_canonico.sql...
NOTICE (42701): column "parcela_numero" of relation "contas_pagar" already exists, skipping
Applying migration 20260911130000_receber_ordem_compra_gera_contas_pagar.sql...
NOTICE (42701): column "data_vencimento" of relation "ordens_compra" already exists, skipping
NOTICE (42701): column "ordem_compra_id" of relation "contas_pagar" already exists, skipping
NOTICE (42P07): relation "contas_pagar_ordem_compra_unico" already exists, skipping
Applying migration 20260911140000_vinculo_oc_nfe_guarda_dupla_entrada.sql...
NOTICE (42701): column "ordem_compra_id" of relation "importacoes_nfe" already exists, skipping
NOTICE (42P07): relation "importacoes_nfe_ordem_compra_unico" already exists, skipping
Local database is up to date.
```

Os `NOTICE ... already exists, skipping` são as guardas de idempotência funcionando como
projetadas. Os blocos `DO $verify$` de cada migration passaram (não houve exceção).

---

## 4. Ledger local = arquivos locais, drift zero

Depois do apply oficial:

| | Depois |
|---|---|
| Arquivos | 369 (368 + o materializado temporariamente) |
| Ledger local | **369** |
| `comm -23` (arquivo sem ledger) | vazio |
| `comm -13` (ledger sem arquivo) | vazio |

As três registradas no topo, na ordem correta, depois de `20260909200000`.

---

## 5. Backfill do P0-1 — idempotência comprovada em dado real

Snapshot de `public.contas_pagar` **antes** e **depois** de reaplicar a migration pelo caminho
oficial (o `UPDATE` de backfill rodou uma segunda vez):

| Métrica | Antes | Depois |
|---|---|---|
| md5 de `id ‖ nfe_numero ‖ parcela_numero` (14 linhas) | `885c0b8f506bc87cb0c476d730bc0e21` | `885c0b8f506bc87cb0c476d730bc0e21` |
| `sum(estoque.quantidade_atual)` | 230836.000 | 230836.000 |
| linhas em `movimentos_estoque_log` | 3028 | 3028 |

**Hash idêntico.** Nenhum dado mutado. O `COALESCE(parcela_numero, nfe_numero)` preserva o valor
já correto numa segunda passagem. Estoque e kardex intactos.

---

## 6. `db reset --local` — reconstrução limpa comprovada

Tentativa anterior descartada: criar um banco de rascunho com `CREATE DATABASE` puro **não
funciona** — falta o schema `auth` que o GoTrue provisiona (`ERROR: schema "auth" does not exist`
na primeira migration). Um banco limpo faiel exige o caminho do CLI.

`npx supabase db reset --local` reconstruiu do zero pelos 369 arquivos.

O comando terminou com **exit 1**, mas por **readiness do container de storage**
(`supabase_storage_fastproduct container is not ready: starting`) — **não por migration**. O
storage subiu logo em seguida e ficou saudável. A fase de migrations completou:

Prova de que a reconstrução foi real (dados de QA apagados, seed restaurado):

```
contas_pagar=0  importacoes_nfe=0  ordens_compra=0  kardex=0
produtos=15     usuarios=4
```

Objetos dos três P0 presentes no build limpo:

```
contas_pagar.parcela_numero      = 1
contas_pagar.ordem_compra_id     = 1
ordens_compra.data_vencimento    = 1
importacoes_nfe.ordem_compra_id  = 1
rpc vincular_importacao_nfe_ordem_compra = 1
```

> Nota: o CI já executa `supabase db reset --local --yes` em
> `.github/workflows/ci-backend-supabase.yml` e `ci-pdv-importados.yml`. Reconstrução limpa é
> prática estabelecida do projeto — mas as três migrations desta frente **ainda não passaram
> pelo CI**, por não estarem commitadas no momento desta validação.

---

## 7. Invariantes dos P0 — 13 asserções passando

Executados contra o banco **reconstruído do zero**, em `BEGIN … ROLLBACK`:

| Arquivo | Asserções | Falhas |
|---|---|---|
| `backend/scripts/contas-pagar-numero-nfe-canonico.test.sql` | 3 | 0 |
| `backend/scripts/receber-ordem-compra-gera-ap.test.sql` | 5 | 0 |
| `backend/scripts/vinculo-oc-nfe-dupla-entrada.test.sql` | 5 | 0 |

**Total: 13 asserções, 0 falhas.**

---

## 8. Demais checks

| Check | Resultado | Quando |
|---|---|---|
| `check-types-drift` | OK — tipos em dia, 6.597 linhas | nesta sprint, contra o banco reconstruído |
| `route-guard` | OK — 28 rotas `/admin` com página | nesta sprint |
| `next build` | OK | encerramento da sprint anterior |
| ESLint (`app`, `components`, `lib`) | OK | encerramento da sprint anterior |
| Vitest (suíte completa) | 1.328 passando; 2 arquivos falhando por ambiente | encerramento da sprint anterior |

**Build, lint e Vitest não foram reexecutados nesta sprint** — nenhum código funcional foi
alterado aqui (as únicas escritas foram documentação e um arquivo de migration temporário,
removido). As duas falhas de Vitest (`productUpdater.semRpc.integracao`,
`produtosFiscalEdicao.integration`) são pré-existentes e ambientais: as chaves de `.env.local`
apontam para o projeto remoto enquanto o stack local está no ar.

---

## 9. `20260910114603` — origem identificada

Registro presente no **ledger remoto** sem arquivo correspondente no repositório.

**Origem: aplicação direta pelo SQL Editor do Supabase Studio**, em 2026-09-10 11:46:03.
O arquivo nunca existiu no repositório — ausente de todo commit, branch, tag, stash, reflog e
worktree (`git log --all --name-only` sem correspondência).

Três indícios convergentes:

1. O statement termina com `NOTIFY pgrst, 'reload schema';` — o Studio anexa isso ao salvar SQL
   como migration. Nenhum arquivo do repositório contém essa linha.
2. Timestamp com precisão de segundos (`114603`), contra o padrão manual do projeto (`HH0000`).
3. Gravada como **1 único statement** de 7.334 bytes contendo a função *e* o `COMMENT` — o
   Studio grava o conteúdo inteiro do editor como uma entrada; `db push` gravaria statements
   separados.

Metadados do registro remoto:

```
version = 20260910114603
name    = cancelar_venda_saldo_caixa_insuficiente
n_statements = 1   |  bytes = 7334  |  md5 = f9c3fb15215388d442c3a509f059e328
inicio: CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(...)
fim:    ...COMMENT ON FUNCTION ... '(migration 2026-09-09).';  NOTIFY pgrst, 'reload schema';
```

---

## 10. Conteúdo provado byte-idêntico a `20260909200000`

O `name` do registro remoto é **exatamente** o nome do arquivo já versionado em `origin/main`:
`20260909200000_cancelar_venda_saldo_caixa_insuficiente.sql` (commit `8bc56764`, PR #409).

Comparação do objeto efetivamente instalado nos dois bancos:

| | md5 de `pg_get_functiondef('public.cancelar_venda_transacional(uuid,text,uuid)')` | bytes |
|---|---|---|
| Local (reconstruído do arquivo `20260909200000`) | `5b72f88a4da6cb5939d93980b59076fc` | 6.956 |
| Remoto (aplicado como `20260910114603`) | `5b72f88a4da6cb5939d93980b59076fc` | 6.956 |

**Idênticos.** É a mesma mudança sob outro identificador de versão. O statement remoto difere do
arquivo apenas no que não é executável: faltam as 48 linhas de cabeçalho `--` que documentam o
achado, e sobra o `NOTIFY`. O próprio texto do `COMMENT` gravado no remoto se autodenomina
*"(migration 2026-09-09)"*.

**Não há arquivo a recuperar nem a reconstruir:** o repositório já contém a versão canônica, mais
completa que o statement remoto. Alterações: **zero** — a divergência é de identificador, não de
conteúdo. Risco de dados numa eventual reconciliação: nulo, porque nenhuma reaplicação mudaria o
objeto.

---

## 11. Diff completo repositório × remoto

Apurado por leitura do ledger remoto (`>= 2026-08-01`) e `comm` contra os arquivos do repositório.

**Só no remoto — bloqueia o apply oficial no alvo (1):**

```
20260910114603
```

**Só no repositório — pendentes de aplicar no alvo (20):**

As 3 desta frente, mais **17 que NÃO são desta frente**, de 02–03/09, todas de fiscal e
pagamentos:

```
20260902130000_fiscal_payload_snapshot_venda
20260902130100_fiscal_provider_config
20260902140000_produtos_icms_origem
20260902140100_criar_produto_icms_origem
20260902140200_atualizar_produto_icms_origem
20260902140300_fiscal_payload_snapshot_icms_origem
20260902150000_list_produtos_gerente_filtrados_campos_fiscais
20260902160000_documentos_fiscais_venda_id_restrict
20260903100000_fiscal_claim_ja_tentou_emissao
20260903110000_fiscal_delete_integrity
20260903120000_fiscal_provider_identity_imutavel
20260903130000_registrar_venda_pagamentos_split
20260903140000_registrar_venda_pagamentos_idempotencia
20260903150000_fiscal_xml_persistence
20260903160000_fiscal_eventos_provider_congelado
20260903170000_fiscal_xml_lease_concorrencia
20260903180000_fiscal_hotfix_codex_review
```

> **Um `migration up` no alvo NÃO aplicaria só as três desta frente — aplicaria as 20**,
> incluindo alterações em produtos, vendas, pagamentos e toda a fila fiscal. Isso é uma janela de
> deploy de escopo muito maior, com validação e plano de rollback próprios. **Não aplicar
> automaticamente.**

---

## 12. Risco estrutural — alterações via Studio fora do pipeline

O ledger remoto tem **349 registros**, dos quais **36 carregam a assinatura do Studio**
(`NOTIFY pgrst` no corpo do statement). Aplicar mudanças pelo Dashboard é **prática recorrente**
neste projeto, não um caso isolado.

`20260910114603` é apenas a instância mais recente. Enquanto o Studio continuar sendo usado para
aplicar DDL no remoto, o drift volta a aparecer — esta validação trata o sintoma de 10/09, não a
causa.

---

## ESTADO FINAL

### RESOLVIDO

- **Prova do pipeline:** `migration files → Supabase CLI → banco` funciona. `migration up --local`
  aplicou as três e o ledger ficou correto (369 = 369, drift zero nos dois sentidos).
- **Prova de reconstrução limpa:** `db reset --local` reconstruiu do zero pelos arquivos, com os
  objetos dos três P0 presentes e os dados de QA comprovadamente apagados. Falha final foi de
  readiness de container, não de migration.
- **Prova das migrations P0:** 13 asserções SQL transacionais passando no banco reconstruído.
- **Prova de idempotência:** backfill do P0-1 reaplicado sem mutar um byte — hash de
  `contas_pagar`, soma de estoque e contagem de kardex idênticos antes e depois.
- **Origem do `20260910114603`:** aplicação via Supabase Studio em 10/09 11:46:03, conteúdo
  byte-idêntico ao `20260909200000` já presente em `origin/main`.
- **Nenhum `repair`, push ou alteração em banco compartilhado** foi realizado.

### PENDENTE

1. **Atualizar o `main` local** — está 1 commit atrás de `origin/main` (`6ab4c673` → `8bc56764`).
   Enquanto não for atualizado, o `migration up` local volta a ser recusado. Não executado aqui
   por decisão: há 24+ arquivos modificados na árvore e o `git pull` é decisão do dono do repo.
2. **Reconciliar formalmente o ledger remoto** — registrar `20260909200000` como aplicado no
   remoto (o objeto está lá, byte-idêntico). **Não remover `20260910114603`**: ela documenta um
   fato real; apagá-la seria mascarar o drift.
3. **Avaliar as 17 migrations pendentes antes do próximo deploy** — escopo fiscal/pagamentos,
   janela de validação e rollback próprios.
4. **Definir política para impedir novo drift via SQL Editor/Studio.**

---

## Estado do ambiente local ao fim da sprint

- Repositório: **368** arquivos de migration (o materializado temporariamente foi removido).
- Ledger local: **369** registros → o drift de `20260909200000` **voltou**, e é esperado: some
  sozinho quando o `main` local for atualizado (pendência 1).
- Banco local: reconstruído do zero, **somente com seed** (`produtos=15`, `usuarios=4`). Os dados
  de QA das sprints anteriores — a ordem de compra `50467B28`, as importações de NF-e — foram
  apagados pelo `db reset`.
- Banco de rascunho `qa_pipeline`: criado durante a investigação e **removido**.

---

## Comandos úteis para a próxima pessoa

```bash
# Diff arquivos x ledger local
docker exec supabase_db_fastproduct psql -U postgres -d postgres -tAc \
  "select version from supabase_migrations.schema_migrations order by version;" \
  | tr -d ' \r' | grep -v '^$' | sort > /tmp/ledger.txt
ls backend/supabase/migrations/*.sql | xargs -n1 basename | sed 's/_.*//' | sort > /tmp/arq.txt
comm -23 /tmp/arq.txt /tmp/ledger.txt   # arquivo sem registro
comm -13 /tmp/arq.txt /tmp/ledger.txt   # registro sem arquivo

# Local x remoto (somente leitura)
cd backend && npx supabase migration list
node scripts/p0-migration-status.mjs

# Caminho oficial
cd backend && npx supabase migration up --local
cd backend && npx supabase db reset --local

# Invariantes dos P0
cd backend/scripts && for t in contas-pagar-numero-nfe-canonico \
  receber-ordem-compra-gera-ap vinculo-oc-nfe-dupla-entrada; do
  docker exec -i supabase_db_fastproduct psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 < "$t.test.sql" 2>&1 | grep -cE "^NOTICE.*OK"
done
```

---

**Sprint encerrada.** A próxima — *imitar a experiência operacional do Bling* — é frente separada
e só deve começar depois do encerramento formal desta.
