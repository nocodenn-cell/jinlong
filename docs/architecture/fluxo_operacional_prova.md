# Prova do fluxo operacional completo

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-18 |
| **Objetivo** | Mapear cada etapa a evidência automatizada existente |

---

## Cadeia obrigatória → evidência

| Etapa | Evidência no repo | Tipo |
|-------|-------------------|------|
| Login | middleware + `usuarios` · e2e login | Auth |
| Abrir caixa | `e2e/caixa-modais-abrir-fechar.spec.ts` · CashSessionWriter | E2E + unit |
| Cadastrar funcionário | **Runbook** Auth+SQL — sem UI | Gate (NO-GO UI) |
| Cadastrar cliente | Customers 100 · `admin/clientes` adapters | Domain closed |
| Cadastrar produto | Products 100 · ProductWriter RPC 270 | Domain closed |
| Entrada estoque | Inventory Adjustment / remessa / NF-e | Domain closed |
| Venda | `e2e/caixa-venda*.spec.ts` · `finalizar_venda_*` | E2E |
| Pagamento / recebimento | TX venda + AR liquidação adapter | RPC + domain |
| Contas a receber | ReceivableReader/Writer/Liquidation | Domain |
| Contas a pagar | PayableReader/Payment | Domain |
| Comissão | `marcar_comissoes_pagas` (satélite) | Action gerente |
| Fechar caixa | CashSessionWriter · e2e abrir/fechar | E2E + adapter |
| Relatórios | admin relatórios / KPIs | UI |
| Auditoria | `/admin/auditoria` reads | UI |

## Specs âncora

1. `pdv-importados/e2e/caixa-golden-flow-cycle5.spec.ts`
2. `pdv-importados/e2e/caixa-fluxos-criticos.spec.ts`
3. `pdv-importados/e2e/caixa-fase5b-contas-receber.spec.ts`
4. `pdv-importados/e2e/fluxo-operacional-completo.spec.ts` (smoke de rotas)

## Como executar (sem Studio/SQL)

```bash
cd pdv-importados
npm run typecheck
npm run guard:domain   # na raiz: npm run guard:domain
npx vitest run app/admin/estoque app/admin/financeiro app/caixa/server/cashSession.test.ts
# E2E (requer env + app up):
npx playwright test e2e/caixa-golden-flow-cycle5.spec.ts e2e/caixa-modais-abrir-fechar.spec.ts
```

## Limite honesto

O spec `fluxo-operacional-completo` atual é **smoke de navegação** (pula se não autenticado). A prova forte do fluxo crítico vive nos e2e de caixa golden + Fase 5b + domínios fechados. Homologação comercial completa exige ambiente autenticado (preview/local com credenciais).
