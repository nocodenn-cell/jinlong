# Corte (cutover) — congelamento e prontidão

## SHA do corte
- Candidato: `29362b1d` (main, #613, CI verde no merge). Será re-fixado após merge de #609 e #614 (trazem as migrations de prod que faltam na main).

## Congelamento de features (a partir de 2026-10-21)
1. Só entram na main: correções de bug bloqueante, segurança e as PRs #609/#614.
2. Toda migration nova precisa ser aplicada em homolog antes de prod e ter rollback.
3. Nenhuma alteração direta em prod sem registro aqui.
4. Novo SHA de corte só com CI obrigatório verde.

## Reconciliação de migrations (prod `kbabmewnahysfvlybiak` × main)

Fase 1 em preparação. Verificação de 2026-10-23 contra `main` = `8217acfc`, somente leitura em prod
(`list_migrations` + `SELECT`). Consultas reproduzíveis: `ops/corte/fase1-verificacao-somente-leitura.sql`.

| Situação | Versões | Estado | Ação |
|---|---|---|---|
| Em prod e na main | 310 versões de 2026 + legado `001`–`127` | ok | nenhuma |
| Mesmo arquivo aplicado com outra versão (MCP `apply_migration`) | 37 em prod / 35 na main | pareadas em `backend/supabase/migration-human-gates.json` (74 pares) | nenhuma |
| Em prod e ausentes na main | `20261022100000_produtos_custos_rpc` (PR #618), `20261022110000_perfis_rls_sem_recursao` (PR #621) | **resolvido em 2026-10-23**: #621 (`d3847b00`) e #618 (`ee9f8f96`) mergeados. Conteúdo em prod idêntico ao arquivo (md5 `d839f0c9…`, `442ec12e…`) | nenhuma |
| Na main e ausente em prod | `20261010120000_caixa_sem_loja_padrao` | **adiada de propósito** (`.github/deploy-governance/deferred-migrations.json`); prod ainda tem `DEFAULT 'a0000001-…'` em `caixas.loja_id` | não aplicar. Condição de liberação no JSON: validação presencial do PDV novo (#590), fila de sync zerada, autorização do Damatta e label `deploy-prod:aprovado` |
| Na main e ausentes em prod (novas, 2026-10-23) | `20261022020000_pdv_config_gerente_senha_sha256_nullable` (#625), `20261023120000_revoga_decrementar_estoque_seguro_authenticated` (#628) | mergeadas sem aplicação em prod. A 1.ª é **no-op em prod** (a coluna `gerente_senha_sha256` não existe lá; só alinha o histórico). A 2.ª fecha a baixa de estoque direta via `/rest/v1/rpc` por OPERADOR | roteiro pronto e ensaiado em `ops/corte/janela-migrations-2026-10/ROTEIRO.md`; aplicar **só com autorização específica** |

- `#609` e `#614` já estão na main: as 3 versões que faltavam em 2026-10-21 (`20261021230000`, `20261022000000`, `20261022001000`) foram resolvidas.
- O último log de `migration-remote-drift` lido (PR #621, run 39765545736) listava `20261020100000`…`20261022010000` como `remote_ausente`. Hoje todas estão em prod: o log é anterior à aplicação. Reexecutar o job depois do merge de #618/#621 para obter o estado oficial.
- Em 2026-10-23 havia 1 caixa `ABERTO` em prod: qualquer janela que toque `caixas` exige zero caixas abertos.

### Procedimento seguro (quando houver autorização)
1. ~~Revisar e mergear #618 e #621~~ — feito em 2026-10-23. Pendente: autorização para aplicar `20261022020000` e `20261023120000` em prod.
2. Rodar `ops/corte/fase1-verificacao-somente-leitura.sql`: resultado esperado é zero versões sem par, md5 iguais e o DEFAULT ainda presente.
3. Reexecutar `migration-remote-drift` na main; esperado: só `20261010120000` pendente (adiada).
4. Fixar o novo SHA de corte com CI obrigatório verde.
5. `20261010120000` fica fora da Fase 1. Só sobe pela condição do `deferred-migrations.json`.

Nada desta seção autoriza aplicar migration, alterar dados ou aprovar deploy.

## Módulos DRAFT
- Nenhuma migration tem marcador DRAFT (ocorrências são o status de dados `RASCUNHO`/`DRAFT`).
- Módulo Importações (#612, título "[rascunho]") já aplicado em prod e coberto por #613 → manter como final.

## Backup e teste de restauração
- Plano Supabase: Free — sem backups acessíveis no painel e sem PITR.
- Backup próprio (grátis): `supabase db dump --linked -f prod_schema.sql` e `supabase db dump --linked --data-only -f prod_data.sql` antes do corte; guardar fora do repo.
- Teste de restauração: `supabase start` local → `psql "$LOCAL_DB" -f prod_schema.sql -f prod_data.sql` → conferir contagens de vendas/produtos/caixas iguais às de prod. Registrar data, contagens e resultado aqui. Nunca restaurar em prod.

## Sentry
- DSNs configurados na Vercel (pdv-importados): `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.
- Teste: num deploy Preview, abrir `/api/sentry-example-api` (gera erro de teste) e conferir o evento no Sentry com environment=preview.
