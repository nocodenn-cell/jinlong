> **ARQUIVADO (2026-07-09):** auditoria pontual anterior, superada pela auditoria completa do sistema (foco em produto e experiência do usuário) e pelas correções executadas em `claude/product-registration-audit-ssz7r5`. Mantida apenas como histórico.

# Auditoria UX/UI — FastProduct (`pdv-importados`)

**Data:** 2026-05-12  
**Escopo:** Dashboard gerente, produtos, caixa, cadastros, componentes compartilhados (toolbar, filtros, tabelas, modais, toasts).

---

## Legenda de prioridade

| Símbolo | Significado |
|--------|--------------|
| 🔴 | Alto impacto em legibilidade, acessibilidade ou consistência |
| 🟡 | Médio — melhoria recomendada, pode ficar para sprint seguinte se arriscado |
| 🟢 | Baixo — polimento |

---

## 1. Tipografia (PT / ZH)

| Prioridade | Problema | Correção proposta | Status |
|------------|----------|-------------------|--------|
| 🔴 | `ProdutosToolbar` e vários controles em `text-xs` (~12px), abaixo do intervalo 14–16px pedido para UI operacional | Base da toolbar em `text-sm`, inputs/filtros de produtos em `text-sm` + altura `h-9` | **Corrigido** |
| 🔴 | Classe `font-chinese` usada em produtos mas **sem definição** em CSS/Tailwind (sem efeito) | `.font-chinese { letter-spacing: 0.02em; }` em `globals.css` | **Corrigido** |
| 🟡 | `next/font` `Noto_Sans_SC` com `subsets: ['latin']` — os tipos atuais do Next **não** expõem `chinese-simplified`; glifos CJK podem vir do fallback (`PingFang SC`, `Microsoft YaHei` no `globals`) | Carregar `@fontsource/noto-sans-sc` (ou aguardar tipagem Next) para garantir arquivo único | **Sugestão sprint** (não alterado: quebraria `tsc`) |
| 🟢 | `GerenteFilterBar` título `text-xl` = 1.25rem < 1.5rem pedido para h1 | Título mínimo `text-2xl` (~1.5rem) | **Corrigido** |
| 🟢 | Cabeçalhos de tabela em `text-xs` no modo confortável | Cabeçalhos em `text-sm` quando densidade ≠ compact | **Corrigido** |
| 🟡 | Badges de origem em `text-[11px]` | Manter compacto por densidade; tooltip e `max-w` já ajudam — documentar | **Sugestão sprint** (trocar por `text-xs` se KPIs de densidade permitirem) |

---

## 2. Cores e contraste

