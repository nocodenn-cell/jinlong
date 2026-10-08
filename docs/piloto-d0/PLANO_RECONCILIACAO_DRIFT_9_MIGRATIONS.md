# P1-02 — Reconciliação drift Git × produção (9 migrations)

**Status:** documentado · **nenhuma** aplicação remota.  
**Fonte do gate:** `migration-remote-drift` / `remote_ausente`.

## Inventário

| Version | Arquivo | Classificação | Equivalência remota? | Ação |
|---|---|---|---|---|
| 20261006120000 | financeiro_contas_formas_e_painel | DESCARTAR_OBSOLETA | Superseded por 180000→195837 | Deny-list (`forbidden-migrations.json`) |
| 20261007161220 | fiscal_cancelado_ssot | APLICAR condicional | Não | Auth humana |
| 20261007163000 | ssot_001_002_painel_ec_cache | APLICAR condicional | Não | Auth + ordem |
| 20261007163100 | ssot_003_nfe_obrigacao_duplicata | INVESTIGAR | Não | Ver matriz NF-e |
| 20261007163200 | ssot_004_revoke_insert | APLICAR condicional | Não | Auth |
| 20261007170000 | ssot_002_mov_ar_ec_cache | APLICAR condicional | Não | Auth |
| 20261007171000 | cancel_guard_antes_devolucao | APLICAR (após 163000) | Não | Auth |
| 20261007180000 | calcular_valor_sistema_por_forma | APLICAR condicional | Não | Auth |
| 20261007190000 | caixas_fechamento_formas_snapshot | APLICAR (após 180000) | Não | Auth |

## Ordem segura (se autorizada no futuro)

```text
161220 → 163000 → [163100 só com GO comercial] → 163200 → 170000 → 171000 → 180000 → 190000
(+ 20261008120000 DROP POLICY insert — opcional defesa, também só com auth)
```

**Nunca:** `20261006120000`, `db push --include-all` cego, apply em lote sem smoke.

## Pré-condições por etapa

1. Backup artifact success &lt;25h **ou** aceite escrito de risco de schema (sponsor).  
2. Janela + observador.  
3. Dry-run / leitura `pg_proc` pós-apply.  
4. Smoke cancel/sangria/fechamento em homolog se disponível.

## Reversão

Comentários de rollback nos SQL; hotline; **proibido** `db reset` em Jinlong.

## Limite

`remote_ausente` ≠ autorização. PR #485 permanece bloqueável por este drift até isenção de path ou reconciliação.
