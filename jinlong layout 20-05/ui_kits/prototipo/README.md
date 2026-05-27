# Protótipo navegável — Jīn Lóng PDV

Protótipo hi-fi navegável que cobre o restante das telas do PDV
(além das três já existentes em `ui_kits/login/`, `ui_kits/caixa/`,
`ui_kits/gerente/`).

Abra `index.html` — um único shell com sidebar à esquerda lista todas as
telas, agrupadas por surface (**PDV — Caixa** e **Painel Gerente**). Modais
e drawers são compartilhados (sangria, aprovação do gerente 印,
detalhe da venda).

## Telas

**Caixa (pdv-local)**
- Operar caixa (cart + payment expandido)
- Abertura de caixa (operador + fundo de troco + atalhos)
- Fechamento de caixa (conferência por método + sangrias + saldo final)
- Devolução / Troca (3 passos · seleção de itens · reembolso · aprovação 印)
- Pagamento — fluxo expandido (PIX QR · Cartão TEF · Dinheiro com troco)
- Recibo / Cupom (templates + opções de impressão · 80 mm)

**Gerente (pdv-importados)**
- Início (dashboard com KPIs + curva intra-dia + estoque crítico + atividades)
- Histórico de vendas (lista + drawer da venda · NFC-e · cancelar)
- Produtos (lista + ficha editável)
- Estoque (atual · entradas/saídas · contagem cíclica · ajustes)
- Clientes (lista + ficha + crediário)
- Fornecedores (cards · ficha em modal)
- Importação NF-e (drop zone · conciliação com divergências)
- Relatórios — financeiro (DRE · 30 d · composição de receita · despesas)
- Relatórios — fiscal (livros · SPED · cronograma)
- Usuários e permissões (matriz de papéis · dispositivos)
- Configurações (loja · fiscal · integrações · impressão · idioma/tema · backup)

**Modais compartilhados**
- Sangria / Suprimento (toggle, valor, motivo, observação)
- Aprovação do gerente (PIN + biometria, com 印 imperial pulsando)
- Drawer da venda (resumo + NFC-e + ações destrutivas com aprovação)

## Estrutura
```
prototipo/
  index.html           ← orquestrador (router em React state)
  prototipo.css        ← sidebar, top-context, tabela, modal, drawer, cupom, QR, numpad
  data.jsx             ← mock data realista (produtos, vendas, clientes, NF-e, financeiro)
  Shell.jsx            ← sidebar + top-context-bar + icon set
  modals.jsx           ← SangriaModal, AprovacaoGerenteModal, VendaDrawer
  caixa-screens.jsx    ← Caixa, Abertura, Fechamento
  caixa-screens-2.jsx  ← Devolução, Pagamento expandido, Recibo
  gerente-screens-1.jsx← Início, Histórico, Produtos, Estoque
  gerente-screens-2.jsx← Clientes, Fornecedores, NF-e, Financeiro
  gerente-screens-3.jsx← Fiscal, Usuários, Configurações
```

Cada arquivo de tela registra seus componentes em `window.Screen*` para
funcionar com `<script type="text/babel" src>` (escopo por arquivo).