| Prioridade | Problema | Correção | Status |
|------------|----------|----------|--------|
| 🟡 | `--muted-foreground` no tema claro próximo do limite WCAG AA em textos pequenos | Escurecer levemente o HSL (~47% → ~40% L) | **Corrigido** |
| 🔴 | Toasts do gerente com cores fixas claras (#eff6ff, etc.) sobre painel **escuro** — baixo contraste contextual | Usar classes semânticas `bg-card`, `text-card-foreground`, `border-border` | **Corrigido** |
| 🟢 | Foco em botões da toolbar dependia de estilos globais genéricos | `focus-visible:ring-2` explícito na toolbar | **Corrigido** |

---

## 3. Layout e espaçamento

| Prioridade | Problema | Correção | Status |
|------------|----------|----------|--------|
| 🔴 | Toolbar de produtos rolava com a página em listas longas | Faixa **sticky** abaixo do header (`top-20`, blur + borda) | **Corrigido** |
| 🟡 | Tabela: scroll horizontal sem suavização iOS | `overflow-x-auto` + estilo touch | **Corrigido** (`GerenteTable`) |
| 🟢 | Filtros: ordem não priorizava “situação” e NF antes de origem | Ordem: busca → status → NF → origem | **Corrigido** |
| 🟡 | Regra global `button, .btn { min-width; padding }` afetava **todos** os botões do app | Removida — padding por componente | **Corrigido** |

---

## 4. Usabilidade

| Prioridade | Problema | Correção | Status |
|------------|----------|----------|--------|
| 🟡 | Modal de exclusão em lote: foco podia cair no “Confirmar” | `autoFocus` no botão **Cancelar** na fase `confirm` | **Corrigido** |
| 🟢 | Toasts já removiam após ~2,8s | Mantido; tipografia do toast `text-sm` | **Corrigido** |
| 🟢 | Placeholder longo na busca de produtos | `title` igual ao placeholder para ver texto completo no hover | **Corrigido** |

---

## 5. Consistência e bilíngue

| Prioridade | Problema | Correção | Status |
|------------|----------|----------|--------|
| 🟡 | Caixa: rótulo de atalhos em `text-[10px]` | `text-xs` + chips `text-sm`, `shrink-0`, foco visível | **Corrigido** |
| 🟢 | Chips de categoria no caixa | Já usavam `flex-wrap` — reforçado espaçamento e tamanho mínimo legível | **Corrigido** |

---

## O que não foi alterado (sugestão próxima sprint)

- **Revisão completa** de todas as telas de cadastro (`clientes`, `fornecedores`, etc.) — não há pasta única `components/gerente/cadastro/`; vale mapear rotas e padronizar formulários.
- **Medição objetiva** de contraste (ferramenta tipo APCA/Polaris) em todos os tokens dos temas `noturno` / `novem` / `dragon-light`.
- **Trap focus** completo em modais (Radix Dialog) — hoje há Escape e backdrop; foco inicial no cancelar foi aplicado só no modal de exclusão em lote.
- **Densidade “compact”** da tabela: mantida intencionalmente menor; usuários que precisam de 14px+ devem preferir modo confortável.

---

## Atualização — sticky responsivo + alinhamento gerente (cadastro-like)

### Sticky abaixo do header

- Variável **`--gerente-sticky-top`** definida em `.gerente-shell` com breakpoints (`<640px` mais alto, `≥1024px` mais baixo), refletindo header que empilha no mobile.
- Componente **`GerenteStickyToolbar`** (`components/gerente/GerenteStickyToolbar.tsx`) centraliza `position: sticky`, `top: var(--gerente-sticky-top, …)`, blur e bleed horizontal.
- Uso em: **Produtos** (toolbar), **Estoque** (linha “Exportar CSV”), **Relatórios** (formulário de período).

### “Cadastro” / formulários no escopo real do repo

Não existem rotas `/gerente/clientes` ou `/gerente/fornecedores` neste módulo; o cadastro de **cliente** e fluxos correlatos estão em **Financeiro**. Foi aplicado:

- **Financeiro**: rótulos `FinField` em `text-sm`, KPIs de cabeçalho em `text-xs` (antes 11px), botão liquidar em `text-sm`, classe **`font-chinese`** quando `idioma !== 'pt'`.
- **Recebimento** e **Transferências**: rótulos de formulário em **`text-sm`**, **`font-chinese`** no container quando zh.
- **Estoque** / **Relatórios**: **`font-chinese`** no root; filtros do estoque com rótulos **`text-sm`**; botões de export em relatórios em **`text-sm`**.

### E2E Playwright

Execução local de `e2e/gerente.spec.ts` + `e2e/qa-produtos-modulo.spec.ts` pode falhar por **login/ambiente** (timeout em “painel carrega”) sem relação direta com CSS — validar com `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD` e Supabase público configurados.

### Arquivos modificados (consolidado UX)

- `app/globals.css`
- `app/caixa/CaixaSearchBar.tsx`
- `app/gerente/produtos/ProdutosGerentePageClient.tsx`
- `app/gerente/estoque/EstoqueGerentePageClient.tsx`
- `app/gerente/relatorios/RelatoriosGerentePageClient.tsx`
- `app/gerente/financeiro/FinanceiroGerentePageClient.tsx`
- `app/gerente/recebimento/RecebimentoGerentePageClient.tsx`
- `app/gerente/transferencias/TransferenciasGerentePageClient.tsx`
- `components/gerente/GerenteFilterBar.tsx`
- `components/gerente/GerenteStickyToolbar.tsx`
- `components/gerente/GerenteTable.tsx`
- `components/gerente/GerenteToastViewport.tsx`
- `components/gerente/produtos/ProdutosExcluirLoteModal.tsx`
- `components/gerente/produtos/ProdutosToolbar.tsx`
- `styles/theme-oriental.css`
- `docs/UX_UI_AUDIT_FASTPRODUCT.md`

