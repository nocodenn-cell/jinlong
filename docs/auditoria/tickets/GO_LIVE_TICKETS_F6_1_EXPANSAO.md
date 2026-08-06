# Tickets F6.1 — Expansão Operacional

> Gerado por Hermes. Apenas itens **confirmados por leitura de código** viraram ticket de
> correção. Itens dependentes de validação (F5) ou de dados (F3) foram sinalizados.

**Status de todos:** `OPEN`

---

## TICKET F6.1-VEN-001 🔴

> **STATUS (2026-08-06): FECHADO — mesmo defeito de RC-001, mesma correção.**
> É literalmente o mesmo achado (mesmo arquivo, mesmas linhas) descrito por duas frentes de
> auditoria. `app/admin/vendas/page.tsx` passou a consumir `obterKpisVendas` →
> `kpis_venda_eventos_gerente`. Medido em produção antes da correção: período real
> R$ 2.878,80 em 54 vendas contra R$ 906,25 exibidos pela página (−68,5%).
> Prova em `backend/supabase/scripts/smoke_rc01_kpis_vendas_periodo.sql`, incluindo o
> cenário ">1 página" que este ticket pede explicitamente no critério de aceite.
> Detalhe completo em `GO_LIVE_TICKETS_REGRAS_CALCULOS.md` (RC-001).

**Título:** KPI de Vendas Admin calculado sobre página parcial (não período)
**Categoria:** Vendas Admin / Relatórios
**Severidade:** 🔴 Bloqueante (informação falsa)
**Problema:** `app/admin/vendas/page.tsx` soma `faturado`/`qtdConcluidas`/`ticketMédio`
sobre `vendas` = apenas a página visível. A action `buscarVendasPaginadasAction` retorna
`hasMore` (cursor, sem total), então o card "Faturado" subestima o período filtrado.
**Evidência:** `app/admin/vendas/page.tsx` l.146-161 (reduce sobre `vendasRes` da página);
`app/admin/vendas/_components/VendasTable.tsx` l.266 (paginação por cursor).
**Local provável:** `app/admin/vendas/page.tsx` (KPIs) + `buscarVendasPaginadasAction`
(retornar agregação server-side por período, ou RPC de totais).
**Critério de aceite:** KPI de faturado/ticket reflete o período filtrado inteiro, não a
página carregada (validar com >1 página de vendas).
**Status:** OPEN

---

## TICKET F6.1-VEN-002 🟡

> **STATUS (2026-08-06): FECHADO — a trilha existe; a premissa do ticket estava desatualizada.**
> O ticket foi escrito quando a devolução era ⚪ NÃO VALIDADO em F5. O guia manda
> *"validar em runtime **antes** de assumir que a trilha não existe"* — foi o que se fez,
> consultando o schema de produção, não documentos.
>
> A migration `20260717031500_248_devolver_ou_trocar_venda.sql` criou a trilha dedicada, e a
> RPC `devolver_ou_trocar_venda` grava nela (confirmado via `pg_get_functiondef`).
> Cobertura do critério de aceite — **todas as colunas são `NOT NULL`**:
>
> | Exigência do aceite | Onde está |
> |---|---|
> | quem | `venda_pos_venda_operacoes.operador_id` |
> | quando | `venda_pos_venda_operacoes.created_at` |
> | valor | `valor_estornado`, `valor_caixa_estornado`, `forma_estorno` |
> | estoque revertido | `estoque_reposicoes_devolucao` (`produto_id`, `quantidade`) |
>
> Além do exigido: `motivo` obrigatório, `idempotency_key` (evita devolução dupla em retry),
> `caixa_id`, `tipo` (devolução × troca), `venda_substituta_id`, `contas_receber_id`, e o
> detalhe por item em `venda_pos_venda_itens`.
>
> Nenhuma correção foi necessária — fechado por verificação, não por implementação.

**Título:** Devolução de venda sem trilha dedicada
**Categoria:** Vendas / Auditoria (conecta F5)
**Severidade:** 🟡 Alto risco
**Problema:** botão `devolverAcao` no `VendaDetailSheet`; não há tabela de devolução
(F5: devolução ⚪ NÃO VALIDADO). Se funcional, grava sem auditoria própria.
**Evidência:** `app/admin/vendas/_components/VendasTable.tsx` l.307 (label `devolver`);
`app/admin/vendas/page.tsx` l.348 (label).
**Local provável:** `app/gerente/vendas/VendaDetalhe*` / action de devolução.
**Critério de aceite:** após validação F5, devolução grava em tabela dedicada (quem/quando/
valor/estoque revertido).
**Status:** OPEN (depende de F5)

---

## TICKET F6.1-PROD-001 🟡
**Título:** Regra de obrigatoriedade categoria/NCM inconsistente (Catálogo vs PDV)
**Categoria:** Produto (conecta F2)
**Severidade:** 🟡 Alto risco
**Problema:** Catálogo permite produto PUBLICADO sem categoria (82) e sem NCM (105);
PDV/relatórios podem exigir esses campos → tratamento divergente entre telas.
**Evidência:** `components/gerente/produtos/ProdutoFormModal.tsx` (campos opcionais /
`modoCompleto`); F2: 82 públicos sem categoria, 105 sem NCM.
**Local provável:** `ProdutoFormModal` + regra de publicação (`statusPublicacao`).
**Critério de aceite:** definir e documentar regra única de obrigatoriedade aplicada em
todas as telas que consomem produto.
**Status:** OPEN (herdado F2-PROD-001/002)

---

## TICKET F6.1-REL-001 🔴
**Título:** Go-Live com indicadores sobre base 100% de teste
**Categoria:** Relatórios/Dashboard (herdado F3)
**Severidade:** 🔴 Bloqueante (dado, não código)
**Problema:** Dashboard/Relatórios calculam KPIs corretos, mas sobre 56 vendas fake e
39 caixas fake (F3). "Informação bonita, porém errada" por interpretação.
**Evidência:** F3 — base 100% seed/teste; `app/admin/dashboard/page.tsx` l.153-206
(queries sobre `vendas` reais-porém-fake).
**Local provável:** processo de Go-Live (seed vs produção).
**Critério de aceite:** ambiente de produção inicia com dados reais ou selado (sem dados de
teste), ou há selo visual "AMBIENTE DE TESTE" nos indicadores.
**Status:** OPEN (herdado F3)

---

## RESUMO

| ID | Módulo | Tipo | Severidade | Título curto |
|---|---|---|:--:|---|
| F6.1-VEN-001 | Vendas Admin | Correção | 🔴 | KPI página parcial (info falsa) |
| F6.1-REL-001 | Relatórios | Bloqueio dado | 🔴 | Indicadores sobre teste (F3) |
| F6.1-VEN-002 | Vendas | Correção | 🟡 | Devolução sem trilha (F5) |
| F6.1-PROD-001 | Produto | Correção | 🟡 | Obrigatoriedade cat/NCM (F2) |

**Total:** 4 tickets · 2 🔴 (1 código, 1 dado) · 2 🟡.
**Estoque:** 0 tickets (módulo maduro).
**Nenhuma falha inventada:** itens não confirmados por código ficaram como validação/herdado.
