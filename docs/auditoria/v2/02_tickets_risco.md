# Tickets de RISCO — rodada 2

Achados com mecanismo de falha demonstrado, mas cuja materialização depende de configuração de ambiente ou de dados que não posso inspecionar sem acesso a produção. Geram ticket (a pedido: `CONFIRMADO` e `RISCO` geram), com o grau de incerteza declarado.

---

## SSOT-03

**Título:** Dashboard agrega vendas em TypeScript com fuso do servidor; relatórios agregam em SQL com fuso configurável — mesma métrica, duas fontes de verdade

**Categoria:** Inconsistência

**Veredito:** RISCO

**Descrição:**
A mesma grandeza de negócio — "total vendido por dia" — é calculada por dois caminhos independentes:

| | Dashboard | Relatórios |
|---|---|---|
| **Onde** | TypeScript, `app/admin/dashboard/page.tsx` | RPC SQL, `relatorio_vendas_por_dia_periodo` |
| **Agregação** | `Math.round(total * 100) / 100` em laço JS | `SUM()` em `numeric` |
| **Fuso** | `new Date(row.data).getHours()` / `cursor.setHours(0,0,0,0)` → **fuso do processo Node** | parâmetro `p_tz`, resolvido por `getRelatorioTimezone()` |
| **Precisão** | `number` (IEEE-754 double) | `numeric` (decimal exato) |

O dashboard não passa por `getRelatorioTimezone()` — busca por `timezone`/`p_tz` no arquivo retorna zero ocorrências, apenas `setHours`/`getHours` nativos.

**Impacto operacional:** Se `TZ` do runtime (Vercel roda em **UTC** por padrão) diferir de `America/Sao_Paulo`, as vendas das últimas 3 horas de cada dia caem no dia seguinte no dashboard, mas no dia correto nos relatórios. O gerente vê dois números diferentes para "vendas de ontem" e não tem como saber qual está certo. Divergência sistemática, não aleatória — e maior justamente no horário de pico noturno do varejo.

**Por que RISCO e não CONFIRMADO:** a materialização depende de `TZ`/`RELATORIO_TIMEZONE` no ambiente de produção, que não posso ler. Se o runtime já roda em `America/Sao_Paulo` e `RELATORIO_TIMEZONE` não está setado divergente, os números coincidem hoje — mas a fragilidade permanece, pois nada impede a divergência.

**Evidências:**
- **Arquivos:** `pdv-importados/app/admin/dashboard/page.tsx:299` (`cursor.setHours(0,0,0,0)`), `:306` (`Math.round(dayTotal*100)/100`), `:316` (`new Date(row.data).getHours()`), `:322`, `:339`
- **Contraparte SQL:** `public.relatorio_vendas_por_dia_periodo(p_de, p_ate, p_tz)`, `relatorio_top_produtos_periodo`, `relatorio_resumo_executivo_periodo` (`remote_schema.sql`)
- **Resolução de fuso ausente no dashboard:** `pdv-importados/lib/relatorios/getRelatorioTimezone.ts` (precedência `RELATORIO_TIMEZONE` → `relatorio_settings.timezone` → `America/Sao_Paulo`) — não referenciado pelo dashboard
- **Validação de fuso no banco:** `public.relatorio_tz_validado(p_tz)`

**Fluxo afetado:** Venda → Relatórios (e decisão gerencial baseada neles)

**Comportamento atual:** Duas implementações da mesma métrica, com fusos e tipos numéricos distintos.

**Comportamento esperado:** Fonte única. O dashboard deve consumir as mesmas RPCs `relatorio_*_periodo` que os relatórios, passando o fuso de `getRelatorioTimezone()`. Agregação monetária em `numeric` no banco, não em `double` no JS.

**Causa provável:** Dashboard construído antes das RPCs de relatório e não migrado quando elas foram criadas.

**Prioridade:** **P1**

**Arquivos prováveis para correção:** `pdv-importados/app/admin/dashboard/page.tsx`; reuso de `getRelatorioTimezone`

