# Checklist — smoke máquina da loja (Jinlong)

> Executar **no PDV físico** após deploy. Itens marcados **[HW]** exigem hardware/rede da loja — não podem ser PASS no CI/cloud.

| # | Item | Como | Resultado |
|---|------|------|-----------|
| 1 | Inicialização | Boot OS → abrir app/PDV até tela de login | ☐ |
| 2 | Login | Operador + senha; perfil correto | ☐ |
| 3 | Resolução / UI | Layout legível; sem corte de botões críticos | ☐ |
| 4 | Performance | Abrir caixa < ~5s após login (subjetivo loja) | ☐ |
| 5 | Rede | API/Supabase alcançável; falha exibe erro claro | ☐ |
| 6 | **[HW]** Leitor código de barras | Bipar produto existente → entra no carrinho | ☐ |
| 7 | **[HW]** Teclado / atalhos | Atalhos de pagamento e quantidade funcionam | ☐ |
| 8 | Venda dinheiro | Venda simples → total explicável | ☐ |
| 9 | **[HW]** PIX / cartão | Fluxo da loja (QR/TEF se houver) | ☐ |
| 10 | Split / parcial | Dois meios ou parcial + CR se usado na loja | ☐ |
| 11 | Suprimento / sangria | Movimentação registra e altera E(c) dinheiro | ☐ |
| 12 | Cancelamento / devolução | Conforme perfil autorizado | ☐ |
| 13 | Fechamento por forma | Recibo: dinheiro = E(c); PIX/cartão = Registrado Jinlong | ☐ |
| 14 | **[HW]** Impressora | Cupom/recibo imprime | ☐ |
| 15 | Offline (se suportado) | Comportamento documentado; sem venda fantasma | ☐ |
| 16 | Recuperação interrupção | Matar app mid-venda → retoma/estado seguro | ☐ |

**Responsável loja:** _______________  
**Data:** _______________  
**Build/versão:** _______________  

Não marcar `STORE_SMOKE_PASS` sem os itens **[HW]** relevantes à operação real.
