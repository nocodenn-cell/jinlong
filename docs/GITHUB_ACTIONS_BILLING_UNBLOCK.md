# Desbloqueio GitHub Actions — FastProduct

**Data:** 2026-07-12  
**Repo:** `nocodenn-cell/fastproduct` (privado, permission ADMIN)  
**Sintoma:** workflows concluem em ~2–5s com FAILURE; E2E SKIPPED.

## Causa raiz (evidência)

Anotação oficial do job `build-and-test` (run `29216177807`):

> *The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings*

Não é falha de código, lint ou testes. O runner **nem inicia**.

## O que já foi verificado via API

| Check | Resultado |
|-------|-----------|
| Actions habilitado no repo | `enabled: true`, `allowed_actions: all` |
| Billing Actions (user/org API) | HTTP 404 / escopo `user` ausente no token `gh` |
| Cache Actions | Ativo (~3.8 GB, 8 caches) |
| Owner | conta de usuário `nocodenn-cell` (não org) |

## Correção (manual — requer UI da conta)

1. Abrir **https://github.com/settings/billing**
2. Em **Payment information**:
   - corrigir cartão / método de pagamento falho;
   - limpar faturas em aberto, se houver.
3. Em **Spending limits** (Actions / Packages / Codespaces):
   - aumentar o limite ou remover o teto de $0;
   - para conta Free com minutos esgotados: adicionar spending limit > 0 **ou** aguardar reset mensal.
4. Confirmar plano em **https://github.com/settings/billing/plans**
5. Voltar à PR #156 → **Re-run all jobs**  
   ou: `gh workflow run` / push vazio de trigger.

## Validação pós-fix

```bash
gh run list --branch feat/admin-screen-consolidation --limit 4
# Esperado: conclusion success (ou failure real de teste, não 2s billing)
```

Gates que devem voltar a executar:

- CI pdv-importados (`build-and-test`, E2E, validate-production)
- CI backend Supabase (migration-remote-drift, RLS)
- CI pdv-local
- Secret scan

## Nota de segurança

Não é possível regularizar billing via token atual do `gh` (sem escopo `user` / endpoints de billing indisponíveis). A correção é **somente na UI** da conta pagante.
