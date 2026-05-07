# Contratos críticos versionados

Este diretório define contratos de integração que não podem quebrar sem versionamento explícito.

## Regra de versionamento

- Cada contrato fica em uma pasta de versão (`v1`, `v2`, ...).
- Mudança compatível (adição opcional): mantém versão.
- Mudança incompatível (campo obrigatório novo, rename, remoção, semântica alterada): cria nova versão.
- Toda mudança deve atualizar o changelog da versão e os testes de contrato correspondentes.

## Escopo inicial

- RPCs críticas:
  - `finalizar_venda_transacional_canonica_v3`
  - `decrementar_estoque_seguro`
  - `transferir_estoque_seguro`
- Payload de sincronização:
  - `sync-outbox` (`VENDA_REGISTRADA`)
