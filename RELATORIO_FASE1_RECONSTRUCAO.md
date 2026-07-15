# Relatório — Fase 1 (Reconstrução Controlada do Jinlong)

**Data:** 2026-07-15
**Branch:** `claude/jinlong-rebuild-9c9sq2`
**Escopo:** Fase 1 da missão de reconstrução (estabilização), com Operação Clean Slate aplicada ao módulo Compras.

---

## 1.1 Gráficos — eliminação definitiva de `width(-1)/height(-1)`

O warning do recharts (`The width(-1) and height(-1) of chart should be greater than 0`) ocorre quando `ResponsiveContainer` mede um contêiner sem dimensões (primeiro paint, aba oculta, flex sem altura). O guard rail `ChartLayoutGate` (ResizeObserver, só renderiza com `width > 0 && height > 0`) já existia, mas 2 de 4 gráficos não o usavam.

| Arquivo | Antes | Depois |
|---|---|---|
| `app/admin/relatorios/_components/RelatoriosBarChart.tsx` | `ResponsiveContainer` sem gate | Envolvido em `ChartLayoutGate` |
| `app/gerente/relatorios/vendas/RelatorioVendasChart.tsx` | `ResponsiveContainer` sem gate | Envolvido em `ChartLayoutGate` |
| `app/admin/dashboard/SalesTrendChart.tsx` | Gate **duplicado**: `useState(ready)` + `useEffect` + `ChartLayoutGate` | Estado de montagem removido; só `ChartLayoutGate` com `fallback` custom (menos 1 estado, menos 1 efeito) |
| `app/admin/dashboard/_components/PaymentDonutChart.tsx` | Já usava gate | Sem alteração |

Nenhum gráfico é renderizado em aba oculta (auditado: `RelatoriosContent`, dashboard).

## 1.2 Loader entre abas

Navegação entre telas do admin mostrava um retângulo vazio (`app/admin/loading.tsx` era um `div` de 40vh sem conteúdo); no shell gerente não havia `loading.tsx` algum (tela congelada durante RSC fetch).

- `app/admin/loading.tsx`: skeleton estrutural que espelha o layout Admin V2 (PageHeader + grid de KPIs + SectionCard com linhas de tabela) — feedback imediato e sem layout shift.
- `app/gerente/loading.tsx`: novo, skeleton equivalente para o shell gerente.

Ambos usam o primitivo `Skeleton` existente — nenhum componente novo.

## 1.3 Tela Compras — reconstrução (Clean Slate)

`/admin/compras` era um wrapper fino sobre o shell **legado** do gerente (`ComprasGerentePageClient`, marcado `@legacy — NÃO reutilizar em fluxos novos`): client component com estado de filtros duplicando a URL, `useEffect` com debounce manual, KPIs em `dragon-glass-card`, tabela `GerenteTable` e modais fora do primitivo `DragonModal`.

Reconstruído no padrão Admin V2 (espelhado de Estoque/Vendas):

**Novos arquivos**
- `app/admin/compras/page.tsx` — Server Component; searchParams (`q`, `status`, `page`) são a única fonte de verdade dos filtros; `PageHeader` + `MetricCard` (4 KPIs) + `FilterBar` (busca debounced + pills de status) + `SectionCard` + paginação numerada server-side.
- `app/admin/compras/actions.ts` — actions movidas de `app/gerente/compras/actions.ts` sem mudança de lógica de domínio; `revalidatePath` agora aponta para as rotas canônicas (`ROUTES.admin.compras`, `ROUTES.admin.estoque`).
- `app/admin/compras/_components/ComprasClient.tsx` — orquestrador cliente mínimo: `DataTable` (ordenação client-side, linha → detalhe) + estado dos dois modais + `router.refresh()` pós-mutação.
- `app/admin/compras/_components/OcFormModal.tsx` — formulário de OC portado para o primitivo `DragonModal` (único caminho aceito para diálogo) com inputs `admin-v2-input` e botões `admin-v2-btn-*`; labels associados por `htmlFor`.
- `app/admin/compras/_components/OcDetalheModal.tsx` — detalhe/transições de status/recebimento no `DragonModal`; badges `admin-v2-badge-*`.
- `app/admin/compras/_components/comprasFormat.tsx` — badge de status + formatadores compartilhados (uma responsabilidade por arquivo).

