# Hipóteses DESCARTADAS — evidência de investigação

Estas hipóteses foram investigadas nesta rodada e **não** geraram ticket. Ficam registradas para que auditorias futuras não repitam o trabalho, e para que a direção saiba o que já foi verificado.

---

### DESC-01 — "Preço é calculado no frontend e no backend" (SSoT)

**Veredito:** DESCARTADO

O PDV **não** replica a fórmula de precificação. O hook `useReprecificarQuantidadeCaixa.ts` chama a Server Action → RPC `calcular_preco_produto`, que é a autoridade única. O próprio arquivo documenta: *"via RPC `calcular_preco_produto` — a mesma autoridade usada no scan inicial e na revalidação de finalização"*.

Reforços encontrados:
- Linhas `MANUAL`/`PROMOCAO` são deliberadamente excluídas do recálculo (override consciente, não bug).
- Há controle de corrida por sequência (`sequenciaRef`) descartando respostas obsoletas.
- Falha de rede não bloqueia a operação porque **a finalização revalida no commit** — e a RPC v4 de fato recalcula (`272:217-221`).

Nos módulos de produto (`productWriter.ts`, `productUpdater.ts`, `productFormMappers.ts`) há apenas mapeamento de campos, nenhuma aritmética de preço.

**Evidência:** `pdv-importados/app/caixa/hooks/useReprecificarQuantidadeCaixa.ts:19-25,38,52`

---

### DESC-02 — "Comissão calculada em mais de um serviço" (SSoT)

**Veredito:** DESCARTADO

Busca por lógica de comissão em `pdv-importados/core` e `shared-core/src`: **zero** arquivos. A regra vive exclusivamente no banco: `103_comissoes.sql`, `20260711020053_261_comissoes_vendedores_regra_e_congelamento.sql`, `214_restaura_comissoes_loja_via_caixa.sql`, `215_backfill_comissoes_vendas_concluidas.sql`, e as RPCs `resumo_comissoes_por_funcionario` / `detalhe_comissoes_operador`.

Nota positiva: a migration 261 implementa **congelamento** da regra no momento da venda — desenho correto, evita que alteração de percentual reescreva comissão histórica.

---

### DESC-03 — "Arredondamento divergente entre TS e SQL"

**Veredito:** DESCARTADO (mantido da rodada 1, reconfirmado)

`public.round_abnt(numeric, integer)` e `core/money/roundAbnt.ts` são explicitamente alinhados (meio-para-longe-de-zero), com o TS documentando a equivalência e trazendo fallback para runtime sem `Intl.roundingMode`.

**Ressalva:** isto vale para o **caminho da venda**. O dashboard usa `Math.round(x*100)/100` em `double` — tratado em SSOT-03, por fuso e tipo numérico, não por modo de arredondamento.

---

### DESC-04 — "Overloads de `ajustar_estoque_manual` divergem entre si"

**Veredito:** DESCARTADO

Produção tem dois overloads (6 e 7 argumentos). Inspecionados: o de 6 args é um **shim** que apenas delega para o de 7 passando `NULL` em `p_ator_id`. Não há divergência de fórmula ou de gate — o gate real está no de 7 args (e tem o problema do SSOT-01, que é outro assunto).

**Evidência:** `remote_schema.sql:50-66` (shim) e `:71-110` (implementação)

---

### DESC-05 — "Migrations de revogação com guarda textual falharam em massa"

**Veredito:** DESCARTADO (a falha existe, mas é isolada — ver SSOT-02)

Apenas 3 migrations usam o padrão `pg_get_functiondef` + patch textual. Verificadas uma a uma contra produção: `278` e `286` **aplicaram corretamente** (as funções alvo mantêm apenas `service_role`). Somente `20260730093000` falhou.

Contraprova adicional: a migration `20260710212628_266` (unique de documento do cliente) aplicou corretamente — `clientes_loja_documento_unique` existe em produção. O drift **não** é generalizado.

---

### DESC-06 — "Tabelas do núcleo têm FKs ausentes / órfãos permitidos"

**Veredito:** DESCARTADO

Verificado no dump: `itens_venda` (FK → vendas DEFERRABLE, → produtos, → regras_preco `ON DELETE SET NULL`), `vendas_pagamentos` (FK → vendas `ON DELETE CASCADE` + `UNIQUE (venda_id, forma_pagamento)`), `contas_receber` (FK → clientes, lojas, vendas), `estoque` (FK → lojas, produtos), `caixas` (FK → lojas, usuarios).

Integridade referencial é sólida. `estoque_baixas` é a única exceção — **FLX-01**.

---

### DESC-07 — "Duplicidade de cadastro é possível (GTIN, documento de cliente)"

**Veredito:** DESCARTADO

- `produtos_codigo_barras_key UNIQUE (codigo_barras)` — `remote_schema.sql:9062`
- `clientes_loja_documento_unique UNIQUE (loja_id, documento) WHERE documento IS NOT NULL` — `:9223`
- `idx_doc_fiscal_unique_venda_tipo UNIQUE (venda_id, tipo_doc) WHERE status <> 'CANCELADO'` — `:9431`
- `uq_vendas_pagamentos_venda_forma UNIQUE (venda_id, forma_pagamento)` — `:9132`
- `remessa_itens_remessa_id_produto_id_key UNIQUE (remessa_id, produto_id)` — `:9087`

---

### DESC-08 — "Dados de teste/demo contaminaram produção"

**Veredito:** DESCARTADO

`027_seed_produtos_demo_importados_zh.sql` insere produtos com IDs fixos (`d1c0d100-0001-4000-8000-...`). Busca por esse prefixo no dump de produção: **zero ocorrências**. Os seeds demo não estão no banco real.

---

### DESC-09 — "`SECURITY DEFINER` sem `search_path` (vetor de hijack)"

**Veredito:** DESCARTADO

Varredura em todas as funções do dump de produção: nenhuma função `SECURITY DEFINER` sem `SET search_path`. Inclusive as duas de `ajustar_estoque_manual` têm `SET "search_path" TO 'public'`. Vetor clássico fechado.

---

## Nota metodológica

Os DESCARTADOS não são ruído — três deles (DESC-01, DESC-02, DESC-06) mostram que a **arquitetura de fonte única funciona** no núcleo do produto: preço, comissão e integridade referencial têm autoridade clara e são respeitados.

Isso muda a leitura dos achados: os problemas de SSoT encontrados (SSOT-03, SSOT-04, SSOT-05) não são sintoma de arquitetura frouxa. São **pontos que ficaram para trás** quando a autoridade foi consolidada — dashboard construído antes das RPCs de relatório, `baixar_estoque_venda` anterior ao kardex, camadas de permissão acumuladas em ondas. É dívida localizada e nomeável, não desenho errado.
