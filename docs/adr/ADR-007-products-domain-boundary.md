# ADR-007 — Products: fronteira de domínio e autoridade

| Campo | Valor |
|--------|--------|
| **ID** | ADR-007 |
| **Título** | Fronteira do domínio Products (catálogo) e contrato de autoridade com Postgres |
| **Status** | Aceito — decisões de fronteira e autoridade (Missão Products 1); **sem implementação de código nesta data** |
| **Data** | 2026-07-18 |
| **Contexto** | Missão 5 concluída (customers + i18n); Products 0 inventário aprovado |
| **Missão** | Products 1 — ADR de fronteira e autoridade |
| **Relacionados** | [ADR-005](./ADR-005-fronteiras-dominio-shared-core.md), [ADR-006](./ADR-006-frontend-domain-boundaries.md), [Inventário Products 0](../architecture/inventario_products_autoridade.md), [Template domínio](../architecture/template_dominio_internacionalizado.md), entity-ssot (`.cursor/rules/entity-ssot.mdc`), DEC-012 |

---

## Contexto

O inventário Products 0 ([`inventario_products_autoridade.md`](../architecture/inventario_products_autoridade.md)) mostrou que o catálogo já opera com **autoridades claras no Postgres**, mas a superfície app ainda misture dual-layer (`/admin/catalogo` × `gerente/produtos`), expectativa de preço desalinhada (`quantidade_gatilho_atacado` vs cadeia real) e risco de, na extração para `shared-core`, **recriar regras no TypeScript**.

Customers provou a cadeia UI → adapter → shared-core → infra. Products é maior (preço, estoque inicial, NF-e, PDV). Sem ADR de fronteira, a Missão Products 2+ tende a:

- mover o cálculo de preço para TS “por conveniência”;
- fazer products “donos” de `estoque`; ou
- fazer inventory “donos” do CRUD de catálogo.

Este ADR **congela responsabilidades e autoridade**. Não cria `shared-core/products`, não move código, não altera RPC nem UI.

---

## Decisão

### 1. Responsabilidade do domínio Products

**Products** é o dono conceitual do **catálogo / SKU**.

| Área | Inclui | Não inclui |
|------|--------|------------|
| **Catálogo** | CRUD de `produtos` alinhado a `/admin/catalogo`; status de publicação; import CSV/lote | Ajuste contínuo de saldo |
| **Identidade** | `codigo_barras`, `codigo_interno`, `referencia_fornecedor`; unicidade por loja; cache GTIN auxiliar | Segunda tabela de barcodes; redefinição de chave no PDV sem `variantesChaveLeitura` |
| **Atributos** | Nome, taxonomia (`categorias`, `marcas`), FK `fornecedor_id`, fiscal, tags, `imagem_url` / metadata | CRUD de `fornecedores` (satélite **suppliers**); binário Storage (adapter) |
| **Preço de cadastro** | Gravar `preco_varejo`, `preco_atacado`, `preco_custo`, faixas `precos_atacado`; respeito a triggers de margem | **Calcular** preço efetivo da venda |
| **Preço como consulta** | Consumir resolução via autoridade Postgres (web) / espelho offline testado | Motor de preço paralelo em actions/policies de catálogo |

**UI SSoT:** `/admin/catalogo` (entity-ssot). Taxonomias: `/admin/categorias-produtos` (+ marcas). PDV relâmpago: create mínimo via **mesma** RPC de create — não abre CRUD completo.

**Pasta alvo futura** (só após missão de scaffold): `@fastproduct/shared-core/src/products/` — layout do [template](../architecture/template_dominio_internacionalizado.md). Resolução de preço permanece em `shared-core/src/pricing/` (products depende / reexporta; **não** duplica cadeia).

---

### 2. Responsabilidade Inventory

**Inventory** é o dono conceitual do **estoque físico e seus movimentos**.

| Owns | Exemplos |
|------|----------|
| Saldo | `estoque` |
| Movimentos / kardex | `movimentos_estoque_log`, ajustes via `ajustar_estoque_manual` |
| Fluxos de estoque | recebimento, transferência, import NF-e (orquestração inventory-led) |
| UI SSoT de saldo | `/admin/estoque/*` |

| Não owns | Motivo |
|----------|--------|
| Identidade / atributos do SKU | Domínio **products** |
| Preço de cadastro ou resolução de venda | Cadastro = products; efetivo = Postgres pricing |
| CRUD completo de catálogo | entity-ssot `/admin/catalogo` |