**Legado removido (sem segunda implementação)**
- `app/gerente/compras/ComprasGerentePageClient.tsx`
- `app/gerente/compras/OcFormModal.tsx`
- `app/gerente/compras/OcDetalheModal.tsx`
- `app/gerente/compras/actions.ts` (movido, não duplicado)

**Ganhos mensuráveis**
- Filtros/paginação saem de estado React duplicado → URL (deep-link, voltar/avançar funcionam).
- KPIs e primeira página renderizados no servidor (menos JS, sem flash de loading para dados iniciais).
- Estados eliminados no cliente: `statusFiltro`, `busca`, `pagina`, `dados`, `loading` + 1 `useEffect` com debounce manual.
- Modais no primitivo único `DragonModal` (foco, Escape, scroll-lock e ciclo de Tab de graça).

## 1.4 PDV — auditoria (pré-requisito obrigatório antes de reconstruir)

A missão exige auditoria antes de implementação. O PDV é o módulo mais crítico (gates de produção `guard:pdv`, `guard:core`, testes de integração de venda) — reconstruí-lo sem essa auditoria violaria "testes preservados / arquitetura preservada".

**Achados (módulo `app/caixa`):**

| Achado | Evidência | Severidade |
|---|---|---|
| Componente-deus | `CaixaPageClient.tsx` com **1.635 linhas**, 30+ imports de componentes, 16 `useState` | Alta |
| Orquestração de modais no topo | 12+ modais/sheets controlados por estados booleanos no mesmo componente | Alta |
| Camadas já corretas no server | `app/caixa/server/*.impl.ts` bem separado (domínio fora da UI) | OK — preservar |
| Atalhos já existem | `useCaixaKeyboardShortcuts` + `CaixaKeyboardShortcutsReference` | OK — preservar |
| Scan pipeline isolado | `scan-pipeline/` com testes próprios | OK — preservar |
| Banner de preview de layout | `CaixaPdvLayoutPreviewBanner` + env flag — código transitório | Média |

**Plano recomendado (próximo ciclo, incremental):**
1. Extrair de `CaixaPageClient` um hook por preocupação (`useVendaEmEspera`, `useCheckoutFlow`, `useModaisCaixa`) sem alterar comportamento — cobertos pelos testes de integração existentes.
2. Reduzir informação visível por padrão (detalhes avançados atrás de `CaixaPdvOperacoesMenu`, que já existe).
3. Remover o banner de preview quando o layout PDV atual for promovido a definitivo.

Nenhuma linha do PDV foi alterada neste ciclo — decisão consciente: estabilizar interface administrativa primeiro (ordem oficial), reconstruir o PDV somente com auditoria aprovada.

---

## Auditoria de encerramento (evidência, não suposição)

Build/lint/testes verdes **não** provam ausência de legado — provam apenas que nada quebrou. Esta seção documenta buscas explícitas por referências residuais, feitas com `grep` em todo o repositório (não só `pdv-importados`).

### 1. Única implementação do módulo Compras

Busca por `ComprasGerentePageClient`, `OcFormModal`, `OcDetalheModal`, `gerente/compras` em todo o repositório. Resultado: as únicas ocorrências restantes são texto histórico/documental, nenhuma é código executável:

