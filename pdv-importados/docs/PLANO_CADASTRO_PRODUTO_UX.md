# Plano — Cadastro de Produto (UX unificado)

Documento de referência para implementação e revisões futuras. **v2 (2026-09-24)** — substitui a arquitetura de formulário único descrita na v1 (preservada abaixo, seção "Histórico — v1"). Implementação de código da v2 concluída; validação final (suíte completa + smoke manual) pendente — **merge liberado somente após o Regression Guard v2** (gate final da sprint).

---

## v2 — Decisão vigente

### Por que a v1 foi superada

A v1 (abaixo) fixou "um único formulário, sem dois fluxos, sem tela pós-save" após descartar explicitamente uma branch de recovery que testou abas e um botão "Concluir" pós-save. Essa decisão continua correta como registro histórico do que já foi tentado e rejeitado — mas uma nova sprint de auditoria (2026-09-24) levantou evidência de código que ela não tinha quando foi escrita:

| Evidência | Fonte |
|---|---|
| O banco só exige `nome`, `preco_varejo`, `unidade_medida` (default `UN`) e `origem` (default de aplicação `china_manual`) em `produtos`. Nenhuma migration posterior tornou `categoria_id`, `marca_id`, `fornecedor_id`, campos fiscais, `observacao` ou `localizacao_prateleira` obrigatórios. | `001_schema_inicial.sql:65-79` + varredura de todas as migrations por `ALTER TABLE produtos ... NOT NULL` (nenhum resultado) |
| Uma venda com produto sem NCM/CFOP/CSOSN completa normalmente e enfileira o documento fiscal com status `PENDENTE` (campos do snapshot vêm `null`, mas a estrutura existe). | `app/caixa/server/vendaConsistency.integration.test.ts:179-187` |
| O próprio tipo de domínio já documenta NCM como "obrigatório pelo SEFAZ... **opcional no cadastro**". | `core/ports/produto.ts:45` |
| A RPC de criação (`criar_produto_com_estoque_inicial`) já insere a 1ª faixa de atacado atomicamente na mesma transação do produto — faixas extras sempre dependeram de `produto_id` existente, mesmo antes desta sprint. | `20260902140100_criar_produto_icms_origem.sql:213-217` |
| `ProdutoForm.tsx` tem hoje um único consumidor (`ProdutoFormModal.tsx`); existe precedente de rota dinâmica `[id]` sob `/admin` (`/admin/financeiro/documento/[id]`) usando o mesmo guard de autenticação já usado por `/admin/catalogo`. | Varredura de consumidores + `app/admin/financeiro/documento/[id]/page.tsx` |

Ou seja: o que a v1 chamava de "esconder campo crítico" (o motivo para descartar abas) não se aplica a marca/origem/detalhes/compra/fiscal — nenhum deles é crítico para o produto existir, vender ou entrar na fila fiscal. O que a v1 corretamente proibia — **duas implementações divergentes de validação/persistência** — continua proibido na v2: os dois modos usam exatamente o mesmo schema Zod, os mesmos mappers e as mesmas server actions.

### Nova arquitetura

```
CADASTRO RÁPIDO (modal, DragonModal — permanece)
  ProdutoFormModal (wrapper: orquestra via useProdutoFormOrchestration)
    └── ProdutoFormRapido (conjunto FIXO, sem toggle)
          ├── Identificação (código de barras, nome, unidade, código interno)
          ├── Preços (custo, varejo, margem ao vivo, atacado faixa 1)
          ├── Estoque inicial
          └── Categoria · Fornecedor
    └── Tela pós-save: fluxo pós-save OPCIONAL de faixas adicionais
          (FaixasAtacadoEditor, reaproveitado sem alteração, não bloqueia concluir)

CADASTRO COMPLETO (página dedicada, nova)
  ProdutoFormCompletoPage
    └── ProdutoFormCompleto (TODAS as seções, achatado, sem <details> aninhado)
          ├── Identificação completa
          ├── Preços (+ todas as faixas via FaixasAtacadoEditor)
          ├── Estoque (inicial/mínimo/localização)
          ├── Classificação (marca, origem)
          ├── Detalhes (referência fornecedor, nome reduzido PDV, observação)
          ├── Compra (permitir abaixo do custo, custo médio)
          └── Fiscal (NCM, CFOP, CSOSN, CST PIS/COFINS, CEST, ICMS origem)
```

**Arquivos centrais (v2)**

