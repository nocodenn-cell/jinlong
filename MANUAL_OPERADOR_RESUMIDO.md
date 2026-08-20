# Manual do Operador — Referência Rápida

**Imprima e cole ao lado da tela do PDV.**

---

## Tela Principal (PDV)

```
┌─ JĪNLÓNG PDV ─────────────────────────┐
│ [Buscar produto ou código]             │ ← Digite aqui ou escaneia código
│                                         │
│ ┌─ CARRINHO ─────────────────────────┐ │
│ │ Produto A          1x    R$ 29.90  │ │
│ │ Produto B          2x    R$ 14.90  │ │
│ │ [desconto: -R$ 5.00]                │ │
│ └─────────────────────────────────────┘ │
│                                         │
│           🟢 FINALIZAR (R$ 59.70)       │ ← Clique aqui para pagar
└─────────────────────────────────────────┘
```

---

## Passo-a-passo de uma Venda

### 1️⃣ **Adicionar Produtos**

- **Opção A:** Escaneia código de barras (gun ou app)
- **Opção B:** Digita nome no campo "Buscar produto"
- **Opção C:** Digita código manualmente

**Resultado:** Produto aparece no carrinho

---

### 2️⃣ **Verificar Preços**

- Olha a coluna "Valor unitário" de cada linha
- Se o preço está **em amarelo** = foi aplicado desconto automático (bem-vindo!)
- Se o preço está **vermelho ou ilegível** = avisa o gerente

---

### 3️⃣ **Corrigir Quantidade**

Clica no **número** de quantidade (ex.: "1x"):
- Digita novo número
- Teclado `Enter` confirma

**Resultado:** Total atualiza sozinho

---

### 4️⃣ **Remover Produto**

Clica no **X** na linha do produto

**Resultado:** Produto sai; total recalcula

---

### 5️⃣ **Aplicar Desconto (Gerente)**

Se o gerente autorizar desconto maior:

1. Clica em "Descontos" (amarelo, embaixo)
2. Insere percentual (ex.: 10%)
3. Digita **senha do gerente**
4. Confirma

**Resultado:** Desconto aparece no carrinho

---

### 6️⃣ **Pagar (Finalizar Venda)**

Clica no **botão azul** "FINALIZAR"

**Modal abre:**

```
┌─ FINALIZAR VENDA ──────────────────┐
│ Total: R$ 59.70                    │
│                                    │
│ Forma de pagamento:                │
│  ☐ DINHEIRO                        │
│  ☐ PIX                             │
│  ☐ CARTÃO DÉBITO                   │
│  ☐ CARTÃO CRÉDITO                  │
│                                    │
│ [  Troco / Valor ]                 │
│                                    │
│           ✅ CONFIRMAR             │
└────────────────────────────────────┘
```

**Seleciona forma de pagamento:**
- DINHEIRO: Cliente paga em notas
- PIX: Você gera QR code no app da loja
- CARTÃO: Máquina de cartão (máquina faz tudo)

**Digita valor de pagamento** (se não for exato):
- Teclado numérico → Enter

**Clica ✅ CONFIRMAR**

**Resultado:** 🟢 "Venda finalizada!" → Comprovante impresso (térmica)

---

## Situações Comuns

### ❌ **"Produto não encontrado"**
→ Verifica código de barras (errado?)  
→ Pergunta para gerente se produto está cadastrado  
→ Se precisa cadastrar rápido, clica "+ Cadastro rápido"

---

### ❌ **"Erro ao finalizar"**
**Mensagem vermelha aparece → anota exatamente o que diz**

Opções:
1. Tira um item do carrinho e tenta novamente
2. Muda forma de pagamento
3. Se persistir → **liga para o gerente / suporte**

---

### ❌ **"Estoque insuficiente"**
→ Cliente quer 5, mas tem só 3  
→ Você reduz quantidade para 3 ou oferece produto alternativo

---