| Ocorrência | Natureza |
|---|---|
| `RELATORIO_FASE1_RECONSTRUCAO.md` | Este relatório, narrando a remoção (esperado) |
| `docs/AUDITORIA_CONSISTENCIA_VISUAL.md:75` | Auditoria histórica datada, já anotada no próprio texto como "árvore morta … impacto real é zero hoje" — registro de evidência, não status atual |
| `docs/GOVERNANCA_PMO_JINLONG.md:55`, `AUDITORIA_PAINEL_ADMIN.md:263` (raiz e `pdv-importados/`) | Docs de status **pré-existentes** (não tocados por este PR — confirmado via `git diff --stat` contra a base) já desatualizados antes deste ciclo (citam `/gerente/compras` como rota; a implementação real sempre viveu em componentes internos, nunca existiu `app/gerente/compras/page.tsx`). Fora do escopo desta reconstrução — são documentos de outro processo (PMO/auditoria geral), não este módulo |
| `pdv-importados/scripts/check-entity-ssot-boundary.mjs:49` | **Encontrado e corrigido nesta auditoria**: a lista `LEGACY_ORPHAN_WARN` ainda continha a entrada `/app/gerente/compras/ComprasGerentePageClient.tsx`, um arquivo que este PR apagou. A entrada era inerte (o guard só avisa sobre arquivos que existem ao varrer a árvore — nunca bloqueava nem falhava), mas é referência morta direta causada por esta reconstrução. **Removida.** `check:entity-ssot` continua OK (6 avisos, mesmos de antes — nenhum novo) |
| `shared-core/navigation/routes.ts:31` (`gerente.compras: '/gerente/compras'`) | Constante **não referenciada em lugar nenhum do código** (`grep -rn "ROUTES.gerente.compras"` → 0 resultados). Confirmado **pré-existente**: todas as chaves de `ROUTES.gerente.*` exceto `.home` já estavam mortas antes desta branch (mesmo padrão em `produtos`, `vendas`, `financeiro` etc. — nenhuma usada fora do próprio arquivo). Não é uma regressão introduzida aqui; é dívida de uma consolidação anterior (Admin V2) que nunca limpou o namespace `gerente` de `ROUTES`. **Fora do escopo deste PR** — mexer nisso afeta o namespace inteiro, não só Compras; ver item de follow-up abaixo |

Import dinâmico / lazy: nenhum `dynamic(() => import(...))` referenciava os arquivos removidos (`grep` por `ComprasGerentePageClient\|OcFormModal\|OcDetalheModal` já cobre qualquer forma de import, estática ou dinâmica). Exports mortos: todos os exports de `app/admin/compras/actions.ts` são consumidos (`obterKpisCompras`, `listarOrdensCompra` em `page.tsx`; `obterOrdemCompraDetalhe`, `atualizarStatusOC`, `registrarRecebimentoOC` em `OcDetalheModal.tsx`; `criarOrdemCompra`, `atualizarOrdemCompra` em `OcFormModal.tsx`; todos os tipos `Oc*DTO`/`Oc*Input` usados na fronteira UI↔actions) — verificado por leitura manual, não só por lint.

**Conclusão:** existe exatamente uma implementação do módulo Compras (`app/admin/compras/**`). O único achado de referência morta (`check-entity-ssot-boundary.mjs`) foi corrigido nesta auditoria.

### 2. Ausência de regressão arquitetural

