# 03 — Deploy do backend (Supabase)

Voltar ao [plano](00-README.md). Complementa — não substitui —
[`docs/CHECKLIST_DEPLOY_SUPABASE.md`](../CHECKLIST_DEPLOY_SUPABASE.md).

---

## 1. Estado atual: 30 migrations pendentes

Comparação feita em **2026-08-17** entre os 304 arquivos de
`backend/supabase/migrations/` e o ledger `supabase_migrations.schema_migrations` do projeto `jinlong`:

| Métrica | Valor |
|---|---|
| Arquivos no repositório | **304** |
| Rastreados em produção (por timestamp **ou** id numérico) | **274** |
| **Pendentes reais** | **30** |

> **Por que "por timestamp ou id numérico".** Uma comparação ingênua por nome de arquivo aponta 107
> divergências. A maioria é artefato de renomeação: os blocos `20260621*` e `20260731200300–202200`
> são *backports* com timestamp de migrations que produção rastreia sob id numérico (`205`–`289`).
> Elas **estão aplicadas**. Só 30 são genuinamente novas.

### 1.1 As 30 pendentes, em ordem de aplicação

**Grupo A — tombstone (1).** No-op em produção; os objetos nunca existiram lá.

```
20260810222702_retire_obsolete_venda_finance_context.sql
```

**Grupo B — remediação financeira AR/AP + comissões DB-05 (24).** 🔴 **Este é o bloco crítico.**

```
20260813231034_financial_idempotency_correlation_expand.sql
20260813232133_sale_totals_invariant.sql
20260813234233_ar_receipts_reconciliation.sql
20260814000154_ap_payments_reconciliation.sql
20260814012644_protect_cash_balance_authority.sql
20260814013015_drop_recalcular_saldo_caixa.sql
20260814013215_reconcile_offline_cash_sales.sql
20260814013447_enforce_store_scoped_receivables.sql
20260814013845_unify_online_offline_price_invariant.sql
20260814014205_offline_resolve_tipo_preco.sql
20260814015032_harden_diagnostics_and_ap_idempotency.sql
20260814090345_validate_offline_replay_payload.sql
20260814095445_auditable_ar_ap_reversals.sql
20260814105031_require_store_context_for_offline_sales.sql
20260814105520_price_band_by_actual_quantity.sql
20260814110028_commission_on_completed_sale_event.sql
20260814111243_revoke_truncate_and_cash_delete.sql
20260814114654_commission_post_sale_adjustments.sql
20260814142254_commission_net_settlement.sql
20260814142814_commission_adjustment_after_full_operation.sql
20260814151030_commission_item_snapshot.sql
20260814161500_commission_cancellation_order_independence.sql
20260814171500_commission_ledger_immutability_audit.sql
20260814180000_commission_frontend_reporting_reconciliation.sql
```

**Grupo C — catálogo de produtos (5).**

```
20260816135000_reconcilia_produtos_codigo_interno.sql
20260816140000_rls_produtos_historico_isolamento_por_loja.sql
20260816141000_criar_produto_autoria_atomica.sql
20260816142000_indices_fks_autoria_produtos.sql
20260816143000_atualizar_produto_com_faixa_atacado.sql
```

### 1.2 O que a ausência do Grupo B significa hoje

Produção roda **sem** as correções dos P0 da Issue #298. Concretamente, na produção de hoje:

- `registrar_liquidacao_receber` atualiza contas a receber **sem** efeito em caixa/fluxo (FIN-298-01);
- pagamento de contas a pagar **não** gera saída de caixa (FIN-298-02);
- comissão depende de `AFTER UPDATE OF status` e **pode não nascer** no fluxo canônico (FIN-298-03);
- cancelamento após recebimento parcial **não** estorna o já recebido (FIN-298-04).

A certificação `DB-05 CERTIFICADO` do §12 é sobre o **código da branch**. Não descreve o banco de produção.

## 2. Ordem de aplicação

A ordem é a **lexicográfica dos timestamps** — o Supabase CLI aplica assim, e a sequência já foi
validada pelo guard. Não reordenar manualmente.

```bash
npm run guard:migrations
```

## 3. Ensaio obrigatório antes de tocar produção

Como **não há staging** ([02](02-ambiente-producao.md) §1), o ensaio é local e descartável:

```bash
npx supabase db reset --local --yes
```

Esse comando aplica as 304 migrations do zero. É a prova de que a cadeia inteira é replayável.
Espera-se ver `20260810222702_retire_obsolete…` na sequência e o reset terminar verde.

Em seguida, as suítes que rodam contra o banco local:

```bash
npm run test:rls-scope        -w fastproduct-backend
npm run test:financial        -w fastproduct-backend
npm run test:financial-concurrency -w fastproduct-backend
npm run check:types-drift     -w fastproduct-backend
```