### ❓ **"O cliente quer parcelar ou desconto"**
→ **NÃO é pelo PDV na hora**  
→ Fala com o gerente ANTES de finalizar

---

## Teclas de Atalho

### 🎯 **Venda**
| Atalho | O que faz |
|--------|-----------|
| **F4 / F9** | Finalizar venda (sempre disponível) |
| **F8** | Novo cupom / Limpar carrinho (caixa aberto) |

### 🔍 **Navegação**
| Atalho | O que faz |
|--------|-----------|
| **F1** | Abrir ajuda (lista completa de atalhos) |
| **F2 / Ctrl+B** | Buscar produto |
| **Alt+Z** | Ir para aba de produtos |
| **Alt+B / Alt+C** | Ir para método de pagamento |
| **F3** | Consulta rápida / Operações |
| **F6** | Fechar caixa (fim do dia) |

### ⚙️ **Operações**
| Atalho | O que faz |
|--------|-----------|
| **Ctrl+Shift+S** | Suprimento (caixa aberto) |
| **Ctrl+Shift+R** | Sangria (caixa aberto) |
| **F12** | Reimprimir recibo (após finalizar venda) |

### ✏️ **Edição**
| Atalho | O que faz |
|--------|-----------|
| **Ctrl+Z** | Desfazer remoção (item removido do carrinho) |
| **Enter** no campo de busca | Adiciona produto |
| **Enter** no campo de valor | Confirma desconto / movimento |
| **Enter** no modal de pagamento | Finaliza venda (se valor OK) |
| **Esc** | Fecha modal / Cancela ação |

**💡 Dica:** Pressione **F1** no PDV para ver a lista completa atualizada com seus atalhos!

---

## Movimentações de Caixa (Sangria e Suprimento)

### 💰 **Sangria** (tirar dinheiro do caixa)
- **Quando:** retirada para depósito, pagamento de fornecedor, etc.
- **Atalho:** `Ctrl+Shift+R` ou Menu → Operações → Sangria
- **Processo:**
  1. Seleciona motivo (Troco Inicial, Pagamento, Retirada, Outro)
  2. Digita valor
  3. Se acima do limite (varia por loja), pede **senha do gerente**
  4. Confirma
  5. ✅ Recibo impresso automaticamente

### 📥 **Suprimento** (colocar dinheiro no caixa)
- **Quando:** reposição de troco, retorno de depósito, etc.
- **Atalho:** `Ctrl+Shift+S` ou Menu → Operações → Suprimento
- **Processo:**
  1. Seleciona motivo
  2. Digita valor
  3. Confirma
  4. ✅ Recibo impresso automaticamente

---

## Final do Dia

**Ao fim do expediente:**

1. ✅ Termina últimas vendas (antes das 18:00)
2. ✅ Menu "Operações" → "Fechar caixa" (ou **F6**)
3. ✅ Insere saldo físico do caixa (conta dinheiro)
4. ✅ Confirma encerramento
5. ✅ Faz logout

**Resultado:** Sistema salva tudo; você pode ir embora.

**⚠️ IMPORTANTE:** Não feche o caixa sem contar o dinheiro físico e conferir com o sistema!

---

## ☎️ Quando Ligar para Suporte

- Operador não consegue fazer login
- Página está em branco / carregando eternamente (> 30s)
- Venda não finaliza depois de 3 tentativas
- Qualquer mensagem de erro que não some

**Número:** `[NÚMERO CTO]`  
**Horário:** 9h-20h (seg-sábado), 10h-18h (domingo)

---

## 💡 Dicas de Ouro

- ✅ **Escaneia código** = mais rápido que digitar
- ✅ **Verifica preço** antes de finalizar (amarelo = desconto OK)
- ✅ **Vê o total** na tela — é grande, em preto, não pode errar
- ✅ **Desconto sempre com gerente** — sem exceção

---

**Versão:** 1.0  
**Data:** 2026-07-29  
**Impressão recomendada:** A4, laminado (resistente à umidade/tinta)
