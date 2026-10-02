# Multiempresa — Fase 1 (aditiva): pacote de execução

Especificação: [`docs/architecture/ESPEC_MULTIEMPRESA_V1.md`](../../../../docs/architecture/ESPEC_MULTIEMPRESA_V1.md) (D1–D19).

> **Status: preparado e testado localmente. NÃO aplicado em staging nem em produção.**
> Qualquer passo marcado ✍️ escreve no banco e exige autorização explícita.

## Conteúdo

| Arquivo | Escreve? | Função |
|---|---|---|
| `../../migrations/20261003090000_multiempresa_fase1_aditiva.sql` | ✍️ DDL | `empresas`, `usuario_vinculos`, `plataforma_admins`, `lojas.empresa_id` (anulável), `UNIQUE (id, empresa_id)`, `UNIQUE (empresa_id, codigo)`, índices; RLS ligada sem policy; sem grant para `anon`/`authenticated` |
| `10_preflight_backfill.sql` | não | relatório: lojas, usuários por perfil, prévia dos vínculos, **exceções** |
| `20_backfill.sql` | ✍️ dados | Empresa 1, `lojas.empresa_id`, vínculos espelhando `usuarios`; ADMIN legado ignorado; asserções abortam a transação; idempotente |
| `30_verify.sql` | não (só view temporária) | 10 checagens de equivalência; aborta se alguma falhar |
| `80_rollback_backfill.sql` | ✍️ dados | desfaz o backfill (não toca `usuarios`) |
| `90_rollback_migration.sql` | ✍️ DDL | remove a estrutura; recusa rodar se houver dados |
| `../../../scripts/multiempresa-fase1.test.sql` | não (ROLLBACK) | T1–T5: estrutura, comportamento inalterado, backfill, A × B estrutural, rollbacks |

## Relatório de impacto

| Área | Impacto | Evidência |
|---|---|---|
| Policies existentes (146) | nenhuma alterada; nenhuma lê as tabelas novas | migration não contém `POLICY` sobre tabelas existentes; `30_verify` checagem 7; teste T2 |
| RPCs/funções existentes | nenhuma alterada; nenhuma lê as tabelas novas | `30_verify` checagem 8; teste T2 |
| `lojas` | +1 coluna anulável, +2 UNIQUE, +1 índice. `lojas_codigo_key` (global) mantida | teste T1/T4. Com 1 loja, custo de criação desprezível |
| `usuarios` | nenhuma alteração; continua fonte de verdade | teste T3/T5 |
| API pública (PostgREST) | tabelas novas invisíveis para `anon`/`authenticated` (permission denied) | teste T2b |
| Frontend | nenhum código muda; `database.types.ts` ganha os tipos novos | `npm run typecheck -w pdv-importados` OK |
| Provisionamento / funcionários | continuam criando loja sem empresa e usuário sem vínculo (válido na Fase 1). **Isso gera divergência** entre `usuarios` e `usuario_vinculos` até a Fase 2 (trigger de sincronização) — `20_backfill.sql` é idempotente e pode ser reexecutado; `30_verify` acusa a divergência | teste T2 |
| `lojas.empresa_id` via API | [FATO] a policy atual `lojas_write_gerente` (FOR ALL, só perfil) e o grant de UPDATE de `authenticated` em `lojas` permitem a GERENTE/DONO/ADMIN alterar qualquer coluna de `lojas`, inclusive a nova. Antes do backfill não há efeito (nada lê a coluna). Depois do backfill, a FK composta de `usuario_vinculos` impede trocar/anular a empresa de loja com vínculo (teste T4). Fechamento definitivo: reescrita das policies de `lojas` (Fase RLS) | risco conhecido, P0 já mapeado |
| Suítes SQL existentes (`backend/scripts/*.test.sql`) | mesmo resultado com e sem a migration (30 passam / 11 falham por limitação do ambiente local sem stack completa, idênticas nos dois casos) | execução local 2026-10-02 |
| Gate `migration-remote-drift` (CI) | a migration nova é "só repositório" até ser aplicada no projeto de verificação; o gate já acusa as 27 pendentes | `backend/scripts/p0-migration-status.mjs` |

## Plano de deploy (só após autorização explícita)

**Pré-condições (D7/drift):** reconciliar as 3 migrations só-produção no repositório e decidir o conflito `20260930090200` × `20260930120000`. **Não usar `supabase db push`**: ele aplicaria também as 27 migrations pendentes. Aplicar **somente** este arquivo.

1. **Staging/clone de produção**
   1. ✍️ aplicar a migration (arquivo único);
   2. `10_preflight_backfill.sql` → revisar exceções (esperado em produção: ADMIN legado `4b19…` inativo; 3 `auth.users` sem `usuarios`);
   3. ✍️ `psql -1 -v ON_ERROR_STOP=1 -v empresa_nome='<nome real do cliente>' -f 20_backfill.sql`;
   4. `30_verify.sql` → todas `ok = true`;
   5. smoke operacional do cliente 1 (login DONO/GERENTE/OPERADOR, abrir caixa, venda, cancelamento, financeiro) → idêntico;
   6. ✍️ ensaio de rollback (80 → 90) e reaplicação.
2. **Produção** (janela qualquer — a mudança é aditiva e não bloqueia leitura/escrita de `lojas` além do `ALTER TABLE ... ADD COLUMN` sem default, que é instantâneo)
   1. ✍️ migration → registrar a versão aplicada (se via MCP, anotar o par em `migration-human-gates.json`, como nas aplicações anteriores);
   2. preflight → revisão humana;
   3. ✍️ backfill (autorização separada);
   4. verify;
   5. smoke do cliente 1.

## Plano de rollback

| Situação | Ação | Efeito no cliente 1 |
|---|---|---|
| verify falhou após o backfill | ✍️ `80_rollback_backfill.sql` | nenhum (nada lê as tabelas) |
| abandonar a Fase 1 | ✍️ `80` → `90_rollback_migration.sql` → `supabase migration repair --status reverted 20261003090000` | nenhum |
| erro durante a migration | transação única (`BEGIN … COMMIT`) — nada é aplicado | nenhum |
| erro durante o backfill | asserções + `psql -1` — nada é aplicado | nenhum |

Rollback deixa de ser trivial **a partir da Fase 2**, quando helpers/policies passarem a ler `usuario_vinculos`.

## Fora desta fase

Helpers `fp_*`, trigger de sincronização `usuarios → usuario_vinculos`, `empresa_id` nos catálogos, guarda RESTRICTIVE (protótipo, D16), correção das RPCs P0, `NOT NULL` em `lojas.empresa_id`, remoção de `lojas_codigo_key`, frontend.