**Exceção documentada:** create de produto via NF-e (`importar_nfe_transacao`) pode INSERT em `produtos` — writer lateral **inventory/compras-led**, permitido pelo entity-ssot; não autoriza inventory a virar dono do catálogo.

---

### 3. Responsabilidade Sales

**Sales** **consome** produto e preço; **não** administra o catálogo.

| Pode | Não pode |
|------|----------|
| Ler SKU / disponibilidade para o carrinho | Editar catálogo completo |
| Obter preço efetivo via `calcular_preco_produto` (web) ou espelho offline | Recalcular preço com lógica própria de action |
| Create relâmpago mínimo → RPC products+inventory | Expandir CRUD de produto no PDV |
| Baixar estoque na TX de venda (efeito inventory, sales-led) | Escrever `produtos.*` de preço/atributos no fluxo de venda |

**Cash** permanece **independente** do catálogo (ADR-005 / ADR-CAIXA-002): sem writers de produto; sem SSoT de preço.

---

### 4. Contrato com Postgres — preço efetivo

#### 4.1 Autoridade

| Camada | Papel |
|--------|--------|
| **`calcular_preco_produto`** | **Única autoridade** de preço unitário efetivo na web (precedência mig. 245 / contrato 250) |
| **`calcularPrecoCanonico`** (`shared-core/pricing`) | Espelho bit-a-bit para offline / `pdv-local` — **paridade**, não segunda regra de negócio |
| Cadastro (colunas + `precos_atacado`) | Inputs da cadeia; gravados por **products** |
| Triggers de margem (`124`/`125`) | Autoridade de guarda no DB; policy TS futura só espelha codes/mensagens |

Cadeia (ordem decrescente):

1. `precos_atacado` (tier aplicável)  
2. `produtos.preco_atacado` + `pdv_config.quantidade_minima_atacado_padrao`  
3. `produtos.preco_varejo`

#### 4.2 Proibições

1. **TypeScript de catálogo / actions não replica** a regra de resolução de preço da venda.  
2. **Proibido** terceiro motor (`if (qtd >= gatilho) …`) em UI, Server Actions ou policies de products.  
3. Qualquer mudança na cadeia: **migration SQL** + atualização do espelho `pricing/` + golden tests — nunca só TS.  
4. `regras_preco` **não** alimenta atacado automático (consolidação P1); não reintroduzir via products.

#### 4.3 Dívida D-P3 (decisão explícita)

`produtos.quantidade_gatilho_atacado` é persistido no cadastro, mas **não** é lido por `calcular_preco_produto` (usa `pdv_config.quantidade_minima_atacado_padrao`).

**Decisão neste ADR:** a autoridade de gatilho do passo 2 da cadeia é **`pdv_config`**, não a coluna do SKU. Tratar desalinhamento UI/coluna como **dívida** (corrigir expectativa, deprecar coluna ou evoluir RPC em missão dedicada) — **não** “consertar” inventando resolução em TS.

---

### 5. Orquestrações

#### 5.1 `criar_produto_com_estoque_inicial` (RPC 270)

| Aspecto | Decisão |
|---------|---------|
| Natureza | Orquestrador **cross-domínio** no Postgres — **não** god module na app |
| Efeito products | INSERT `produtos` (+ idempotência `produto_create_requests`) |
| Efeito inventory | INSERT/linha `estoque`; opcional `ajustar_estoque_manual` / kardex na **mesma TX** |
| App | Adapter chama a RPC; **não** reimplementa a transação em TypeScript |
| Pós-create | Qualquer alteração de saldo → **somente** `/admin/estoque/*` |
| PDV relâmpago | Mesma RPC; products mínimo + estoque inicial; CRUD completo permanece GERENTE+ em `/admin/catalogo` |

```
App (adapter products)
  → RPC criar_produto_com_estoque_inicial
       ├─ products:  produtos (+ request idempotente)
       └─ inventory: estoque (+ ajuste opcional)
```

Cada efeito continua pertencendo ao dono da tabela; a RPC só garante atomicidade.

#### 5.2 Outras orquestrações (referência)

| Orquestrador | Led por | Nota |
|--------------|---------|------|
| `importar_nfe_transacao` | inventory / compras | Pode criar SKU; não transfere dono do catálogo |
| `finalizar_venda_*` | sales | Lê preço (RPC); baixa estoque; não muta catálogo |

---

### 6. Regras de fronteira (resumo normativo)

