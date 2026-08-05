
---

## DAT-01

**Título:** `estoque_baixas.quantidade` nunca é gravada — fica sempre `0`, quebrando o `COALESCE` da view de divergência de estoque

**Descrição do problema:**
A tabela `public.estoque_baixas` tem a coluna `quantidade numeric DEFAULT 0`. **Todos** os `INSERT` no código inserem apenas `(venda_id, produto_id)` — a quantidade nunca é informada, então grava `0` (não `NULL`). A view de reconciliação `v_estoque_ledger_divergencia` calcula o delta com `-COALESCE(eb.quantidade, ivsum.qtd, 0)`. Como `eb.quantidade` é `0` e **não** `NULL`, o `COALESCE` retorna `0` e **nunca** cai no fallback `ivsum.qtd` (a soma real dos itens da venda).

**Impacto operacional:** A ferramenta criada justamente para detectar divergência entre `estoque_baixas` e `movimentos_estoque_log` reporta delta `0` para toda baixa órfã. Uma venda cuja baixa não gerou kardex aparece na view com quantidade zero — ou seja, o detector de divergência é cego exatamente no caso que deveria detectar.

**Evidência encontrada:**
- Schema real: `remote_schema.sql:7380-7386` → `CREATE TABLE "public"."estoque_baixas" ("venda_id" uuid NOT NULL, "produto_id" uuid NOT NULL, "created_at" timestamptz NOT NULL, "quantidade" numeric DEFAULT 0);`
- View: `remote_schema.sql:8513` → `((- COALESCE("eb"."quantidade", "ivsum"."qtd", (0)::numeric)))::numeric(10,3) AS "quantidade_delta"`
- Migration da view: `backend/supabase/migrations/20260801090000_v_estoque_ledger_divergencia.sql`
- INSERTs que omitem `quantidade` (todos):
  - `backend/supabase/migrations/007_estoque_baixa_idempotente.sql:38`
  - `backend/supabase/migrations/015_security_rpc_hardening.sql:43`
  - `backend/supabase/migrations/032_lojas_estoque_por_loja.sql:168`
  - `backend/supabase/migrations/038_fix_decrementar_estoque_seguro_estoque_baixas_schema.sql:96`
  - `backend/supabase/migrations/127_kardex_vendas_imutavel.sql:147`
  - confirmado no corpo em produção de `decrementar_estoque_seguro` (`remote_schema.sql:1406`)

**Comportamento atual:** `estoque_baixas.quantidade = 0` em 100% das linhas; `v_estoque_ledger_divergencia` sempre reporta `quantidade_delta = 0` no ramo `estoque_baixas`.

**Comportamento esperado:** Duas correções, ambas necessárias:
1. `decrementar_estoque_seguro` deve gravar `p_quantidade` na coluna.
2. `DEFAULT 0` deve virar `DEFAULT NULL` (ou a view deve usar `NULLIF(eb.quantidade, 0)`), para o fallback funcionar no histórico já gravado.

**Risco:** Divergência de inventário passa despercebida; conciliação de estoque dá falso-verde; perda financeira silenciosa.

**Prioridade sugerida:** **P0** (é um controle de integridade quebrado, não um relatório cosmético)

**Arquivos prováveis para correção:**
- nova migration `291_fix_estoque_baixas_quantidade.sql`
- `backend/supabase/migrations/20260801090000_v_estoque_ledger_divergencia.sql` (recriar view com `NULLIF`)
- função `decrementar_estoque_seguro` (última definição vigente: `127_kardex_vendas_imutavel.sql`)

---

## FLX-01

**Título:** `estoque_baixas` não tem FOREIGN KEY para `vendas` nem `produtos` — órfãos permitidos no ledger de idempotência

**Descrição do problema:**
`public.estoque_baixas` possui apenas `PRIMARY KEY (venda_id, produto_id)`. Não há **nenhuma** FK declarada para `public.vendas(id)` nem `public.produtos(id)`, apesar de as duas colunas serem `NOT NULL` e semanticamente referenciais. Verificado por varredura no dump: zero ocorrências de FK envolvendo `estoque_baixas`.

**Impacto operacional:** Essa tabela é o **ledger de idempotência** que impede baixa dupla de estoque (`ON CONFLICT (venda_id, produto_id) DO NOTHING`). Sem FK, um `DELETE` em `vendas` deixa a chave de idempotência órfã — e, pior, se a venda for recriada com novo `id`, a proteção não se aplica. Também permite inserir baixa para `venda_id` inexistente.

**Evidência encontrada:**
- `remote_schema.sql:8881-8882` → `ALTER TABLE ONLY "public"."estoque_baixas" ADD CONSTRAINT "estoque_baixas_pkey" PRIMARY KEY ("venda_id","produto_id");` — única constraint da tabela
- Varredura: nenhuma linha `FOREIGN KEY` referenciando `estoque_baixas` no dump (o schema tem 127 FKs no total, nenhuma nesta tabela)
- Uso como guarda de idempotência: `remote_schema.sql:1405-1408` (dentro de `decrementar_estoque_seguro`)

**Comportamento atual:** Órfãos permitidos; integridade referencial delegada à disciplina do código.

**Comportamento esperado:** FKs `venda_id → vendas(id)` e `produto_id → produtos(id)`, com `ON DELETE` explicitamente definido (recomendo `RESTRICT` — a baixa de estoque é fato contábil e não deve sumir junto com a venda).

**Risco:** Quebra da garantia de idempotência (baixa dupla de estoque); órfãos que corrompem a view de reconciliação.

**Prioridade sugerida:** **P0**

**Arquivos prováveis para correção:**
- nova migration `292_estoque_baixas_fks.sql` (fazer `NOT VALID` + `VALIDATE` para não travar se já houver órfão; e antes rodar SELECT de contagem de órfãos)
