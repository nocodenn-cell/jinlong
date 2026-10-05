# Go-Live — inventário Financeiro + Fiscal

> Registro histórico da entrega de 19/07/2026. A restrição “AP somente NF-e”
> descreve aquela versão; a operação atual também inclui despesas manuais e
> recorrentes. Consulte [Financeiro para a loja](../financeiro-loja.md).

| Campo | Valor |
|--------|--------|
| **PR** | [#220](https://github.com/nocodenn-cell/fastproduct/pull/220) |
| **Data** | 2026-07-19 |
| **Decisões** | Fiscal = **Stub** · AP = **somente NF-e** |
| **DI** | Congelada em `feat/first-customer-go-live` (`/admin/intelligence`) — fora deste PR |

## Financeiro — EXISTS

| Tela | Rota | Operações |
|------|------|-----------|
| Unificado AR | `/admin/financeiro?tab=receber` | listar, criar título, liquidar |
| Unificado AP | `/admin/financeiro?tab=pagar` | listar, pagar, cancelar |
| AP standalone | `/admin/financeiro/contas-pagar` | mesmo client |
| Dashboard (gate) | `/admin/dashboard` | item `financeiro.dashboard` |
| Comissões | `/admin/comissoes` | satélite |

## Fiscal — EXISTS (mínimo Stub)

| Tela | Rota | Operações |
|------|------|-----------|
| Fila | `/admin/financeiro?tab=fiscal` | listar PENDENTE/ERRO + aviso Stub |
| Detalhe sheet | mesmo | timeline + reprocessar |
| Detalhe página | `/admin/financeiro/documento/[id]` | leitura + reprocessar |
| Enfileiramento | PDV pós-venda | `NFC_E_STUB` (sem UI de emissão) |

## Ausências / não implementar

| Item | Motivo |
|------|--------|
| UI criar AP manual | Decisão de produto — botão aponta para import NF-e |
| UI emissão NFC-e real | Stub no 1º cliente |
| Cockpit DI neste PR | DI congelada em branch própria |

## Fluxo de homologação (humano)

```
/caixa (venda)
  → /admin/estoque (saldo)
  → /admin/financeiro?tab=receber|pagar
  → /admin/financeiro?tab=fiscal (Stub)
  → /admin/intelligence (branch DI / deploy que a contenha)
  → /admin/implantacao (autorizar GO)
```

## Ajustes feitos neste PR

- AP: botão morto “Lançar” → link canônico `/admin/estoque/importar-nfe` + hint SSoT.
- Fiscal: `FiscalStubNotice` na aba fiscal.
- Matriz técnica ampliada (paths Financeiro/Fiscal/homologação).
