# Inventário Products — entidades e autoridade

| Campo | Valor |
|--------|--------|
| **Missão** | Products 0 — Inventário e autoridade |
| **Data** | 2026-07-18 |
| **Pré-requisitos** | Missão 5 (customers + i18n) · [template_dominio_internacionalizado.md](./template_dominio_internacionalizado.md) |
| **Referência de domínio** | Customers (modelo completo) |
| **ADRs** | [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) · [ADR-006](../adr/ADR-006-frontend-domain-boundaries.md) |
| **Escopo** | Diagnóstico factual — **não** cria `shared-core/products`, **não** move código, **não** altera RPC/UI |

---

## 1. Diagnóstico executivo

Products é o domínio de **catálogo / SKU**: identidade do produto, taxonomias, preços de cadastro, imagem e status. É **tier E** na migração frontend (alto acoplamento) — por isso customers veio antes.

| Dimensão | Estado hoje | Implicação para o contrato |
|----------|-------------|----------------------------|
| UI SSoT | `/admin/catalogo` | entity-ssot — não criar CRUD paralelo |
| Writers TS | `app/gerente/produtos/*` | Dual-layer admin UI ↔ gerente actions |
| Create + estoque inicial | RPC `criar_produto_com_estoque_inicial` (mig. 270) | Orquestrador products+inventory — não reimplementar TX em TS |
| Preço **efetivo** na venda | RPC `calcular_preco_produto` (web) ≡ `calcularPrecoCanonico` (offline) | **Autoridade Postgres**; TS é espelho, não motor paralelo |
| Preço **cadastro** | Colunas + `precos_atacado` via actions | products owns write; sales só lê resolução |
| `shared-core/products` | **Inexistente** | Próximas missões — após ADR |

**Veredito:** inventário suficiente para ADR (Products 1). **Não** iniciar CRUD/extração sem congelar autoridade de preço e estoque inicial no contrato.

---

## 2. Entidades

### 2.1 Núcleo catálogo

| Entidade | Artefato | Propósito | Evidência |
|----------|----------|-----------|-----------|
| Produto (SKU) | `produtos` | Nome, códigos, preços cadastro, FKs, fiscal, status, imagem URL, loja | `001_schema_inicial.sql`; evoluções `033`, `075`, `084`, `102`, `125`, `232`, `258` |
| Categoria | `categorias` | Taxonomia (árvore `categoria_pai_id`) | `001_schema_inicial.sql` |
| Marca | `marcas` | Marca comercial opcional | `083_tabela_marcas.sql` |
| Fornecedor (link) | `produtos.fornecedor_id` → `fornecedores` | FK no SKU; CRUD do fornecedor é satélite | `075_importacao_nfe_compra.sql` |
| De-Para NF-e | `vinculos_fornecedor_produto` | loja+fornecedor+cProd → produto (+ `gtin_origem`) | `211_vinculos_fornecedor_produto_depara.sql` |

### 2.2 Códigos

| Conceito | Onde mora | Nota |
|----------|-----------|------|
| Código de barras | `produtos.codigo_barras` | Unique por loja (`102`); **não** há tabela de barcodes |
| Código interno | `produtos.codigo_interno` | Identidade auxiliar |
| Ref. fornecedor | `produtos.referencia_fornecedor` | Cadastro / NF-e |
| Normalização scanner | `shared-core/src/caixa/variantesChaveLeitura.ts` | Leitura — **não** writer |
| Cache GTIN | `gtin_lookup_cache` | Enrichment; não SSoT do SKU (`271`) |

### 2.3 Imagens

| Conceito | Onde mora | Writer |
|----------|-----------|--------|
| Binário | Storage bucket `produto-imagens` | `uploadImagemProduto` / `removerImagemProduto` |
| URL | `produtos.imagem_url` | Mesmas actions |
| Adapter storage | `pdv-importados/lib/gerente/produtoImagemStorage.ts` | — |

### 2.4 Preços (cadastro vs runtime)

| Conceito | Artefato | Papel |
|----------|----------|-------|
| Varejo cadastro | `produtos.preco_varejo` | Fallback da cadeia de resolução |
| Atacado simples | `produtos.preco_atacado` | Usado com gatilho **global** `pdv_config` |
| Gatilho no SKU | `produtos.quantidade_gatilho_atacado` | Persistido no form/CSV/RPC create — **não** lido por `calcular_preco_produto` |
| Gatilho efetivo | `pdv_config.quantidade_minima_atacado_padrao` | Entrada da cadeia de preço (mig. `033` / comment `245`) |
| Faixas / tiers | `precos_atacado` | Prioridade 1 na resolução (`077`) |
| Regras legadas | `regras_preco` | **Fora** do atacado automático (consolidação P1) |
| Custo / margem | `produtos.preco_custo`, `permitir_abaixo_custo` | Guards em trigger (`124`/`125`) |

