# Fase 3: Semântica ARIA e Conformidade WCAG 2.1

**Status**: Em andamento  
**Branch**: `claude/phase-3-aria-accessibility-v21hp2`  
**Objetivo**: Implementar semântica ARIA completa, suporte a leitores de tela e conformidade WCAG 2.1 AA/AAA

---

## 1. Escopo da Fase 3

### Pilares de Implementação
1. **Semântica HTML5 e ARIA**: roles, labels, descriptions, landmarks
2. **Leitores de Tela**: Suporte completo NVDA, JAWS, VoiceOver
3. **Navegação Assistida**: Teclado (Tab, Enter, Setas, Escape)
4. **Regiões Dinâmicas**: aria-live para feedback de operações
5. **Landmarks Estruturais**: main, nav, complementary, contentinfo, region
6. **Conformidade WCAG 2.1**: AA (mínimo) e AAA (onde possível)

### Critérios de Aceitação
- ✅ Todos os componentes críticos implementam ARIA roles/labels
- ✅ Navegação via teclado 100% funcional
- ✅ Leitores de tela leem conteúdo dinamicamente
- ✅ Contrastes mantidos (herdados da Fase 2)
- ✅ Testes automatizados com axe-core e manual com NVDA
- ✅ Documentação ARIA para cada componente

---

## 2. Componentes Críticos por Prioridade

### Prioridade 1: Fluxo Principal do Caixa
- `app/caixa/CaixaLayout.tsx` - **Landmarks principal**
- `components/caixa/CaixaHeader.tsx` - **Navegação, landmark nav**
- `components/caixa/CaixaForm.tsx` - **Formulário, labels associadas**
- `components/caixa/CaixaTotais.tsx` - **Região dinâmica com aria-live**
- `components/ui/DragonModal.tsx` - **Modal, alertdialog para confirmações**
- `components/ui/DataTable.tsx` - **Tabela semântica, headers, scope**

### Prioridade 2: Formulários e Inputs
- `components/ui/FormField.tsx` - **Labels, hints, error messages**
- `components/ui/Input.tsx` - **aria-label, aria-describedby**
- `components/ui/Select.tsx` - **Combobox ARIA, aria-expanded**
- `components/ui/Checkbox.tsx` - **role, aria-checked**
- `components/ui/RadioGroup.tsx` - **role, aria-selected**

### Prioridade 3: Navegação e Modais
- `components/ui/Sidebar.tsx` - **Landmark complementary, aria-current**
- `components/caixa/CaixaMovimentacaoModal.tsx` - **Modal com alertdialog**
- `components/gerente/` - **Modais de admin, alertdialog**
- `components/ui/FilterBar.tsx` - **Botões filtráveis, aria-pressed**

### Prioridade 4: Indicadores Dinâmicos
- `components/ui/StockAlertBadge.tsx` - **aria-live, aria-atomic**
- `components/ui/ActivityFeed.tsx` - **Lista, item roles**
- `components/ui/Badge.tsx` - **aria-label para badges sem texto**
- Toast/Notification system - **aria-live, aria-polite**

---

## 3. Implementação por Componente

### Template de Checklist ARIA

Para cada componente, verificar:

```
[ ] 1. Role semântico correto (button, dialog, tab, combobox, etc.)
[ ] 2. Label acessível (aria-label, aria-labelledby, ou texto visível)
[ ] 3. Description se necessário (aria-describedby para hints/erros)
[ ] 4. State management (aria-expanded, aria-selected, aria-checked)
[ ] 5. Live region se dinâmico (aria-live, aria-atomic, aria-relevant)
[ ] 6. Keyboard navigation (Tab, Enter, Setas, Escape)
[ ] 7. Focus management (tabindex, focus restoration)
[ ] 8. Hidden content (aria-hidden, sr-only)
[ ] 9. Landmark se aplicável (main, nav, complementary, region)
[ ] 10. Test com axe-core e leitor de tela (NVDA/JAWS)
```

### Componentes Base Atualizados

#### Button.tsx
- [x] role="button" (implícito)
- [ ] aria-label para botões icon-only
- [ ] aria-pressed para toggle buttons
- [ ] aria-disabled deprecated → usar disabled attr
- [ ] aria-describedby para hints

#### Input.tsx
- [ ] aria-label associado
- [ ] aria-describedby para erros
- [ ] aria-invalid para estados de erro
- [ ] aria-required se necessário
- [ ] aria-labelledby se label separada

#### DragonModal.tsx (já parcialmente implementado)
- [x] role="dialog"
- [x] aria-modal="true"
- [x] aria-labelledby + aria-describedby
- [ ] Considerar role="alertdialog" para modais de confirmação
- [ ] aria-controls quando fecha outros elementos
- [ ] Test de focus trap completo

---

## 4. Landmarks Estruturais

### Hierarquia Recomendada

```
<body>
  <header role="banner">
    <nav aria-label="Principal">
      <ul role="navigation">
        <li><a aria-current="page">Caixa</a></li>
        ...
      </ul>
    </nav>
  </header>
  
  <main role="main">
    <h1>Título da página</h1>
    <!-- Conteúdo principal -->
  </main>
  
  <aside role="complementary" aria-label="Filtros">
    <!-- Sidebar, filtros -->
  </aside>
  
  <footer role="contentinfo">
    <!-- Rodapé -->
  </footer>
</body>
```

### Implementação em FastProduct
- [ ] RootLayout.tsx: `<header role="banner">` + `<main>`
- [ ] Navigation: `<nav aria-label="Navegação">` + `aria-current="page"`
- [ ] Sidebar: `<aside role="complementary">`
- [ ] Modais: Semanticamente isolados com `role="dialog"`

