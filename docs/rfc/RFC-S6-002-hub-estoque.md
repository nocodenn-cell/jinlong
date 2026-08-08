# RFC-S6-002 — Hub Estoque (logística na mesma família)

**Status:** implementado (Sprint 6)

## Problema atual

Recebimento aparecia como item CORE separado de Estoque; Transferências ficava em “Mais”. Operadores tratavam tudo como “movimentação de mercadoria”, mas a IA da interface sugeria três módulos distintos.

## Evidência

- CORE continha `estoque` + `recebimento`; EXPANDED continha `transferencias`.
- Fluxos NF-e e etiquetas só eram alcançáveis por CTAs pontuais na página de saldos.

## Decisão

**Mover** recebimento e transferências para abas do hub Estoque (`EstoqueHubNav`). Sidebar mantém uma entrada “Estoque”.

## O que mudou

- Sidebar CORE −1, EXPANDED −2 (transferências + recebimento removidos como itens isolados).
- Abas: Saldos · Recebimento · Transferências · Importar NF-e · Etiquetas em todas as rotas `/admin/estoque/*` relevantes.

## Onde a função foi parar

Rotas inalteradas (`ROUTES.admin.estoqueRecebimento`, etc.).

## Impacto

Navegação logística unificada; “Mais” fica para cadastros periféricos (fornecedores, compras, comissões).

## Riscos

Páginas legado (`RecebimentoGerentePageClient`) ganharam wrapper `admin-v2-page` — possível duplicação visual de padding (monitorar).

## Como validar

- Testes de menu + `hubNavModel.test.ts` (match exato de saldos).
- Percorrer abas recebimento → transferências → NF-e.