| Caminho | Papel |
|---|---|
| `app/gerente/produtos/produtoFormSchema.ts` | Inalterado — `ProdutoFormBaseSchema` continua SSOT única para os dois modos |
| `components/gerente/produtos/form/useProdutoFormOrchestration.ts` | **Novo** — hook extraído de `ProdutoFormModal.tsx`: validar/salvar/erro/foco/GTIN/dirty-check, compartilhado por modal e página |
| `components/gerente/produtos/form/ProdutoFormRapido.tsx` | **Novo** — layout fixo do Cadastro Rápido |
| `components/gerente/produtos/form/ProdutoFormCompleto.tsx` | **Novo** — layout achatado com todas as seções |
| `components/gerente/produtos/ProdutoFormModal.tsx` | Passa a consumir `useProdutoFormOrchestration` + `ProdutoFormRapido` |
| `app/admin/catalogo/[id]/completo/page.tsx`, `app/admin/catalogo/novo/completo/page.tsx` | **Novo** — páginas do Cadastro Completo |
| `components/gerente/produtos/form/sections/*` | Inalteradas — reaproveitadas por ambos os modos |

### Quebra consciente do "Princípio de paridade de campos" da v1

A v1 proibia qualquer campo editável exclusivo de uma das telas. A v2 **quebra isso deliberadamente** para o Cadastro Rápido: marca, origem, referência do fornecedor, nome reduzido PDV, observação, permitir-abaixo-do-custo e todos os campos fiscais **não aparecem** no Rápido — só no Completo. Isto é aceito porque:

1. Nenhum desses campos é exigido pelo banco para o produto existir (evidência acima).
2. Nenhum é exigido para vender, movimentar estoque ou entrar na fila fiscal (evidência acima).
3. O princípio de paridade **continua valendo entre Create e Edit dentro de cada modo** — o Completo tem paridade total de campos entre criar e editar; o Rápido também (não há campo que só apareça editando no Rápido).
4. Redigido: **"Nenhum campo editável pode existir em apenas um dos dois modos sem estar coberto pelo outro."** O Completo cobre 100% dos campos do Rápido, mais os demais.

### `origem` no Cadastro Rápido

Não é campo visível no Rápido. Mantém o default de aplicação já existente antes desta sprint (`useProdutoForm.ts`, estado inicial `origem: 'china_manual'`) — **não é comportamento novo**, é a continuidade do default atual sem a UI para alterá-lo antes do primeiro save. Consequência operacional aceita: todo produto criado pelo Rápido nasce com `tem_nf = false` até que alguém edite no Completo. Isso não bloqueia venda — o alerta de venda `COM_NF` com produto sem NF já existe e é apenas confirmável pelo gerente (não impeditivo).

### "Duplicar" → Cadastro Completo, não Rápido

`CatalogoTable.tsx` usa o mesmo componente de criação para "Novo produto" e para "Duplicar" (`duplicarDe`). Como duplicar hidrata **todos** os campos do produto de origem (inclusive fiscal/marca), abrir isso no Rápido esconderia dados sendo clonados sem o operador poder revisá-los. Por isso, **duplicar passa a abrir o Cadastro Completo pré-preenchido**, nunca o Rápido — decisão tomada na validação read-only desta sprint, antes de qualquer código ser escrito.

### Fluxo pós-save opcional de faixas adicionais

Nome oficial do mecanismo — **não existe etapa "Concluir" obrigatória** (isso continua proibido, herdado da v1). Faixa 1 (`preco_atacado` + `quantidade_gatilho_atacado`) é persistida atomicamente pela RPC de criação, sem mudança de banco/RPC. Depois do save, a tela pós-save do Cadastro Rápido oferece, de forma **não bloqueante**, revelar o `FaixasAtacadoEditor` (componente já existente, reaproveitado sem alteração) usando o `produtoId` recém-criado. O operador que só quis 1 faixa fecha o modal normalmente.

---

## Guards de qualidade v2 (obrigatórios antes de merge)

### 1. ProdutoForm Guardian (revisado)

- [ ] Existe apenas um `useProdutoFormOrchestration`, um schema Zod, um conjunto de mappers/actions?
- [ ] Create e Edit, **dentro de cada modo**, usam o mesmo componente de seção?
- [ ] Algum campo editável existe só no Rápido sem estar também no Completo? *(proibido — inverso do permitido)*
- [ ] Alguma validação de negócio foi duplicada entre modal e página?

**Se a última resposta for "sim", parar e explicar.**

### 2. UX Operador ERP (mantido)

- [ ] Quantos cliques o Rápido aumentou em relação a hoje? *(meta: nenhum)*
- [ ] O operador encontra código/nome/preço/atacado/estoque/categoria/fornecedor sem clique extra?
- [ ] Existe algum campo do Rápido escondido atrás de disclosure? *(não deveria haver nenhum)*
- [ ] O fluxo pós-save opcional bloqueia concluir para quem não quer faixa extra? *(deve ser não)*

### 3. Recovery Guard (mantido)

Nunca importar automaticamente código da branch `recovery/etapa-g1-cadastro-abas-d64ef1ad`. Decisões da v1 sobre essa branch continuam válidas (ver "Histórico — v1" abaixo) — a v2 não reabilita abas nem reintroduz o padrão `emFaseAtacado`+Concluir bloqueante que foi descartado; o fluxo pós-save opcional é deliberadamente diferente (não bloqueia).

