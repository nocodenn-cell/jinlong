# SPRINT UX-01 — Auditoria

Data: 2026-10-11. Fase A, somente leitura de código. Não houve sessão autenticada no browser.

## Skills

Lidas antes da auditoria: `frontend-design`, `jinlong-design` (`jinlong layout 20-05`), `react-best-practices`, `erp-domain-auditor`.

Não instaladas neste ambiente: `ui-ux-audit`, `information-architecture`, `interaction-design`, `ux-research`, `accessibility-audit`, `playwright`, `performance-profiling`. A evidência veio do código e dos testes de regressão já existentes.

A identidade visual (âmbar, Noto Sans SC, português e chinês) permanece. O objetivo desta sprint é reduzir esforço operacional, não redesenhar a marca.

## O que foi confirmado

| ID | Severidade | Tela | Evidência |
|----|------------|------|-----------|
| UX-01 | P0 | `/admin/catalogo` | Dois `FilterBar`. O Limpar do primário só apaga as chaves daquela instância. |
| UX-02 | P1 | `/admin/compras` | Placeholder promete produto. `montarFiltroBuscaOc` consulta fornecedor e prefixo de UUID. |
| UX-03 | P1 | `/admin/fornecedores` | Placeholder promete contato, e-mail e categoria. A query usa `nome` e `cnpj`. Essas colunas são fantasma no contrato. |
| UX-04 | P1 | `/admin/clientes` | Busca sem resultado oferece “Novo cliente”. |
| UX-05 | P1 | `/admin` dashboard | Botão primário e item “Ir para Vendas & Caixas” têm o mesmo href. |
| UX-06 | P1 | `/admin/catalogo` | Link “Imprimir Etiquetas” no header repete a aba do hub. Cinco CTAs visíveis. |
| UX-07 | P1 | `/admin/estoque` | Botão “Entradas” do header repete a aba do hub. |
| UX-08 | P2 | `/admin/relatorios` | “Visão geral” no menu secundário repete Início da sidebar. |
| UX-09 | P1 | `/caixa` | Preço da linha em `text-sm`. Recibo abre após venda (passo de impressão — preservar). |
| UX-10 | P1 | `/admin/vendas` | Não há busca textual. A lista vem da RPC `listar_vendas_gerente`. Cancelar é ícone de 28px. `FilterBar` com `clearable={false}`. |
| UX-11 | P2 | vendas, caixas, financeiro | Chip de remover filtro sem `aria-label`. |
| UX-12 | P2 | `FilterBar` | `aria-label` fixo em português. |
| UX-13 | P2 | `/admin/financeiro` aba fiscal | Estado vazio com emoji. |
| UX-14 | P2 | `/admin/clientes` | `className` do header briga com o espaçamento do `PageHeader`. |
| UX-15 | P2 | badges | Dois `StatusBadge` com contratos diferentes. |
| UX-16 | P2 | `/admin/estoque/movimentacoes` | Chrome diferente do restante do hub. |
| UX-17 | P2 | `/admin/compras` | Pills de status com cores Tailwind soltas. Busca sem nome acessível. |

## O que não é redundância

- Aba Etiquetas no Catálogo e no Estoque: o mesmo href é intencional. Teste `hubNavEtiquetas.regression.test.ts`.
- Impressora na linha do catálogo: abre etiquetas já com o produto. Diferente da aba geral.
- Faixa “Entrada de mercadoria” no estoque: escolhe NF-e ou recebimento manual. Diferente do botão do header, que só ia para recebimento.
- Busca do caixa (código, nome ou categoria) e busca do catálogo administrativo: semânticas diferentes.
- Busca da lista de saldos e busca do modal de ajuste: a segunda filtra a página já carregada.
- `OperationalQuickActions` não tem consumidor. Não será apagado nesta sprint.

## Adiado

Busca de vendas por cliente ou código exige alterar a RPC `listar_vendas_gerente`. Fica para uma sprint com migration. Nesta entrega a lista continua filtrada por período, status e forma de pagamento, com limpar e cancelar mais claros.
