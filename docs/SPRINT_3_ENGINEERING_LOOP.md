# Sprint 3 — Engineering Loop (Estoque satélites + Compras + Comissões)

| Campo | Valor |
|--------|--------|
| **Abertura** | 2026-08-07 (autorização: “faça a próxima sprint”) |
| **Fechamento** | 2026-08-07 |
| **RFCs** | [`UI_UX_RFC.md`](./UI_UX_RFC.md) 011–014 |
| **Branch** | `feat/sprint-ux-go-live` |
| **Estado** | **FECHADA** |

## Escopo entregue

| ID | Item | Status |
|----|------|--------|
| UX-P0-06 | Compras PageShell + EntityTable (zero dragon-glass/GerenteTable) | ✅ |
| UX-P0-07 | Comissões FilterBar daterange + status + EmptyState | ✅ |
| UX-P1-09 | NF-e Stepper + FileDropzone + PageShell | ✅ |
| UX-P1-12 | Estoque hub ações (NF-e, Recebimento, Transferências, Etiquetas) | ✅ |

## Decisões arquiteturais

- **Compras** permanece tela própria (≠ Recebimento ≠ NF-e); só muda a pele SSOT.
- **Comissões** não ganha rota de detalhe — detalhe fica na mesma página.
- **NF-e** não inventa wizard paralelo: `Stepper` + `FileDropzone` sobre o fluxo existente.
- **Estoque** não cria página-hub: ações no header da lista de saldos.

## Métricas (antes → depois)

| Indicador | Pré-S3 | Pós-S3 |
|-----------|-------:|-------:|
| `GerenteTable` imports | 4 | **3** (Δ−1 Compras) |
| `.app-btn-*` hits | 8 | **6** |
| Compras paradigmas tabela | GerenteTable | **EntityTable** |
| Comissões FilterBar na UI | ausente | **daterange + status** |
| NF-e dropzone | ad hoc | **FileDropzone SSOT** |
| Aderência DS (roadmap) | ~80 | **~85** |

## Validação

| Gate | Resultado |
|------|-----------|
| `check:ds-sprint0` | ✅ |
| `tsc --noEmit` | ✅ |
| eslint | ✅ 0 errors |
| vitest (UI + P0 matrices) | ✅ 80 tests |
| `check:entity-ssot` | ✅ |

## DoD

- [x] Entregas da tabela ✅
- [x] RFCs 011–014
- [x] Gates verdes
- [x] Relatório + métricas
- [x] **Sprint 4 bloqueada** até aceite explícito

## Fora de escopo (S4+)

- Funcionários EntityTable, Config TabNav, Suspensão ConfirmDialog, toast rename, burndown a zero.
