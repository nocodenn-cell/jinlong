# Dragon UI — Operational UX Rules

> Regras baseadas em comportamento real do PDV operacional.
> Não são preferências estéticas — são contratos de UX que protegem o operador de caixa.

---

## 1. Estados de Loading

### Regra: Todo submit tem loading visível

```tsx
// ✅ obrigatório
<Button
  disabled={loading}
  aria-busy={loading}
  className="app-btn-accent"
>
  {loading ? <DragonOuroLoader iconClassName="h-4 w-4" /> : "Finalizar Venda"}
</Button>
```

**Por quê:** Operador de caixa em momento de pressão (fila) CLICA DUAS VEZES se não vê feedback imediato. Duplicar uma venda ou sangria é erro crítico.

### Regra: Loading de página usa `<DragonLoadingState>`, nunca texto "Carregando..."

```tsx
// ✅
if (loading) return <DragonLoadingState label="Carregando caixa..." />

// ❌ nunca
if (loading) return <p>Carregando...</p>
```

---

## 2. Estados Vazios

### Regra: Toda lista vazia usa `<DragonEmptyState>`, nunca texto solto

```tsx
// ✅
if (itens.length === 0) {
  return <DragonEmptyState icon={<ShoppingCart />} title="Carrinho vazio" size="compact" />
}

// ❌ nunca
if (itens.length === 0) return <p className="text-center text-gray-400">Nenhum item</p>
```

**Por quê:** Texto solto sem estrutura não transmite hierarquia visual. O operador lê a tela em 0.5s — estrutura importa.

---

## 3. Feedback de Ações

### Regra: Feedback inline usa `<DragonFeedbackBanner>`, nunca `alert()` ou toast genérico

```tsx
// ✅ para erros recuperáveis inline
<DragonFeedbackBanner variant="error">
  Desconto acima do limite. Requer autorização do gerente.
</DragonFeedbackBanner>

// ✅ para confirmações efêmeras (desaparecem após ~4s)
// Toast via useCaixaMensagens — já tem timer gerenciado
```

**Hierarquia de urgência:**
| Situação | Componente | Variante |
|---|---|---|
| Operação bem-sucedida | Toast (useCaixaMensagens) | — |
| Aviso não-bloqueante | DragonFeedbackBanner | warning |
| Erro recuperável | DragonFeedbackBanner | error |
| Erro crítico / bloqueador | Modal de confirmação | — |

---

## 4. Seções Desabilitadas

### Regra: Bloco inteiro bloqueado usa `<DragonDisabledSection>`, nunca `opacity-50` inline

```tsx
// ✅
<DragonDisabledSection disabled={!caixaAberto}>
  <CaixaOperacoesButtons />
</DragonDisabledSection>

// ❌
<div className={`${!caixaAberto ? 'opacity-50 pointer-events-none' : ''}`}>
  <CaixaOperacoesButtons />
</div>
```

**Por quê:** `DragonDisabledSection` aplica `aria-disabled` semântico além da opacidade.

---

## 5. Botões — Hierarquia Obrigatória

| Ação | Classe / Variante | Altura |
|---|---|---|
| Ação primária (finalizar, confirmar, adicionar) | `.app-btn-accent` | `h-14` (PDV) · `h-11` (modal) |
| Ação secundária (cancelar, fechar, voltar) | `variant="secondary"` | igual ao primário do contexto |
| Ação destrutiva (cancelar venda, excluir) | `.app-btn-danger` | igual ao primário do contexto |
| Autorização gerente | `border-amber-500/40 bg-amber-500/10 text-amber-400` | `h-11` |

**Nunca misturar alturas diferentes no mesmo row.**

### Regra: Botão com confirmação pendente mostra estado loading, não desaparece

```tsx
// ✅
<Button disabled={enviando} aria-busy={enviando} className="app-btn-accent">
  {enviando ? <DragonOuroLoader iconClassName="h-4 w-4" /> : "Confirmar"}
</Button>

// ❌ — nunca remover o botão enquanto processa
{!enviando && <Button>Confirmar</Button>}
```

---

## 6. Valores Monetários

### Regra: Todo valor monetário usa `tabular-nums`

```tsx
// ✅
<span className="font-bold tabular-nums text-jl-accent">R$ 1.250,00</span>

// ❌
<span className="font-bold text-amber-400">R$ 1.250,00</span>
```

**Por quê:** `tabular-nums` evita que os dígitos "pulem" ao atualizar em tempo real (total do carrinho, saldo do caixa).

### Regra: Total principal do PDV usa escala `text-2xl sm:text-3xl font-extrabold`

```tsx
// ✅ — total da venda
<p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-jl-accent">
  {formatCurrency(total)}
</p>
```

---

## 7. Ícones

### Regra: Ícone decorativo tem `aria-hidden`, ícone com significado tem `title`

```tsx
// ✅ decorativo
<ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />

// ✅ com significado standalone
<AlertTriangle title="Atenção: limite de desconto atingido" className="h-5 w-5" />
```

### Regra: Ícone dentro de flex container tem `shrink-0`

```tsx
// ✅
<div className="flex items-center gap-2">
  <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
  <span>Carrinho</span>
</div>
```

---

## 8. Modais / Diálogos

### Regra: Modal de confirmação destrutiva mostra o que será destruído

```tsx
// ✅
<p>Cancelar a venda de <strong>{vendaId}</strong>?</p>
<p className="text-sm text-jl-fg-3">Esta ação não pode ser desfeita.</p>

// ❌
<p>Confirmar cancelamento?</p>
```

### Regra: Modal de autorização gerente deixa claro quem precisa agir

```tsx
// ✅
<p>Requer senha do <strong>gerente</strong> para desconto de {pct}%</p>
```

---

## 9. Foco e Teclado (PDV Operacional)

### Regra: Campo de busca recebe foco automático ao abrir PDV

O operador de caixa trabalha quase exclusivamente com teclado físico (leitor de código de barras). O campo de busca DEVE estar focado ao:
- Abrir a página `/caixa`
- Finalizar uma venda (novo cupom)
- Fechar qualquer modal

### Regra: Confirmação de modal com Enter

Botão primário do modal deve responder a `Enter`. Usar `type="submit"` em form ou `autoFocus` no botão de confirmação.

---

## 10. Prop Churn — Anti-padrões

### Regra: Nunca passar objeto/array inline como prop de componente memoizado

```tsx
// ❌ — cria novo objeto a cada render, destrói memo
<CaixaFooter config={{ showDiscount: true, maxItems: 10 }} />

// ✅ — objeto estável fora do render ou via useMemo
const footerConfig = useMemo(() => ({ showDiscount: true, maxItems: 10 }), [])
<CaixaFooter config={footerConfig} />
```

### Regra: Callbacks passados como prop usam useCallback

```tsx
// ❌
<CaixaConfirmModal onConfirmar={() => handleConfirmar(id)} />

// ✅
const handleConfirmarCallback = useCallback(() => handleConfirmar(id), [id, handleConfirmar])
<CaixaConfirmModal onConfirmar={handleConfirmarCallback} />
```

---

## 11. Acessibilidade Mínima

| Elemento | Requisito |
|---|---|
| Botão com só ícone | `aria-label` obrigatório |
| Botão em loading | `disabled` + `aria-busy={true}` |
| Lista de itens | `role="list"` ou semântica HTML |
| Modal aberto | `role="dialog"` + `aria-modal="true"` (shadcn Dialog já faz) |
| Toast/notificação | `role="status"` (não-urgente) ou `role="alert"` (urgente) |
| Ícone decorativo | `aria-hidden` |
