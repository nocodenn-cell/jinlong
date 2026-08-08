# Missão: Estoque hub + Compras — paridade Admin V2 operacional

**Branch:** `cursor/estoque-compras-admin-v2-633a`  
**Escopo:** Recebimento, Importar NF-e, Etiquetas, Compras — chrome/UI Admin V2 sem alterar regras de negócio, actions, SSOT, permissões ou auditoria.  
**Fora de escopo:** Sprint 8 genérica; remoção global de `app/gerente/*`.

---

## 1. Auditoria pré-implementação (mapa exato)

| Superfície | Rota admin | PageClient / Content | Actions | Permissão (`loadAdminContext`) | SSOT | Auditoria / movimento | Legado UI | Testes |
|------------|------------|----------------------|---------|----------------------------------|------|------------------------|-----------|--------|
| **Recebimento** | `/admin/estoque/recebimento` | `RecebimentoGerentePageClient` (`embeddedInAdminHub`) | `app/gerente/recebimento/actions.ts` — `assertGerenteSession`, `createInventoryMovementWriter`, `buscarProdutosRecebimento` | `route:/admin/estoque/recebimento` | Produto só catálogo; entrada via writer admin | `revalidatePath` gerente recebimento/estoque; movimento via `inventoryMovementWriter` | `CadastroRapidoBlock`, `emitGerenteToast`, `ProdutoRecebimentoAutocomplete` — **sem** `GerenteTable`; back link oculto no hub | `recebimento/actions.validation.test.ts`; pilares matrix |
| **Importar NF-e** | `/admin/estoque/importar-nfe` | `ImportarNfePageClient` (`embeddedInAdminHub`) | `app/gerente/estoque/importar-nfe/actions.ts` — `assertGerenteSession`, import + `createInventoryMovementWriter` | `route:/admin/estoque/importar-nfe` | Novo produto via fluxo NF-e (catálogo); estoque SSOT | `revalidatePath` gerente estoque/produtos + `/admin/catalogo` | Admin-v2 já (PageHeader, SectionCard, DataTable); back link oculto no hub | pilares / p0 roteiro matrix |
| **Etiquetas** | `/admin/estoque/imprimir-etiquetas` | `ImprimirEtiquetasPageClient` | `./actions` + `listarCategoriasProdutos` (gerente categorias) | `route:/admin/estoque/imprimir-etiquetas` | Somente leitura produto/estoque; PDF local | `assertGerenteSession` nas buscas; sem kardex | LABELS pt/zh locais; **sem** back link | pilares matrix; e2e gerente etiquetas |
| **Compras** | `/admin/compras` | **Antes:** `ComprasGerentePageClient` (`GerenteTable`). **Depois:** `ComprasContent` | `app/gerente/compras/actions.ts` — OC CRUD, `revalidatePath('/gerente/compras')` | `route:/admin/compras` | Fornecedor `/admin/fornecedores`; produto catálogo | RPC `receber_ordem_compra` no recebimento OC; transições status inalteradas | Modais `OcFormModal` / `OcDetalheModal` preservados | sem teste dedicado compras |

**Hub Estoque:** `EstoqueHubNav` em recebimento, importar-nfe, etiquetas (não em Compras — rota CORE sidebar).

**Auth nas actions:** Todas usam `assertGerenteSession()` (camada compartilhada gerente/admin) — **intencionalmente preservado** nesta missão.

---

## 2. Implementação (chrome only)

### Compras
- Novo `app/admin/compras/_components/ComprasContent.tsx`: `PageHeader`, `MetricCard`, `SectionCard`, `DataTable`, `Button`, `Input`.
- `app/admin/compras/page.tsx`: wrapper `admin-v2-page`; dados server inalterados.
- `ComprasGerentePageClient.tsx`: reexport `@legacy` → `ComprasContent` (zero `GerenteTable`).

### Etiquetas
- Prop `embeddedInAdminHub` (padrão S7): evita `admin-v2-page` duplicado; admin passa `embeddedInAdminHub`.

### Recebimento / Importar NF-e
- Sem mudança funcional nesta missão (já com hub + `embeddedInAdminHub` + sem `GerenteTable`).

---

## 3. Critérios de aceite

| Critério | Status |
|----------|--------|
| Zero `GerenteTable` nas 4 superfícies admin | Compras migrado; demais já conformes |
| Zero back link redundante com hub | Recebimento/NF-e/Etiquetas embedded |
| Actions / SSOT / permissões / auditoria inalterados | Preservado |
| `app/gerente/*` não removido globalmente | Preservado (reexport compras) |

---

## 4. Verificação (gates)

Executado em **2026-08-08** na branch `cursor/estoque-compras-admin-v2-633a`:

| Gate | Resultado |
|------|-----------|
| `npm run check:ds-sprint0` | OK (GerenteTable files 12, Δ-5 vs baseline) |
| `npm run check:entity-ssot` | OK (6 avisos legado) |
| `npm run typecheck` | OK |
| `npm run lint` | OK (3 warnings e2e pré-existentes) |
| `npm test` | **858** passed |
| `npm run build` | OK |

---

## 5. Riscos / impacto

- **Baixo:** UI Compras; modais ainda usam estilos gerente até migração futura dedicada.
- **Médio:** KPIs Compras não refrescam client-side após filtro (comportamento idêntico ao legado — KPIs vinham só do SSR inicial).

---

## 6. Próximo passo sugerido (fora desta missão)

- Migrar modais OC para tokens admin-v2.
- i18n Etiquetas via `getMessages` (hoje LABELS locais).
- `revalidatePath('/admin/compras')` adicional nas actions (opcional, cache UX).
