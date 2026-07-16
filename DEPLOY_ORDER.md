# Deploy Order — FastProduct Go-Live

**Data:** 2026-07-16 · **Princípio:** banco antes de app; RPC canônica consistente em cada passo; nada irreversível sem rollback pronto (`ROLLBACK_PLAN.md`).

> ⚠️ Todo passo marcado 🔒 é **mutação de produção** e só executa após sua confirmação explícita.

## Pré-requisitos (verificados nesta auditoria)
- [x] Produção atual = `main` @ `8deb540` (READY) — base estável para o corte.
- [x] Rollback candidate identificado (`c41f241` #190).
- [x] `ageguard` INACTIVE — sem risco de destino cruzado.

## Sequência

### Passo 0 — Congelamento
- Confirmar branch de release = `main`; nenhum merge novo durante o corte.

### Passo 1 — 🔒 Banco (Supabase `jinlong`)
Aplicar, **em ordem de timestamp**, as migrations do repo ausentes no ledger de produção. Ordem lógica validada:
1. `248_devolver_ou_trocar_venda` — **só após homologação remota + gate financeiro 5/5** (R2).
2. `250_calcular_preco_produto_decision_fields`
3. `251_rls_admin_alinha_painel_gerente`
4. `252_venda_finance_context_mirror`
5. `253_clientes_tipo_endereco_e_view_gerente`
6. `256_pdv_diagnostico_pre_producao`

Regras de segurança:
- **RPC v4:** se aplicar `268_drop_v4_overloads`, aplicar `268_reconcile_finalizar_venda_v4_single_overload` **no mesmo lote** — nunca deixar a RPC sem overload canônico (R4).
- Rodar `get_advisors(security)` após DDL; garantir 0 ERROR.
- Verificar `SMOKE_OK` da 248 no ambiente alvo antes de liberar o fluxo de devolução na UI.

### Passo 2 — 🔒 Config (cofres)
- Confirmar Vercel Env (Prod/Preview) e GitHub Secrets por nome (`AUDITORIA_AMBIENTES_PRODUCAO.md` §7).
- Confirmar `NEXT_PUBLIC_SUPABASE_URL` (Prod) = `kbabmewnahysfvlybiak`.
- Confirmar `SYNC_KEY` idêntico Vercel/desktop ↔ Edge Custom Secret.
- Remover 4 órfãos (após confirmar não-uso externo).

### Passo 3 — 🔒 Edge Functions
- Só re-deploy se o código das funções mudar. Hoje: sync-outbox v68 / validar-gerente v43 / fiscal-worker v35 já ACTIVE. Nenhuma ação necessária salvo mudança.

### Passo 4 — App (Vercel)
- Promover o commit de release a produção (deploy automático no push de `main`).
- Confirmar deploy **READY** e smoke de rotas (`smoke:http`).

### Passo 5 — Observabilidade
- Confirmar `SENTRY_DSN` ativo; habilitar leaked-password-protection (R9).
- War room 48–72h (roadmap Fase 4).

## Regra de ouro
Banco (Passo 1) **sempre antes** do App (Passo 4). Se a 248 não homologar, **congelar o escopo de devolução** e seguir sem ela — não bloquear o resto do go-live.
