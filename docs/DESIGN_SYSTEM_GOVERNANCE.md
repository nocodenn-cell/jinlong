# Governança do Design System — Jīn Lóng ERP

| Campo | Valor |
|--------|--------|
| **Data** | 2026-08-07 |
| **Status** | Vigente a partir da aceitação da Sprint 0 |
| **Escopo** | `pdv-importados` (piloto web); `pdv-local` só brand tokens opcional |
| **Irmãos** | [`DESIGN_SYSTEM_GAPS.md`](./DESIGN_SYSTEM_GAPS.md) · [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) · [`UI_UX_BACKLOG.md`](./UI_UX_BACKLOG.md) |
| **Objetivo** | Impedir retorno da heterogeneidade após consolidação do SSOT |

---

## 1. Princípios

1. **Um paradigma por família** — Button, tabela, FilterBar, modal/confirm, toast painel, empty, paginação.
2. **Aplicar ≠ inventar** — sprints pós-S0 só consomem SSOT; não criam shells/tabelas/filtros paralelos.
3. **Exceção é explícita, temporária e medida** — sem exceção silenciosa em PR.
4. **Burndown não sobe** — hits de legado em arquivos novos = bloqueio.
5. **Entity-SSoT e arquitetura intactos** — DS não move regra de negócio nem CRUD fora das telas oficiais.

---

## 2. Checklist obrigatório de Pull Request (UI)

Todo PR que toque `app/**/*.tsx`, `components/**/*.tsx` ou `styles/**` deve marcar:

### 2.1 Antes do review

- [ ] Verifiquei no código o estado atual (não só a auditoria).
- [ ] Reutilizei SSOT de [`DESIGN_SYSTEM_GAPS.md`](./DESIGN_SYSTEM_GAPS.md) § matriz SSOT.
- [ ] Não introduzi segundo Button / DataTable / FilterBar / Toast / Modal genérico.
- [ ] Não usei `GerenteTable`, `DataTablePage`, `CadastroPageShell`, `.app-btn-*`, `dragon-glass-*` em código **novo**.
- [ ] Não usei `window.confirm` / `alert()` em hot-path.
- [ ] Não adicionei `text-[Npx]` arbitrário nem hex em `className` (exceto brand auth já existente).
- [ ] Empty/erro usam `EmptyState` / `ErrorState` (sem emoji como empty state).
- [ ] Listagens admin usam `PageShell` + (`CrudListShell` \| slots equivalentes) quando aplicável.
- [ ] Overlays usam `DragonModal` / `ConfirmDialog` / `DetailSheet` (contrato S0).
- [ ] i18n de superfície: sem hardcode PT em strings de UI novas (exceto demo/interno documentado).
- [ ] A11y: rótulo em ação por ícone; foco/Esc em modal novo; `aria-*` em combobox/tabela quando aplicável.

### 2.2 Se o PR cria componente em `components/ui/**`

- [ ] Justificativa no corpo do PR: por que nenhum SSOT existente cobre o caso.
- [ ] Nome, props e exemplo de uso documentados (JSDoc ou story).
- [ ] Teste behavior/unit mínimo.
- [ ] Atualização da matriz SSOT em `DESIGN_SYSTEM_GAPS.md`.
- [ ] Aprovação de **DS owner** (ver §6).

### 2.3 Se o PR pede exceção ao DS

- [ ] Issue/ADR curto ou seção no PR: motivo, escopo, prazo de remoção.
- [ ] Exceção listada em `DESIGN_SYSTEM_GAPS.md` § Exceções aprovadas.
- [ ] Não é “porque era mais rápido”.

### 2.4 Verificações automatizadas

- [ ] `npm run check:ds-burndown` (ou script equivalente) — hits legado **não sobem**.
- [ ] Lint/typecheck/testes do pacote tocado verdes.
- [ ] Sem `--no-verify`.

---

## 3. Regras para criação de novos componentes

| Situação | Ação |
|----------|------|
| Precisa de UI que **já existe** no SSOT | **Reutilizar** — proibido wrap cosmético paralelo |
| Precisa de variação visual pequena | Extender props/variants do SSOT (`tone`, `size`, `density`) |
| Precisa de composição de domínio (ex.: `CatalogoLoteToolbar`) | Componente de **domínio** em `app/.../_components` ou `components/<domínio>`, **usando** SSOT por baixo |
| Precisa de primitivo genérico novo (ex.: Stepper) | Só na Sprint 0 ou PR dedicado de DS com §2.2 |
| “Só desta tela” com `fixed inset-0` + classes soltas | **Rejeitar** — usar DragonModal/DetailSheet |

**Onde colocar**