---

## 5. Live Regions (Dinâmicas)

### Áreas que Precisam aria-live

| Componente | Tipo | aria-live | aria-atomic |
|---|---|---|---|
| CaixaTotais | Atualização de saldo | `polite` | `true` |
| Toast/Alert | Notificação | `assertive` (erro) ou `polite` | `true` |
| Form Validation | Erro inline | `polite` | `false` |
| StockAlert | Alerta de estoque | `polite` | `true` |
| ActivityFeed | Nova atividade | `polite` | `false` |
| CaixaStatus | Mudança de status | `assertive` | `true` |

### Padrão de Implementação

```tsx
<div aria-live="polite" aria-atomic="true" role="status">
  {/* Conteúdo dinâmico que será anunciado */}
</div>
```

---

## 6. Keyboard Navigation

### Requisitos por Componente

#### Buttons
- [x] Enter/Space para ativar
- [x] Focus visível
- [ ] Tab navigation fluido

#### Modals
- [x] Escape para fechar (se dismissable)
- [x] Tab trap (foco reciclado)
- [x] Focus restoration ao fechar
- [ ] Teste com VoiceOver

#### Forms
- [x] Tab entre campos
- [ ] Enter para submit (se apropriado)
- [ ] Setas para radio/select (Radix UI)
- [ ] Escape para cancelar

#### Tables
- [ ] Setas para navegação de célula
- [ ] Ctrl+Home/End para primeira/última célula
- [ ] Enter em célula editável

#### Menus/Dropdowns
- [ ] Setas para navegação
- [ ] Enter/Space para seleção
- [ ] Escape para fechar
- [ ] Home/End para primeira/última opção

---

## 7. Testing Strategy

### Automated Testing
- [ ] Integrar axe-core nos testes (vi + axe)
- [ ] Relatório automático de violações
- [ ] CI/CD gate para novos issues ARIA

### Manual Testing
- [ ] NVDA (Windows) - Teste completo
- [ ] JAWS (Windows) - Teste crítico
- [ ] VoiceOver (macOS/iOS) - Teste secundário
- [ ] Teclado only (Tab, Enter, Setas, Escape)
- [ ] Browser DevTools - Accessibility tree

### Test Cases por Sprint
1. **Sprint 1**: Componentes base + layouts
2. **Sprint 2**: Modais + formulários
3. **Sprint 3**: Dinâmicos + integração

---

## 8. Checklist de Implementação

### Fase 3.1: Fundamentos ARIA
- [ ] Documentar todas as mudanças em ARIA_IMPLEMENTATION.md
- [ ] Atualizar Button.tsx com aria-label, aria-pressed
- [ ] Atualizar Input.tsx com aria-describedby, aria-invalid
- [ ] Atualizar DragonModal.tsx com role="alertdialog" onde necessário
- [ ] Adicionar sr-only classe para labels ocultas

### Fase 3.2: Landmarks e Estrutura
- [ ] Implementar header/footer/main em RootLayout.tsx
- [ ] Adicionar nav/complementary roles em navegação
- [ ] Testar com aXe devTools (0 violações críticas)

### Fase 3.3: Live Regions e Dinâmicos
- [ ] Implementar aria-live em CaixaTotais
- [ ] Implementar aria-live em Toast/Alert system
- [ ] Implementar aria-live em StockAlert
- [ ] Testar anúncio com NVDA

### Fase 3.4: Keyboard Navigation Completa
- [ ] Testar Tab + Shift+Tab fluídos
- [ ] Testar Escape em todos os modais
- [ ] Testar Setas em selects/menus
- [ ] Documentar keyboard shortcuts em atalhos

### Fase 3.5: Testing e Auditoria
- [ ] Executar axe audit em todas as páginas
- [ ] Teste manual com NVDA (30 min mínimo)
- [ ] Teste manual com teclado only
- [ ] Gerar relatório final WCAG 2.1 AA

---

## 9. Recursos e Referências

### WCAG 2.1 Guidelines
- [WCAG 2.1 AA Compliance](https://www.w3.org/WAI/WCAG21/quickref/?versions=2.1)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [MDN: ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)

### Tools
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [NVDA (free screen reader)](https://www.nvaccess.org/)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)
- [Lighthouse (Chrome)](https://developers.google.com/web/tools/lighthouse)

### Radix UI / Headless Components
- [Radix UI Accessible Components](https://radix-ui.com/)
- Muitos componentes já implementam ARIA corretamente

---

## 10. Timeline Estimado

| Fase | Escopo | Duração | Entregáveis |
|---|---|---|---|
| 3.1 | Componentes base + docs | 2-3 dias | Button, Input, Modal com ARIA |
| 3.2 | Landmarks e estrutura | 1-2 dias | Layout roles, nav, complementary |
| 3.3 | Live regions | 2-3 dias | CaixaTotais, Toast, StockAlert |
| 3.4 | Keyboard completo | 2-3 dias | Navegação 100% funcional |
| 3.5 | Testing e auditoria | 2-3 dias | Relatório WCAG 2.1 AA, PR |
| **Total** | **Fase 3 completa** | **9-14 dias** | **PR #134+ com conformidade WCAG** |

---

## 11. Documento de Referência: ARIA_IMPLEMENTATION.md

Será criado um documento separado com:
- Checklist detalhado por componente
- Snippets de código ARIA
- Exemplos de implementação
- Padrões reutilizáveis
- Links para WCAG 2.1

---

## Status e Próximos Passos

**Próximo**: Criar ARIA_IMPLEMENTATION.md e começar Fase 3.1 com componentes base.

---

*Última atualização: 2026-07-03*  
*Branch: claude/phase-3-aria-accessibility-v21hp2*