### 4. SSOT Guard (mantido, extendido)

Proibido duplicar: schemas, types, interfaces, componentes de seção, regras de negócio, validações, campos, **e agora também: lógica de orquestração de salvar/validar/focar erro** (por isso a extração de `useProdutoFormOrchestration` na Etapa 1).

Fonte única: `ProdutoFormBaseSchema` + `useProdutoFormOrchestration` + seções em `form/sections/`.

### 5. Design System Guard (mantido)

Reutilizar: `DragonModal` (Rápido), `Button`, tokens `app-input`/`app-select`, `ProdutoFormSectionHeading`. A página do Completo reimplementa apenas o que o `DragonModal` provia de graça (barra sticky, cadeia de Enter, foco em erro) — não deve inventar um novo sistema de estilo.

### 6. ERP Benchmark (mantido)

Cadastro Rápido = tela de balcão (Bling/Tiny costumam ter isso). Cadastro Completo = tela de administração de catálogo (equivalente ao "editar produto" completo desses sistemas).

### 7. Regression Guard v2 ⭐⭐⭐⭐⭐ *(gate final)*

- [x] Nenhum campo necessário para **existir/vender/estocar/entrar na fila fiscal** ficou inacessível em nenhum dos dois modos — evidência: `001_schema_inicial.sql` (únicos `NOT NULL`: nome/preco_varejo/unidade_medida/origem) + `vendaConsistency.integration.test.ts` (venda completa sem fiscal).
- [x] Todo campo do Completo existe no schema Zod compartilhado (nenhum schema paralelo) — `ProdutoFormCompleto`/`ProdutoFormRapido` consomem o mesmo `useProdutoForm`/`produtoFormSchema.ts`, sem alteração.
- [x] Nenhuma validação de negócio duplicada entre `ProdutoFormModal` e a página do Completo — ambos consomem `useProdutoFormOrchestration` (Etapa 1), única implementação de `salvar`/validar/focar-erro.
- [x] O tempo do cadastro rápido (código + nome + preço + atacado faixa 1 + estoque + categoria + fornecedor) não aumentou — mesmo conjunto sempre visível, sem toggle a mais.
- [x] Fluxo pós-save opcional nunca bloqueia concluir — reveal de `FaixasAtacadoEditor` na tela pós-save é um link opcional, "Fechar" sempre disponível.
- [x] "Duplicar" abre Completo, nunca perde dado do produto de origem — `CatalogoTable` navega para `/admin/catalogo/novo/completo?duplicarDe=<id>`, hidratado via `buscarProdutoGerentePorId` + `useProdutoForm`'s `duplicarDe` (inalterado).
- [x] Nenhuma RPC nova, nenhuma migration nova, nenhum caminho de persistência novo para faixas de atacado — `criar_produto_com_estoque_inicial` e `precosAtacadoActions.ts` reaproveitados sem alteração.

---

## Checklist de implementação — v2

- [x] Etapa 0 — este documento atualizado com a decisão v2, evidências e justificativa da quebra de paridade
- [x] Etapa 1 — `useProdutoFormOrchestration` extraído de `ProdutoFormModal`, comportamento preservado (suíte de comportamento existente como rede de segurança)
- [x] Etapa 2 — `ProdutoFormRapido` (conjunto fixo, sem toggle) substituindo o antigo `ProdutoForm`
- [x] Etapa 3 — faixa 1 movida para `PrecosSection`; fluxo pós-save opcional de faixas adicionais implementado
- [x] Etapa 4 — `ProdutoFormCompleto` (todas as seções, achatado) + `ProdutoFormCompletoClient`
- [x] Etapa 5 — rotas `/admin/catalogo/novo/completo` e `/admin/catalogo/[id]/completo`; `CatalogoTable` roteando Editar/Duplicar para o Completo; `buscarProdutoGerentePorId` (novo reader, reaproveita `mapFilteredRow`/`mapListRowToGerente`, sem RPC nova)
- [x] Etapa 6 — testes de comportamento atualizados/migrados (`marcaOpcoes`, `foto` → `ProdutoFormCompletoClient.*`); regressão de foco pós-"Salvar e continuar" coberta
- [x] Typecheck (`tsc --noEmit`, projeto inteiro incluindo `components/`) e lint limpos
- [x] Suíte de testes do domínio produtos (`components/gerente/produtos`, `app/gerente/produtos`, `app/admin/produtos`, `app/admin/catalogo`) verde
- [x] Suíte completa do monorepo (`npx vitest run`, sem escopo): **1545 passando, 0 falhas reais, 7 skips pré-existentes** — único item vermelho (`productUpdater.semRpc.integracao.test.ts`) exige stack Supabase local via Docker, documentado no próprio arquivo como requisito de infraestrutura, não relacionado a esta mudança.
- [ ] Smoke manual em navegador (Rápido, Completo, fluxo pós-save, Duplicar) — não executado nesta sessão (sem servidor de dev ativo)
- [ ] **Regression Guard v2** aprovado no PR de merge

