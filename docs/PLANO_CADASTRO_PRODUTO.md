# Plano — Tela de Cadastro de Produto

> Versão revisada com foco em redução de escopo e execução rápida.
> Princípio-guia: cadastro é **entrada de dados**, não motor de negócio.

---

## Objetivo da tela

Permitir que o operador/gerente registre um produto **em menos de 20 segundos**.

Critérios de sucesso:
- Nome + Preço → salvar → feito
- Zero decisões obrigatórias além do mínimo
- Nenhum campo bloqueia o cadastro

---

## Escopo desta fase

### Campos obrigatórios
| Campo | Tipo | Regra |
|-------|------|-------|
| Nome | texto | obrigatório, ≤ 120 chars |
| Preço de Varejo | monetário | obrigatório, > 0 |

### Campos opcionais visíveis
| Campo | Tipo | Motivo de inclusão |
|-------|------|-------------------|
| Código de barras | texto (monospace) | identidade operacional do produto |
| Origem | select (China / Brasil c/ NF) | determina status inicial (publicado vs draft) — regra de negócio já existente |
| Preço de Custo | monetário | útil para margem futura, sem lógica ativa agora |
| Preço de Atacado | monetário | fundamental ao MVP — loja atacarejo |
| Qtd. gatilho atacado | número inteiro | par obrigatório do preço atacado quando preenchido |
| Categoria | select | organização, sem regra de negócio |

### Ações disponíveis
- **Salvar** — cria produto e fecha o modal
- **Cancelar** — descarta e fecha
- *(Futuro)* **Salvar e continuar** — cria e reabre limpo para próximo produto

### Organização visual (seções)
```
┌─────────────────────────────────┐
│  Identificação                  │
│    Nome *                       │
│    Código de barras  |  Origem  │
├─────────────────────────────────┤
│  Preços                         │
│    Varejo *  |  Atacado  |  Qtd │
│    Custo                        │
├─────────────────────────────────┤
│  Organização  (se há categorias)│
│    Categoria                    │
└─────────────────────────────────┘
       [Cancelar]       [Salvar]
```

---

## O que NÃO entra nesta fase

| Item removido | Motivo |
|--------------|--------|
| Autocomplete de produtos | Complexidade prematura; 0 uso no fluxo mínimo |
| Validação automática de código de barras | Formato variável (EAN-8, EAN-13, interno); validação cria fricção sem ganho real |
| Regras de margem / promoções | Motor de precificação é feature separada, não formulário |
| NCM / CFOP / CST inteligente | Fiscal é módulo próprio — não pertence ao cadastro rápido |
| Seção Fiscal no modal | Remover do modal atual; NCM pode ser editado na tela de detalhes futura |
| `permitir_abaixo_custo` checkbox | Regra de negócio; pertence a configurações do produto, não ao cadastro inicial |
| Histórico de alterações | Feature de auditoria — fase futura |
| Validações cruzadas de preço | Sem alertas de "atacado > varejo" ou similares no cadastro |

---

## Estado atual do código vs. plano

O `NovoProdutoModal.tsx` (306 linhas) já está próximo do correto. Dois ajustes pontuais alinhados com este plano:

### 1. Remover seção Fiscal (NCM) do modal de criação

O campo NCM não é necessário no cadastro rápido. Produtos sem NCM funcionam normalmente no PDV. Quando necessário, NCM deve ser editado em uma tela de detalhes do produto (futura).

**Ação:** remover bloco `{/* NCM (fiscal) */}` do modal (linhas 255–279 do arquivo atual).

**Campo no banco:** mantém coluna `ncm` na tabela `produtos` — apenas não exposto no cadastro inicial.

### 2. Remover `permitirAbaixoCusto` do modal de criação

O checkbox "Permitir venda abaixo do custo" é uma política de negócio, não um dado do produto. Deve ser configurável em edição/detalhes, não no cadastro inicial (onde o custo muitas vezes ainda é desconhecido).

**Ação:** remover estado `permitirAbaixoCusto` e o bloco do checkbox (linhas 243–252) do modal.

---

## O que permanece inalterado

- `criarProduto` server action — sem mudança
- Validação de nome e preço varejo — mantida
- Auto-focus no nome ao abrir — mantido
- Submit com Enter — mantido
- Lógica de origem (china_manual / brasil_nf) — mantida (determina status inicial)
- Preço atacado + qtd gatilho — mantidos (core do negócio de importados)
- Categoria opcional — mantida

---

## Fases futuras (fora do escopo atual)

Itens deliberadamente adiados:

- **Tela de detalhes do produto** — NCM, CFOP, CST, imagem, localização na prateleira, observações
- **Permitir abaixo do custo** — configuração na tela de detalhes
- **Histórico de alterações** — auditoria de edições
- **Autocomplete / busca por similaridade** — prevenção de duplicatas
- **Validação de barcode** — GS1 check digit, formato EAN
- **Motor de precificação** — regras de margem, promoções, preços por cliente
- **Automação fiscal** — sugestão de NCM, CFOP automático por origem

---

## Resumo executivo

**Cadastro atual:** 9 campos + 1 seção fiscal = ligeiramente acima do mínimo.

**Cadastro revisado:** 7 campos em 3 seções = entrada rápida, sem fricção, sem regras escondidas.

O formulário deve ser burro por design. Inteligência de domínio fica no motor de preços (`shared-core/productEngine`) e nas regras de publicação — não no formulário de entrada.
