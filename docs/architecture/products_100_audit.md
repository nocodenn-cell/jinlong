# Products 100% — auditoria final (piloto)

| Campo | Valor |
|--------|--------|
| **Missão** | Products 10 — Fechamento 100% |
| **Data** | 2026-07-18 |
| **ADR** | [ADR-007](../adr/ADR-007-products-domain-boundary.md) |
| **Template** | [template_dominio_internacionalizado.md](./template_dominio_internacionalizado.md) |
| **Pré-requisitos** | Products 0–9 |

---

## 1. Caminho arquitetural único (catálogo)

```
UI (/admin/catalogo + facades gerente)
  ↓
actions/facade (gerente/produtos/actions — contratos UI success/*)
  ↓
admin/produtos/actions.ts (borda auth + i18n + revalidate)
  ↓
adapters (Reader | Writer | Updater | Exclusion | Lifecycle | PriceReader)
  ↓
@fastproduct/shared-core/products (types · contracts · policies · codes)
  ↓
infra (RPC listagem / RPC 270 / UPDATE produtos / calcular_preco_produto)
```

---

## 2. Writers encontrados

| Writer | Port | Persistência | Status |
|--------|------|--------------|--------|
| Form create | `ProductWriter` | RPC `criar_produto_com_estoque_inicial` (270) | **Único caminho** |
| CSV create | `ProductWriter` via `criarProdutoAction` | mesma RPC 270 | Migrado (10) |
| Lote create | `ProductWriter` via `criarProdutoAction` | mesma RPC 270 | Migrado (10) |
| PDV relâmpago | `ProductWriter` | mesma RPC 270 | Migrado (10) |
| Form update | `ProductUpdater` | UPDATE `produtos` | OK |
| CSV/lote update | `ProductUpdater` (merge + update) | UPDATE `produtos` | Migrado (10) |
| Categoria lote | `ProductUpdater.updateCategoriaLote` | UPDATE `categoria_id` | Migrado (10) |
| Lifecycle single/lote | `ProductLifecycleService` | dual-write status+ativo | Migrado (10) |
| Exclusion | `ProductExclusionService` | inactivate / delete físico | OK |
| Imagem upload/remove | actions gerente (Storage + `imagem_url`) | Storage + UPDATE | **Satélite** (não CRUD núcleo) |
| NF-e create | RPC `importar_nfe_transacao` | inventory/compras-led | **Exceção ADR-007** |

---

## 3. Readers encontrados

| Reader | Port | Fonte | Status |
|--------|------|-------|--------|
| Listagem filtrada catálogo | `ProductReader.listComFiltros` | RPC `list_produtos_gerente_filtrados` + snapshot estoque | Migrado (10) |
| Listagem simples | `ProductReader.listPaginados` | SELECT `produtos` | OK |
| getById / identity | `ProductReader` | SELECT `produtos` | OK |
| Detalhe (morto UI) | `getById` + estoque read-through | facade | Migrado (10) |
| Preço efetivo | `ProductPriceReader` | RPC `calcular_preco_produto` | OK (Postgres) |
| Opções filtro cat/marca/forn | cache action | taxonomias | **Satélite** (não é leitura de SKU) |
| PDV busca código/nome | `caixaCatalogo` | sales-led | **Fora da tela Products** (Inventory/Sales) |
| Etiquetas / GTIN auxiliares | lib gerente | lookups | **Fora do CRUD catálogo** |

**Snapshot estoque na listagem:** read-through de inventory na borda do Reader (`quantidadeAtual` / `estoqueMinimo`). Products **não** é dono do saldo (ADR-007).

---

## 4. Regras de autoridade