- **Duplicação:** reduzida — de 2 shells (gerente legado + admin) para 1. Actions movidas, não copiadas (confirmado por `git diff --stat` mostrando `rename` na origem).
- **Acoplamento:** reduzido — filtros/paginação saem de estado React local (5 `useState` + 1 `useEffect` de debounce) para `searchParams` da URL; `router.refresh()` substitui recarregamento manual de estado.
- **Boundaries preservados:** nenhuma query nova a tabelas do Supabase; `page.tsx` só orquestra `actions.ts` existente + 2 selects já usados na versão anterior (fornecedores/produtos).
- **Lógica de negócio na UI:** auditado explicitamente (`grep` por `STATUS_TRANSITIONS`, comparações de status) — a máquina de estados (`STATUS_TRANSITIONS`, em `actions.ts`) é a única autoridade, enforced server-side em `atualizarStatusOC`. Os componentes cliente (`OcDetalheModal.tsx`) só decidem **qual botão mostrar** para o status atual (apresentação), padrão idêntico ao que já existia no shell removido — não é uma regressão, é comportamento preservado.
- **Segunda autoridade de domínio:** não criada. `fmtTotal` no `OcFormModal.tsx` é um somatório client-side só para feedback visual antes do submit; o `valor_total` persistido é sempre recomputado a partir dos itens no servidor (`actions.ts`, inalterado).
- **Admin V2 como única implementação:** confirmado por `grep` — zero ocorrências de `GerenteTable`, `GerenteStickyToolbar` ou `dragon-glass-card` no novo módulo; zero cores hex hardcoded ou classes `bg-slate-*`/`zinc-*` (regra do teste `admin-v2-ui-hardening.test.ts`, que também cobre o novo `loading.tsx`).

### 3. Relatório vs. estado real do código

Reconferido linha a linha contra o diff atual: contagem de estados eliminados (5 + 1 efeito) bate com o arquivo removido; a alegação "nenhuma linha do PDV foi alterada" foi reverificada com `git diff --stat -- app/caixa` (vazio) nesta auditoria — confirmada. Nenhuma correção de conteúdo foi necessária no relatório além desta seção de auditoria.

### 4. `guard:core` — causa raiz confirmada tecnicamente

```
pdv-importados/components/gerente/produtos/ProdutoFormModal.tsx: comparação/literal/branch de status_publicacao
pdv-importados/app/login/LoginForm.tsx: branch por produto.ativo (mensagem genérica do guard; na prática é usuario.ativo)
```

| Arquivo | Linha | Introduzida em | Commit | Relacionado a este PR? |
|---|---|---|---|---|
| `components/gerente/produtos/ProdutoFormModal.tsx:99` (e 178/216/375) | `produto?.status_publicacao === 'DRAFT'` | 2026-07-10 | `9a9da6a5` "Cadastro produto: modo compacto, estoque inicial, etiquetas…" | **Não** — módulo Produtos, nunca tocado nesta branch |
| `app/login/LoginForm.tsx:123` | `u.ativo === false` (gate de login para conta desativada) | presente desde a criação do arquivo em 2026-06-21 (`09ecd71`, o mesmo commit que introduziu o próprio `core-rule-guard.mjs`) | `09ecd71` | **Não** — módulo Login, nunca tocado nesta branch |

Confirmação adicional: `git stash` da árvore de trabalho + `node scripts/core-rule-guard.mjs` na base `79e2e51` (antes de qualquer commit deste PR) reproduz a mesma falha, idêntica. `git diff --stat` da base contra `HEAD` não inclui `ProdutoFormModal.tsx` nem `LoginForm.tsx`. **Confirmado: dívida técnica anterior, não introduzida nem agravada por este PR.**

**Por que este PR não altera esse comportamento:** o escopo da Fase 1 é gráficos, loaders e o módulo Compras; `ProdutoFormModal.tsx` pertence ao módulo Produtos (Fase 2) e `LoginForm.tsx` a Autenticação (fora do roadmap de módulos). Misturar a correção aqui violaria "não misturar com este PR" e ampliaria o raio de mudança sem auditoria própria desses módulos.

**Menor correção possível (não aplicada — proposta para item de follow-up dedicado):**
- `ProdutoFormModal.tsx`: extrair `const podeSalvarRascunho = isRascunho(produto)` / `foiPublicado(produto)` para `core/systemRules.ts` (ou equivalente), eliminando os 4 literais `'DRAFT'`/`'PUBLICADO'` do componente cliente.
- `LoginForm.tsx`: mover o gate de conta desativada para o server (RLS/edge já deveria negar sessão; o client atualmente é a única camada que impede o uso após login bem-sucedido) — menor correção é extrair para um helper `core/auth/contaAtiva.ts` chamado tanto no client (UX) quanto validado no server, em vez de o client ser a única autoridade.

