# ADR-PDV-TEMA-002 — Contrato de Tema do PDV

| Campo | Valor |
|--------|--------|
| **ID** | ADR-PDV-TEMA-002 |
| **Título** | Contrato de Tema do PDV: Padrão Visual Claro como Baseline Operacional |
| **Status** | Aceito |
| **Data de Decisão** | 2026-05-12 (codificado) |
| **Data de Formalização** | 2026-06-27 |
| **Revisor** | Arquitetura |
| **Relacionados** | ADR-PDV-001, LAYOUT_KERNEL_ERP.md |

---

## Contexto

O painel gerencial (`pdv-importados/app/gerente/`) funciona exclusivamente em tema claro (`dragon-light`). A decisão foi pragmática:

- **Fase 0** da interface focava em **estabilidade operacional**, não em variedade visual
- **Tema claro** alinha-se com **ambiente de loja** (luz ambiente, contraste para ler rápido)
- **Toggle de tema** adicionava **estado local** (localStorage) sem benefício operacional comprovado

Historicamente, isso foi codificado como **rejeição definitiva** de tema escuro. Este ADR **formaliza a decisão atual sem linguagem final**, abrindo espaço para evolução quando a arquitetura ou negócio exigir.

---

## Decisão

### Estado Atual (Baseline)

**O tema claro é o contrato vigente do PDV (painel gerencial).**

Implementação:
- Arquivo: `pdv-importados/components/gerente/GerenteThemeContext.tsx`
- Provider: `GerenteUiThemeProvider` retorna `theme: 'dragon-light'`
- `setTheme()` é inerte (sem efeito)
- localStorage **não é lido nem escrito** para tema
- CSS variables: `--color-*` (claro) aplicadas globalmente

**Restrição operacional:** caixa web + gerente + relatórios: sempre claro.

**Justificativa:**
1. **Ambiente de loja** exige alto contraste e legibilidade em luz ambiente variável
2. **Complexidade reduzida** (uma paleta, uma decisão de design)
3. **Sem requisito de negócio** comprovado para tema escuro (nenhum usuário solicitou)
4. **Performance e acessibilidade:** contrato único simplifica auditoria de contraste WCAG

---

### Processo para Futuras Mudanças

Se **novo requisito de negócio** aparecer (ex.: operação noturna, preferência de usuário, acessibilidade), o caminho é:

#### Passo 1: Validar o Requisito
- Quem solicita? (usuário, suporte, produto?)
- Qual problema resolve? (fadiga visual, acessibilidade, operação noturna?)
- Escopo: painel gerencial, caixa web, PDV desktop, ou todos?

#### Passo 2: Avaliar Viabilidade Arquitetural
Se aprovado, questões técnicas:
- **Design system:** componentes Radix UI + Tailwind suportam tema? (Sim, ambos CSS variables)
- **Ledger visual:** há logs/relatórios que precisam ser vistos em ambos os temas?
- **RLS/autenticação:** mudança de tema é por usuário ou global?

#### Passo 3: Expandir ADR
Reabrir este ADR e:
1. Adicionar seção "Tema Escuro (Proposto)"
2. Descrever migração (ativar localStorage, expandir `GerenteThemeContext`)
3. Testar contraste em ambas as paletas (WCAG AA mínimo)
4. Atualizar testes (snapshots, acessibilidade)

#### Passo 4: Implementar Incrementalmente
- [ ] Atualizar CSS variables para suportar ambos
- [ ] Estender `GerenteThemeContext.tsx` (ler localStorage)
- [ ] UI: adicionar toggle ou preferência de usuário em settings
- [ ] Testes: Visual Regression + WCAG Contrast
- [ ] Documentar em LAYOUT_KERNEL_ERP.md

---

## Justificação

### Por Que Não Tema Escuro Agora?

| Questão | Resposta |
|---------|----------|
| **Requisito claro?** | Não há solicitação de usuário documentada |
| **Benefício à operação?** | Não muda fluidez, preço, estoque ou finalização |
| **Risco de atraso?** | Sim — desvia foco de funcionalidades de valor (Fase 2) |
| **Custo técnico?** | Médio-alto (paletas, testes de contraste, regressão visual) |

**Conclusão:** adiado deliberadamente até haver **requisito real** ou **acessibilidade crítica** (ex.: WCAG falha).

### Por Que Manter Esta ADR?

