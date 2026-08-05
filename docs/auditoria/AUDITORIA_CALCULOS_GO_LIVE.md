# Auditoria de Cálculos e Fórmulas — Go-Live

> Validação de fórmulas e indicadores que podem apresentar números falsos.
> Análise de leitura de código (sem alteração). Gerado por Hermes em 2026-08-03.
> Classificação: **CONFIRMADO** · **RISCO** · **NÃO PROBLEMA** · **MELHORIA**.
> Sem tickets por suspeita — só problemas confirmados por código/dado real.

## Resposta à pergunta central
**"Existe cálculo que gera informação falsa?"**

SIM, em 2 pontos confirmados:
1. **KPI de Vendas Admin** soma só a página visível (cursor) → faturado/ticket subestimados.
2. **Comissão** depende de `comissao_percentual` nulo (sem UI) → calcula 0% para todos.

RISCO de dado (não de fórmula): Dashboard/Relatórios sobre base 100% teste (F3/F6.1-REL-001).

---

## Matriz de cálculos por domínio

### Venda

| Fórmula | Tabela/RPC | Filtro | Página parcial? | Dado teste? | Veredito |
|---|---|---|:--:|:--:|---|
| Faturamento bruto | `kpis_venda_eventos_gerente` (RPC) | `p_inicio/p_fim` | não | sim | ✅ correta (RPC) |
| Faturamento líquido | idem | idem | não | sim | ✅ correta |
| Ticket médio | idem | idem | não | sim | ✅ correta |
| Vendas concluídas/canceladas | idem | idem | não | sim | ✅ correta |
| **KPI tela admin/vendas** | `reduce(vendasDaPagina)` | não usa RPC | **SIM** | sim | 🔴 CONFIRMADO (RC-001) |

- `totaisFromItens` (finalizarVendaValidation.ts:131): `bruto = Σ(precoOriginal×qtd)`,
  `liquido = Σ(precoUnitario×qtd)`, `desconto = bruto−liquido` — ✅ corretos.
- `totalsMatchDeclared` valida total declarado vs calculado (ε=0,02) — ✅ anti-fraude.

### Estoque

| Fórmula | Tabela/RPC | Veredito |
|---|---|---|
| Saldo atual | `estoque.quantidade_atual` | ✅ correta |
| Custo/valor estoque | `preco_custo × saldo` | 🟡 RISCO se `preco_custo` nulo (66/113) |
| Movimentações | `movimentos_estoque_log` | ✅ correta (com `quantidade_delta`) |

### Financeiro / Caixa

| Fórmula | Tabela/RPC | Veredito |
|---|---|---|
| Saldo caixa | `calcular_valor_sistema_dinheiro_caixa` RPC | ✅ correta |
| Fechamento (sistema vs contado) | RPC + `valorContado` | ✅ correta |
| Diferença de caixa | `|sistema−contado|` vs `LIMITE_DIVERGENCIA_FECHAMENTO=5` | ✅ correta (tolerância R$5 intencional) |
| Entradas/Saídas | `movimentos_caixa` | 🟡 RISCO (tabela vazia — F5-VAL-12) |

### Margem

| Fórmula | Tabela/RPC | Veredito |
|---|---|---|
| Margem % / lucro por produto | `relatorio_margem_por_venda_periodo` | ✅ correta |
| Custo inexistente/zero | `custo_confiavel=false` → `margem=null` | 🟡 **TRATADO NESTE CAMINHO APENAS** — ver ressalva |
| Lucro total | soma de margens | ✅ correta quando custo confiável |

> **Ressalva ADR-007 (2026-08-05).** `relatorio_margem_por_venda_periodo` trata custo ausente
> corretamente. Isso **não** significa que ADR-007 esteja cumprida: ela é absoluta e alcança
> *"margem por venda, margem por produto, CMV, curva ABC, resumo executivo, dashboards, exports
> e relatórios agregados"*. RN-031 e RN-035 estão **`Divergente`** (ticket BR-03) e o risco R4
> (*"custo zero fantasma escapando por relatório/export"*) segue aberto.
> **Não verificados:** `relatorio_curva_abc_periodo`, dashboards e exports.