### 2.5 Estoque relacionado (efeito inventory)

| Conceito | Artefato | Dono conceitual |
|----------|----------|-----------------|
| Saldo | `estoque` | **inventory** |
| Idempotência create | `produto_create_requests` | products (orquestra create) |
| Ajuste / kardex | `ajustar_estoque_manual`, `movimentos_estoque_log` | **inventory** |
| View leitura | `v_estoque_baixo` | inventory (read) |

Create canônico cria linha de estoque **dentro** da RPC 270 — efeito inventory, orquestração products-led.

### 2.6 Listagem / views

| Artefato | Uso |
|----------|-----|
| RPC `list_produtos_gerente_filtrados` | Listagem filtrada admin (`086`) |
| UI | `pdv-importados/app/admin/catalogo/**` |

---

## 3. Writers canônicos

Legenda de **autoridade:** quem é SSoT da mutação / regra (não só quem chama).

| Dado | Tabela | Writer | Autoridade | Evidência |
|------|--------|--------|------------|-----------|
| Create produto + estoque inicial | `produtos` + `estoque` (+ ajuste opcional) | RPC `criar_produto_com_estoque_inicial` | **Postgres RPC** | `270_criar_produto_com_estoque_inicial.sql`; OPERADOR PDV: `20260718135138_*` |
| App entry create | — | `criarProduto` → `criarProdutoComEstoque` → adapter RPC | Adapter TS (não reimplementa TX) | `app/gerente/produtos/actions.ts`; `lib/adapters/supabase/criarProdutoComEstoqueInicialRpc.ts`; `core/services/produtoService.ts` |
| ~~PDV relâmpago~~ | — | **REMOVIDO (2026-07-30)** — o PDV não cadastra produto | — | Ver `pdv_cadastro_removido.md`. Gates de OPERADOR nas RPCs seguem no banco sem consumidor (pendência registrada no doc). |
| Update catálogo | `produtos` | `atualizarDadosProdutoGerente` | **TS action** + triggers margem | `actions.ts` (~899+) |
| Preço varejo rápido | `produtos.preco_varejo` | `atualizarPrecoVarejoProduto` | TS action | `actions.ts` (~107) |
| Faixas atacado | `precos_atacado` | `criarFaixaAtacado` / update / soft-delete | TS action (RLS GERENTE+) | `precosAtacadoActions.ts` |
| Imagem | Storage + `imagem_url` | `uploadImagemProduto` / `removerImagemProduto` | TS action | `actions.ts` (~518+) |
| Status / ativo / lote | `produtos` | `publicarProduto`, `inativarProduto`, lotes | TS action | `actions.ts`; `core/catalog/statusPublicacao.ts` |
| Import CSV / lote | `produtos` | `importarProdutosCsv` / `importarProdutosLote` | TS + RPC create | `actions.ts` |
| Categorias | `categorias` | `criarCategoriaProduto` / update / toggle | TS action | `app/gerente/categorias-produtos/actions.ts`; UI `/admin/categorias-produtos` |
| Marcas | `marcas` | `criarMarcaProduto` (+ helpers) | TS action | `app/gerente/marcas-produtos/actions.ts` |
| Fornecedores CRUD | `fornecedores` | actions fornecedores | **suppliers** (satélite) | `app/gerente/fornecedores/actions.ts`; UI `/admin/fornecedores` |
| Link SKU→fornecedor | `produtos.fornecedor_id` | create/update produto | products writer | payload RPC 270; update gerente |
| De-Para / create via NF-e | `vinculos_*` + `produtos` | RPC `importar_nfe_transacao` | **Postgres** (inventory/compras-led) | `075`/`104`/`211`/`233`; `app/.../estoque/importar-nfe/actions.ts` |
| GTIN cache | `gtin_lookup_cache` | `writeGtinCache` upsert | TS adapter | `lib/adapters/gtin/gtinCacheRepository.ts` |
| Estoque pós-create / ajuste | `estoque` | `ajustar_estoque_manual`; UI estoque | **inventory** | UI `/admin/estoque`; 270 chama ajuste se qty>0 |
| Preço efetivo (leitura venda) | — | RPC `calcular_preco_produto` | **Postgres** (web) | `077`→`234`→`250`; comment `245` |
| Preço efetivo offline | — | `calcularPrecoCanonico` | Espelho TS ≡ RPC 250 | `shared-core/src/pricing/calcularPrecoCanonico.ts` |
| Delete produto | `produtos` (+ cleanup) | exclusão em `actions.ts` | TS action | cleanup `regras_preco` / `estoque` / storage |

