# Feature Freeze — Piloto 1º Cliente Pagante

> **Fonte funcional atual:** para decisões autoritativas e rastreabilidade do D0, consulte [`docs/piloto-d0/README.md`](./piloto-d0/README.md). Este freeze continua válido quando não conflitar com aquelas decisões.

**Vigência:** até encerramento da Fase 4 (primeiro cliente em produção estável).  
**Responsável:** sponsor comercial + CTO.

## Perfil do piloto (contrato)

| Item | Decisão |
|------|---------|
| Canal | **Web** (`pdv-importados`) — sem desktop/outbox no D0 |
| Pagamentos | Dinheiro, PIX, cartão débito/crédito — **sem fiado** no PDV |
| Fiscal | **Mock/stub** ou fora do contrato D0 — NFC-e Focus só se contrato exigir |
| Loja | **Uma loja** (Matriz) |
| Catálogo | Assistido (time Jinlong) + cadastro unitário + import CSV |
| Financeiro | Contas a receber (painel) + contas a pagar (rota gerente) |
| Fora do escopo D0 | Venda em espera, inventário cego, conciliação bancária, multi-loja |

## IN (pode entrar no piloto)

- Correções de integridade (schema verify, financial gate)
- Restaurar fluxos quebrados na migração admin (CSV import/export)
- Salvar e continuar no cadastro
- Rota contas a pagar
- Onboarding (loja, usuários, seed)
- Homologação com evidência (T1–T12)

## OUT (congelado)

- Novas features ERP (hold, CRM, promo engine, inventário formal)
- Refatoração de núcleo (`finalizar_venda_*`, pricing, multi-authority caixa)
- Redesign visual / unificação total de tokens
- Squash histórico de migrations (só reconcile ambiente do piloto)
- Fiscal Focus real (sem checklist Focus completo)

## Exceções ao freeze

Somente com aprovação explícita do sponsor **e** classificação como bloqueador absoluto (ver `CHECKLIST_EXECUCAO_GO_LIVE.md` §1).
