# Runbook — Primeiro Dia do Cliente (1 página)

Para operador e gerente na loja piloto. Suporte Jinlong: preencher contato abaixo.

**Contato suporte:** _______________  
**URL do sistema:** _______________

## Antes de abrir a loja

1. Confirmar login de cada operador em `/login`.
2. Gerente: conferir catálogo em `/admin/catalogo` (produtos publicados).
3. Operador: abrir caixa em `/caixa` (troco inicial conforme treinamento).

## Fluxo do operador (caixa)

| Passo | Ação |
|-------|------|
| 1 | Buscar produto (nome ou código de barras) |
| 2 | Conferir carrinho e totais (varejo/atacado automático) |
| 3 | Desconto acima do limite → chamar gerente (token) |
| 4 | Pagamento: uma ou várias formas (dinheiro, PIX, cartão) |
| 5 | Finalizar (F4) — aguardar confirmação |
| 6 | Sangria/suprimento só quando necessário |
| 7 | Ao fim do turno: fechar caixa (F6) |

## Fluxo do gerente

| Tarefa | Onde |
|--------|------|
| Ver vendas do dia | `/admin/vendas` |
| Cadastrar produto | `/admin/catalogo` → Novo |
| Importar planilha | `/admin/catalogo` → Importar produtos |
| Ajustar estoque | `/admin/estoque` |
| Contas a pagar | `/gerente/financeiro/contas-pagar` |
| Auditoria de eventos | `/admin/auditoria` |

## Se algo der errado

| Sintoma | O que fazer |
|---------|-------------|
| Não consegue logar | Verificar e-mail/senha; perfil OPERADOR ou GERENTE |
| Venda não finaliza | Anotar horário + mensagem na tela; não repetir clique — chamar suporte |
| Estoque insuficiente | Gerente ajusta em Estoque ou repõe mercadoria |
| Tela em branco / erro | Recarregar (F5); se persistir, screenshot + suporte |
| Valor divergente no painel | Gerente anota venda ID; suporte roda gate financeiro |

## O que NÃO está no piloto D0

- Venda em espera (hold)
- Venda fiado no PDV
- NFC-e real (se contrato for mock)
- App desktop offline

## Fim do dia

1. Todos os caixas fechados com conferência.
2. Gerente confere `/admin/vendas` vs caixa físico.
3. Qualquer divergência → ticket antes do dia seguinte.
