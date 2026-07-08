# Plano — Cadastro de Produto (UX unificado)

Documento de referência para implementação e revisões futuras. Implementação concluída — **merge liberado somente após o Regression Guard** (gate final da sprint).

---

## Objetivo

Um único formulário (`ProdutoForm`) para **criar** e **editar** produtos, com seções permanentes visíveis, schema Zod compartilhado e paridade total de campos editáveis entre Create e Edit.

Meta operacional: cadastro em ~20s para operadores que registram centenas de produtos/dia.

---

## Arquitetura

```
ProdutoFormModal (wrapper: título, submit create/update, fechar)
  └── ProdutoForm (único)
        ├── Seção Essencial (permanente)
        ├── Seção Comercial (permanente)
        ├── Seção Compra (permanente)
        ├── Seção Estoque (permanente)
        └── Seção Fiscal (única recolhível — <details>)
```

**Arquivos centrais**

| Caminho | Papel |
|---------|--------|
| `app/gerente/produtos/produtoFormSchema.ts` | `ProdutoFormBaseSchema` + `NovoProdutoSchema` / `EditarProdutoCatalogoSchema` |
| `components/gerente/produtos/form/` | Seções, mappers, hook, combobox fornecedor |
| `components/gerente/produtos/ProdutoFormModal.tsx` | Wrapper (submit, título, read-only) |
| `NovoProdutoModal.tsx` / `ProdutosEditarCatalogoModal.tsx` | Wrappers finos → `ProdutoFormModal` |

---

## Ajustes finais (aprovados)

1. **Título:** "Cadastro de Produto" (`cadastro_produto`), não "Cadastro rápido".
2. **Um único formulário** para create e edit — sem dois fluxos.
3. **Seções permanentes** com separadores visuais: Essencial, Comercial, Compra, Estoque, Fiscal. **Apenas Fiscal** pode iniciar recolhida.
4. **Schema compartilhado:** `ProdutoFormBaseSchema`; Create/Update só adicionam diferenças (ex.: `produto_id` no update).
5. **Zero `if (mode === "create")` nas seções** — diferenças só no wrapper (submit, título, dados somente leitura).

---

## Princípio de paridade de campos

> **Nenhum campo editável poderá existir apenas na tela de edição.** Todo campo editável disponível no Editar deverá estar disponível também no Cadastro.
>
> **Exceção:** informações geradas após a criação (histórico, auditoria, saldo, custo médio, faixas de atacado que exigem `produtoId`).

Faixas de atacado = **complemento** ao preço atacado + qtd gatilho no Essencial (placeholder informativo no create, editor após salvar).

Salvar **sempre fecha** o modal — sem two-phase / botão "Concluir".

---

## Conteúdo das seções

| Seção | Campos editáveis | Somente leitura |
|-------|------------------|-----------------|
| **Essencial** | nome*, varejo*, atacado, qtd gatilho, código barras, fornecedor | — |
| **Comercial** | origem, unidade, categoria, marca, SKU, ref. fornecedor, nome reduzido, obs | faixas (slot: editor ou placeholder) |
| **Compra** | custo, permitir abaixo custo | custo médio |
| **Estoque** | localização | saldo, mínimo |
| **Fiscal** | NCM, CFOP, CSOSN, CEST, CST PIS/COFINS | — |

---

## Guards de qualidade (obrigatórios antes de merge)

### 1. ProdutoForm Guardian ⭐⭐⭐⭐⭐

Antes de alterar qualquer tela de produto, verificar:

- [ ] Existe apenas um `ProdutoForm`?
- [ ] Create e Edit usam o mesmo componente?
- [ ] Algum campo editável existe só no Edit?
- [ ] Alguma validação foi duplicada?

**Se alguma resposta for "sim" (exceto exceções documentadas acima), parar e explicar.**

### 2. UX Operador ERP ⭐⭐⭐⭐⭐

Antes de aceitar uma mudança, responder:

- [ ] Quantos cliques aumentou?
- [ ] O operador encontra o campo em menos de 3 segundos?
- [ ] O cadastro ficou mais rápido?
- [ ] Existe algum campo escondido (fora de Fiscal recolhível)?
- [ ] O fluxo continua lógico para quem cadastra centenas de produtos/dia?

### 3. Recovery Guard ⭐⭐⭐⭐