Mapa transversal (Missão 5.1a): [inventario_dominio_modulo_tabela_writer.md](./inventario_dominio_modulo_tabela_writer.md) § products.

---

## 4. Regras críticas (autoridade)

### 4.1 `calcular_preco_produto` — SSoT de preço efetivo

| Aspecto | Valor |
|---------|--------|
| Função | `public.calcular_preco_produto(uuid, integer, uuid)` |
| Precedência | Documentada na mig. **245** (comment ON FUNCTION) |
| Cadeia | (1) `precos_atacado` tier → (2) `preco_atacado` + `pdv_config.quantidade_minima_atacado_padrao` → (3) `preco_varejo` |
| Conflito | Tier **sempre** vence `preco_atacado` de catálogo (por fonte, não por valor menor) |
| Callers web | `caixaPrecoProduto.impl.ts`, `caixaPrecoAutoritativoServer.ts`; revalidação em `finalizar_venda_*` (ex. `243`/`268`) |
| Offline | `calcularPrecoCanonico` + golden tests (`calcularPrecoCanonico.spec.ts`, `offlineRpcEquivalence.golden.test.ts`) |
| **Contrato futuro** | Port de resolução **delega** à RPC (web) / espelho (local); **proibido** terceiro motor em actions de catálogo |

```
precos_atacado (maior quantidade_minima ≤ q)
        ↓ se nenhum tier
produtos.preco_atacado + pdv_config.quantidade_minima_atacado_padrao
        ↓ se não aplicável
produtos.preco_varejo
```

### 4.2 Preço varejo / atacado (cadastro)

| Regra | Autoridade | Nota |
|-------|------------|------|
| Gravar `preco_varejo` | TS action + trigger margem | Cadastro products |
| Gravar `preco_atacado` | TS action / RPC create | Cadastro; runtime usa só se passo 2 da cadeia |
| CRUD `precos_atacado` | TS `precosAtacadoActions.ts` | Prioridade 1 em runtime |
| Usar preço na venda | **só** RPC / `calcularPrecoCanonico` | sales **lê**; não edita catálogo |

### 4.3 Margem

| Guard | Escopo | Autoridade | Evidência |
|-------|--------|------------|-----------|
| `trg_fn_produtos_margem` | varejo/atacado vs custo (exceto `permitir_abaixo_custo`) | **Postgres trigger** | `125_guard_margem_produtos_catalogo.sql` |
| Triggers `precos_atacado` / `regras_preco` | faixa/regra abaixo do custo | **Postgres trigger** | `124_guard_margem_negativa_cadastro_precos.sql` |

UI pode avisar; **DB bloqueia**. Policy TS futura = espelho de mensagens/codes, não substituir trigger.

### 4.4 Estoque inicial

| Momento | Permitido | Proibido |
|---------|-----------|----------|
| Durante create | Payload → RPC `criar_produto_com_estoque_inicial` (TX: produto + estoque + ajuste opcional; idempotência `client_request_id`) | 2º round-trip parcial de estoque no modal |
| Após create | `/admin/estoque/*` | Ajuste de saldo no form de produto |

Evidência: mig. **270**; entity-ssot workspace; PDV relâmpago = mesma RPC (mínimo OPERADOR+).

### 4.5 Código de barras

| Peça | Papel | Autoridade |
|------|-------|------------|
| `produtos.codigo_barras` | Persistência / unique loja | products writer |
| `variantesChaveLeitura` | Normalização de chave de leitura | shared-core (leitura PDV) — **não** inventar segunda normalização |
| GTIN cache / sugestão | Enrichment cadastro | products (cache); não redefine SKU |
| NF-e match | De-Para → produto | inventory/compras-led RPC |

### 4.6 Desalinhamento crítico: `quantidade_gatilho_atacado`

| Campo UI / coluna | Usado em `calcular_preco_produto`? |
|-------------------|-------------------------------------|
| `produtos.quantidade_gatilho_atacado` | **Não** |
| `pdv_config.quantidade_minima_atacado_padrao` | **Sim** (passo 2) |

Risco: gerente configura gatilho no SKU e espera efeito na venda — a cadeia ignora. Deve constar no ADR Products como dívida / decisão (documentar, alinhar ou deprecar).

---

## 5. Fronteiras

### 5.1 Matriz de donos

