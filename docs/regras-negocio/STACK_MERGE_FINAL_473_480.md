# Merge final da stack — recomendação humana

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Tip código** | #479 `9f72ce56` (21 commits vs `main`, merge-tree limpo) |
| **Tip docs/ops** | #480 `74c73164`+ (1 commit sobre #479; merge-tree limpo vs `main`) |

## Estratégia escolhida: **B — #480 como tip consolidado final**

1. Retarget da base de **#480** para **`main`** (PR passa a conter #473…#479 + hardening/backup).
2. Humano revisa e **`MERGE #480`** em `main`.
3. **`FECHAR COMO SUPERSEDIDOS`:** `#473`, `#474`, `#475`, `#476`, `#477`, `#478`, `#479`.

### Alternativa A (dois merges)

`MERGE #479` → depois `MERGE #480` (base #479). Mesmo conteúdo; um passo a mais.

### Proibido

Cherry-pick duplicado; mergear #473…#478 depois do tip; force-push; merge automático por agente.

## Gate stack

**`STACK_FINAL_READY_TO_MERGE`** — conteúdo linear, sem conflitos com `main`, gates de código da fase anterior OK.  
Merge **somente** com autorização humana.
