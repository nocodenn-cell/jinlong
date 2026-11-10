# P0-03 — Checklist smoke presencial (loja Matriz)

**Status:** roteiro pronto · execução real = **PENDENTE** (requer autorização + presença).  
**Alvo:** `https://pdv-importados.vercel.app` (ou host da loja).  
**Proibido nesta missão de preparação:** vendas/cancelamentos reais, testes destrutivos, dados de clientes reais nos anexos do Git.

Complementa [`CHECKLIST_PILOTO_CLIENTE_2026-08-24.md`](../../CHECKLIST_PILOTO_CLIENTE_2026-08-24.md).

---

## Pré-condições

| # | Item | OK? |
|---|---|---|
| 0.1 | Autorização escrita do dono para smoke com SKUs/caixa de prova | |
| 0.2 | Internet ≥ 10 Mbps; notebook/tablet da loja | |
| 0.3 | Contas sintéticas OPERADOR + GERENTE (e-mail real, sem `.test`) | |
| 0.4 | Produtos de prova com GTIN/código (varejo + faixa atacado) | |
| 0.5 | Leitor, impressora térmica (se usados no dia a dia) | |

---

## Bloco A — Auth e permissões

| # | Passo | Evidência esperada | Resultado |
|---|---|---|---|
| A1 | Login OPERADOR | Redireciona `/caixa` | |
| A2 | OPERADOR tenta URL `/admin/catalogo` | Bloqueado / redirect | |
| A3 | Login GERENTE | Acessa `/admin/*` | |
| A4 | Troca idioma PT ↔ ZH (login + PDV) | Labels coerentes; sem chave crua | |

## Bloco B — PDV (consulta e venda)

| # | Passo | Evidência | Resultado |
|---|---|---|---|
| B1 | Busca produto por nome | Lista legível (fonte ≥ 14px) | |
| B2 | Bip / leitor código existente | Item no cupom | |
| B3 | Código inexistente | Mensagem clara; **sem** cadastro no PDV | |
| B4 | Varejo (qtd abaixo do atacado) | Preço varejo | |
| B5 | Atacado (qtd ≥ faixa) | Preço atacado | |
| B6 | Multi-pagamento DINHEIRO+PIX | Troco só dinheiro | |
| B7 | Cartão (débito/crédito) | Fecha sem troco indevido | |
| B8 | Comprovante / reimpressão F12 | Modal ou impressão | |
| B9 | F5 a meio do cupom (se autorizado) | Recuperação / idempotência | |
| B10 | Rede off→on (airplane mode 10s) | Mensagem clara; sem duplicar venda | |

## Bloco C — Caixa

| # | Passo | Evidência | Resultado |
|---|---|---|---|
| C1 | Abrir caixa | Status ABERTO | |
| C2 | Sangria abaixo do limite | Movimento + recibo | |
| C3 | Suprimento | Movimento | |
| C4 | Fechar caixa | Fechamento; histórico `/admin/caixas` | |

## Bloco D — Admin / estoque / AR

| # | Passo | Evidência | Resultado |
|---|---|---|---|
| D1 | Venda aparece em `/admin/vendas` | ID anotado (sem PII) | |
| D2 | Estoque baixou no produto de prova | Kardex ou saldo | |
| D3 | Conta a receber (se fiado de prova) | Título coerente | |
| D4 | Cancelamento venda de **prova** (GERENTE) | Status cancelada; estoque volta | |

## Bloco E — Ergonomia

| # | Item | OK? |
|---|---|---|
| E1 | Totais e botões principais legíveis a 1 m | |
| E2 | Atalhos F2/F4/F9 documentados no treino | |
| E3 | Sem erro técnico em chinês (caracteres quebrados) | |

---

## Critério de aprovação do smoke

- Todos os itens A–D marcados PASS **ou** falha classificada (rede/periférico/produto) com ID.  
- Falha reproduzível de venda/estoque/caixa → **hotfix**, não “aceite”.  
- Anexos: checklist assinado **fora do Git**; IDs de venda/caixa sem PII no PR.

**Estado atual da missão de código:** IMPLEMENTADO (roteiro) · execução = PENDENTE / NÃO VERIFICADO.
