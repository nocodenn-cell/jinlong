# Relatório de vendas (avançado) — `/gerente/relatorios/vendas`

Subrota nova abaixo de `/gerente/relatorios/` (que hoje só tem
`RelatoriosGerentePageClient`). Foca em **análise por filtros múltiplos**
em vez do resumo executivo.

## Drop-in

```
pdv-importados/app/gerente/relatorios/vendas/
  page.tsx                    ← server component
  RelatorioVendasClient.tsx   ← client com filtros + chart + tabela
  actions.ts                  ← buscarRelatorioVendasAvancadoAction
```

Aplique `i18n.additions.ts` em `messages.{pt,zh}.ts`.

## Dependência: `recharts`

```bash
cd pdv-importados
pnpm add recharts
```

(O monorepo já usa recharts em outros lugares? Caso contrário, este é o
único arquivo que importa.)

## Filtros entregues

- Período (data inicial + data final, default últimos 7 dias)
- Vendedor (select, vem do server com `usuarios.papel in (gerente,caixa,dono)`)
- Categoria (select, vem do server com `categorias.ativo = true`)
- Forma de pagamento (DINHEIRO / PIX / DEBITO / CREDITO / CREDIARIO)

## Componentes

- **4 KPIs**: Faturamento, Ticket médio, Concluídas, Canceladas
- **Gráfico de barras** (Recharts) — faturamento por dia, tooltip em
  pt-BR/zh-CN, eixos com fonte numérica
- **Tabela** das vendas brutas (até 1 000 linhas/consulta)
- **Exportar CSV** com colunas amigáveis (reusa `downloadCsvBrowser`)
- **Exportar PDF** via `window.print()` (a página inteira é printable)

## Schema esperado

```sql
-- coluna que pode ainda não existir:
alter table vendas add column if not exists categoria_principal text;
-- ou usar join itens_venda → produtos.categoria_id; ajustar a query

-- usuarios.papel é o discriminante de vendedores
```

Se sua coluna chama-se diferente (ex.: `vendedor_id` em vez de
`operador_id`), troque na linha:
```ts
if (filters.vendedor_id) query = query.eq('operador_id', filters.vendedor_id)
```

## Demo

`index.html` na pasta — gráfico SVG nativo (sem Recharts) usa `.rv-bars`
do CSS para deixar o protótipo standalone.