| Tipo | Path |
|------|------|
| Primitivo SSOT | `pdv-importados/components/ui/**` ou `components/ui/admin-v2/**` |
| Form control | `components/ui/forms/**` |
| Feedback | `components/ui/feedback/**` |
| Domínio (não SSOT) | `app/<rota>/_components/**` ou `components/<domínio>/**` |
| Legado gerente | **Não expandir**; só migrar/remover |

---

## 4. Quando reutilizar vs. quando compor

1. **Reutilizar puro** — Button, Field, Input, Select, Autocomplete, DataTable/EntityTable, FilterBar, PaginationBar, EmptyState, MetricCard, SectionCard, StatusChip/badges tipados, MoneyText, KeyHint, ConfirmDialog, DragonModal, PageShell, CrudListShell, TabNav, Stepper, InlineAlert, FileDropzone, FormSection, DetailSheet.
2. **Compor** — tela = PageShell + FilterBar + CrudListShell + EntityTable + PaginationBar; modal de domínio = DragonModal + FormSection + Field.
3. **Domínio fino** — toolbars de lote, mapas de coluna, labels i18n da página. Não reimplementar tabela/filtro.

---

## 5. Quando uma exceção ao DS é aceitável

Exceção **só** se **todas** forem verdadeiras:

1. Cobertura SSOT documentada como insuficiente **e** não dá para extender o primitivo em &lt; M esforço sem atrapalhar outros módulos.
2. Caso é **operacionalmente distinto** (ex.: PDV teclado-first; canal toast PDV ≠ painel — ver `VISUAL_TRANSACTION_STATES.md`).
3. Há **dono + prazo** para absorver ou formalizar no SSOT (máx. 2 sprints, senão vira item de backlog DS).
4. Registrada em § Exceções aprovadas de `DESIGN_SYSTEM_GAPS.md`.

**Nunca exceção:** “cliente legado”, “não quero migrar”, “copiei do Gerente”, dark-glass em rota `/admin`.

---

## 6. Papéis

| Papel | Responsabilidade |
|-------|------------------|
| **DS owner** | Aprovar primitivos novos e exceções; atualizar matriz SSOT |
| **Autor do PR** | Checklist §2; burndown; sem legado novo |
| **Reviewer** | Recusar segundo paradigma; exigir PageShell em página admin nova/alterada |
| **Sponsor freeze** | Unificação total de tokens / redesign amplo |

---

## 7. Como medir aderência ao longo do tempo

### 7.1 Frequência

- **Fim de cada sprint** — preencher tabela em [`ROADMAP_UI_UX.md`](./ROADMAP_UI_UX.md) § Métricas.
- **Cada PR UI** — burndown não sobe.
- **Release piloto** — meta aderência ≥ 85%.

### 7.2 Fórmula de aderência (%)

```
score = 0.20 * (páginasAdminComPageShell / páginasAdminOperacionais)
      + 0.20 * (listasComDataTableOuEntityTable / listasAdmin)
      + 0.15 * (overlaysDragonOuConfirmOuSheet / overlaysTotais)
      + 0.15 * (arquivosButtonSsot / (buttonSsot + appBtn + adminV2Btn))
      + 0.15 * (emptyStateSsot / (emptyStateSsot + emptyLocal))
      + 0.15 * (filtrosFilterBar / listagensComFiltro)
```

### 7.3 Sinais de regressão (parar e abrir item S0-hotfix)

- Novo import de `GerenteTable` / `DataTablePage` / `.app-btn-*`.
- Novo `fixed inset-0` role=dialog fora de DragonModal/DetailSheet.
- Aderência cai &gt; 3 pp entre sprints.
- PR cria componente em `components/ui` sem §2.2.

### 7.4 Artefatos

| Artefato | Uso |
|----------|-----|
| `pdv-importados/reports/ds-legacy-burndown.json` | Baseline legado |
| `DESIGN_SYSTEM_GAPS.md` | SSOT + cobertura + exceções |
| `ROADMAP_UI_UX.md` § Métricas | Série temporal |
| Este arquivo | Processo PR / exceção |

---

## 8. Relação com freeze e entity-SSoT

- Sprint 0 e aplicação de SSOT = **IN** no freeze (consistência estrutural).
- Unificação total de tokens / multi-tema = **OUT** sem sponsor.
- Não criar CRUD de produto/cliente/fornecedor fora das telas oficiais (`.cursor/rules/entity-ssot.mdc`).
- Pasta `app/gerente/*` permanece como biblioteca de actions até migração; **não** é desculpa para UI nova no visual Gerente.

---

## 9. Entrada em vigor

1. Sprint 0 aceita (critérios em `ROADMAP_UI_UX.md`).
2. Este documento linkado no template de PR (ou checklist da sprint UX).
3. Qualquer PR pós-S0 que viole §2 pode ser rejeitado sem discussão de “preferência visual”.
