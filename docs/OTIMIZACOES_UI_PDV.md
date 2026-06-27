# Otimizações de UI/UX do PDV — Barra Superior e Resumo Financeiro

**Data:** 2026-06-27  
**Objetivo:** Reduzir ruído visual, aumentar foco na busca e venda  
**Escopo:** Layout "default" (oriental) + classic  
**Impacto:** Clareza visual, agilidade operacional, menos distrações

---

## 1️⃣ Barra Superior (CaixaHeader + CaixaPdvTopBar)

### Status Atual

**CaixaHeader.tsx (linhas 67-100):**
```
┌─────────────────────────────────────────────────────┐
│ CaixaPdvTopBar (logo, titulo, turno, operador,      │
│ fundo, impressora, botão abrir/fechar, idioma, sair)│
├─────────────────────────────────────────────────────┤  ← Linha 2 (apenas em "default")
│ [Data/Hora] [Status Badge: ABERTO/FECHADO/...]      │
└─────────────────────────────────────────────────────┘
```

**CaixaPdvTopBar.tsx (linhas 68-209):**
- Ícone + Título ("Caixa")
- 4 badges: Turno (ABERTO #1), Operador, Fundo (R$), Impressora (se ativa)
- 3 botões: Abrir/Fechar Caixa, Language Toggle, Sair
- Padding: `py-2.5` (10px top/bottom)

### Problemas Identificados

| Problema | Localização | Impacto | Severidade |
|----------|------------|---------|-----------|
| **Altura excessiva** | CaixaPdvTopBar: py-2.5 | Visual pesado; compete com conteúdo | 🟡 Médio |
| **Data/hora duplicada** | CaixaHeader (linha 81+) + Sistema operacional | Informação redundante | 🟡 Médio |
| **Language Toggle sem necessidade** | CaixaPdvTopBar (linha 196) | Se operação é apenas PT ou ZH | 🟢 Baixo |
| **Operador em badge** | CaixaPdvTopBar (linhas 103-111) | Nem sempre crítico visualizar nome | 🟡 Médio |
| **Fundo em badge compacto** | CaixaPdvTopBar (linhas 112-120) | Importante mas pode ser mais discreto | 🟢 Baixo |
| **Impressora sempre visível** | CaixaPdvTopBar (linhas 121-141) | Só relevante se estado ≠ idle | 🟢 Baixo |

### Mudanças Propostas

#### **Mudança 1: Reduzir altura do header**
- **De:** `py-2.5` (10px)
- **Para:** `py-1.5` (6px)
- **Benefício:** ~15% menos altura, visual mais limpo
- **Arquivo:** `CaixaPdvTopBar.tsx` linha 70

#### **Mudança 2: Remover segunda linha de data/hora**
- **Remover:** CaixaHeader.tsx linhas 81-99 (data/hora + badge redundante)
- **Justificativa:** Data/hora no seu próprio display da máquina; status do caixa fica no badge da TopBar
- **Arquivo:** `CaixaHeader.tsx`

```diff
  return (
    <div className="shrink-0 flex flex-col" style={fontStack ? { fontFamily: fontStack } : undefined}>
      <CaixaPdvTopBar ... />
-     {layoutVariant !== "classic" && currentDateTime ? (
-       <div className="flex items-center gap-2 border-b border-jl-border-1 bg-jl-surface-base px-4 py-1 sm:px-6">
-         <span className="inline-flex ... {currentDateTime}</span>
-         <span className={cn(...)} >{badgeLabel}</span>
-       </div>
-     ) : null}
    </div>
  )
```

#### **Mudança 3: Remover LanguageToggle se operação é monolíngue**
- **Condição:** Se `NEXT_PUBLIC_CAIXA_IDIOMAS` = apenas PT ou apenas ZH
- **Remover:** LanguageToggle linha 196 condicionalmente
- **Arquivo:** `CaixaPdvTopBar.tsx`

```diff
+ {process.env.NEXT_PUBLIC_CAIXA_IDIOMAS?.includes(',') && (
    <LanguageToggle idiomaAtual={idioma} />
+ )}
```

**Alternativa:** Sempre remover (decisão de UX: cada loja usa um idioma, não alterna).

#### **Mudança 4: Posicionar logomarca discretamente**
- **Atual:** Ícone SquareTerminal (h-9 w-9 = 36px) + Título "Caixa"
- **Proposto:** Manter ícone, reduzir para h-7 w-7 (28px), remover/collapsar título "Caixa"
- **Arquivo:** `CaixaPdvTopBar.tsx` linhas 78-89

```diff
- <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", ...)} >
+ <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", ...)} >
    <SquareTerminal className="h-5 w-5" aria-hidden />
  </span>
- <h1 className={cn("min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg", ...)} >
-   {m.caixa.topbar_titulo}
- </h1>
```

#### **Mudança 5: Consolidar informações — remover "Operador" badge**
- **Racional:** Operador já está logado (sessão ativa); mostrar novamente é redundante
- **Remover:** Linhas 103-111
- **Arquivo:** `CaixaPdvTopBar.tsx`

```diff
  <span className={cn("max-w-[11rem] truncate ...", ...)} > {turnoText} </span>
- <span className={cn("max-w-[14rem] truncate ...", ...)} > {operadorText} </span>
  <span className={cn("max-w-[12rem] truncate ...", ...)} > {fundoText} </span>
```

**Nota:** Operador fica visível no `CaixaPdvOperadorTabs` (se necessário nas abas).

#### **Mudança 6: Consolidar atalhos de teclado**
- **Localização:** `CaixaSearchBar.tsx` e `CaixaPdvOperadorTabs.tsx` duplicam "Enter · Adicionar"
- **Problema:** Repetição confunde usuário (qual Enter?)
- **Solução:** Mostrar atalhos apenas na busca, consolidados em um único bloco visual

Arquivo: `CaixaSearchBar.tsx` (procurar por exibição de atalhos)

```
[Enter] Adicionar · [Esc] Limpar · [F1] Cliente · [F2] Pagamento
```

---

## 2️⃣ Resumo Financeiro (CaixaPdvCartSaleBar)

### Status Atual

**CaixaPdvCartSaleBar.tsx:**
- Exibe sempre: Total Bruto, Desconto, Total Líquido, Gerente %
- Sempre visível, compete por espaço com carrinho

### Problema

Quando carrinho está vazio, resumo financeiro é inútil (todos zeros).

### Solução: Tornar Colapsável

#### **Mudança 7: Implementar Accordion no resumo**

Arquivo: `CaixaPdvCartSaleBar.tsx` (ou novo arquivo `CaixaFinancialSummary.tsx`)

```tsx
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"

export function CaixaPdvCartSaleBar({ itensLength, totalBruto, totalDesconto, ... }) {
  const vazio = itensLength === 0
  
  // Mostrar expandido se há itens, colapsado se vazio
  const defaultValue = vazio ? null : 'resumo'
  
  return (
    <Accordion type="single" collapsible defaultValue={defaultValue}>
      <AccordionItem value="resumo">
        <AccordionTrigger>
          💰 Resumo Financeiro
          {!vazio && (
            <span className="ml-2 text-sm font-semibold">
              Total: {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
            </span>
          )}
        </AccordionTrigger>
        <AccordionContent>
          {/* Grid de totais */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Total Bruto: <span className="font-semibold">{...}</span></div>
            <div>Desconto: <span className="font-semibold">{...}</span></div>
            <div>Total Líquido: <span className="font-semibold">{...}</span></div>
            {descontoGerentePercentual > 0 && (
              <div>Gerente: <span className="font-semibold">{...}</span></div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
```

**Efeito:** Quando vazio → colapsado (1 linha). Quando com itens → expandido (4 linhas).

---

## 3️⃣ Busca e Atalhos — Consolidação

### Problema Atual

`CaixaSearchBar.tsx` e `CaixaPdvOperadorTabs.tsx` exibem instruções de teclado separadas:
- Busca: "Enter · Adicionar" (ou similar)
- Tabs: "F1 Cliente · F2 Pagamento" (ou similar)

Usuário vê **múltiplas sequências de atalhos**, fica confuso qual aplica.

### Solução: Bloco Único de Atalhos

Criar componente `CaixaKeyboardHintsBar.tsx`:

```tsx
export function CaixaKeyboardHintsBar() {
  return (
    <div className="flex gap-4 text-xs text-fg-secondary">
      <span><kbd>Enter</kbd> Adicionar</span>
      <span><kbd>Esc</kbd> Limpar</span>
      <span><kbd>F1</kbd> Cliente</span>
      <span><kbd>F2</kbd> Pagamento</span>
      <span><kbd>F3</kbd> Desconto</span>
    </div>
  )
}
```

Integrar em:
- `CaixaSearchBar.tsx` — remover hints locais, render global ao final
- `CaixaPdvOperadorTabs.tsx` — remover hints locais

---

## 4️⃣ Resumo Visual das Mudanças

### Antes (Altura ~85px para default layout)

```
┌────────────────────────────────────────────────────────┐ 45px
│ [Logo] Caixa  [Turno: #1] [Op: João] [Fundo: R$ 500]  │
│              [Imp: OK]  [Abrir] [PT/EN] [Sair]         │
├────────────────────────────────────────────────────────┤ 35px
│ [27/06/2026 14:32:15] [ABERTO]                         │
└────────────────────────────────────────────────────────┘
```

### Depois (Altura ~50px)

```
┌────────────────────────────────────────────────────────┐ 50px
│ [Logo] [Turno: #1] [Fundo: R$ 500] [Abrir] [Sair]     │
└────────────────────────────────────────────────────────┘
```

**Economias:**
- `-35px` (segunda linha de data)
- `-4px` (reduzir py-2.5 → py-1.5)
- `-10px` (remover LanguageToggle)
- `-5px` (reduzir logo h-9 w-9 → h-7 w-7)
- **Total: ~54px economizados** (35% redução de altura header)

---

## 📋 Arquivos a Modificar

| Arquivo | Mudanças | Esforço |
|---------|----------|---------|
| `CaixaPdvTopBar.tsx` | Reduzir py, remover LanguageToggle, remover Operador, reduzir logo | 2h |
| `CaixaHeader.tsx` | Remover segunda linha data/hora | 30min |
| `CaixaPdvCartSaleBar.tsx` | Tornar colapsável com Accordion | 1–1.5h |
| `CaixaSearchBar.tsx` | Remover hints duplicados | 30min |
| `CaixaKeyboardHintsBar.tsx` (nova) | Criar bloco central de atalhos | 1h |
| `CaixaPdvOperadorTabs.tsx` | Remover hints duplicados | 30min |

**Esforço Total:** ~5–6 horas

---

## ✅ Checklist de Validação

Após implementar, testar:

- [ ] Header height reduzido visualmente (screen compare lado a lado)
- [ ] Data/hora removida ou movida (não mais na TopBar)
- [ ] LanguageToggle removido (se config monolíngue)
- [ ] Operador badge removido (verificar se não quebra nenhuma expectativa)
- [ ] Logo reduzido mas ainda visível (não vai pra 0)
- [ ] Botões Abrir/Fechar/Sair ainda acessíveis e clicáveis
- [ ] Resumo financeiro colapsável (expand/collapse com mouse e Accordion)
- [ ] Atalhos consolidados em uma única linha (não duplicados)
- [ ] Layout "classic" também otimizado (aplicar mesmas reduções)
- [ ] Responsividade mantida (mobile sm, md, lg)
- [ ] Acessibilidade OK (Accordion is accessible via Radix UI)

---

## 🎯 Resultado Esperado

1. **Barra mais compacta** (~50px vs ~85px = 35% redução)
2. **Menos elementos visuais** (remove operador, idioma, data redundante)
3. **Foco maior na busca** (menos competing UI elements)
4. **Resumo financeiro sob demanda** (accordion, não sempre visível)
5. **Atalhos consolidados** (single source of truth para teclado)

---

## Roadmap de Implementação

**Fase 1 (Quick Wins, ~2h):**
- [ ] Reduzir py-2.5 → py-1.5 em TopBar
- [ ] Remover linha data/hora do Header
- [ ] Remover badge Operador

**Fase 2 (Médio, ~2h):**
- [ ] Remover LanguageToggle (se config permite)
- [ ] Reduzir logo tamanho
- [ ] Consolidar atalhos em novo componente

**Fase 3 (Polimento, ~1.5h):**
- [ ] Accordion no Resumo Financeiro
- [ ] Testes responsividade + acessibilidade
- [ ] Validação com operadores

---

## Notas Importantes

- **Operador:** Remover badge libera espaço. Se crítico que apareza, deixar em `CaixaPdvOperadorTabs` como info do turno.
- **Idioma:** Se cada loja usa 1 idioma, remover toggle economiza espaço. Se cada operador escolhe, manter (mas em settings, não na barra).
- **Data/Hora:** Já aparece no relógio da máquina e na barra da OS. Remover evita duplicação.
- **Teste com usuários:** Após implementar, validar com operadores reais se acham intuitivo e ágil.

