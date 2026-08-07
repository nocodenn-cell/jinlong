# Sprint 0 — Engineering Loop (validação produção)

| Campo | Valor |
|--------|--------|
| **Data** | 2026-08-07 |
| **Branch** | `feat/sprint-ux-go-live` |
| **Veredicto** | **Sprint 0 PRONTA PARA ACEITE** (fundação SSOT/IX no código) |
| **Sprint 1** | Bloqueada até aceite explícito do sponsor |

## Ciclos executados

| Ciclo | Missão | Evidência |
|------:|--------|-----------|
| 1 | IX-CONFIRM 100% | `askConfirm` + `ConfirmDialogHost`; zero `confirm(`/`window.confirm`/`globalThis.confirm` em produção; gate vazio |
| 2 | IX-SHEET entidade | Venda/Fiscal/Auditoria → `DetailSheet`; allowlist encolhida |
| 3 | Lookup/toast/export/bulk | Recebimento → EntityLookup; `emitToast` canônico; `downloadTextFile`; ExportAction relatórios; BulkActionBar catálogo; KeyHint PDV; órfão GerenteFilterBar removido |
| 4 | OC + transferências + bulk forn. | OcForm/OcDetalhe → DragonModal; Transferências EntityLookup; BulkActionBar fornecedores |
| 5 | PDV confirm + prompt + export | `CaixaConfirmModal` thin-wrap ConfirmDialog; cancel AP sem `window.prompt`; ExportAction catálogo/AP |

## Checklist obrigatório (código)

| Item | Status | Evidência |
|------|--------|-----------|
| ConfirmDialog substituiu confirms genéricos | ✅ | `rg confirm\(` → só comentário; `askConfirm` / ConfirmActionButton / CaixaConfirmModal |
| DetailSheet eliminou sheets entidade paralelos | ✅ | Venda/Fiscal/Auditoria usam DetailSheet; PDV/nav EXC |
| EntityLookup cobre lookups assíncronos/longos | ✅ | Recebimento + Transferências; Autocomplete client-only para listas curtas |
| FilterBar consistente (paradigma) | ✅ | Único FilterBar URL; GerenteFilterBar removido; IX-SEARCH local permanece em infinite (EXC-04) |
| PaginationBar numbered/cursor/infinite | ✅ | API + testes; infinite em API (EXC-04 sentinel ainda em cadastros) |
| BulkActionBar nos fluxos de seleção | ✅ | Catálogo + Fornecedores |
| ExportAction / downloadTextFile | ✅ | Relatórios, catálogo, AP; `downloadCsvBrowser` delega |
| emitToast único ponto de entrada | ✅ | Função canônica; `emitGerenteToast` só alias deprecated |
| Legado S0 não voltou | ✅ | CadastroPageShell/card/PendingSubmitButton/GerenteFilterBar ausentes |
| Nenhum novo paradigma | ✅ | `check:ds-sprint0` no CI |

## Gates locais (última passagem)

```bash
npm run check:ds-sprint0   # OK
npm run typecheck          # OK
npm run lint               # OK (0 errors)
vitest components/ui + smoke produtos/catalogo  # 57 OK
npm run build              # OK (ciclo 1)
```

## O que NÃO é dívida da Sprint 0

Estes itens são **adoção de tela / Sprint 1+**, não fundação faltante:

- Migrar `GerenteTable`/`DataTablePage`/`app-btn-*` restantes → EntityTable/Button (S2–S3)
- Aplicar `PageShell` em todas as pages admin (primitivo existe)
- Trocar sentinel infinite por botão `PaginationBar infinite` (EXC-04 permite sentinel)
- Redesign UX de hot-path (FilterBar em Vendas UI, etc.)

## Infra

- CI GitHub `ci-pdv-importados` só dispara em PR → `main` (esta PR baseia `chore/node22-alignment`)
- Vercel preview falhou com `Resource provisioning failed` (infra) — build local Next.js OK

## Aceite sponsor

Checkbox em [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) §3.3 — “DS owner assina DoD S0”.
