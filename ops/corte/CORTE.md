# Corte (cutover) — congelamento e prontidão

## SHA do corte
- Candidato: `29362b1d` (main, #613, CI verde no merge). Será re-fixado após merge de #609 e #614 (trazem as migrations de prod que faltam na main).

## Congelamento de features (a partir de 2026-10-21)
1. Só entram na main: correções de bug bloqueante, segurança e as PRs #609/#614.
2. Toda migration nova precisa ser aplicada em homolog antes de prod e ter rollback.
3. Nenhuma alteração direta em prod sem registro aqui.
4. Novo SHA de corte só com CI obrigatório verde.

## Reconciliação de migrations (prod `kbabmewnahysfvlybiak` × main)
- Em prod e ausentes na main (3): `20261021230000_pdv_operador_pin_p0` (#609), `20261022000000_commercial_leads_landing_fields` e `20261022001000_commercial_leads_jinlong_wechat_idioma` (#614).
- Demais diferenças de versão são o mesmo nome aplicado com outra version (MCP) — já documentadas no padrão de `backend/supabase/README.md`; inclui `20261009180000/180001` (prod: `20261009135940/140739`).
- Na main e não em prod: `20261010120000_caixa_sem_loja_padrao` (manter; aplicar no corte) e legado `074_remove_zhHK`.
- O gate `migration-remote-drift` compara com homolog, não prod.

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