**Dependências:** nenhuma

**Critério de aceite:** Para um mesmo período, dashboard e relatório retornam valores idênticos, verificado com `TZ=UTC` no runtime (o caso adverso). Teste automatizado comparando as duas saídas.

---

## SSOT-04

> **STATUS (2026-08-06): CONFIRMADO E AMPLIADO — investigação fechada, correção pendente.**
> O ticket registrava **um** desviante (`baixar_estoque_venda`). Varredura completa em produção
> (`pg_get_functiondef` de toda função que faz `UPDATE ... estoque`) encontrou **três**, e dois
> deles são caminhos **vivos** do produto:
>
> | Função | Grava kardex? | Situação |
> |---|:--:|---|
> | `decrementar_estoque_seguro` | ✅ | ok |
> | `ajustar_estoque_manual` | ✅ | ok |
> | `transferir_estoque_seguro` | ✅ | ok |
> | `transferir_estoque_entre_lojas` | ✅ | ok |
> | `baixar_estoque_venda` | ❌ | **órfã** — 0 grants de cliente (SEC-01 resolvido), 0 chamadores no banco, 0 no repositório |
> | **`cancelar_venda_transacional`** | ❌ | **ativa e já usada em produção** |
> | **`devolver_ou_trocar_venda`** | ❌ | **ativa**, ainda sem uso real |
>
> **Evidência do impacto real:** há **7 vendas canceladas** em produção. O estoque foi devolvido
> por `UPDATE` direto e o kardex não tem **nenhum** lançamento correspondente — os tipos
> existentes são apenas `ENTRADA_AJUSTE, ENTRADA_NFE, ENTRADA_REMessa_LOJA, SAIDA_AJUSTE,
> SAIDA_VENDA`. A view `v_estoque_ledger_divergencia` acusa **22 linhas divergentes**.
> Não há trigger em `public.estoque` (invariante é convenção, não estrutura), e
> `cancelar_venda_transacional` não delega para nenhuma função que grave kardex.
>
> **O caminho da correção já está preparado no próprio schema:** o catálogo
> `tipos_movimento_estoque` **já contém `ENTRADA_DEVOLUCAO_CLIENTE`** (hoje com zero uso) —
> exatamente o tipo para estoque que retorna do cliente. Não é preciso criar tipo novo;
> basta as duas RPCs passarem a lançar nele.
>
> **Correção mínima proposta (forward-only, não executada nesta rodada):**
> 1. `cancelar_venda_transacional` e `devolver_ou_trocar_venda` inserem em
>    `movimentos_estoque_log` com `tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'`, no mesmo
>    `UPDATE` de estoque e na mesma transação.
> 2. `baixar_estoque_venda`: **DROP**. É drift sem migration de origem, sem grants de cliente e
>    sem nenhum chamador. `backend/scripts/test-rls-scope.mjs` já trata "função inexistente"
>    como aprovação (linhas 76-78), então remover não quebra o gate de SEC-01.
>
> **Descasado do critério de aceite original, de propósito:** "zero divergências" exigiria
> **backfill das 22 linhas históricas**, que é mutação de dado passado — decisão de negócio,
> não correção técnica, e não deve ser feita em silêncio. A correção acima **para de produzir
> divergência nova**; reconciliar o passado é item separado.
>
> **Trigger em `public.estoque` foi descartado** como caminho: as quatro funções corretas já
> gravam o kardex, então um trigger genérico duplicaria lançamentos, e distinguir "quem já
> logou" dentro do trigger é frágil. O ticket sugeria trigger como ideal; a evidência mostra
> que, neste schema, o custo/risco não compensa.

**Título:** Múltiplos caminhos de escrita em estoque, nem todos gravando no kardex `movimentos_estoque_log`

**Categoria:** Inconsistência

**Veredito:** RISCO

