# Sprint P0 — roteiro de execução (1º cliente)

| Campo | Valor |
|--------|--------|
| **Status** | Em execução |
| **Gate** | APROVADO COM RESSALVAS (2026-07-19) |
| **DI** | Core v1.0 / Wave A congelados |

## Ordem

1. Gate de Produto — **fechado** (Fiscal=Stub, AP=só NF-e)
2. **P0-DADOS** — `/admin/implantacao` → Validar dados
3. **P0-SSOT** — `npm run check:entity-ssot` exit 0
4. **P0-VEN-PROOF** — venda DINHEIRO + PIX → estoque → financeiro → auditoria
5. **P0-VEN-REV** — cancelamento + devolução revertem saldos
6. **P0-FIX** — só bugs que quebrem as provas
7. **P0-HOM** — homologação integrada + autorizar GO-LIVE

## Comandos de validação técnica

```bash
cd pdv-importados
npm run check:entity-ssot
npx vitest run app/admin/implantacao/homologacaoDados.test.ts app/admin/implantacao/implantacaoCatalog.test.ts tests/p0-venda-homologacao.matrix.test.ts
```

## Declaração GO dos módulos

Somente após **P0-HOM** bem-sucedido: Venda, Estoque, Financeiro e Cadastro = GO.
