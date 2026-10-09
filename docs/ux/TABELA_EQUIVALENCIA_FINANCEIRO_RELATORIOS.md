# Tabela de Equivalência — Financeiro (PR 5) e Relatórios (PR 7)

| Campo | Valor |
|---|---|
| Data | 2026-10-08 |
| Status | **Proposta para aprovação. Nada foi implementado.** PR 5 e PR 7 seguem NO-GO até a aprovação desta tabela. |
| Método | Leitura de `FINANCEIRO_TAB_ORDER`, `FinanceiroWorkspace.tsx`, `RelatoriosContent.tsx` (seções 770–880), painéis `executive/Exec*Panel.tsx` e busca por deep-links de entrada. **Conteúdo comparado por título de seção e rótulo de KPI, não campo a campo nem valor a valor** — por isso a coluna "Confiança". |

---

## 1. Relatórios — abas clássicas × views executivas

Hoje há 5 abas clássicas (`?tab=visao|produtos|estoque|margem|vendas`, só quando **não** há `?view=`) e 4 views executivas (`?view=vendas-caixas|dre-financeiro|produtos-estoque|crm-auditoria`).

| # | Aba clássica › seção | Existe na view executiva? | Onde | Confiança | Ação necessária antes de aposentar |
|---|---|---|---|---|---|
| R1 | Visão › KPI Faturamento | Sim | Vendas & Caixas › "Faturamento" | Média | Conferir se o valor é o mesmo (devoluções/receita líquida aparecem só no clássico, linha 741) |
| R2 | Visão › KPI Ticket médio | **Não encontrado** | — | Alta | **Migrar** (ou aceitar a perda) |
| R3 | Visão › KPI Nº de vendas | Sim | Vendas & Caixas › "Vendas concluídas" | Média | — |
| R4 | Visão › KPI Taxa de cancelamento | Sim | Vendas & Caixas › "Taxa cancelamento" | Média | — |
| R5 | Visão › KPI Margem | Parcial | DRE › "Margem bruta est." | Média | Confirmar mesma fórmula (`kpiMargemIndisponivel` indica regra de indisponibilidade) |
| R6 | Visão › Gráfico **Faturamento por dia** | **Não encontrado** | — (Vendas & Caixas tem "Vendas por hora do dia", outra dimensão) | Alta | **Migrar** |
| R7 | Visão › Gráfico **Status das vendas** (concluídas × canceladas) | Parcial | só a taxa % | Alta | Migrar ou aceitar |
| R8 | Produtos › **Top produtos** (mais vendidos) | **Não encontrado** | Produtos & Estoque tem Curva ABC (classificação por faturamento), não ranking "top N" | Média | **Migrar** ou declarar Curva ABC como substituta |
| R9 | Estoque › Reposição | Sim | Produtos & Estoque › "Reposição" | Alta | — |
| R10 | Estoque › Cobertura | Sim | Produtos & Estoque › "Cobertura" | Alta | — |
| R11 | Estoque › **Divergência de estoque** (saldo × soma de movimentos) | **Não encontrado** | — | Alta | **Migrar — bloqueante**: é sinal de integridade (audit P0 8.2) |
| R12 | Estoque › Sem giro | Sim | Produtos & Estoque › "Encalhe" | Alta | — |
| R13 | Vendas › Vendas em detalhe | Provável | Vendas & Caixas › "Transações" | Baixa | Comparar colunas; links para venda existem nos dois |
| R14 | Margem › **Margem por venda** (líquido/custo/margem) | **Não encontrado** | DRE mostra margem agregada | Alta | **Migrar** |
| R15 | Margem › Curva ABC | Sim | Produtos & Estoque › "Curva ABC" | Alta | — |