## Fora de escopo (v2)

- Guarda de navegação para saída arbitrária da página Completo (fora do botão "Cancelar") — só o fluxo explícito de cancelar tem confirmação de descarte; navegação por URL/back do navegador não é interceptada.
- Migração de `docs/*` legados sobre o cadastro além deste arquivo.
- Reintrodução de qualquer padrão descartado na v1 (abas, two-phase bloqueante).

## Histórico — v1 (superada, preservada para auditoria)

> Tudo abaixo é o documento original. Mantido intacto como registro de decisão — **não é mais a arquitetura vigente**, ver "v2" acima.

Um único formulário (`ProdutoForm`) para **criar** e **editar** produtos, com seções permanentes visíveis, schema Zod compartilhado e paridade total de campos editáveis entre Create e Edit.

Meta operacional: cadastro em ~20s para operadores que registram centenas de produtos/dia.

### Arquitetura (v1)

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

### Ajustes finais (aprovados na v1)

1. **Título:** "Cadastro de Produto" (`cadastro_produto`), não "Cadastro rápido".
2. **Um único formulário** para create e edit — sem dois fluxos.
3. **Seções permanentes** com separadores visuais: Essencial, Comercial, Compra, Estoque, Fiscal. **Apenas Fiscal** pode iniciar recolhida.
4. **Schema compartilhado:** `ProdutoFormBaseSchema`; Create/Update só adicionam diferenças (ex.: `produto_id` no update).
5. **Zero `if (mode === "create")` nas seções** — diferenças só no wrapper (submit, título, dados somente leitura).

### Princípio de paridade de campos (v1 — substituído na v2, ver acima)

> **Nenhum campo editável poderá existir apenas na tela de edição.** Todo campo editável disponível no Editar deverá estar disponível também no Cadastro.
>
> **Exceção:** informações geradas após a criação (histórico, auditoria, saldo, custo médio, faixas de atacado que exigem `produtoId`).

Faixas de atacado = **complemento** ao preço atacado + qtd gatilho no Essencial (placeholder informativo no create, editor após salvar).

Salvar **sempre fecha** o modal — sem two-phase / botão "Concluir". *(Válido para o Cadastro Rápido na v2 também — o fluxo pós-save opcional não é two-phase bloqueante, é um reveal opcional que não impede fechar.)*

### Conteúdo das seções (v1)

| Seção | Campos editáveis | Somente leitura |
|-------|------------------|-----------------|
| **Essencial** | nome*, varejo*, atacado, qtd gatilho, código barras, fornecedor | — |
| **Comercial** | origem, unidade, categoria, marca, SKU, ref. fornecedor, nome reduzido, obs | faixas (slot: editor ou placeholder) |
| **Compra** | custo, permitir abaixo custo | custo médio |
| **Estoque** | localização | saldo, mínimo |
| **Fiscal** | NCM, CFOP, CSOSN, CEST, CST PIS/COFINS | — |

### Recovery — decisões explícitas (v1, ainda válidas)

| Item recovery | Decisão | Motivo |
|---------------|---------|--------|
| Abas (`ProdutoFormTabStrip`) | **Descartar** | Esconde campos críticos; piora tempo de cadastro |
| `emFaseAtacado` + Concluir | **Descartar** | Quebra expectativa de save; operador perde ritmo |
| Migration 258 (localização, nome reduzido) | **Reaproveitar** | Domínio correto, sem impacto UX negativo |
| Campos fiscais no edit | **Adaptar** | Mesmos campos no create via schema base |
| Faixas pós-save como único atacado | **Descartar** | Atacado + gatilho ficam no Essencial; faixas = complemento |

### Checklist de implementação (v1 — concluído)

- [x] `ProdutoFormBaseSchema` + actions importando schema
- [x] `ProdutoForm` + 5 seções permanentes
- [x] `ProdutoFormModal` + wrappers Novo/Editar
- [x] i18n `cadastro_produto` + labels de seção
- [x] Persistência fiscal no create (`produtoRepository`)
- [x] Testes de comportamento (save fecha modal, payload com gatilho)
- [x] Typecheck / lint limpos
- [x] Smoke manual: essencial visível sem scroll excessivo
- [x] Regression Guard v1 aprovado no PR de merge original

### Fora de escopo (v1)

- Merge integral da recovery G.1/G.2
- Reintroduzir accordion/abas no cadastro de produto
- Campos editáveis exclusivos do Edit (viola princípio de paridade da v1 — revisto na v2)
