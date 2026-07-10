# 📦 Cadastro de Produto — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[05_CADASTRO_PRODUTO]] (2026-07-10)
> [[Home]] | [[Arquitetura]] | [[PDV]]

---

## Checklist Completo de Campos

### Identificação

| Campo | Status | Arquivo |
|---|---|---|
| Nome do produto | ✔ Pronto | `EssencialSection.tsx` |
| Código de barras | ✔ Pronto | `EssencialSection.tsx` + `migrations/102_produtos_unique_codigo_loja.sql` |
| Código interno / SKU | ✔ Pronto | `EssencialSection.tsx` |
| Unicidade de código por loja | ✔ Pronto | `migrations/102_produtos_unique_codigo_loja.sql` |
| Marca | ✔ Pronto | `migrations/083_marcas.sql` + `EssencialSection.tsx` |
| Categoria | ✔ Pronto | `migrations/106_categorias_ativo.sql` + `EssencialSection.tsx` |
| Tags | ✔ Pronto | `migrations/084_produto_tags.sql` |
| Imagem | ✔ Pronto | `migrations/088_produto_imagens_storage_bucket.sql` |
| Status de publicação / rascunho | ✔ Pronto | `migrations/232_produtos_status_publicacao.sql` |
| Origem do produto (com NF / sem NF) | ✔ Pronto | Campo `tem_nf` em produtos |

---

### Preço e Margem

| Campo | Status | Arquivo |
|---|---|---|
| Preço de custo | ✔ Pronto | `CompraSection.tsx` |
| Preço de varejo | ✔ Pronto | `ComercialSection.tsx` |
| Preço de atacado (manual) | ✔ Pronto | `ComercialSection.tsx` |
| Faixas de atacado por quantidade (tiers) | ✔ Pronto | `migrations/077_precos_atacado_tiers_e_rpc.sql` + `ComercialSection.tsx` |
| Margem calculada automaticamente | ✔ Pronto | `ComercialSection.tsx` (calculado em tempo real) |
| Guard de margem negativa (banco) | ✔ Pronto | `migrations/124_guard_margem_negativa_cadastro_precos.sql` |
| Guard de margem negativa no catálogo | ✔ Pronto | `migrations/125_guard_margem_produtos_catalogo.sql` |
| Histórico de preço | ✖ Inexistente | Não implementado — ver [[Dívida Técnica]] |

---

### Estoque

| Campo | Status | Arquivo |
|---|---|---|
| Saldo de estoque | ✔ Pronto | Tabela `estoque` separada (por loja) |
| Estoque mínimo | ✔ Pronto | Campo `estoque_minimo` em `estoque` |
| Semáforo de estoque | ✔ Pronto | Verde (>mínimo) / Amarelo (≤mínimo) / Vermelho (zero) |
| Estoque por loja | ✔ Pronto | `migrations/032_lojas_estoque_por_loja.sql` |
| Trilha de movimentação (kardex) | ✔ Pronto | `migrations/060_v_kardex_unificado.sql` |
| Kardex avançado com export | 🔴 Pendente | `docs/BACKLOG_TECNICO.md` item 1 |

---

### Compra / Fornecedor

| Campo | Status | Arquivo |
|---|---|---|
| Fornecedor | ✔ Pronto | `CompraSection.tsx` + tabela `fornecedores` |
| Preço de custo | ✔ Pronto | `CompraSection.tsx` |
| Data de compra | 🟡 Parcial | Via ordem de compra (`migrations/109_ordens_compra.sql`) |
| Importação de NF-e de compra | ✔ Pronto | `migrations/075_importacao_nfe_compra.sql` |
| Draft de importação NF-e | ✔ Pronto | `migrations/233_import_nfe_status_draft.sql` |

---

### Fiscal

| Campo | Status | Arquivo |
|---|---|---|
| Flag `tem_nf` (produto tem nota fiscal) | ✔ Pronto | Campo em `produtos` |
| NCM | ✔ Pronto | `migrations/210_fiscal_campos_produto.sql` + `FiscalSection.tsx` |
| CFOP | ✔ Pronto | `FiscalSection.tsx` |
| CSOSN | ✔ Pronto | `FiscalSection.tsx` |
| CEST | ✔ Pronto | `FiscalSection.tsx` |
| CST | ✔ Pronto | `FiscalSection.tsx` |
| Integração com NFC-e real | 🟡 Parcial | Fila implementada; Focus real pendente |