### Comissões

| Fórmula | Tabela/RPC | Veredito |
|---|---|---|
| `% aplicado` | `usuarios.comissao_percentual` | 🔴 CONFIRMADO (RC-002): campo sem UI → nulo → 0% |
| Base de cálculo | `base_calculo` (RPC) | ✅ definida |
| Vendas canceladas/devoluções | `resumo_comissoes_por_operador` | 🟡 RISCO: devolução sem trilha (RC-004) |

### Relatórios (KPIs)

Cada KPI responde:
- **Tabela que alimenta:** RPCs `relatorio_*_periodo` + `v_estoque_baixo`.
- **Fórmula:** executada no banco (não no front).
- **Filtros:** `p_de/p_ate/p_tz` (período explícito) — ✅ respeitados.
- **Risco página parcial:** NÃO (relatórios usam RPC agregada, não cursor).
- **Risco dado teste:** SIM (F3) — indicadores sobre base fake, mas fórmula correta.

---

## Achados CONFIRMADOS problemáticos

### RC-001 🔴 — KPI Vendas Admin usa página parcial
- **Problema:** `app/admin/vendas/page.tsx:146-161` soma `reduce(vendasDaPagina)`; action retorna
  `hasMore` (cursor). Existe RPC correta `obterKpisVendas`→`kpis_venda_eventos_gerente` (vendas/actions.ts:172)
  mas a tela **não a usa**.
- **Impacto:** "Faturado" e "Ticket Médio" subestimam o período filtrado.
- **Arquivo:** `app/admin/vendas/page.tsx` · `app/gerente/vendas/actions.ts:152`.
- **Classificação:** CONFIRMADO (código). Cruzado F6.1-VEN-001.
- **Critério de aceite:** KPI usa `obterKpisVendas` (agregação server-side); validar com >1 página e filtro.

### RC-002 🔴 — Comissão 0% por campo sem preenchimento
- **Problema:** `resumo_comissoes_por_operador` calcula sobre `usuarios.comissao_percentual`
  (nulo — sem UI, F6-CMP-001). Resultado: comissão zero para todos os operadores.
- **Impacto:** informação falsa (operador "recebe" R$ 0 de comissão).
- **Arquivo:** `app/gerente/comissoes/actions.ts:51` · `usuarios.comissao_percentual`.
- **Classificação:** CONFIRMADO (campo sem preenchimento + RPC dependente). Cruzado F6-CMP-001.
- **Critério de aceite:** `% comissão` gravável; resumo reflete valor real; teste com operador com % definido.

## Itens de RISCO (validação, não correção)

- **RC-003 🟡** Venda sem estoque: confirmar se `decrementar_estoque_seguro` bloqueia saldo negativo.
- **RC-004 🟡** Devolução sem trilha: confirmar gravação (F5-VAL-15) antes de afirmar perda de auditoria.

## Itens NÃO PROBLEMA (fórmulas corretas — registrado p/ não confundir)

- `totaisFromItens` (bruto/líquido/desconto) ✅
- `totalsMatchDeclared` (anti-fraude) ✅
- RPC de KPIs de vendas (`kpis_venda_eventos_gerente`) ✅
- Relatórios por RPC com período ✅
- Margem com `custo_confiavel=false` → null em `relatorio_margem_por_venda_periodo` ✅
  (**escopo limitado** — ver ressalva ADR-007 acima)
- Caixa: valor sistema RPC, divergência R$5 ✅

## Conexão com frentes anteriores
F1 (formas pagamento hardcoded → MELHORIA), F3 (dados teste), F5 (trilha), F6/F6.1 (coerência).
Esta auditoria isola o que é **cálculo em si** e cruza IDs originais — sem duplicar tickets.

**Fila oficial de execução:** `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md`.
**Autoridade normativa:** `docs/ARQUITETURA_REGRAS_NEGOCIO.md`.
