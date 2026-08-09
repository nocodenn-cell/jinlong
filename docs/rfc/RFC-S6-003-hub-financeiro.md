# RFC-S6-003 — Hub Financeiro + fim de `/financeiro/contas-pagar` como superfície

**Status:** implementado (Sprint 6)

## Problema atual

Contas a pagar existiam em `/admin/financeiro?tab=pagar` **e** em `/admin/financeiro/contas-pagar` (página dedicada com layout legado). Categorias financeiras eram item em “Mais”, desconectadas do financeiro unificado.

## Evidência

- `financeiro/page.tsx` já unificava receber/pagar/fiscal com abas.
- `contas-pagar/page.tsx` renderizava `ContasPagarListClient` standalone.
- Sidebar EXPANDED listava categorias financeiras separadamente.

## Decisão

- **Redirecionar** `/admin/financeiro/contas-pagar` → `/admin/financeiro?tab=pagar` (preservando query `status`/`periodo`).
- **Mover** categorias financeiras para aba do hub (`FinanceiroHubNav`).
- Remover categorias financeiras da sidebar EXPANDED.

## O que mudou

- `contas-pagar/page.tsx` virou redirect server-side.
- `FinanceiroTabNav` substituído por `FinanceiroHubNav` (4 abas).
- Página categorias financeiras usa cabeçalho “Financeiro” + mesmas abas.

## Impacto

Um único lugar para contas, fiscal e plano de categorias; menos itens em “Mais”.

## Riscos

Links externos para `/admin/financeiro/contas-pagar` continuam funcionando via redirect.

## Como validar

- Acessar `/admin/financeiro/contas-pagar?status=aberto` e confirmar redirect.
- Abas pagar/receber/fiscal/categorias com `aria-current` correto.
