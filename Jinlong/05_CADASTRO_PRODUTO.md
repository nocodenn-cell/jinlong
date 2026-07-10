# 05 — Cadastro de Produto

> Estado atual, decisões e regras SSoT.
> [[03_ARQUITETURA]] · [[04_PDV]] · [[07_DECISOES_ARQUITETURAIS]]

---

## Tela Oficial (SSoT)

| Rota | Uso |
|---|---|
| `/admin/catalogo` | CRUD principal, paginação server-side |
| `/gerente/produtos` | Legado — ainda funcional, migração para admin |

**Regra:** nenhum outro fluxo cria produto (exceto import NF-e em `/admin/estoque/importar-nfe`).

---

## Estado Atual

| Área | Status |
|---|---|
| CRUD completo | ✅ |
| Imagens (Storage) | ✅ |
| Marcas e categorias | ✅ |
| Tags | ✅ |
| Tiers atacado | ✅ |
| Campos fiscais (NCM/CFOP/CSOSN/CEST/CST) | ✅ |
| Guard margem negativa | ✅ |
| Status publicação/rascunho | ✅ |
| Unicidade código por loja | ✅ |
| Import CSV no catálogo | ✅ |
| Import NF-e de compra | ✅ (`/admin/estoque/importar-nfe`) |
| Histórico de preço | ❌ Não implementado |
| Variantes (cor/tamanho) | ❌ Catálogo plano |
| Produto composto/kit | ❌ Não implementado |
| Peso/dimensões | ❌ Não encontrado |

---

## Seções do Formulário

```
ProdutoFormModal
  ├─ EssencialSection   → nome, código, categoria, marca
  ├─ ComercialSection   → preço varejo, atacado, faixas, margem
  ├─ CompraSection      → custo, fornecedor, NCM
  ├─ EstoqueSection     → saldo inicial, mínimo
  └─ FiscalSection      → CFOP, CSOSN, CEST, CST, tem_nf
```

**Validação:** Zod no cliente → Server Action → trigger `guard_margem_negativa` no banco.

---

## Decisões de Domínio

### Estoque inicial (exceção SSoT fechada)

| Momento | Permitido | Proibido |
|---|---|---|
| **Durante criação** (primeiro save) | `aplicarEstoqueInicial()` via `atualizarEstoqueProduto` | — |
| **Após criação** | — | Qualquer alteração de saldo fora de `/admin/estoque/*` |

Implementação: `ProdutoFormModal.tsx` → `aplicarEstoqueInicial`.

### Produto sem NF
- `tem_nf = false` é cidadão de primeira classe
- Não bloqueia cadastro nem venda
- Alerta na venda COM_NF se produto sem NF (gerente confirma)

### Faixas de atacado
Prioridade: **regra por produto > regra por categoria > preço varejo**

### Código único por loja
Dois produtos da mesma loja não podem ter o mesmo código de barras (`migrations/102`).

---

## Importação

### Import CSV (catálogo)
- Disponível na tela `/admin/catalogo`
- Restaurado na consolidação admin (`88f2e64a`)

### Import XML/NF-e de compra
| Item | Evidência |
|---|---|
| Importação NF-e | `migrations/075` |
| Draft de importação | `migrations/233` |
| Rota | `/admin/estoque/importar-nfe` |
| Ordens de compra | `migrations/109` |
| Recebimento | `migrations/110` |

---

## Categorias e Marcas

| Entidade | Tabela | Migration |
|---|---|---|
| Categorias | `categorias` | `106_categorias_ativo.sql` |
| Marcas | `marcas` | `083_marcas.sql` |
| Tags | `produto_tags` | `084_produto_tags.sql` |

Categorias financeiras separadas em `/gerente/categorias-financeiras` (legado).

---

## Busca e Filtros

| Funcionalidade | Evidência |
|---|---|
| Busca trigram por nome | `migrations/208` |
| Busca por código de barras | `variantesChaveLeitura` |
| Filtro categoria/marca/status | RPC `rpc_list_produtos_gerente_filtrados` |
| Paginação server-side | RPC com limit/offset |
| Export CSV | `ExportCsvButton` |

---

## Melhorias Futuras (congeladas)

| Item | Prioridade | Status |
|---|---|---|
| Histórico de preço | P2 | Backlog |
| Variantes (cor/tamanho) | P3 | Fora do escopo |
| Produto composto/kit | P3 | Fora do escopo |
| Salvar e continuar no cadastro | P0 piloto | IN no Feature Freeze |
| Kardex avançado com export | P2 | Backlog |

---

## Arquivos Principais

| Arquivo | Propósito |
|---|---|
| `components/gerente/produtos/ProdutoFormModal.tsx` | Modal principal |
| `components/gerente/produtos/form/ProdutoForm.tsx` | Formulário |
| `components/gerente/produtos/form/sections/*` | Seções |
| `app/gerente/produtos/actions.ts` | Server Actions |
| `app/admin/catalogo/` | Tela admin v2 |
| `lib/adapters/supabase/produtoRepository.ts` | Data access |

---

## Exceção Legada (não replicar)

`FornecedorCombobox` — cadastro rápido de fornecedor dentro do modal de produto. Preferir `/admin/fornecedores`.

---

> Legado detalhado: [[Cadastro Produto]] · PDV: [[04_PDV]] · Dívida: [[Dívida Técnica]]