Referência de resultados esperados (§12.6 do relatório): `test:rls-scope` **42/42**,
`test:financial` **6/6**.

## 4. Validação do HUMAN_GATE

O arquivo de gates humanos existe e está **vazio**:

```bash
cat backend/supabase/migration-human-gates.json
# → { "gates": [] }
```

`gates: []` significa **nenhuma migration exige aprovação humana explícita** neste momento. Se o
arquivo tiver qualquer entrada, **pare** e resolva antes de aplicar.

Status geral de migrations:

```bash
npm run test:migration-status -w fastproduct-backend
```

## 5. Verificação da tombstone `venda_finance_context`

Existe verificação dedicada no workspace do backend:

```bash
npm run check:venda-finance-context-retirement -w fastproduct-backend
npm run test:venda-finance-context-retirement  -w fastproduct-backend
```

Confirmação de que o repositório está no estado correto:

```bash
# deve retornar VAZIO — a reaplicação foi aposentada
ls backend/supabase/migrations/ | grep 20260808130200

# deve retornar o arquivo — a tombstone é a convergência oficial
ls backend/supabase/migrations/ | grep 20260810222702
```

> ⛔ **Não reaplicar `20260808130200` manualmente, em nenhum ambiente.** Decisão formalizada em
> [ADR-012](../adr/ADR-012-aposentadoria-venda-finance-context.md); histórico completo em
> [`RECONCILIACAO_venda_finance_context_2026-08-13.md`](../RECONCILIACAO_venda_finance_context_2026-08-13.md).
> A linha `252` do ledger **não deve ser reparada**.

## 6. Aplicação em produção

> 🔴 **Só executar dentro da janela coordenada** de [07-go-live-day.md](07-go-live-day.md).
> Aplicar o Grupo B com a aplicação antiga no ar coloca AR/AP em **falha fechada** (§11.6 do
> relatório): as chamadas antigas passam a ser rejeitadas e nada é gravado.

Backup primeiro. Depois:

```bash
npx supabase db push --linked
```

Conferência do que foi aplicado:

```bash
npx supabase migration list --linked
```

O ledger deve passar a conter as 30 versões do §1.1.

## 7. Deploy das Edge Functions

As três funções estão ACTIVE mas com proveniência inconsistente ([02](02-ambiente-producao.md) §2).
Republicar a partir da branch fecha essa incerteza.

Validação local antes:

```bash
npm run check:edge
```

Deploy:

```bash
npx supabase functions deploy sync-outbox     --project-ref kbabmewnahysfvlybiak
npx supabase functions deploy validar-gerente --project-ref kbabmewnahysfvlybiak
npx supabase functions deploy fiscal-worker   --project-ref kbabmewnahysfvlybiak
```

Preservar `verify_jwt`: `validar-gerente` usa `true`; `sync-outbox` e `fiscal-worker` usam `false`
por autenticarem via chave própria.

### 7.1 🟠 `GL-DENO-LOCK` — risco conhecido e aberto

O relatório (§5) registra: com `--frozen`, **`fiscal-worker` passa**, mas **`sync-outbox` e
`validar-gerente` falham**; todas passam com `--no-lock`. Isso significa que o lockfile Deno não
reproduz de forma determinística as dependências dessas duas funções.

Classificado como *"corrigir em tarefa separada antes do Go-Live"* — **e continua aberto**. Com
cliente pagante, o efeito prático é que um redeploy pode resolver dependências diferentes das
testadas. Decidir explicitamente:

- **(a)** corrigir os lockfiles antes do deploy (preferível), ou
- **(b)** publicar com `--no-lock` e registrar o risco aceito por escrito.

## 8. Smoke pós-deploy

```bash
npm run smoke:rls-rest   -w fastproduct-backend
npm run smoke:sync-edge  -w pdv-local
npm run test:cors:validar-gerente -w pdv-importados
```

## 9. Checklist de saída

- [ ] `npx supabase db reset --local --yes` verde com as 304 migrations
- [ ] `test:rls-scope` 42/42 · `test:financial` 6/6 · `check:types-drift` verde
- [ ] `migration-human-gates.json` com `gates: []`
- [ ] Tombstone presente, `20260808130200` ausente
- [ ] **Backup do banco de produção feito**
- [ ] `db push` aplicado dentro da janela coordenada
- [ ] `migration list` mostra as 30 versões
- [ ] Decisão registrada sobre `GL-DENO-LOCK`
- [ ] 3 Edge Functions republicadas, `verify_jwt` preservado
- [ ] Smokes verdes

→ Próximo: [04-deploy-frontend.md](04-deploy-frontend.md)
