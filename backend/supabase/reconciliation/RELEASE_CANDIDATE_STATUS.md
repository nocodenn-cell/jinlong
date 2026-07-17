# FastProduct — Status Final (Modo Executor)

**PR #198** · branch `claude/auditoria-ambientes-producao` · 10 commits

## Itens concluídos
- **P0 Banco:** 248/252/256 revisadas (idempotentes, dependências OK, sem conflito entre si nem com 274-276); rollback + validação + smoke completos.
- **P0.1 Schema:** inventário exaustivo (95 funções + 55 tabelas + 7 views) — repo é autoridade única do schema estrutural. 7 migrations de captura (270-276) cobrindo todo objeto de produção sem correspondência no repo.
- **P1 Segurança:** 79/79 funções `SECURITY DEFINER` classificadas (Obrigatória / pode virar INVOKER / só GRANT / candidata a remoção). Scripts prontos com rollback para REVOKE (S1-S3) e DROP (S4) e ALTER search_path (S5).
- **P2 Limpeza:** 4 arquivos mortos removidos (patch solto, config backup obsoleta, hook sem consumidor, CSS órfão) — cada um verificado por grep antes da remoção.
- **P3 Arquitetura:** 5 autoridades únicas reconfirmadas (config/preço/venda/status/autenticação) — todas OK.
- **P4 Validação:** guard:all 7/7, typecheck limpo, 663/663 testes verdes — repetido após cada mudança.

## Itens corrigidos
- Migration `268` (repo) declara REVOKE de `anon` na RPC v4, mas produção ainda concede `EXECUTE` a `anon` — achado e documentado com script de correção pronto (S1).
- 7 dos 8 overloads legados de venda já eram stubs desabilitados (`RAISE EXCEPTION`) — confirmado, script de DROP+rollback completo.
- 3 dos 4 achados de `search_path` mutável resolvidos automaticamente pelo DROP acima; só 1 função real precisa de ALTER.

## Commits realizados (10, nesta PR)
`7f3b37b` `2215a67` `e0c0857` `0cdce69` `0221115` `2fe1f60` `06f65bc` `36c49e7` `edbdb51` `7769579`

## Riscos restantes (documentados, sem mutação de produção)
- Segundo projeto Supabase `ageguard` (INACTIVE — risco latente, não ativo).
- ~~Migration 248 (devolução) só homologada em ambiente local.~~ **Resolvido 2026-07-17** — aplicada em produção com smoke comportamental direto em `jinlong` (transações com `ROLLBACK`); ver `docs/sprint-ux-conclusao/FASE_2_ESTOQUE_FECHAMENTO_248.md`.
- `jinlong` está no plano Free do Supabase — sem PITR disponível para futuras mutações de produção (mitigado caso a caso via rollback por script + captura de definições PRE, mas vale avaliar upgrade de plano antes do go-live).
- Provider fiscal abstrato (sem emissão real) — decisão de escopo do piloto pendente.
- UI dupla `/gerente` ↔ Admin V2 — viva, cross-linked; requer gate de validação por módulo antes de consolidar (não é remoção segura).

## Itens que dependem de você (mutação de produção)
1. **Banco:** aplicar migrations 252 / 256 em `jinlong` (248 já aplicada em 2026-07-17).
2. **Segurança:** executar REVOKE `anon` (S1-S3, reversível) e DROP dos overloads legados + `is_feature_enabled` (S4, requer snapshot). Nota: 2 novos achados do mesmo padrão (grant-drift de `anon`) já foram corrigidos como parte da aplicação da 248 (migration 277).
3. **Configuração:** confirmar valores nos cofres Vercel/GitHub/Supabase; remover 4 variáveis órfãs.
4. **Produto:** decidir escopo Fiscal (congelar vs. Focus real); autorizar início da consolidação `/gerente`→Admin V2.
