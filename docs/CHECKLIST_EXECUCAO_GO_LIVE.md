# Checklist de Execução — Go-Live (1º cliente)

Use com [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md), [DONE_DEFINITION_PILOTO.md](./DONE_DEFINITION_PILOTO.md) e [FEATURE_FREEZE_PILOTO.md](./FEATURE_FREEZE_PILOTO.md).

## 1. Bloqueadores absolutos (todos obrigatórios)

| # | Item | Evidência |
|---|------|-----------|
| B1 | Feature freeze assinado | Link/cópia `FEATURE_FREEZE_PILOTO.md` |
| B2 | `migration list` sem lacunas no ref do piloto | Print CLI |
| B3 | `verify_p0_producao.sql` sem falha | Print SQL Editor |
| B4 | Financial gate 5/5 PASS | Output `stress:pdv` + SQL apêndices |
| B5 | `USE_UNIFIED_SALES_FLOW=true` em produção | Vercel env |
| B6 | Smoke §4b: abrir → vender split → fechar → ver em `/admin/vendas` | Ata curta |
| B7 | PITR/backup ativo | Print Supabase |
| B8 | Rollback ensaiado | Nota `RUNBOOK_ROLLBACK.md` |
| B9 | Onboarding: loja + DONO/GERENTE/OPERADOR + catálogo mínimo | `seed:demo-fluxo` ou CSV |
| B10 | Runbook cliente entregue | `RUNBOOK_CLIENTE_PRIMEIRO_DIA.md` |

## 2. Fase 2 — operação (pré-homologação)

| # | Item | OK? |
|---|------|-----|
| O1 | `/admin/catalogo` — import CSV funcional | [ ] |
| O2 | `/admin/catalogo` — export CSV funcional | [ ] |
| O3 | Cadastro — salvar e continuar | [ ] |
| O4 | `/gerente/financeiro/contas-pagar` — lista e pagamento | [ ] |
| O5 | `/admin/estoque` — ajuste de saldo | [ ] |
| O6 | Sem fiado no PDV (formas: dinheiro/PIX/cartão) | [ ] |

## 3. Homologação (Fase 3)

| # | Item | OK? |
|---|------|-----|
| H1 | CI verde (`npm run ci` na raiz) | [ ] |
| H2 | `npm run validate:production` pós-deploy | [ ] |
| H3 | `DONE_DEFINITION_PILOTO` §1–§5 | [ ] |
| H4 | Ata GO/NO-GO assinada | [ ] |

## 4. Corte (Fase 4)

| # | Item | OK? |
|---|------|-----|
| C1 | Janela de publicação comunicada ao cliente | [ ] |
| C2 | Treinamento 2h (caixa + cadastro + estoque) | [ ] |
| C3 | Canal de suporte ativo (48–72h war room) | [ ] |
| C4 | Monitoramento: Vercel + Supabase logs | [ ] |

## Comandos rápidos

```bash
# Raiz do monorepo
npm run ci

# Gate financeiro (staging)
cd pdv-importados && npm run stress:pdv

# Onboarding mínimo
cd pdv-importados && npm run seed:demo-fluxo

# Migrations
cd backend && npx supabase migration list
# SQL Editor: backend/supabase/scripts/verify_p0_producao.sql
```