| Domínio | Owns (write) | Não owns |
|---------|--------------|----------|
| **products** | `produtos`, `categorias`, `marcas`, `precos_atacado`, `gtin_lookup_cache`, status publicação, `imagem_url` / metadata; FK `fornecedor_id` no SKU | Saldo contínuo de `estoque`; `vendas*`; `caixas` / movs |
| **inventory** | `estoque`, kardex, ajustes, NF-e recebimento, transferências; De-Para NF-e (RPC) | CRUD catálogo “completo” (exceto create produto via NF-e já previsto) |
| **sales** | `vendas`, `itens_venda`, `vendas_pagamentos`, cancel/devolver | Catálogo; **lê** preço via `calcular_preco_produto`; relâmpago mínimo → products RPC |
| **cash** | `caixas`, `movimentacoes_caixa`, \(E(c)\) | Independente do catálogo — **sem** writers de produto |
| **suppliers** (satélite) | CRUD `fornecedores` | products só referencia |

### 5.2 Orquestrador cross-cut (não god module)

| Orquestrador | Domínios | Efeitos |
|--------------|----------|---------|
| `criar_produto_com_estoque_inicial` | products + inventory | products: INSERT SKU; inventory: estoque (+ ajuste) |
| `importar_nfe_transacao` | inventory (+ products se cria SKU) | inventory-led; products aceita create lateral documentado |
| `finalizar_venda_*` | sales + inventory | sales lê preço; inventory baixa estoque — **não** cash mov |

### 5.3 Entity-ssot UI

| Entidade | Rota oficial |
|----------|----------------|
| Produto | `/admin/catalogo` |
| Categoria produto | `/admin/categorias-produtos` |
| Fornecedor | `/admin/fornecedores` |
| Estoque manual | `/admin/estoque/*` |

PDV: só produto mínimo + estoque inicial via RPC (relâmpago). Financeiro: sem CRUD produto.

---

## 6. Dívidas

| ID | Tipo | Descrição | Severidade |
|----|------|-----------|------------|
| **D-P1** | Legado / dual-layer | UI `/admin/catalogo` importa writers de `app/gerente/produtos/*`; `ProdutosGerentePageClient` legado | Alta (migração) |
| **D-P2** | Legado entity-ssot | `FornecedorCombobox` — CRUD inline de fornecedor no form produto | Média — não replicar |
| **D-P3** | Duplicação / expectativa | `quantidade_gatilho_atacado` ≠ cadeia `calcular_preco_produto` | Alta (produto/UX) |
| **D-P4** | Legado | `regras_preco` ainda no ecossistema caixa; fora do atacado automático | Média |
| **D-P5** | Lógica TS paralela | `calcularPrecoCanonico` — **aceitável** se golden ≡ RPC 250; risco de drift | Controlada |
| **D-P6** | Writer lateral | NF-e cria `produtos` fora do modal catálogo | Aceita entity-ssot; superfície extra |
| **D-P7** | Legado | Cleanup/delete estoque em exclusão de produto nas actions; inserts diretos históricos | Baixa–média |
| **D-P8** | Lacuna scaffold | `shared-core/src/products/` inexistente; ports em `pdv-importados/core/ports/produto.ts` / `engine` | Esperado até Products 2+ |
| **D-P9** | Taxonomia | Marcas sem pasta `admin/marcas*` espelhando categorias | Baixa |
| **D-P10** | RPC antiga / residual | Overloads/histórico de `calcular_preco_*`; governança em `234`/`250`/`249` | Baixa se 250 for a canônica |

---

## 7. Callers (quem toca products)

| Caller | Relação |
|--------|---------|
| `/admin/catalogo` | CRUD / listagem SSoT |
| `/admin/categorias-produtos`, marcas | Taxonomia |
| `/caixa` | Lê preço (RPC); create relâmpago |
| `pdv-local` | Lookup + `calcularPrecoCanonico` |
| `/admin/estoque` / import NF-e | Create lateral / vínculo |
| Sync / outbox | Catálogo para device (fora do detalhe deste doc) |
| Financeiro | **Não** deve CRUD produto |

---

## 8. Proposta de contrato futuro (Products 1–2)

Sem implementação nesta missão. Alinhado ao [template](./template_dominio_internacionalizado.md).

### 8.1 Pasta alvo

```
shared-core/src/products/
  types.ts
  contracts.ts
  errorCodes.ts
  policies/          # validate input, lifecycle — NÃO recalcular preço de venda
  index.ts
```

Pricing de **resolução** já vive em `shared-core/src/pricing/` — products **reexporta / depende**, não duplica cadeia.

### 8.2 Ports (nomes)

