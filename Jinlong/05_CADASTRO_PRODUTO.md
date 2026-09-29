# 05 — Cadastro de Produto

> Estado atual, decisões e regras SSoT.
> [[03_ARQUITETURA]] · [[04_PDV]] · [[07_DECISOES_ARQUITETURAIS]]

---

## Tela Oficial (SSoT)

| Rota | Uso |
|---|---|
| `/admin/catalogo` | CRUD principal, paginação server-side |
| `/gerente/produtos` | **Não tem `page.tsx` própria** (não é uma tela renderizável). `app/gerente/produtos/actions.ts` e arquivos irmãos (`precosAtacadoActions.ts`, `historicoPrecosActions.ts`, `produtoAutoriaActions.ts`, `produtoFormSchema.ts`) são a facade (Zod na borda + `assertGerenteSession`) que `/admin/catalogo` importa e depende para funcionar. Não são "legado a apagar" — mover exigiria migrar essa facade primeiro. |

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
| Histórico de preço | ✅ Implementado (`historico_precos_produto` para varejo/atacado/custo; `historico_tiers_crud` para faixas de `precos_atacado`) |
| Variantes (cor/tamanho) | ❌ Catálogo plano |
| Produto composto/kit | ❌ Não implementado |
| Peso/dimensões | ❌ Não encontrado |

---

## Seções do Formulário

Desde a separação de cadastro rápido/completo (`ProdutoFormRapido.tsx` / `ProdutoFormCompleto.tsx`), o diagrama de um único `ProdutoFormModal` com 5 seções fixas não reflete mais o código:

- **Cadastro Rápido** (`ProdutoFormRapido`) — Essencial + Preços + Categoria/Fornecedor rápidos + Estoque. Sem marca, origem, referência de fornecedor, nome reduzido PDV, observação, "permitir abaixo do custo" e **sem nenhum campo fiscal** — decisão deliberada (nenhum desses campos é exigido para o produto existir, vender, estocar ou entrar na fila fiscal).
- **Cadastro Completo** (`ProdutoFormCompleto`) — todos os campos, incluindo a seção Fiscal (CFOP, CSOSN, CEST, CST, `tem_nf`).

A validação Zod (`ProdutoFormBaseSchema`/`NovoProdutoSchema`) é a **mesma** para os dois modos — não há divergência de regra entre Rápido e Completo, só de quais campos são expostos na UI.

**Validação:** Zod no cliente → Server Action → triggers de margem no banco (`trg_regras_preco_margem_biu`, `trg_precos_atacado_margem_biu`, `trg_produtos_margem_biu` — não existe um único `guard_margem_negativa`).

---

## Decisões de Domínio

### Estoque inicial (exceção SSoT fechada)

| Momento | Permitido | Proibido |
|---|---|---|
| **Durante criação** (primeiro save) | RPC `criar_produto_com_estoque_inicial` (chama `ajustar_estoque_manual` internamente, gera kardex) | — |
| **Após criação** | — | Qualquer alteração de saldo fora de `/admin/estoque/*` |

Implementação: `components/gerente/produtos/form/useProdutoFormOrchestration.ts` → `criar_produto_com_estoque_inicial`. (O nome antigo `ProdutoFormModal.aplicarEstoqueInicial` não existe mais no código — só aparece em `tests/consolidacao-post-audit.test.ts` como teste-guarda garantindo que não volte.)

### Produto sem NF
- `tem_nf = false` é cidadão de primeira classe
- Não bloqueia cadastro nem venda
- Alerta na venda COM_NF se produto sem NF (gerente confirma)

### Faixas de atacado
Fonte real em runtime (`calcular_preco_produto`, decisão D0-01): tiers ativos de `precos_atacado`, escolhidos por `quantidade_minima` decrescente (sem tier aplicável → preço varejo). Não há hierarquia "produto > categoria > varejo" participando do cálculo automático — o motor de regras por categoria (`shared-core/src/pricing`, `regras_preco`) só é usado no caminho de venda MANUAL/PROMOCAO revalidado no servidor, não no preço automático de item.

`produtos.preco_atacado` + `quantidade_gatilho_atacado` (par no formulário) **não são lidos diretamente por `calcular_preco_produto`**, mas também não são inertes: ao editar, `atualizar_produto_com_faixa_atacado` deriva esse par para a **faixa 1** de `precos_atacado` (`derivarFaixaAtacado`, `app/admin/produtos/productUpdater.ts`), então mexem no preço de venda real de forma indireta. A confusão potencial não é "campo morto" — é que existem dois editores para a mesma tabela `precos_atacado`: este par simplificado (faixa 1, no formulário principal) e o `FaixasAtacadoEditor` completo (múltiplas faixas, após o produto já existir). Antes de qualquer mudança de UI/rótulo aqui, mapear precisamente a interação entre os dois editores — não investigado a fundo nesta rodada.

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