**Descrição:**
Ao menos 20 migrations contêm `UPDATE` em `public.estoque`. O kardex `movimentos_estoque_log` é a fonte de verdade da movimentação física, e a view `v_estoque_ledger_divergencia` existe justamente para reconciliar saldo × kardex. Verifiquei as principais funções em produção:

| Função | Escreve kardex? |
|---|---|
| `decrementar_estoque_seguro` | ✅ sim |
| `ajustar_estoque_manual` (7 args) | ✅ sim |
| `transferir_estoque_seguro` | ✅ sim (2 lançamentos: saída + entrada) |
| `receber_ordem_compra` | ✅ sim |
| `importar_nfe_transacao` | ✅ sim |
| **`baixar_estoque_venda`** | ❌ **não** |

O caso confirmado (`baixar_estoque_venda`) já é o **SEC-01** da rodada 1 — e o fato de não gravar kardex agrava aquele ticket: além de exposta a `anon`, a função produz movimentação invisível à reconciliação.

**Por que RISCO:** não consegui auditar exaustivamente os ~20 caminhos de `UPDATE estoque` (vários são migrations históricas cujas funções foram substituídas). O que afirmo com segurança: os caminhos principais estão corretos, e existe ao menos um desviante. Não posso garantir que seja o único.

**Evidências:**
- **Varredura:** `grep -l "UPDATE public.estoque\|UPDATE estoque" backend/supabase/migrations/*.sql` → 20 arquivos
- **Desviante confirmado:** `public.baixar_estoque_venda(uuid, jsonb)` em `remote_schema.sql` — `UPDATE estoque SET quantidade_atual = quantidade_atual - item.qtd` sem inserção em `movimentos_estoque_log`
- **Reconciliação afetada:** `public.v_estoque_ledger_divergencia` (`20260801090000_...sql`)
- **Tabelas:** `public.estoque`, `public.movimentos_estoque_log`, `public.estoque_baixas`

**Fluxo afetado:** Estoque → Auditoria → Relatórios de inventário

**Comportamento atual:** Existe pelo menos um caminho de alteração de saldo invisível ao kardex.

**Comportamento esperado:** Invariante explícita — **toda** alteração de `estoque.quantidade_atual` gera lançamento correspondente em `movimentos_estoque_log`. Idealmente garantida por **trigger** em `public.estoque`, não por disciplina espalhada por N funções (é o desenho que torna a invariante estrutural em vez de convencional).

**Causa provável:** Kardex introduzido depois (migration 127) sobre funções que já existiam; nem todas foram migradas.

**Prioridade:** **P1**

**Arquivos prováveis para correção:** resolver SEC-01 primeiro (drop ou reescrita); avaliar trigger de invariante em `public.estoque`

**Dependências:** SEC-01

**Critério de aceite:** Query de reconciliação retorna zero divergências entre `SUM(movimentos_estoque_log.quantidade_delta)` e `estoque.quantidade_atual` por `(loja_id, produto_id)` — **após** a correção de DAT-01, que hoje cega essa verificação.

---

## SSOT-05