---

### Outros

| Campo | Status | Arquivo |
|---|---|---|
| Observações / Descrição | 🟡 Parcial | Não foi possível confirmar campo específico |
| Peso / Dimensões | ✖ Inexistente | Não encontrado nas migrations ou formulários |
| Código de referência do fabricante | ✖ Inexistente | Não encontrado |
| Variantes (cor, tamanho) | ✖ Inexistente | Catálogo é plano (sem variantes) |
| Produto composto / kit | ✖ Inexistente | Não implementado |

---

## Fluxo de Cadastro

```
Gerente → /gerente/produtos ou /admin/catalogo
  ↓
Botão "Novo Produto" → ProdutoFormModal
  ↓
ProdutoForm com seções:
  [Essencial]   nome, código, categoria, marca
  [Comercial]   preço varejo, atacado, faixas, margem
  [Compra]      custo, fornecedor, NCM
  [Estoque]     saldo inicial, mínimo por loja
  [Fiscal]      CFOP, CSOSN, CEST, CST, tem_nf
  ↓
Validação Zod no cliente
  ↓
Server Action (gerente/produtos/actions.ts)
  ↓
supabase.from('produtos').insert()
  ↓
Trigger BD: guard_margem_negativa (rejeita se < 0)
  ↓ Sucesso
Produto aparece na lista + estoque criado
```

---

## Busca e Filtros

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Busca por nome (trigram) | ✔ Pronto | `migrations/208_indices_busca_produto_trgm.sql` |
| Busca por código de barras | ✔ Pronto | Via `variantesChaveLeitura` |
| Filtro por categoria | ✔ Pronto | RPC `rpc_list_produtos_gerente_filtrados` |
| Filtro por marca | ✔ Pronto | RPC `086_rpc_list_produtos_gerente_filtrados.sql` |
| Filtro por status (rascunho/publicado) | ✔ Pronto | `migrations/232` |
| Paginação server-side | ✔ Pronto | RPC com `limit` + `offset` |
| Ordenação | ✔ Pronto | RPC com parâmetro de ordenação |
| Export CSV | ✔ Pronto | `ExportCsvButton` na tela de listagem |

---

## Regras de Negócio do Cadastro

1. **Código único por loja** — dois produtos da mesma loja não podem ter o mesmo código de barras
2. **Margem não pode ser negativa** — guard no banco rejeita `preço_varejo < preço_custo`
3. **Produto sem NF é cidadão de primeira classe** — `tem_nf = false` não bloqueia nenhum fluxo
4. **Faixas de atacado** — prioridade: `regra por produto > regra por categoria > preço varejo`
5. **Alerta de NF na venda** — se venda `COM_NF` tiver produto `tem_nf = false`, exibe alerta mas não bloqueia (gerente confirma)

---

## Arquivos Principais

| Arquivo | Propósito |
|---|---|
| `pdv-importados/components/gerente/produtos/ProdutoFormModal.tsx` | Modal principal de cadastro |
| `pdv-importados/components/gerente/produtos/form/ProdutoForm.tsx` | Formulário completo |
| `pdv-importados/components/gerente/produtos/form/sections/EssencialSection.tsx` | Seção de identificação |
| `pdv-importados/components/gerente/produtos/form/sections/ComercialSection.tsx` | Seção de preços |
| `pdv-importados/components/gerente/produtos/form/sections/CompraSection.tsx` | Seção de compra |
| `pdv-importados/components/gerente/produtos/form/sections/EstoqueSection.tsx` | Seção de estoque |
| `pdv-importados/components/gerente/produtos/form/sections/FiscalSection.tsx` | Seção fiscal |
| `pdv-importados/app/gerente/produtos/actions.ts` | Server Actions |
| `pdv-importados/app/admin/catalogo/` | Tela catálogo no admin v2 |
| `pdv-importados/lib/adapters/supabase/produtoRepository.ts` | Data access layer |

---

> Estado do PDV em [[PDV]] · Inconsistências em [[Dívida Técnica]]