Nunca importar automaticamente código da branch `recovery/etapa-g1-cadastro-abas-d64ef1ad`.

Sempre classificar cada hunk:

| Decisão | Critério |
|---------|----------|
| **Reaproveitar** | Persistência, migration 258, campos de domínio já validados |
| **Adaptar** | UX de abas → seções permanentes; two-phase → save fecha |
| **Descartar** | `emFaseAtacado`, modal aberto pós-save, fornecedor escondido, gatilho null forçado |

Explicar o motivo de cada decisão no PR.

### 4. SSOT Guard ⭐⭐⭐⭐⭐

Proibir duplicação de:

- schemas, types, interfaces
- componentes de formulário
- regras de negócio, validações, campos

**Sempre procurar reutilizar antes de criar.**

Fonte única: `ProdutoFormBaseSchema` + `ProdutoForm` + seções em `form/sections/`.

### 5. Design System Guard ⭐⭐⭐⭐

Bloquear:

- cores hardcoded novas
- classes de input duplicadas fora de `produtoFormStyles.ts`
- componentes diferentes fazendo a mesma função

Reutilizar: `DragonModal`, `Button`, tokens `app-input` / `app-select`, `ProdutoFormSectionHeading`.

### 6. ERP Benchmark ⭐⭐⭐

Perguntar: *"Como Bling, Tiny, Omie ou Odoo resolvem esse fluxo?"*

Não para copiar interface, mas para validar se o fluxo operacional faz sentido (ex.: preço + fornecedor visíveis no cadastro inicial; fiscal secundário/recolhido).

### 7. Regression Guard ⭐⭐⭐⭐⭐ *(gate final — encerra a sprint)*

Antes de **qualquer PR** relacionado ao cadastro de produtos, verificar obrigatoriamente:

- [ ] Nenhum campo desapareceu do formulário.
- [ ] Nenhum campo mudou de seção sem justificativa documentada no PR.
- [ ] Nenhuma validação foi duplicada.
- [ ] Create e Edit continuam usando o mesmo `ProdutoForm`.
- [ ] O tempo do cadastro essencial não aumentou (nome + varejo + atacado + gatilho + fornecedor, sem clique extra).

**Se algum item falhar, bloquear merge e corrigir antes de encerrar a sprint.**

Referência de campos por seção: tabela [Conteúdo das seções](#conteúdo-das-seções) acima. Mudança de seção só é aceita se melhorar o tempo operacional e estiver explicada no PR.

---

## Encerramento oficial da sprint UX

Ordem dos gates antes do merge:

1. Guards 1–6 (estrutura, UX, recovery, SSOT, design system, benchmark)
2. **Regression Guard (7)** — gate operacional final
3. Smoke manual: essencial visível, save fecha modal, paridade create/edit

Somente após todos os itens acima: **sprint UX encerrada** e merge liberado.

## Recovery — decisões explícitas

| Item recovery | Decisão | Motivo |
|---------------|---------|--------|
| Abas (`ProdutoFormTabStrip`) | **Descartar** | Esconde campos críticos; piora tempo de cadastro |
| `emFaseAtacado` + Concluir | **Descartar** | Quebra expectativa de save; operador perde ritmo |
| Migration 258 (localização, nome reduzido) | **Reaproveitar** | Domínio correto, sem impacto UX negativo |
| Campos fiscais no edit | **Adaptar** | Mesmos campos no create via schema base |
| Faixas pós-save como único atacado | **Descartar** | Atacado + gatilho ficam no Essencial; faixas = complemento |

---

## Checklist de implementação

- [x] `ProdutoFormBaseSchema` + actions importando schema
- [x] `ProdutoForm` + 5 seções permanentes
- [x] `ProdutoFormModal` + wrappers Novo/Editar
- [x] i18n `cadastro_produto` + labels de seção
- [x] Persistência fiscal no create (`produtoRepository`)
- [x] Testes de comportamento (save fecha modal, payload com gatilho)
- [x] Typecheck / lint limpos
- [ ] Smoke manual: essencial visível sem scroll excessivo
- [ ] **Regression Guard** aprovado no PR de merge

---

## Fora de escopo

- Merge integral da recovery G.1/G.2
- Reintroduzir accordion/abas no cadastro de produto
- Campos editáveis exclusivos do Edit (viola princípio de paridade)