| Regra | Dono | Evidência |
|-------|------|-----------|
| CRUD catálogo / lifecycle publicação | **Products** | Writer / Updater / Lifecycle / Exclusion |
| Preço efetivo da venda | **Postgres** `calcular_preco_produto` | ProductPriceReader só consulta |
| Espelho offline de preço | `shared-core/pricing` | Paridade — não segunda regra |
| Estoque / kardex / ajustes | **Inventory** | `/admin/estoque`; RPC 270 só estoque **inicial** |
| Create atômico + estoque inicial | RPC 270 (orquestração) | ProductWriter chama; não reimplementa TX |
| Create via NF-e | Inventory/compras (exceção) | entity-ssot |
| Margem / barcode unique | Triggers DB | Updater/Writer mapeiam erros |

---

## 5. Lifecycle (Etapa 2)

| Ação UI | Port | Nota |
|---------|------|------|
| `publicarProduto` | `ProductLifecycleService.setStatus(PUBLICADO)` | Catálogo |
| `inativarProduto` | `setStatus(INATIVO)` | Catálogo |
| `alternarAtivoProduto` | `setStatus(statusFromAtivoLegacy)` | Catálogo legado |
| `publicarProdutosLote` / `alterarAtivoLote` | `setStatusLote` | Catálogo |
| Exclusion lote | `ProductExclusionService` | delete vs inactivate (policy pura) |

Não há status novos. Dual-write `status_publicacao` + `ativo` permanece via `dualWriteFromStatus`.

---

## 6. Caminhos antigos

| Caminho | Destino |
|---------|---------|
| `criarProdutoComEstoque` no form/CSV/lote/PDV catálogo | **Removido** desses fluxos → ProductWriter |
| `buscarProdutosComFiltros` I/O inline | **Facade** → `listComFiltros` |
| `publicar/inativar` via `produtoRepository` | **Facade** → Lifecycle |
| `produtoService` create no catálogo | Não usado nos fluxos da tela |
| `criarProdutoComEstoque` / repo | Podem permanecer como util legado; **não** no caminho quente da UI Products |

---

## 7. i18n

| Camada | Estado |
|--------|--------|
| Policies shared-core | Só codes (sem PT) |
| Adapters | Codes + `localizeProductFailure` na borda; MSG_* deprecated → catálogo |
| Catálogo | `pt.json` / `zh.json` namespace `produtos.err_*` |
| Fallback | en-US → pt-BR (catalogAdapter) |
| Infra residual | Mensagens de RPC/DB sem code passam como `error` string (sem forçar locale) |

---

## 8. Dívidas restantes (não bloqueiam piloto Products)

| ID | Item | Severidade |
|----|------|------------|
| D-P3 | `quantidade_gatilho_atacado` vs gatilho `pdv_config` | Média — ADR-007 §4.3 |
| D-IMG | Upload/remoção de imagem fora de port tipado | Baixa |
| D-TAX | `listarOpcoesFiltrosProdutos` (categorias/marcas/fornecedores) | Baixa — satélite |
| D-PDV-READ | Leituras PDV/etiquetas não passam por ProductReader | Fora da tela Products |
| D-NFE | Create SKU via NF-e | Exceção documentada |
| D-INFRA-MSG | `mensagemErroComSecao` em falhas DB ainda mistura seções | Baixa |

---

## 9. Checklist piloto

- [x] Create usa ProductWriter
- [x] Update usa ProductUpdater
- [x] Delete/inactivate usa ProductExclusionService (+ Lifecycle para publicar/inativar explícitos)
- [x] Listagem usa ProductReader
- [x] Preço efetivo continua Postgres
- [x] Estoque continua Inventory (snapshot read-through na listagem)
- [x] CSV não possui caminho paralelo de create
- [x] i18n fechado (codes → catálogo → locale; fallback pt-BR)
- [x] testes verdes (shared-core products + adapters admin/produtos)
- [x] typecheck + `guard:domain`

---

## 10. GO / NO-GO

| Critério | Resultado |
|----------|-----------|
| Tela Products opera no caminho único ADR-007 | **GO** |
| Sem segundo motor de preço / sem Products dono de estoque | **GO** |
| Pronto para iniciar Inventory (mesmo template) | **GO** |

**Decisão: Products 100% fechado para piloto.**

**Próximo domínio:** Inventory — inventário → ADR → contracts → adapters → i18n → wire.