> **STATUS (2026-08-06): instâncias concretas FECHADAS; a classe permanece aberta como P2.**
>
> Medição em produção — para **toda** função com gate de perfil (corpo contendo `_PERFIL`),
> verifiquei se ainda menciona `'OPERADOR'`:
>
> **14 RPCs com gate de perfil · `menciona OPERADOR` = false em 14/14.**
> (`ajustar_estoque_manual`, `criar_produto_com_estoque_inicial`, `receber_ordem_compra`,
> `importar_nfe_transacao`, `confirmar_importacao_nfe`, `confirmar_remessa_entrada`,
> `registrar_conferencia_nfe`, `registrar_conferencia_ordem_compra`,
> `registrar_liquidacao_receber`, `registrar_pagamento_contas_pagar`,
> `transferir_estoque_seguro`, `transferir_estoque_entre_lojas`,
> `obter_estoque_disponivel_transferencia`, `fiscal_reprocessar_documento`.)
>
> Ou seja: as **duas divergências que motivaram o ticket** (TB-01 e SSOT-01, ambas "backend mais
> permissivo que a tela") estão corrigidas, e nenhuma RPC com gate de perfil reintroduziu
> OPERADOR. As duas mais sensíveis (`ajustar_estoque_manual`,
> `criar_produto_com_estoque_inicial`) sequer têm grant para `anon`/`authenticated`.
>
> **O que NÃO foi verificado, para não superestimar:** isto é uma checagem de uma dimensão
> (menção a OPERADOR em função com gate), **não** a auditoria de paridade dos ~40 pares
> tela/RPC que o ticket pede. A ausência de teste de paridade automatizado — o risco de
> *classe*, que é o objeto real deste ticket — continua aberta.
>
> **Mantido como P2** conforme a própria classificação do ticket ("os casos concretos já têm
> tickets P0 próprios; este cobre a classe"), portanto fora desta rodada, cuja regra é
> P2 só depois de esgotados P0/P1. O script de paridade sugerido segue sendo o caminho certo.

**Título:** Autorização de papel implementada em três camadas independentes, com a RPC divergindo da tela

**Categoria:** Segurança

**Veredito:** RISCO

**Descrição:**
O controle de acesso por papel existe em três lugares que precisam concordar manualmente:

1. **Policy TS:** `pdv-importados/lib/admin/policy/adminPolicy.ts` (mapa `'route:/admin/...' → ['ADMIN']`) + `canAccessResource()`
2. **Server Action:** `assertGerenteSession()` / `loadAdminContext()`
3. **Banco:** `RAISE EXCEPTION '..._PERFIL'` dentro de cada RPC + policies RLS

Não há geração automática nem teste de paridade entre as três. A divergência já se materializou duas vezes — **TB-01** (tela exige GERENTE+, RPC aceita OPERADOR) e **SSOT-01** (string mágica). Ambas na mesma direção: **backend mais permissivo que a tela**, que é o sentido perigoso.

**Por que RISCO:** não auditei a paridade dos ~40 pares tela/RPC. Afirmo o padrão arquitetural e dois casos confirmados; não afirmo quantos outros existem.

**Evidências:**
- **Camada 1:** `pdv-importados/lib/admin/policy/adminPolicy.ts:74,111`; `lib/admin/context/adminContext.ts:37,76`
- **Camada 2:** `lib/gerente/auth/assertGerenteSession.ts`, usado em `app/admin/*/actions.ts`
- **Camada 3:** exceções `CRIAR_PRODUTO_PERFIL`, `AJUSTE_ESTOQUE_PERFIL`, `OC_PERFIL` (`remote_schema.sql`)
- **Divergências confirmadas:** TB-01 (rodada 1), SSOT-01 (esta rodada)
- **Desenho assumido explicitamente:** `20260718135138_criar_produto_permite_operador_pdv.sql:1-2` — *"CRUD completo do catálogo continua gated na Server Action"* (isto é, defesa no cliente)

**Fluxo afetado:** Todos

**Comportamento atual:** Três fontes de verdade sincronizadas manualmente; duas divergências conhecidas, ambas com backend mais permissivo.

**Comportamento esperado:** Matriz de permissões única e um teste de paridade que falhe no CI quando uma RPC aceitar papel que a tela recusa. Não é refatoração arquitetural — é teste de invariante sobre o desenho atual.

**Causa provável:** Camadas construídas em momentos diferentes (RLS → Server Actions → Admin V2) sem consolidação.

**Prioridade:** **P2** (os casos concretos já têm tickets P0 próprios; este cobre a classe)

**Arquivos prováveis para correção:** teste de paridade em `pdv-importados/scripts/` (modelo: `check-entity-ssot-boundary.mjs`)

**Dependências:** SEC-02, SSOT-01

**Critério de aceite:** Script que, para cada RPC com gate de perfil, compara os papéis aceitos no banco com os da policy TS e falha quando o banco for mais permissivo.