| Port / policy | Responsabilidade | Autoridade real |
|---------------|------------------|-----------------|
| `validateProdutoInput` | Validação de formulário / codes i18n | TS policy |
| `ProdutoLifecyclePolicy` | DRAFT / PUBLICADO / INATIVO ↔ `ativo` | TS (+ colunas) |
| `CreateProdutoWithInitialStockPort` | Orquestra create; adapter chama RPC 270 | **RPC Postgres** |
| `UpdateProdutoCatalogoPort` | Update campos catálogo | Adapter TS + triggers DB |
| `ProdutoPricingCatalogPort` | Gravar varejo/atacado/custo/faixas | Cadastro; margem = trigger |
| `PriceResolutionPort` | Preço efetivo p/ qtd | **RPC** / `calcularPrecoCanonico` |
| `BarcodeNormalizePort` | Envolve `variantesChaveLeitura` | shared-core existente |
| `GtinSuggestionPort` | Cache read/suggest | Adapter |
| `CategoriaTaxonomyPort` / `MarcaTaxonomyPort` | Taxonomia | Adapters |
| `ProdutoFornecedorLinkPort` | Só FK no SKU | products; CRUD = suppliers |
| `ProdutoImagePort` | URL/metadata | Storage = adapter |
| `ListProdutosFiltrosPort` | Contrato da RPC listagem | Postgres list RPC |

### 8.3 Cláusulas obrigatórias no ADR (Products 1)

1. **Preço efetivo = Postgres** (`calcular_preco_produto`); TS offline é espelho testado.  
2. **Estoque inicial = RPC 270**; pós-create só inventory UI.  
3. **products não escreve** `estoque` fora do orquestrador documentado.  
4. **sales lê** preço; não edita catálogo (exceto relâmpago → mesma RPC).  
5. **cash independente** do catálogo.  
6. Decisão explícita sobre `quantidade_gatilho_atacado` (D-P3).  
7. i18n: codes na borda (padrão customers / template).

### 8.4 Ordem sugerida pós-inventário

```
Products 0  inventário + autoridade          ← este doc
    ↓
Products 1  ADR products (fronteiras + ports + cláusulas §8.3)
    ↓
Products 2  types/contracts/policies/errorCodes (+ specs) — sem wire CRUD
    ↓
Products 3+ Reader → Writer(create RPC) → Updater → i18n borda
```

**Não** começar por modal CRUD nem por mover telas.

---

## 9. GO / NO-GO

| Critério | Status |
|----------|--------|
| Entidades mapeadas (produto, taxonomia, códigos, imagens, preços, estoque relacionado) | OK |
| Writers canônicos com tabela / autoridade / evidência | OK |
| Regras críticas (preço, margem, estoque inicial, barcode) com dono explícito | OK |
| Fronteiras products / inventory / sales / cash | OK |
| Dívidas marcadas (incl. D-P3 gatilho) | OK |
| Proposta de contrato futuro (ports) | OK |
| Criar `shared-core/products` / mover código / alterar RPC ou UI nesta missão | **NO-GO** |

| Decisão | Resultado |
|---------|-----------|
| Congelar este inventário como base do domínio Products | **GO** |
| Prosseguir **Missão Products 1 — ADR** (contratos + autoridade preço/estoque) | **GO** (quando autorizar) |
| Extrair CRUD / implementar Writer agora | **NO-GO** |
| Reimplementar `calcular_preco_produto` em TypeScript de catálogo | **NO-GO** |
| Tratar inventory como submódulo de products na mesma extração | **NO-GO** |

---

## Referências

- Template: [template_dominio_internacionalizado.md](./template_dominio_internacionalizado.md)  
- Writers transversais: [inventario_dominio_modulo_tabela_writer.md](./inventario_dominio_modulo_tabela_writer.md)  
- Frontend boundary: [inventario_frontend_boundary.md](./inventario_frontend_boundary.md)  
- Precedência preço: `backend/supabase/migrations/245_calcular_preco_produto_precedence_comment.sql`  
- Create atômico: `backend/supabase/migrations/270_criar_produto_com_estoque_inicial.sql`  
- Espelho offline: `shared-core/src/pricing/calcularPrecoCanonico.ts`  
- UI SSoT: `pdv-importados/app/admin/catalogo/`  
- Actions: `pdv-importados/app/gerente/produtos/actions.ts`, `precosAtacadoActions.ts`  
- Consolidação P1: `docs/regras-negocio/CONSOLIDACAO_P1_NUCLEO_PDV.md`  

## Sign-off

| Papel | Entrega | Data |
|-------|---------|------|
| Eng | Inventário Products + autoridade + proposta de contrato | 2026-07-18 |
