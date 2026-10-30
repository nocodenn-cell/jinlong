# PR-B1 — Transferência e kardex (#629): sequência após G14

## Conteúdo (exclusivo)
- Renomeação: `20261023130000_movimentos_estoque_log_transferencia_id.sql` → `20261029155000_…` (depois do G14, `20261029150000`).
- Âncora de entrada aceita `p_produto_id` (antes do G14) e `v_produto_destino` (depois do G14), com `\1` na substituição.
- Rollback renomeado: `ops/rollback_20261029155000_…` (versão atualizada).
- Teste de kardex: `backend/scripts/transferencia-id-kardex.test.sql` (cria a empresa da fixture dentro da transação).

Não contém: migrations NF-e, growth-001 nem alterações de TypeScript.

## Motivo
A migration original tinha a mesma versão de `growth-001` (`20261023130000`) e reescrevia a função de transferência antes do G14, que espera o texto anterior. Em produção e homologação o G14 foi aplicado sem a #629, então a sequência naqueles ambientes é consistente; a cadeia do repositório não era.

## Evidências
- Cadeia de `origin/main` + B1 reconstruída em banco local descartável: **447 migrations**, sem erro. A pasta de migrations é idêntica à testada.
- `internal.transferir_estoque_seguro` contém G14 (`v_produto_destino`) e `transferencia_id`.
- `transferencia-id-kardex`, `fase3-tenant-isolation-transferencias-remessas` e `pr1b-kardex-imutavel`: **passam** nessa reconstrução.
- Tipos gerados (`--local`, CLI 2.116.0) a partir da reconstrução: **idênticos** a `database.types.ts` de `origin/main` (drift gate sem diferença).

## Riscos
1. **Growth-001 continua em `origin/main` com a versão `20261023130000`.** Esta PR não a renomeia nem remove. Ver o relatório de investigação antes de qualquer merge.
2. Qualquer merge em `main` pode disparar a integração Supabase, que aplica migrations pendentes (ver `docs/audits/ENGINEERING_LOOP_NFE_2026-10-30.md`).
3. Esta PR altera caminho de produção (`backend/supabase/migrations/`). O guard exige a label `deploy-prod:aprovado`, que **não** é adicionada aqui.
4. Homologação ainda não tem a #629. Não será aplicada até o merge e a aprovação.

## Rollback
`ops/rollback_20261029155000_movimentos_estoque_log_transferencia_id.sql`. Não executado.
