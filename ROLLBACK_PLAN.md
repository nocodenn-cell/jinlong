# Rollback Plan — FastProduct Go-Live

**Data:** 2026-07-16 · **Objetivo:** retornar a um estado estável conhecido em < 15 min, sem perda de dados transacionais.

> Todo comando de rollback é **mutação de produção** → executar com sua autorização.

## 1. App (Vercel) — rollback rápido (minutos)
- **Estado estável conhecido:** deploy de produção `8deb540` (#193) — `isRollbackCandidate: true`.
- **Alternativa anterior:** `c41f241` (#190).
- **Ação:** Vercel Dashboard → Deployments → escolher o deploy READY estável → *Promote to Production* / *Rollback*.
- **Reversível:** sim, imediato. App não guarda estado; rollback de app é seguro a qualquer momento.

## 2. Banco (Supabase) — o ponto crítico
Migrations **não são trivialmente reversíveis**. Estratégia por tipo:

| Migration | Reversibilidade | Plano |
|---|---|---|
| `248_devolver_ou_trocar_venda` | RPC + tabelas novas | Reverter = `DROP FUNCTION devolver_ou_trocar_venda` + desabilitar UI de devolução. Tabelas novas (`venda_pos_venda_*`, `estoque_reposicoes_devolucao`) podem permanecer vazias sem efeito. |
| `268_drop_v4_overloads` + reconcile | dropa/recria overload de RPC | **Nunca reverter só o reconcile.** Reverter = re-aplicar o estado v4 anterior do overload. Manter script do overload antigo à mão antes do corte. |
| `250`–`253`, `256` (colunas/views/RLS) | aditivas | Em geral seguras; reverter view/coluna só se causar erro. Preferir *fix-forward*. |

**Regra:** para banco, preferir **fix-forward** (nova migration corretiva) a rollback destrutivo, exceto se houver corrupção de dados.

## 3. Backup / ponto de restauração
- **Antes do Passo 1 do `DEPLOY_ORDER.md`:** capturar snapshot/PITR do `jinlong` (Supabase Dashboard → Database → Backups). Registrar timestamp.
- **Critério de restore total:** só em corrupção de dados irrecuperável; restore de PITR reverte dados transacionais desde o snapshot — coordenar com a operação da loja.

## 4. Edge Functions
- Versionadas (sync-outbox v68 etc.). Rollback = re-deploy da versão anterior via CLI/Dashboard. Confirmar `SYNC_KEY`/`FISCAL_WORKER_KEY` inalterados.

## 5. Config / Secrets
- Não alterar secrets no corte salvo necessário. Se alterar e quebrar: reverter o valor no cofre (Vercel/Supabase). Manter registro do valor anterior fora de banda antes de mudar.

## 6. Gatilhos de rollback (quando acionar)
- Erro P0 no fluxo de venda (RPC v4 falhando) → **rollback de app imediato** + investigar banco.
- Advisor de segurança vira ERROR após DDL → parar, avaliar, fix-forward.
- Divergência de dados de estoque/caixa após 248 → congelar devolução, fix-forward.

## 7. Ordem de rollback (inverso do deploy)
App primeiro (rápido, seguro) → depois avaliar banco (fix-forward preferido) → Edge/config só se envolvidos.
