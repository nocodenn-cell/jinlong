# SPRINT UX-01 — Validação

## Linha de base (antes do código)

Contagem feita na leitura de 2026-10-11, sem sessão autenticada.

| Métrica | Antes |
|---------|--------|
| Atalhos com o mesmo destino na mesma tela | 4 (dashboard Vendas & Caixas, etiquetas no header do catálogo, Entradas no header do estoque, Visão geral em relatórios) |
| Buscas cujo texto promete campo que a consulta não lê | 2 (compras, fornecedores) |
| Limpar que deixa filtro avançado ativo | 1 (catálogo) |
| CTA de vazio que cadastra em vez de limpar | 1 (clientes) |
| Interações extras no caminho feliz de editar produto | 0. O problema era varredura visual, não um clique a mais. |
| Interações da venda no PDV até o recibo | inalteradas de propósito. O recibo continua sendo o passo de impressão. |
| Busca textual de vendas | ausente. Adiada: exige migration da RPC `listar_vendas_gerente`. |

## Critérios

- Limpar do catálogo remove filtros avançados e `page`.
- Placeholders de compras e fornecedores descrevem a consulta real, em português e chinês.
- Busca de clientes sem resultado limpa o termo.
- Header do catálogo sem o link solto de etiquetas. NF-e e CSV em “Mais ações”.
- Header do estoque sem o botão Entradas.
- Dashboard com um único atalho para Vendas & Caixas.
- Preço da linha do caixa em `text-base`. Recibo ainda abre. Foco volta à busca.
- Vendas: limpar não apaga o período. Cancelar tem rótulo. Sem input de busca novo.
- Chips de vendas, caixas e financeiro anunciam a remoção.
- Fila fiscal vazia usa `EmptyState`.
- `VendaStatusBadge` no detalhe da venda. Hubs de etiquetas intactos.
- Sem migration, sem mudança de permissão e sem RPC nova.

## O que está implementado no código

Conferido no working tree em 2026-10-11, sobre `sprint/go-live-01` (`6067b799`), antes de qualquer commit desta auditoria.

- Limpar do catálogo apaga as chaves avançadas e `page` (`extraClearKeys` em `FilterBar` + `CatalogoFiltrosBar`).
- `valorDeFiltroAtivo` não trata o valor padrão de pills/select como filtro ativo. Chave ausente ou string vazia também não. Os defaults do catálogo (`status=todos`, `origem=all`, `estoque=todos`, `imagem=todos`) só entram na URL quando diferem do padrão, então o Limpar não fica preso neles.
- Placeholders de compras e fornecedores, nos dois idiomas, descrevem a consulta real.
- Busca de clientes sem resultado limpa o termo. Lista vazia continua com “Novo cliente”.
- Cabeçalhos sem o atalho repetido de etiquetas, de entradas, de “Vendas & Caixas” e de “Visão geral”.
- Duplicar e Excluir do catálogo ficam no menu da linha. O link Duplicar tem `aria-label` com o nome do produto.
- Preço da linha do caixa em `text-base`. Débito usa `Wallet`. A topbar usa o ícone `Printer`.
- O recibo ainda abre em `setReimprimirModalAberto(true)` depois da venda ok. O fechar chama `focarCampoBusca()`. Essa função desiste no primeiro frame se ainda existir `[role="dialog"]` e não tenta de novo. O comportamento não foi exercitado no browser.
- Vendas: Limpar tira status e pagamento e preserva o período. Cancelar tem rótulo. Não há campo de texto. `VendasFiltro` e a RPC `listar_vendas_gerente` não ganharam parâmetro de busca.
- Chips de vendas, caixas e financeiro usam `catalogo_chip_remover`. `FilterBar` aceita `ariaLabel` e `clearAriaLabel`.
- Fila fiscal vazia usa `EmptyState`. Header de clientes usa o espaçamento do `PageHeader`.
- Detalhe da venda importa `VendaStatusBadge`. O `StatusBadge` de tom do admin-v2 permanece.
- Movimentações usa `PageHeader`, `CrudListShell` e chaves de i18n. A consulta não mudou.
- Status de compras usa classes `admin-v2-badge-*`.

## Execução desta auditoria

Comandos rodados em `pdv-importados` na sessão de 2026-10-11 à noite. Números abaixo são desta execução, não de um relatório anterior.

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | saiu 0, antes da correção do `aria-label`. Repetido depois da correção: saiu 0. |
| `npm run lint` | saiu 0, antes da correção. `npx eslint` só em `CatalogoTable.tsx`, depois da correção: saiu 0. |
| `npm test` | saiu 1. 1 arquivo falhou, 372 passaram, 1 ignorado. 1 teste falhou, 2354 passaram, 1 ignorado. A falha foi `catalogoNovoProdutoEntradas.behavior.test.tsx`: o link Duplicar não tinha `aria-label`. |
| Reexecução depois da correção | `catalogoNovoProdutoEntradas.behavior.test.tsx`, `VendasTable.onda-a.test.tsx` e `FilterBar.behavior.test.tsx`: 3 arquivos, 10 testes, saíram 0. A suíte inteira não foi rodada de novo. |
| `npm run build` | saiu 0, depois da correção do `aria-label`. |

## Não executado

- Playwright e qualquer fluxo no browser. Não havia sessão autorizada.
- A suíte Vitest completa depois da correção do `aria-label`.
- Migration ou alteração da RPC `listar_vendas_gerente`. Continua fora desta entrega.

## Timeout em localhost:3000

`Invoke-WebRequest http://127.0.0.1:3000/login -TimeoutSec 20` esgotou o prazo sem status HTTP. A porta aceita TCP. O processo é `node.exe` PID 37456, iniciado em 2026-10-10 16:07, filho de `next dev` (PID 27960, `node_modules\.bin\next dev`). As conexões ficam em `CLOSE_WAIT`. O comando certo para subir o painel é `npm run dev:web` na raiz do monorepo, ou `npm run dev` dentro de `pdv-importados`. Esse `next dev` antigo não foi encerrado nesta auditoria.