**Item de follow-up proposto (não incluído neste PR):** `chore(core): mover regras de status_publicacao e conta ativa para /core` — escopo: exatamente esses 2 arquivos, sem tocar Compras/Admin V2.

---

## Critérios de aprovação (estado neste ciclo)

- Existe apenas uma implementação do módulo Compras ✔ (verificado por busca em todo o repo, não só build/lint/teste)
- Não restam referências ao legado ✔ (uma encontrada e corrigida nesta auditoria: `check-entity-ssot-boundary.mjs`)
- Single Source of Truth fortalecido ✔ (filtros na URL; rotas canônicas em `revalidatePath`; nenhuma segunda autoridade de domínio criada)
- Sem regressão arquitetural ✔ (duplicação e acoplamento reduzidos; boundaries e padrão Admin V2 preservados — ver seção 2)
- Relatório sincronizado com o código ✔ (reconferido nesta auditoria)
- Único bloqueio remanescente é externo (billing do GitHub Actions, documentado em `docs/GITHUB_ACTIONS_BILLING_UNBLOCK.md`) **ou** dívida técnica pré-existente e formalmente documentada (`guard:core`, seção 4 acima, com causa raiz, commits de origem e item de follow-up específico)

**Nenhum critério bloqueou a conclusão da Fase 1.**

---

## Proposta de Fase 2 (não implementada neste ciclo)

Ordem recomendada — **PDV → Produtos → Estoque → Financeiro** — pelo valor operacional e pela ordem de dependência arquitetural (cada módulo é pré-requisito de dados/fluxo do seguinte):

1. **PDV (`app/caixa`).** Maior impacto operacional direto (é onde a loja fatura, minuto a minuto) e maior risco técnico hoje: `CaixaPageClient.tsx` com 1.635 linhas e 16 `useState` é o componente-deus mais crítico do repositório (auditoria na seção 1.4). É also o módulo com mais guard rails de produção (`guard:pdv`, testes de integração de venda) — não pode ser tocado sem o inventário que já produzimos. Prioridade 1 porque adiar aumenta o custo de qualquer mudança futura (mais código se acumula sobre o componente-deus) e porque é o módulo mais visível ao operador na loja física.
2. **Produtos.** Fonte de dados de que PDV, Compras e Estoque dependem (preço, unidade de medida, categoria). `ProdutoFormModal.tsx` já tem uma violação confirmada de `guard:core` (`status_publicacao` na UI) — reconstruir este módulo é a oportunidade natural de resolver esse item de follow-up dentro do próprio ciclo de reconstrução do módulo (evita abrir um PR isolado só para mover 4 linhas). Também tem componentes `@legacy` (`ProdutosGerentePageClient.tsx`) ainda órfãos no `check:entity-ssot`.
3. **Estoque.** Já parcialmente migrado para Admin V2 (`app/admin/estoque/page.tsx` é o padrão de referência que usei para reconstruir Compras) — menor esforço relativo, mas depende de Produtos estar estável (mesma entidade, mesmo `unidade_medida`/`categoria`).
4. **Financeiro (Contas a Pagar/Receber).** Menor urgência operacional imediata (não bloqueia a operação de balcão) e já tem uma consolidação recente (`FinanceiroContent`, ver `CORRECOES_ESTABILIZACAO.md`). Deixado por último para não competir por atenção com os 3 módulos que sustentam a venda física.

Cada módulo segue o fluxo já validado nesta Fase 1: Inventário → Auditoria de Código (evidência, não suposição) → Reconstrução → Remoção definitiva do legado → Validação (typecheck/lint/build/testes/guards) → busca explícita por referências residuais antes de declarar concluído.
