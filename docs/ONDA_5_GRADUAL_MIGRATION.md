# Onda 5 — Migração Gradual de Design System

**Status:** Planejamento (aguardando merge de PR #202 — Onda 3+4)  
**Objetivo:** Adotar novo design system sem breaking changes · coexistência com código legado  
**Duração estimada:** 4-6 sprints (componente por componente)  
**Princípio:** Pequenas PRs + testes + validação visual a cada etapa

---

## Visão Geral

Após Onda 3 (colapso de dualismo) e Onda 4 (design guard), Onda 5 migra componentes para novo design system de forma gradual:

```
Onda 3 ✅ (Colapso layout)
   ↓
Onda 4 ✅ (Design Guard — proteger)
   ↓
Onda 5 (Migração gradual)
   ├─ Lote 1: Button → new Button (com deprecation)
   ├─ Lote 2: Modal → DragonModal (coexistência)
   ├─ Lote 3: Table → new Table
   ├─ Lote 4: Toast → new Toast
   ├─ Lote 5: Badge → new Badge
   └─ Lote 6: Forms → new Form components
```

**Cada lote:** 1 PR com validação visual, testes, sem romper código existente.

---

## Princípios de Onda 5

### 1. **Coexistência, Não Substituição Imediata**

```typescript
// ✅ PERMITIDO: Ambos existem lado a lado
<OldButton /> {/* Componente clássico */}
<NewButton /> {/* Novo design system */}

// ❌ PROIBIDO: Remover componente antigo enquanto ainda é usado
// <OldButton /> será removido em Onda 6, após deprecation period
```

### 2. **Deprecation Gradual**

```typescript
// Lote 1 (PR 250): Novo Button com design tokens
export const NewButton = ({ variant = 'primary', size = 'md', ...props }) => {
  // Usa design tokens de Onda 3
  // sem ternários de layout
}

// Lote 2+ (PR 251–255): Migrar consumidores um por um
// CaixaHeader: OldButton → NewButton
// CaixaPdvTopBar: OldButton → NewButton
// ... etc
```

### 3. **Sem Breaking Changes**

- Novo componente tem **nova prop API** (não sobrescreve a antiga)
- Antigo continua funcionando normalmente
- Deprecation warning em console (dev only)
- Migration guide em docs

### 4. **Validação Visual por Lote**

Cada PR inclui:
- Build + tests (npm run build, npm test)
- Storybook visual (antes/depois lado a lado)
- Smoke test em caixa/gerente (se aplicável)
- Screenshot diff (se CI suportar)

---

## Lotes de Onda 5

### Lote 1: Button (Prioridade Alta)

**Objetivo:** Novo Button com design tokens, sem variant prop de layout

**Arquivos afetados:**
```
pdv-importados/components/Button.tsx (novo)
pdv-importados/stories/Button.stories.tsx (novo/atualizado)
pdv-importados/lib/design-tokens/button.tokens.ts (novo)
```

**Mudanças:**
- Button novo com `size` (sm, md, lg) e `variant` (primary, secondary, ghost)
- Usa design tokens `--btn-*` (tamanho, cor, padding)
- Sem `layoutVariant` prop
- Deprecation alias: `export { NewButton as Button_v2 }`

**Consumidores Fase 1 (nesta PR):** Storybook only  
**Consumidores Fase 2 (próxima sprint):** Migrar 3-5 consumidores

**Validação:**
- [ ] npm run build ✅
- [ ] npm test ✅
- [ ] Storybook visual (lado a lado: OldButton vs NewButton)
- [ ] Testes unitários de Button_v2
- [ ] Design tokens mapeados (Figma ↔ CSS)

---

### Lote 2: Modal (Prioridade Alta)

**Objetivo:** Validar DragonModal vs novo Modal wrapper

**Arquivos afetados:**
```
pdv-importados/components/Modal.tsx (novo wrapper)
pdv-importados/app/caixa/modals/CaixaRecibo.tsx (consumidor de teste)
```

**Mudanças:**
- Modal novo com API clara: `<Modal open={} onClose={} title="" actions=[]>`
- DragonModal existente mantido (usado em 6+ modais)
- Modal novo é wrapper que internamente usa DragonModal ou CSS nativo (TBD)
- Sem prop `variant` de layout

**Consumidores Fase 1:** Nenhum (apenas novo componente)  
**Consumidores Fase 2:** Migrar 2 modais de teste (ex: CaixaRecibo, CaixaAbertura)

**Validação:**
- [ ] npm run build ✅
- [ ] Storybook (Modal showcase)
- [ ] E2E: modal abrir/fechar/ações (Playwright)
- [ ] Visual regression (antes/depois)

---

### Lote 3: Table (Prioridade Média)

**Objetivo:** Novo Table com design tokens (sem layout bifurcação)

**Arquivos afetados:**
```
pdv-importados/components/Table/Table.tsx (novo)
pdv-importados/components/Table/TableCell.tsx (novo)
pdv-importados/components/Table/TableRow.tsx (novo)
pdv-importados/stories/Table.stories.tsx (novo)
```

**Mudanças:**
- Table novo com `columns`, `rows`, `striped`, `hover` props
- Usa design tokens para cores, spacing, borders
- Sem seletor `[data-table-variant]` ou similares
- Suporta responsive (grid layout em mobile)

**Consumidores Fase 1:** Nenhum  
**Consumidores Fase 2:** Migrar `/gerente/vendas` table e `/admin/estoque` table

**Validação:**
- [ ] npm run build ✅
- [ ] npm test ✅
- [ ] Storybook (Table responsive showcase)
- [ ] Mobile visual test (320px, 768px, 1024px breakpoints)

---

### Lote 4: Toast (Prioridade Média)

**Objetivo:** Novo Toast com design tokens

**Arquivos afetados:**
```
pdv-importados/components/Toast/Toast.tsx (novo)
pdv-importados/hooks/useToast.ts (novo hook)
pdv-importados/lib/toast-context.tsx (novo context)
```

**Mudanças:**
- Toast novo com `type` (success, error, warning, info)
- Usa design tokens `--toast-*`
- Sem variant de layout
- Context provider para múltiplos toasts em stack

**Consumidores Fase 1:** Nenhum  
**Consumidores Fase 2:** Migrar `atualizarEstoqueProduto` toast + vendas toasts

**Validação:**
- [ ] npm run build ✅
- [ ] npm test ✅
- [ ] Storybook (Toast tipos)
- [ ] E2E: trigger toast, verificar dismiss

---

### Lote 5: Badge (Prioridade Baixa)

**Objetivo:** Novo Badge com design tokens

**Arquivos afetados:**
```
pdv-importados/components/Badge.tsx (novo)
pdv-importados/stories/Badge.stories.tsx (novo)
```

**Mudanças:**
- Badge novo com `color` (blue, green, red, yellow)
- Sem prop de layout
- Pequeno, reutilizável

**Consumidores Fase 1:** Nenhum  
**Consumidores Fase 2:** Migrar status badges (`/gerente/vendas`, `/admin/catalogo`)

**Validação:**
- [ ] npm run build ✅
- [ ] npm test ✅
- [ ] Storybook (Badge colors)

---

### Lote 6: Forms (Prioridade Alta, mas complexo)

**Objetivo:** Novo Form system com design tokens

**Arquivos afetados:**
```
pdv-importados/components/Form/Input.tsx (novo)
pdv-importados/components/Form/Select.tsx (novo)
pdv-importados/components/Form/Checkbox.tsx (novo)
pdv-importados/components/Form/Radio.tsx (novo)
pdv-importados/lib/form-context.tsx (novo)
```

**Mudanças:**
- Input novo com `size` (sm, md, lg), `error` state
- Select, Checkbox, Radio com design tokens
- Integração com React Hook Form (se usado)
- Sem bifurcação visual por layout

**Consumidores Fase 1:** Nenhum  
**Consumidores Fase 2:** Migrar `/admin/clientes` form + `/admin/catalogo` form (maior impacto)

**Validação:**
- [ ] npm run build ✅
- [ ] npm test ✅
- [ ] Storybook (Form inputs em todos os estados)
- [ ] E2E: preencher form, validar, submeter
- [ ] Mobile responsive

---

## Checklist de Onda 5

### Pré-Onda (Antes de Lote 1)

- [ ] PR #202 mergeado em `main` (Onda 3+4)
- [ ] Design tokens finalizados (cor, spacing, tipografia)
- [ ] Figma updated com novo design
- [ ] Storybook setup (stories para novos componentes)
- [ ] Jest/Vitest setup para testes unitários
- [ ] Playwright setup para e2e
- [ ] Documentação de deprecation policy escrita
- [ ] Equipe alinhada em pequeníssimas PRs (< 300 linhas por lote se possível)

### Lote 1–6 (Cada iteração)

Checklist por lote:
- [ ] Novo componente criado (arquivo .tsx)
- [ ] Stories criadas (Storybook)
- [ ] Testes unitários (componente isolado)
- [ ] npm run build ✅
- [ ] npm run test ✅
- [ ] npm run guard:design-system ✅ (sem regressão)
- [ ] Storybook visual reviewed
- [ ] PR abre, revisão, merge
- [ ] Merge em `main`, Vercel preview validado
- [ ] (Opcional) E2E smoke após merge

### Pós-Onda (Após Lote 6)

- [ ] Todos 6 componentes em produção
- [ ] Consumidores migrados (20–30 arquivos)
- [ ] Deprecation warnings no console
- [ ] Documentação de migration atualizada
- [ ] Planejar Onda 6 (remoção de componentes antigos)

---

## Timeline Estimado

```
Semana 1: Lote 1 (Button)           — PR #250
Semana 2: Lote 2 (Modal)            — PR #251
Semana 3: Lote 3 (Table)            — PR #252
Semana 4: Lote 4 (Toast)            — PR #253
Semana 5: Lote 5 (Badge)            — PR #254
Semana 6: Lote 6 (Forms)            — PR #255

Post-merge: Consumidor migration (2–3 sprints adicionais)
```

---

## Estrutura de Diretórios (Após Onda 5)

```
pdv-importados/
├── components/
│   ├── Button.tsx (novo)
│   ├── Button.stories.tsx
│   ├── Modal.tsx (novo wrapper)
│   ├── Modal.stories.tsx
│   ├── Table/
│   │   ├── Table.tsx (novo)
│   │   ├── TableCell.tsx (novo)
│   │   ├── TableRow.tsx (novo)
│   │   └── Table.stories.tsx
│   ├── Toast/
│   │   ├── Toast.tsx (novo)
│   │   ├── Toast.stories.tsx
│   │   └── toastContext.tsx
│   ├── Badge.tsx (novo)
│   ├── Badge.stories.tsx
│   └── Form/
│       ├── Input.tsx (novo)
│       ├── Select.tsx (novo)
│       ├── Checkbox.tsx (novo)
│       ├── Radio.tsx (novo)
│       └── Form.stories.tsx
├── lib/
│   ├── design-tokens/
│   │   ├── button.tokens.ts
│   │   ├── table.tokens.ts
│   │   ├── toast.tokens.ts
│   │   ├── badge.tokens.ts
│   │   ├── form.tokens.ts
│   │   └── index.ts (export all)
│   └── hooks/
│       ├── useToast.ts
│       └── useForm.ts (opcional)
└── stories/
    └── (Storybook stories, mirroring components/)
```

---

## Critério de Sucesso

✅ Onda 5 é **concluída quando:**

1. **Todos 6 componentes** criados e testados
2. **Sem breaking changes** — código legado continua funcionando
3. **Design guard passa** — `npm run guard:design-system` ✅
4. **Build verde** — `npm run build` ✅
5. **Testes verdes** — `npm test` ✅
6. **Vercel preview validado** — cada PR
7. **Consumidores começam migração** (fora do escopo Onda 5, mas planejado)

---

## Próximo Passo

1. ✅ Este documento (Onda 5 — Planejamento)
2. ⏳ Aguardar merge de PR #202
3. 🚀 Criar PR #250 (Lote 1: Button)
4. 🔄 Repetir Lote 2–6

**Documento pronto para compartilhar com a equipe.**