**Conclusão R:** a aba clássica **não pode ser aposentada hoje**. Seis conteúdos não têm equivalente nas views (R2, R6, R7, R8, R11, R14), sendo R11 sinal de integridade. Caminho seguro para o PR 7:
1. Mover R6/R7/R2 para Vendas & Caixas; R8/R11 para Produtos & Estoque; R14 para DRE (ou para Vendas & Caixas).
2. Só depois remover o item "Detalhe por domínio" da sidebar e fazer `?tab=` redirecionar para `?view=` correspondente.
3. Até lá, "Detalhe por domínio" **permanece na sidebar** (já está, PR #509).

**Mapeamento de URL (para o redirect do PR 7):**

| Entrada antiga | Destino novo |
|---|---|
| `/admin/relatorios` (sem parâmetros) e `?tab=visao` | `?view=vendas-caixas` |
| `?tab=vendas` | `?view=vendas-caixas` |
| `?tab=produtos`, `?tab=estoque` | `?view=produtos-estoque` |
| `?tab=margem` | `?view=dre-financeiro` (R14 migrado) — ou `produtos-estoque` para a Curva ABC |
| `/gerente/relatorios`, `/gerente/relatorios/{estoque,sem-giro,vendas}` | já redirecionam para `/admin/relatorios` (`LEGACY_GERENTE_REDIRECTS`); manter |
| Filtros de período (`de`, `ate`, `periodo`) | preservar na troca |

Links de entrada que apontam para a base `/admin/relatorios` (a preservar): `ExecutiveVisaoGeralStub.tsx` (botão Relatórios), `gerenteNavUi.ts`, `RelatoriosPeriodFilters.tsx`, sidebar "Detalhe por domínio".

---

## 2. Financeiro — 9 controles × 6 grupos propostos

Ordem atual (`FINANCEIRO_TAB_ORDER`): resumo · receber · pagar · contas · recebiveis · conciliacao · resultado · fiscal, mais "Categorias" (rota `/admin/categorias-financeiras`). Default quando falta `?tab=`: `receber`.

| Aba atual (`?tab=`) | Conteúdo (componente) | Destino proposto | Mudança de URL? | Risco |
|---|---|---|---|---|
| `resumo` | `FinanceiroResumo` (+ `FinanceiroPrimeiroUso` quando sem contas) | Aba **Resumo** (cabeçalho de KPIs) | Não | Baixo |
| `receber` | Contas a receber (`ContasReceberTable`, extras, estorno) | Aba **A receber** (padrão) | Não | Baixo |
| `pagar` | Contas a pagar (`payableReader`, `payablePayment`) | Aba **A pagar** | Não | Baixo |
| `contas` | `FinanceiroContas` + movimentos + paginação | Aba **Contas e conciliação** › seção "Contas" | **Não** (`?tab=contas` continua abrindo essa seção) | Médio |
| `recebiveis` | `FinanceiroRecebiveis` + paginação | idem › seção "PIX e cartões" | Não | Médio |
| `conciliacao` | `FinanceiroConciliacao` + paginação | idem › seção "Conciliação" | Não | Médio |
| `resultado` | Resultado de **caixa** por categoria (regime de caixa) | Mantém **conteúdo e URL**; vira atalho/seção ligada ao Resumo. **Não fundir com o DRE** (competência) | Não | Baixo se só mudar a exposição |
| `fiscal` | Documentos fiscais + `/documento/[id]` | Aba **Fiscal** | Não | Baixo |
| Categorias | `/admin/categorias-financeiras` | Continua; atalho em Configurações (PR #511) | Não | Baixo |
| (novo) Comissões | `/admin/comissoes` | Entrada na barra de Financeiro **ou** manter sub-link da sidebar | Não | Baixo |

**Regras para o PR 5 (todas verificáveis por teste):**
1. Todo `?tab=<id>` atual continua abrindo exatamente o mesmo conteúdo (nenhum id removido; só a barra muda).
2. `parseFinanceiroTab` e o default `receber` não mudam.
3. Parâmetros por aba (`TAB_QUERY_KEYS`: `opcao, cliente, q, de, ate, limite, status, periodo, pagina`) continuam sendo preservados ao trocar de aba.
4. Os 6 testes `Financeiro*.behavior.test.tsx` e `payableReader/receivableWriter` passam **sem alterar asserts de regra**.
5. A mudança é só no componente de barra (`FinanceiroHubNav` em `AdminHubTabNav.tsx`) e no rótulo/agrupamento; `FinanceiroWorkspace` não é refatorado.

**Deep-links de entrada que devem continuar funcionando** (encontrados por busca):

| Origem | Link |
|---|---|
| `VendaDetailSheet` | `?tab=receber` |
| `ClientesListClient` | `?tab=receber&cliente_id=…&cliente=…` |
| `ExecDreFinanceiroPanel` | `?tab=receber`, `resumo`, `resultado`, `pagar` (com período) |
| `FinanceiroPrimeiroUso` | `?tab=contas`, `pagar`, `recebiveis` |
| `ImportarNfePageClient`, `FornecedoresListClient` | `?tab=pagar&fornecedor_id=…` (`adminFinanceiroContasPagarFornecedorQuery`) |
| `/admin/financeiro/contas-pagar`, `/gerente/financeiro/contas-pagar` | redirect para `?tab=pagar&status&periodo` |
| Paleta Ctrl+K (PR #512) | todas as abas |

---

## 3. Decisões que dependem de você

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | R2, R6, R7, R8, R14 (KPIs/gráficos/rankings só do clássico): migrar para as views ou aceitar a perda? | **Migrar** — são os números que o dono mais olha |
| D2 | R11 (divergência de estoque) migra para Produtos & Estoque? | **Sim, bloqueante** |
| D3 | "Contas e conciliação" como **seletor secundário** dentro de uma aba, ou manter 3 abas separadas e só reordenar? | Seletor secundário (menos controles), com os 3 `?tab=` preservados |
| D4 | "Resultado" fica como aba, seção do Resumo, ou link? | Seção do Resumo + URL mantida; rotular "Resultado de caixa" ≠ "DRE" |
| D5 | Comissões entra na barra de Financeiro? | Sim (a liquidação é financeira); sidebar mantém o sub-link até lá |

**Sem as respostas D1–D2, o PR 7 permanece NO-GO. O PR 5 pode seguir com D3–D5.**
