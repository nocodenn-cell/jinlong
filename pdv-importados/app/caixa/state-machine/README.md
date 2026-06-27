# PDV State Machine

Máquina de estados centralizada para o PDV (Ponto de Venda). Toda a inteligência de fluxo fica aqui, os componentes são apenas renderizadores.

## Arquitetura

```
usePDVStateMachine
├── currentState: PDVState
├── context: PDVSaleContext
├── stateConfig: PDVStateConfig
├── actions: {...}
└── canTransitionTo(state): boolean
```

## Estados

```
CAIXA_FECHADO
    ↓ (abrirCaixa)
CAIXA_ABERTO
    ↓ (novoCupom)
CUPOM_VAZIO
    ↓ (adicionarProduto)
ADICIONANDO_ITENS ←──┐
    ↓ (selecionarCliente) │
CLIENTE_SELECIONADO ──┴─→ (adicionarProduto)
    ↓ (pronto)
PRONTO_PARA_PAGAMENTO
    ↓ (irParaPagamento)
PAGAMENTO
    ↓ (receberPagamento)
EMITINDO_DOCUMENTO
    ↓ (vendaFinalizada)
VENDA_FINALIZADA
    ↓ (novoCupom)
CUPOM_VAZIO
```

## Uso

### Inicializar

```typescript
const pdv = usePDVStateMachine(PDVState.CAIXA_ABERTO, {
  operadorId: "user-123",
  operadorLabel: "João",
  caixaId: "caixa-01",
})
```

### Acessar Estado

```typescript
// Estado atual
console.log(pdv.currentState) // PDVState.CUPOM_VAZIO

// Contexto da venda
console.log(pdv.context.itens) // []
console.log(pdv.context.totalLiquido) // 0

// Configuração do estado
console.log(pdv.stateConfig.autoFocus) // "busca"
console.log(pdv.stateConfig.enabledShortcuts) // Set(["F1", "F2", ...])
```

### Executar Ações

```typescript
// Adicionar produto
pdv.adicionarProduto({
  produtoId: "prod-123",
  nome: "Coca Cola 2L",
  preco: 12.00,
  quantidade: 1,
})
// Estado: CUPOM_VAZIO → ADICIONANDO_ITENS

// Selecionar cliente
pdv.selecionarCliente({
  clienteId: "cli-456",
  nome: "Maria Silva",
  cpf: "123.456.789-00",
})
// Estado: ADICIONANDO_ITENS → CLIENTE_SELECIONADO

// Pronto para pagamento
pdv.pronto()
// Estado: CLIENTE_SELECIONADO → PRONTO_PARA_PAGAMENTO

// Ir para pagamento (tela inteira)
pdv.irParaPagamento()
// Estado: PRONTO_PARA_PAGAMENTO → PAGAMENTO

// Receber pagamento
pdv.receberPagamento([
  { formaPagamento: "DINHEIRO", valor: 250.00 }
])
// Estado: PAGAMENTO → EMITINDO_DOCUMENTO → VENDA_FINALIZADA
```

### Verificar Ações Disponíveis

```typescript
const actions = usePDVAvailableActions(pdv)
// {
//   canAddProduct: true,
//   canRemoveProduct: false,
//   canSelectClient: true,
//   canFinalize: true,
//   ...
// }

if (actions.canAddProduct) {
  // Renderizar input de busca
}
```

### Verificar Shortcuts Ativos

```typescript
const shortcuts = usePDVActiveShortcuts(pdv)
// {
//   shortcuts: ["F1", "F2", "F3", ...],
//   autoFocus: "busca",
//   defaultTab: "produto"
// }

// Registrar listeners de teclado apenas para shortcuts ativos
shortcuts.shortcuts.forEach(key => {
  registerKeyListener(key)
})
```

## Como Usar nos Componentes

### Antes (com condicionais espalhados)

```typescript
function CaixaPageClient({ ... }) {
  const [abaPdvAtiva, setAbaPdvAtiva] = useState("produto")
  const [visibleTabsPdv, setVisibleTabsPdv] = useState(new Set(["produto"]))
  const [itens, setItens] = useState([])
  const [processando, setProcessando] = useState(false)

  const handleAdicionarProduto = (produto) => {
    if (itens.length === 0 && processando) return // Condição 1
    const novoItens = [...itens, produto]
    setItens(novoItens)
    if (novoItens.length === 1) {
      setAbaPdvAtiva("produto")
      setVisibleTabsPdv(new Set(["produto"]))
    }
  }

  // Muitos condicionais espalhados...
}
```

### Depois (com state machine)

```typescript
function CaixaPageClient({ ... }) {
  const pdv = usePDVStateMachine(PDVState.CAIXA_ABERTO, {
    operadorId: userId,
    operadorLabel: operadorLabel,
  })

  const handleAdicionarProduto = (produto) => {
    pdv.adicionarProduto(produto)
    // Transição automática! Sem ifs/elses
  }

  // Renderizar apenas com base em pdv.stateConfig
  return (
    <>
      {pdv.stateConfig.visibleComponents.busca && <SearchBar />}
      {pdv.stateConfig.visibleComponents.carrinho && <CartList />}
    </>
  )
}
```

## Benefícios

✅ **Centralização**: Toda a lógica em um lugar  
✅ **Previsibilidade**: Estados e transições bem definidas  
✅ **Testabilidade**: Fácil testar cada estado e transição  
✅ **Escalabilidade**: Adicionar novas funcionalidades sem modificar lógica existente  
✅ **Debugging**: Logs de transições ajudam a entender o fluxo  

## Próximas Funcionalidades

Com essa base, é fácil adicionar:

- **Motor comercial**: Regras de desconto/promoção em `updateContext`
- **Venda em atacado**: Indicadores de preço no estado `ADICIONANDO_ITENS`
- **Fidelidade**: Crédito do cliente disponível na aba `CLIENTE_SELECIONADO`
- **Sugestões inteligentes**: Disparadas automaticamente em transições
- **Múltiplas formas de pagamento**: Totalmente isoladas no estado `PAGAMENTO`

## Debug

Para ver o log de transições:

```typescript
const pdv = usePDVStateMachine(...)
// Toda vez que há transição, um log aparece no console:
// [PDV StateMachine] CUPOM_VAZIO → ADICIONANDO_ITENS (Primeiro produto adicionado)
```
