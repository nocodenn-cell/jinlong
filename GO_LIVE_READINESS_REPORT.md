# Go-Live Readiness Report — FastProduct

**Atualizado:** 2026-07-12 (pós A+C)  
**Branch:** `feat/admin-screen-consolidation`  
**HEAD (pré-fix push):** ver `git log -1`  
**PR:** [#156](https://github.com/nocodenn-cell/fastproduct/pull/156)

---

## Decisão objetiva

### **Não pronto** para produção

### **Homologação parcial em progresso** — ambiente local Docker validado; remoto dedicado ainda bloqueado por limites de plano

**Justificativa:** a migration `248` foi aplicada e exercitada com **SMOKE_OK** no Supabase **local** (`project_id=fastproduct`). Dois bugs da RPC foram encontrados e corrigidos no smoke. Porém: (1) branch Supabase remoto exige **Pro**; (2) novo projeto Free está no **limite de 2 projetos**; (3) `jinlong` **não** recebeu a migration (conforme decisão); (4) CI GitHub permanece bloqueado por **billing**.

---

## 1. Ambiente de homologação (decisão A)

| Tentativa | Resultado |
|-----------|-----------|
| Branch Supabase `homolog-sprint-b-devolucao` | **Falhou** — `PaymentRequiredException: Branching is supported only on the Pro plan or above` |
| Projeto Free remoto `homolog-sprint-b-devolucao` | **Falhou** — limite Free: *naturecode (2 project limit)* — projetos ativos: `jinlong` + `ageguard` |
| Supabase **local** Docker (`fastproduct`) | **OK** — usado como homologação dedicada desta sessão |

### Evidência local (migration 248)

| Check | Resultado |
|-------|-----------|
| Tabelas `venda_pos_venda_*`, `estoque_reposicoes_devolucao` | Presentes |
| RPC `devolver_ou_trocar_venda` | Presente (assinatura completa) |
| Tipo kardex `ENTRADA_DEVOLUCAO_CLIENTE` | Presente |
| View `v_kardex_unificado` inclui devolução | Sim |
| Smoke SQL ponta a ponta | **SMOKE_OK** |

**Script:** `backend/supabase/scripts/homolog_sprint_b_devolucao_smoke.sql`

```
SMOKE_OK operacao=… estoque=5.000->6.000 caixa=100.00->90.00 valor_estornado=10.00 valor_caixa=10.00
```

Validado no smoke:

- estoque ↑
- caixa ↓ (DINHEIRO)
- `devolucoes` com `operacao_id`
- `estoque_reposicoes_devolucao`
- ledger `SALE_PARTIAL_RETURN`
- view kardex `ENTRADA_DEVOLUCAO_CLIENTE`
- idempotência (`homolog-key-001`)

### Bugs encontrados e corrigidos no smoke

1. `CASE … THEN v_cr.id` avaliava record não atribuído fora de `CREDITO_CLIENTE` → uso de `v_contas_receber_id`.
2. Typo no `RETURN QUERY`: `v_valor_estornado` → `v_valor_estorno`.

Arquivo corrigido: `backend/supabase/migrations/248_devolver_ou_trocar_venda.sql`

### `jinlong`

**Não alterado.** RPC/tabelas Sprint B continuam ausentes no remoto.

---

## 2. Status do CI (decisão C)

| Item | Status |
|------|--------|
| Causa raiz | Billing: *recent account payments have failed or your spending limit needs to be increased* |
| Actions habilitado no repo | Sim |
| Correção via API `gh` | **Impossível** (endpoints billing 404 / falta escopo `user`) |
| Runbook | [`docs/GITHUB_ACTIONS_BILLING_UNBLOCK.md`](docs/GITHUB_ACTIONS_BILLING_UNBLOCK.md) |

**Ação humana obrigatória:** https://github.com/settings/billing → corrigir pagamento / spending limit → Re-run PR #156.

---

## 3. Status dos testes

| Camada | Status |
|--------|--------|
| Typecheck | PASS (sessão anterior) |
| Build | PASS (sessão anterior) |
| Smoke SQL Sprint B (local) | **PASS (SMOKE_OK)** |
| Unit parser devolução | PASS |
| Playwright `e2e/admin-vendas-devolucao-troca.spec.ts` | **Criado**; execução bloqueada até CI/billing + app apontando homolog |
| E2E crítico CI | SKIPPED (billing) |

---

## 4. Pendências críticas (P0) restantes

| ID | Pendência |
|----|-----------|
| P0-1 | Upgrade Supabase **Pro** (branch) **ou** pausar `ageguard` / liberar slot Free **ou** autorizar projeto pago de homolog |
| P0-2 | Regularizar billing GitHub Actions (UI) |
| P0-3 | Rodar Playwright devolução contra app + DB homolog |
| P0-4 | Renomear migrations `247a/b/c` para padrão `<timestamp>_name.sql` (CLI as está **pulando**) |
| P0-5 | Reconciliar drift remoto `jinlong` vs repo antes de qualquer promote |
| P0-6 | Autorização explícita para aplicar `248` (versão corrigida) em `jinlong` **somente após** P0-1…P0-3 |

---

## 5. Riscos conhecidos

| Risco | Severidade |
|-------|------------|
| Homolog só local (não espelha dados/produtos de `jinlong`) | Média |
| Drift migrations timestamp no remoto | Alta |
| CI vermelho mascara regressões | Alta |
| Limite Free impede segundo projeto remoto | Alta |
| Sprint C ainda bloqueada | — (intencional) |

---

## 6. Checklist de implantação

- [x] Push branch com Sprint B
- [x] Diagnóstico CI billing documentado
- [x] Homolog local Docker com migration 248
- [x] Smoke SQL estoque/kardex/financeiro/auditoria
- [x] Correção de bugs RPC descobertos no smoke
- [x] Spec Playwright criada
- [ ] Billing GitHub regularizado + CI verde
- [ ] Homolog **remota** dedicada (Pro branch ou slot Free)
- [ ] Playwright verde em homolog remota
- [ ] Autorização para `jinlong`
- [ ] Sprint C

---

## 7. Próximos gates (escolha do PO)

Para destravar homolog **remota** (escolher um):

1. **Upgrade Pro** no projeto `jinlong` → criar branch `homolog-sprint-b-devolucao` (~US$ 0,01344/h)  
2. **Pausar** `ageguard` (`dusngyacduoihxhkqmhv`) → criar projeto Free `homolog-sprint-b-devolucao`  
3. Autorizar projeto pago dedicado

Para destravar CI:

4. Corrigir https://github.com/settings/billing e re-rodar PR #156

Sprint C permanece **bloqueada** até: homolog remota verde **ou** aceite explícito de homolog local como evidência suficiente + CI restaurado + Playwright executado.
