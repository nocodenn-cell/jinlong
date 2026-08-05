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
