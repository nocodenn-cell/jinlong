# Changelog contratos v1

## 2026-08-13

- Publicado `rpc-finalizar-venda-canonica-v4.json` — contrato **canônico** de finalização de venda,
  derivado de `20260809120837_finalize_v4_scope_guard_22args.sql` (22 args, wrapper com scope-guard
  de loja/caixa/operador; `_unscoped` sem `EXECUTE` para `authenticated`).
- `rpc-finalizar-venda-canonica-v3.json` marcado `deprecated: true` — descreve uma função que não é
  a de produção. Mantido como registro histórico; **não** removido, para não quebrar referências.
- Motivo: o contrato publicado divergia da implementação. `docs/AUTHORIZATION_MATRIX.md` chegava a
  recomendar "preferir canônica v2", três versões atrás do que roda em produção — mesma classe de
  risco dos scripts de apply paralelos removidos em ADR-011.
- Teste de contrato `pdv-importados/tests/contrato-finalizar-venda-v4.test.ts` passa a comparar o
  JSON contra a assinatura real da migration, falhando se divergirem.

## 2026-05-07

- Publicação inicial dos contratos versionados:
  - `rpc-transferir-estoque-seguro.json`
  - `rpc-decrementar-estoque-seguro.json`
  - `rpc-finalizar-venda-canonica-v3.json`
  - `sync-outbox-venda-registrada.json`
