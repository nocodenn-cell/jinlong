# Plano de retirada gradual do `service_role` no `pdv-local`

## Objetivo

Eliminar o uso de `SUPABASE_SERVICE_ROLE_KEY` no desktop, mantendo operação estável do PDV.

## Fase 1 (curto prazo)

- Manter `sync-outbox` via Edge com `SYNC_KEY`.
- Remover chamadas REST diretas com `service_role` para catálogo/config no desktop.
- Criar Edge/RPC dedicada de leitura (`catalogo_sync`) com retorno mínimo necessário.
- Desktop passa a chamar somente endpoint dedicado com credencial de baixo privilégio.

## Fase 2 (médio prazo)

- Login do operador no desktop (JWT Supabase Auth).
- Aplicar RLS para leitura de catálogo/config por `authenticated`.
- Assinar requisições de sync com JWT + nonce/timestamp.
- Descontinuar `SUPABASE_SERVICE_ROLE_KEY` do `.env` do `pdv-local`.

## Fase 3 (hardening)

- Device registration por terminal (token por PDV/loja).
- Rotação automática de `SYNC_KEY` e invalidação de dispositivos comprometidos.
- Auditoria central de sync (tentativas, falhas, replay).

## Critérios de aceite

- `pdv-local/.env.example` sem `SUPABASE_SERVICE_ROLE_KEY`.
- Nenhuma referência a `service_role` no código do desktop.
- Sync funcional em ambiente de homologação por 7 dias sem regressão.
