# Checklist de homologação comercial

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-18 |
| **Missão** | Fechamento comercial |

---

## Domínios

| Domínio | Status | Evidência |
|---------|--------|-----------|
| Customers | 100% | `products_100` pattern · audit customers |
| Products | 100% | `docs/architecture/products_100_audit.md` |
| Inventory | 100% | `docs/architecture/inventory_100_audit.md` |
| Cash | GO piloto | `cash_100_audit.md` · ADR-009 |
| Financial | GO piloto | `financial_100_audit.md` · ADR-010 |

## Validações técnicas

| Check | Como | Estado alvo |
|-------|------|-------------|
| Typecheck | `pdv-importados` `npm run typecheck` | Verde |
| Guard domain | `npm run guard:domain` | Verde |
| Testes shared-core cash/financial/inventory/… | `vitest` | Verde |
| Testes adapters | vitest admin + caixa/server | Verde |
| Entity-ssot | `npm run check:entity-ssot` | Verde (se tocar CRUD) |

## Checklist funcional (piloto)

- [ ] Login operador + gerente
- [ ] CRUD cliente `/admin/clientes`
- [ ] CRUD produto `/admin/catalogo` + estoque inicial
- [ ] Ajuste estoque `/admin/estoque`
- [ ] Abrir caixa `/caixa`
- [ ] Venda DINHEIRO + PIX
- [ ] Conferir baixa estoque
- [ ] Liquidar título AR (se gerado)
- [ ] Fechar caixa com \(E(c)\)
- [ ] i18n pt/zh em telas críticas
- [ ] Auditoria lê eventos
- [ ] Sem SQL manual / Studio

## i18n

| Domínio | Codes → catálogo |
|---------|------------------|
| Customers / Products / Inventory | Fechado |
| Cash / Financial | Codes no core; mensagens legadas na borda (P1 catálogo completo) |

## Veredito homologação técnica

**GO técnico** para piloto se typecheck + guard + testes unitários verdes e e2e críticos de caixa passarem no ambiente alvo.

**Homologação humana** (checklist funcional) permanece responsabilidade do piloto no ambiente real.