1. Products escreve catálogo; inventory escreve saldo/movimentos; sales consome; cash independente.  
2. Preço **efetivo** = Postgres; TS offline = espelho testado.  
3. Estoque inicial na criação = RPC 270; depois = inventory UI.  
4. Products **não** escreve `estoque` fora do orquestrador 270 (ou path legado documentado a eliminar).  
5. Inventory **não** assume CRUD de catálogo (exceto create lateral NF-e).  
6. Imports entre domínios só via ports públicos (ADR-005/006) quando o scaffold existir.  
7. i18n: domínio emite **codes**; borda resolve catálogo (template + customers).  
8. Entity-ssot e DEC-012 permanecem.

---

## Consequências

### Positivas

- Fronteira products/inventory/sales inequívoca antes do scaffold.  
- Protege o anti-fraude de preço (revalidação server-side) e a paridade web/offline.  
- Evita que Products 2+ “puxem” estoque ou recalculem preço no core.  
- Alinha create atômico à entity-ssot já operacional.

### Negativas / trade-offs

- RPC orquestradora 270 continua cross-cutting no Postgres (aceitável; redesign TX fora de escopo).  
- Dívida D-P3 (gatilho SKU vs `pdv_config`) permanece até missão explícita.  
- Dual-layer `gerente/produtos` coexiste até facade/colocation (como customers).

### Riscos se ignorado

- Motor de preço em TS no catálogo → drift com `finalizar_venda_*` e offline.  
- Products dono de estoque → viola entity-ssot e inventário 5.1a.  
- Inventory dono de catálogo → segundo CRUD; quebra SSoT `/admin/catalogo`.

---

## Alternativas rejeitadas

| Alternativa | Motivo da rejeição |
|-------------|-------------------|
| **Mover cálculo de preço efetivo para TypeScript** (actions/policies products) | Viola autoridade Postgres; quebra anti-fraude e paridade com mig. 250; offline já tem espelho dedicado em `pricing/` |
| **Products controlar estoque** (saldo/ajustes no domínio products) | Viola ADR-005 e entity-ssot (`/admin/estoque`); mistura catálogo com inventory |
| **Inventory controlar catálogo** (CRUD SKU sob estoque) | Viola entity-ssot (`/admin/catalogo`); NF-e create é exceção lateral, não transferência de dono |
| Extrair `shared-core/products` + Writer nesta missão | Fora do escopo Products 1; inventário/ADR primeiro (template) |
| Big-bang: unificar gatilho SKU + RPC + UI num único PR com scaffold | Mistura fundação com feature; D-P3 exige missão própria |
| next-intl / prefixo de URL no catálogo | DEC-007; i18n via template customers |

---

## Entregáveis vinculados

| Item | Status |
|------|--------|
| Products 0 — inventário | Feito |
| **ADR-007** (este documento) | Feito |
| Products 2 — scaffold `shared-core/src/products` (types/contracts/policies; sem wire CRUD) | Pendente — missão explícita |
| Products 3+ — Reader → Writer (RPC 270) → Updater → i18n borda | Pendente |
| Resolução D-P3 (`quantidade_gatilho_atacado`) | Pendente — não bloqueia scaffold se contrato §4.3 for respeitado |

---

## GO / NO-GO

| Critério | Status |
|----------|--------|
| Responsabilidades Products / Inventory / Sales definidas | OK |
| Contrato Postgres: `calcular_preco_produto` = autoridade; TS não replica regra | OK |
| Orquestração RPC 270 (products + inventory) explicada | OK |
| Alternativas rejeitadas documentadas | OK |
| Criar código / `shared-core/products` / alterar RPC ou UI nesta missão | **NO-GO** |

| Decisão | Resultado |
|---------|-----------|
| Aceitar ADR-007 como fronteira oficial de Products | **GO** |
| Prosseguir Missão Products 2 (scaffold contratos no shared-core, sem CRUD) | **GO** (quando autorizar) |
| Reimplementar preço efetivo em TS de catálogo | **NO-GO** |
| Fazer products dono de estoque ou inventory dono de catálogo | **NO-GO** |

---

## Sign-off

| Papel | Decisão | Data |
|-------|---------|------|
| Eng | Fronteira Products + autoridade preço/estoque inicial | 2026-07-18 |

**Próximo passo:** Missão Products 2 — scaffold `@fastproduct/shared-core/src/products` (`types` / `contracts` / `policies` / `errorCodes`) **sem** wire de CRUD e **sem** reimplementar `calcular_preco_produto`.
