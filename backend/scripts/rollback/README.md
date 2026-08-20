# Artefatos de rollback — aplicação em produção 2026-08-19

Retratos do estado de produção **imediatamente antes** da aplicação das migrations
`20260814015032` e `20260819000000` (Fase 1 do plano de fechamento para Go-Live).

Servem para reverter sem depender de backup de cluster. Não são backup de dados —
só de definição de objeto e de privilégio.

## Estado registrado (2026-08-19, produção `kbabmewnahysfvlybiak`)

| Item | Valor antes da aplicação |
|---|---|
| ledger `schema_migrations` | **305** |
| `registrar_pagamento_contas_pagar` — md5 da definição | `9cc4f2c285315d45f254d9cde8a0e1af` (6677 bytes) |
| `registrar_pagamento_contas_pagar` — ACL | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `verificar_consistencia_venda(uuid)` — `authenticated` pode executar | **true** (o vazamento) |
| `relatorio_consistencia_vendas(4 args)` — `authenticated` pode executar | false (já fechado) |
| `relatorio_consistencia_vendas(3 args)` | **não existe em produção** |

## Como reverter

1. **Corpo da função AP:** aplicar `registrar_pagamento_contas_pagar.pre-2026-08-19.sql`
   (é um `CREATE OR REPLACE` completo do estado anterior). Confirmar com o md5 acima.
2. **Privilégios dos diagnósticos:**
   ```sql
   GRANT EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid) TO authenticated;
   ```
   > Reverter isto **reabre o vazamento entre lojas**. Só faça se um consumidor legítimo
   > quebrar, e antes registre quem chamava a função como `authenticated`.
3. **Ledger:** remover as linhas `20260814015032` e/ou `20260819000000` de
   `supabase_migrations.schema_migrations` apenas se a reversão for total.