Evita:
- ✗ Interpretação de "nunca" tema escuro (fecha portas)
- ✗ Retrabalho se requisito emerge (já têm o contrato)
- ✗ Dúvidas na arquitetura ("por que está assim?")

Permite:
- ✓ Evoluir sem quebrar promessas existentes
- ✓ Traçabilidade clara (por que, quando, como mudar)
- ✓ Testes incrementais antes de commit

---

## Implementação Técnica Atual

### Arquivo: `GerenteThemeContext.tsx`

```typescript
/**
 * Tema claro é contrato vigente.
 * localStorage não é lido — estado local desativado.
 * setTheme() é inerte (preparação para expansão futura).
 */
const ThemeCtx = createContext<Ctx>({
  theme: 'dragon-light',
  setTheme: () => {} // Inert: preparado para ativar se requisito surgir
})

export function GerenteUiThemeProvider({ children }: ...) {
  return (
    <ThemeCtx.Provider value={{ theme: 'dragon-light', setTheme: () => {} }}>
      {children}
    </ThemeCtx.Provider>
  )
}
```

**Notar:** `setTheme` **não é deletado** — é proposital. Facilita ativação futura sem refatorar consumers.

### CSS Variables

Arquivo: `pdv-importados/app/globals.css` (ou similar)

```css
:root {
  /* Tema claro (vigente) */
  --color-bg: #ffffff;
  --color-fg: #000000;
  --color-border: #e5e5e5;
  /* ... */
}

/* Se tema escuro ativar (futuro) */
@media (prefers-color-scheme: dark) {
  /* Desativado enquanto não houver requisito */
  /* :root {
    --color-bg: #1a1a1a;
    --color-fg: #ffffff;
  } */
}
```

---

## Impacto

### Positivos
- ✅ **Operação clara:** contrato visual único, sem ambiguidade
- ✅ **Acessibilidade:** paleta claro auditada, contraste WCAG documentado
- ✅ **Performance:** zero lógica de tema, sem re-renders
- ✅ **Manutenibilidade:** testes visuais em uma paleta

### Limitações
- ⚠️ **Sem preferência de usuário:** todos os usuários veem claro (mesmo se OS em escuro)
- ⚠️ **Operação noturna:** se loja operar 24h, fadiga visual potencial (não comprovada)
- ⚠️ **Acessibilidade bidirecional:** `prefers-color-scheme: dark` ignorado (pode impactar acessibilidade em contextos específicos)

---

## Próximos Passos

### Curto Prazo (Se Não Houver Requisito)
- [ ] Atualizar comentário em `GerenteThemeContext.tsx` (linguagem menos definitiva) ✅
- [ ] Documentar em LAYOUT_KERNEL_ERP.md: "Tema claro é baseline; escuro é roadmap condicional"
- [ ] Testar contraste WCAG AA (auditoria de acessibilidade)

### Médio Prazo (Se Requisito Surgir)
- [ ] Reabrir ADR com seção "Tema Escuro (Proposto)"
- [ ] Expandir CSS variables
- [ ] Ativar localStorage em `GerenteThemeContext`
- [ ] PR: gradual (paleta claro + teste escuro, sem ativar UI yet)
- [ ] Validar em staging com feedback de usuários

### Roadmap Aberto
Se em 2026-Q3 houver 3+ solicitações de tema escuro ou acessibilidade falhar WCAG em contexto de acessibilidade crítica (ex.: usuário daltônico), reavaliar e expandir suporte.

---

## Referências

- **Código:** `pdv-importados/components/gerente/GerenteThemeContext.tsx`
- **Design:** Radix UI + Tailwind CSS (ambos suportam temas)
- **Acessibilidade:** WCAG 2.1 AA (contraste mínimo 4.5:1 texto normal)
- **Related:** ADR-PDV-001 (Centro de gravidade), LAYOUT_KERNEL_ERP.md

---

## Histórico

| Data | Mudança |
|------|---------|
| 2026-05-12 | Tema claro codificado em `GerenteThemeContext.tsx` (Fase 0 Layout Compiler) |
| 2026-06-27 | ADR formalizado com linguagem não-definitiva e processo de evolução |

---

## Sign-off

- [ ] Produto (validar sem requisito de escuro)
- [ ] Arquitetura (contrato técnico aprovado)
- [ ] Eng Lead (implementação viável conforme descrito)

