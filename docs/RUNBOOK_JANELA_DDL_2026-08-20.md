# Runbook — janela de DDL de 2026-08-20, 21:00 BRT

**Projeto:** `jinlong` (`kbabmewnahysfvlybiak`)
**Autorização:** dono, 2026-08-19. Loja confirmada fechada no horário.
**Escopo:** 4 migrations. **Ledger 307 → 311.**
**Pré-requisito:** PR [#310](https://github.com/nocodenn-cell/fastproduct/pull/310) mergeado.

---

## O que realmente muda

Das quatro, **três são no-op em produção** — existem para convergir o repositório com o
estado que produção já tem. Medido em 2026-08-19:

| # | Migration | Efeito em produção |
|---|---|---|
| 1 | `20260819220000` — Filial demo | **no-op** — a loja já foi removida à mão; `lojas` tem só `Matriz` |
| 2 | `20260819220100` — fiscal, assinatura única | **ÚNICO com efeito real** — cria a sobrecarga de 4 args e remove a de 3 |
| 3 | `20260819220200` — relatório 3 args | **no-op** — a sobrecarga já não existe |
| 4 | `20260819230000` — 10 funções sem consumidor | remove as que existem lá (parte já é ausente) |

> **A janela inteira é, na prática, uma troca de função.** É isso que deve ser vigiado.

### Por que a #2 importa

Produção tem só a sobrecarga de 3 args; a Edge `sync-outbox` chama com 4 e recebe
`PGRST202` — que **não falha o batch**. O corpo novo é a **união** da `099` (bloqueio
`SEM_NF`, permissão com escopo de loja, trilha `REENFILEIRADO`) com a validação `p_loja_id`
da `114`. Produção **ganha** `SEM_NF` e escopo de loja, que já deveria ter.

O caminho web chama com 3 args e continua funcionando: `p_loja_id` assume `NULL` e a
validação de loja é pulada, exatamente como hoje.

---

## Antes de abrir a janela

```bash
# 1. estar no main já com o #310 mergeado
git checkout main && git pull

# 2. o repositório deve ter 311 migrations
ls backend/supabase/migrations/*.sql | wc -l     # 311

# 3. retrato do ANTES, em produção (somente leitura)
```

```sql
SELECT count(*) AS ledger FROM supabase_migrations.schema_migrations;               -- 307
SELECT md5(pg_get_functiondef(oid)) FROM pg_proc
 WHERE proname = 'fiscal_enfileirar_documento_venda';                               -- 954b441b291de316d2c36d42f6252307
SELECT count(*) FROM public.documentos_fiscais_pendentes;                           -- anotar
SELECT count(*) FROM public.vendas;                                                 -- anotar
```

Anotar os dois últimos: são a linha de base para provar que a janela não tocou em dado.

---

## Execução

Na ordem. Não paralelizar.

```
20260819220000  →  20260819220100  →  20260819220200  →  20260819230000
```

Cada uma emite `NOTICE` dizendo o que fez. **Ler os NOTICE** — é como se distingue
"aplicou" de "não tinha nada para fazer":

- `FASE1B: loja demo ausente — nada a fazer (estado de producao).`
- `FASE1B: sobrecarga legada de 3 args removida — ambiguidade fechada.`
- `FASE1B: relatorio_consistencia_vendas(3 args) ausente — nada a remover.`
- `codigo morto SQL: N removida(s), M ja ausente(s).`

---

## Verificação pós-janela

```sql
-- 1. ledger
SELECT count(*) FROM supabase_migrations.schema_migrations;   -- 311

-- 2. assinatura única, com os 4 recursos
SELECT count(*) AS assinaturas,
       bool_or(pg_get_functiondef(oid) LIKE '%SEM_NF%')                 AS tem_sem_nf,
       bool_or(pg_get_functiondef(oid) LIKE '%u.loja_id = v.loja_id%')  AS tem_escopo_loja,
       bool_or(pg_get_functiondef(oid) LIKE '%FISCAL_ENQUEUE_LOJA_DIVERGENTE%') AS tem_p_loja_id,
       bool_or(pg_get_functiondef(oid) LIKE '%REENFILEIRADO%')          AS tem_trilha
FROM pg_proc WHERE proname = 'fiscal_enfileirar_documento_venda';
-- esperado: 1 | t | t | t | t

-- 3. as 10 funções sem consumidor sumiram
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN
 ('fn_criar_funcionario','fn_atualizar_funcionario','fn_desativar_funcionario',
  'fn_listar_funcionarios_gerente','resumo_comissoes_por_funcionario',
  'total_vendas_por_funcionario','registrar_conferencia_nfe',
  'registrar_conferencia_remessa','venda_eventos_items_from_payload',
  'decrementar_estoque_idempotente');
-- esperado: 0

-- 4. as que NÃO podiam sair continuam lá
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN
 ('verificar_consistencia_venda','relatorio_consistencia_vendas',
  'transferir_estoque_entre_lojas','fiscal_reaper_documentos');
-- esperado: 4

-- 5. nada de dado foi tocado — comparar com o retrato do ANTES
SELECT count(*) FROM public.vendas;
SELECT count(*) FROM public.documentos_fiscais_pendentes;
```

E o script completo:

```bash
# 0 falhas, e a asserção "ledger: total = 311" em t
psql "$PROD_URL" -f backend/scripts/verificacao-pos-apply.sql
```

### Smoke de venda

Uma venda `web_caixa` de ponta a ponta na Matriz, **depois cancelada**. É o mesmo
procedimento da PR #309. Confirma que a troca da função não afetou o fechamento de venda.

> O enfileiramento fiscal do caminho web está atrás de `AUTO_ENQUEUE_FISCAL_ON_SALE`, hoje
> em `fiscal.stub` — então o smoke **não** exercita a função trocada. Isso é esperado, e é
> justamente por isso que a janela é de risco baixo. Quem exercita a função é o
> `pdv-local`, que ainda não entrou.

---

## Rollback

Só a #2 precisa de rollback; as outras três são no-op ou remoções idempotentes.

```bash
# 1. recriar a sobrecarga de 3 args (estado anterior de produção)
psql "$PROD_URL" -f backend/scripts/rollback/fiscal_enfileirar_documento_venda.pre-2026-08-19.sql

# 2. só então remover a de 4 args
psql "$PROD_URL" -c "DROP FUNCTION IF EXISTS public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid);"

# 3. conferir
psql "$PROD_URL" -c "SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='fiscal_enfileirar_documento_venda';"
# esperado: 954b441b291de316d2c36d42f6252307
```

**A ordem importa:** recriar antes de remover, para não haver instante sem sobrecarga.

> ⚠️ Reverter leva a um estado **conhecido**, não a um estado bom: o corpo antigo não tem
> `SEM_NF` nem escopo de loja na permissão. Use como parada de emergência e reaplique assim
> que a causa for entendida.

---

## Depois da janela

1. `backend/supabase/migration-human-gates.json` → esvaziar para `{"gates": []}`. Os quatro
   gates existem só enquanto a divergência existe; com o ledger em 311 dos dois lados,
   `migration-remote-drift` volta a `ALIGNED` sozinho.
2. `GO_LIVE_CERTIFICATION_REPORT.md` → data/hora real da janela e ledger medido.
3. `BACKLOG_TECNICO.md` → encerrar **12, 13 e 14**.

> **Não** encerrar 10, 11, 15 e 16. Esta janela não os toca: a reconciliação de baseline
> (`db pull`), as **15 políticas RLS a mais** em produção, as 7 funções e 2 tabelas
> só-produção e os deltas de colunas/índices continuam abertos, e dependem de um ambiente
> de ensaio que ainda não existe. Ver
> [AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md](./AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md) §6.
