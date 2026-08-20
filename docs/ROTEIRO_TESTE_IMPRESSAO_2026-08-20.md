# Roteiro de Teste — Recibos de Impressão (PR #311/#312)

**Objetivo:** validar manualmente, em navegador real, os fluxos de impressão implementados nas últimas 24–48h antes do treinamento do cliente #1 (2026-08-21).

## ✅ ATUALIZAÇÃO 2026-08-20 (noite) — 5 de 5 recibos validados ao vivo, com dados reais

Depois da primeira passada (só leitura de código), os fluxos foram de fato **executados** em um ambiente Supabase local isolado (Docker, projeto `jinlong` local, zero contato com produção), com login real, uma venda real, e as 5 operações de recibo disparadas ponta a ponta pelo navegador. Resultado: **todos os 5 recibos renderizaram corretamente, com dados completos, sem placeholders e sem erros de impressão.**

| Recibo | Resultado |
|---|---|
| Cupom de venda | ✅ OK — item, total, pagamento corretos; sistema anti-venda-duplicada (P0-1) disparou e foi resolvido corretamente sem duplicar a venda |
| Suprimento | ✅ OK — saldo antes/depois, motivo, valor, tudo correto |
| Sangria | ✅ OK — matemática confere (R$50 − R$30 = R$20) |
| Fechamento de caixa | ✅ OK — **nome da loja "Matriz" resolveu corretamente** (não caiu no fallback "—" que eu tinha sinalizado como risco) |
| Devolução | ✅ OK — **lista de itens aparece completa**, confirmando que a migration `20260820120000` funciona corretamente quando aplicada |
| Cancelamento | ✅ OK tecnicamente (dados corretos no recibo) — mas revelou um **achado real, ver abaixo** |

### ✅ Achado corrigido: risco de reembolso duplicado (era 🔴, corrigido no mesmo dia)

Ao testar cancelamento **depois** de uma devolução parcial na mesma venda (caso de teste deliberadamente adverso), o sistema permitiu cancelar a venda inteira e gerou um recibo de cancelamento com "Total estornado: R$89,90" — o **mesmo valor já estornado na devolução anterior**. A causa raiz estava em `cancelar_venda_transacional` (RPC no banco, não em `cancelarVendaGerenteAction`), que não descontava devoluções prévias nem no valor estornado nem na reposição de estoque.

**Corrigido e testado** — ver [docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md](DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md) para a análise completa, a migration aplicada e a evidência de teste (venda R$4.000 → devolve R$2.000 → cancela → agora estorna corretamente só R$2.000, estoque e caixa batendo). **Pendência restante: aplicar a migration em produção** — ainda não aplicada, exige decisão explícita separada.

### Não validado

`/admin/relatorios` (impressão de relatório) ficou travado em "Carregando…" de forma reproduzível no ambiente local, sem erro de console ou de servidor visível — pode ser flakiness do Turbopack em modo dev (o mesmo padrão apareceu e se resolveu sozinho em `/caixa` e `/admin/vendas` durante os testes) ou um problema real. Não foi possível confirmar qual dos dois em tempo hábil. Recomendo um teste manual rápido desta tela antes de confiar nela amanhã.

---

## Metodologia original (primeira passada, só leitura de código)

Código lido integralmente a partir de `origin/main` @ `3ccd7741` (worktree de teste isolado, sem afetar produção). O app foi instalado do zero (`npm ci`) e o servidor de desenvolvimento subiu com sucesso (`✓ Ready in 34.6s`), sem erros de console, servindo a tela de login normalmente — isso **refutou** a suspeita registrada em `docs/VALIDACAO_COMPROVANTES_IMPRESSAO_2026-08.md` de que "o app falha ao compilar": o problema anterior era o ambiente de dev sem `node_modules` completo, não um bug de código. Nesta primeira passada, login real e fluxos que gravam dados não foram executados. **Isso foi superado pela atualização acima** — todos os fluxos foram executados de verdade num Supabase local isolado.

---

## 1. Componentes e páginas que acionam impressão

| # | Recibo | Componente | Disparado a partir de | Mecanismo de impressão |
|---|---|---|---|---|
| 1 | Cupom de venda | `app/caixa/CaixaReciboModal.tsx` | `app/caixa/CaixaPageClient.tsx`, ao finalizar uma venda | Térmica (WebUSB, se suportado) **ou** janela do navegador (iframe oculto + `window.print()`) |
| 2 | Fechamento de caixa | `app/caixa/CaixaFechamentoReciboModal.tsx` | `CaixaPageClient.tsx` → `executarFecharCaixa()`, após confirmar valor contado (carrinho precisa estar vazio) | Janela do navegador (iframe oculto) |
| 3 | Sangria / suprimento | `app/caixa/CaixaMovimentacaoReciboModal.tsx` | `app/caixa/hooks/useCaixaStatusMovimentacoes.ts`, após submeter `CaixaMovimentacaoModal` | Janela do navegador (iframe oculto) |
| 4 | Cancelamento de venda | `app/gerente/vendas/VendaCancelamentoReciboModal.tsx` | `app/gerente/vendas/VendaCancelarModal.tsx`, rota `/gerente/vendas` | Janela do navegador (iframe oculto) |
| 5 | Devolução / troca | `app/gerente/vendas/VendaDevolucaoReciboModal.tsx` | `app/gerente/vendas/VendaDevolucaoModal.tsx` → `devolverOuTrocarVenda.impl.ts` | Janela do navegador (iframe oculto) |
| 6 | Relatórios (admin) | `app/admin/relatorios/_components/RelatoriosContent.tsx` | Botão "Imprimir" na página `/admin/relatorios` | `window.print()` direto na página, com CSS `@media print` escondendo sidebar (`styles/admin-v2.css:363-377`) |

Suporte auxiliar: `hooks/useThermalPrinter.ts` + `lib/thermal-printer/escpos.ts` (impressão térmica direta, só para o cupom de venda, item 1).

Todos os itens 2–5 usam exatamente o mesmo padrão de impressão (iframe oculto injetado no DOM + `win.print()`), copiado do cupom de venda original — ou seja, o mecanismo em si já é validado indiretamente pelo uso de produção do cupom de venda; o que **não** foi validado é a montagem de dados específica de cada tela nova.

---

## 2. Roteiro de teste manual — passo a passo por recibo

Pré-requisito comum: login com um usuário OPERADOR (itens 1–3) ou GERENTE/DONO (itens 4–6), loja com caixa configurado.

### 2.1 Cupom de venda (referência — já era usado em produção)
1. Abrir caixa, fazer 1 venda com 2+ itens, pelo menos 1 com desconto de gerente.
2. Finalizar venda → modal de recibo abre automaticamente.
3. Clicar "Imprimir" (ou "Imprimir térmica" se houver impressora USB conectada).
4. **Verificar:** nome dos itens, quantidade × preço, subtotal, desconto de produto, desconto de gerente (%), total, formas de pagamento, rodapé "não é documento fiscal".

### 2.2 Fechamento de caixa (NOVO)
1. Com o caixa aberto e o carrinho **vazio** (o botão de fechar caixa é bloqueado se houver itens no carrinho — mensagem de aviso aparece em vez do modal).
2. Informar o valor contado em dinheiro → confirmar.
3. Se a diferença entre o valor contado e o valor esperado pelo sistema for maior que R$ 5,00, um modal pedindo "motivo da diferença" aparece antes — preencher e confirmar.
4. Modal de comprovante de fechamento abre → clicar "Imprimir comprovante".
5. **Verificar:** nome da loja (se aparecer "—" no lugar do nome, é sinal de falha ao buscar o nome da loja — reportar), operador, data/hora de abertura e fechamento, saldo inicial, total de vendas recebidas (com contagem de vendas), suprimentos, sangrias, saldo do sistema, saldo contado, diferença (deve aparecer destacada em vermelho se for diferente de zero).

### 2.3 Sangria / suprimento (NOVO)
1. Com o caixa aberto, abrir o menu de sangria ou suprimento.
2. Sangria pede confirmação extra (ação sensível) antes de abrir o formulário.
3. Preencher valor e motivo → confirmar.
4. Modal de comprovante abre → clicar "Imprimir comprovante".
5. **Verificar:** tipo (sangria/suprimento) no título, saldo antes, motivo, valor (com sinal − para sangria e + para suprimento), saldo depois, nome do operador (se aplicável).
6. Repetir para o outro tipo (se testou sangria, testar suprimento também, e vice-versa) — são o mesmo componente mas vale confirmar os dois.

### 2.4 Cancelamento de venda (NOVO)
1. Login como GERENTE/DONO → `/gerente/vendas`.
2. Selecionar uma venda concluída → cancelar.
3. Informar motivo do cancelamento → confirmar.
4. Modal de comprovante de cancelamento abre → clicar "Imprimir comprovante".
5. **Verificar:** lista de itens da venda original (nome, quantidade, preço unitário, subtotal), data da venda original, forma de pagamento, total estornado, motivo, nome de quem cancelou, rodapé "comprovante interno — não é documento fiscal".
6. **Caso de risco específico:** cancelar uma venda que **já está cancelada** ou onde o usuário não tem permissão — antes desta sprint, o sistema mostrava "sucesso" mesmo quando a operação falhava no servidor (bug corrigido em `cancelarVendaGerenteAction`, PR #312). Confirmar que agora aparece uma mensagem de erro real, não um falso "sucesso".
7. **Caso de risco adicional (achado e corrigido em 20/08):** cancelar uma venda que já teve item devolvido parcialmente — verificar que o "Total estornado" mostra só o valor pendente (descontando a devolução), não o valor cheio da venda de novo. Ver `docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md`.

### 2.5 Devolução / troca (NOVO — é o mais arriscado dos 4)
1. Login como GERENTE/DONO → `/gerente/vendas`.
2. Selecionar uma venda concluída → devolução parcial ou troca.
3. Selecionar os itens e quantidades a devolver → confirmar.
4. Modal de comprovante abre → clicar "Imprimir comprovante".
5. **Verificar:** título correto ("COMPROVANTE DE TROCA" vs. "COMPROVANTE DE DEVOLUÇÃO"), **lista de itens devolvidos com nome/quantidade/preço/subtotal**, valor total estornado, forma de estorno, motivo, operador.
6. **⚠️ Ponto crítico:** a lista de itens só aparece se a migration `20260820120000_devolver_ou_trocar_venda_retorna_itens.sql` estiver aplicada em produção. **Se não estiver aplicada, o recibo é exibido normalmente mas SEM a lista de itens** (degrada graciosamente, não trava) — isso é o primeiro sinal para checar se a migration está pendente. Ver checklist da seção 4, item 4.

### 2.6 Impressão de relatório (NOVO)
1. Login como GERENTE/ADMIN → `/admin/relatorios`.
2. Clicar no botão "Imprimir" no topo da página.
3. **Verificar:** a barra lateral (sidebar) do admin **não** deve aparecer na pré-visualização de impressão — só o conteúdo do relatório. Os botões/filtros/abas (elementos com classe `admin-v2-print-hide`) também devem sumir. Fundo deve virar branco com texto preto (não deve imprimir com fundo escuro, se o tema estiver em dark mode).
4. Testar nas 4 abas (Visão, Produtos, Estoque, Margem) — cada uma imprime o que está visível na tela naquele momento (não existe relatório dedicado de impressão por aba; é a página inteira via `Ctrl+P`/botão).

---

## 3. Verificação de completude dos dados (feita via leitura de código)

| Componente | Dado | Status | Observação |
|---|---|---|---|
| Todos os 5 modais | Rótulos/textos (pt e zh) | ✅ Completos | Conferido em `src/lib/i18n/pt.json` e `zh.json` — nenhuma chave `comprovante_*` ausente ou vazia nos dois idiomas |
| Todos os 5 modais | Texto `[NÚMERO CTO]` ou similar | ✅ Não aparece | O placeholder de telefone de suporte existe apenas nos manuais/documentos (`MANUAL_OPERADOR_RESUMIDO.md`, `docs/RUNBOOK_CLIENTE_PRIMEIRO_DIA.md`), **não** vaza para dentro dos componentes de recibo |
| Fechamento de caixa | Nome da loja | ⚠️ Fallback silencioso | Se `obterNomeLojaAtual()` falhar, o recibo mostra `"—"` em vez do nome — não trava, mas é um sinal a observar no teste |
| Devolução/troca | Lista de itens | ⚠️ Depende de migration | `mapRpcItens()` retorna `[]` (lista vazia) se a RPC não devolver o campo `itens` — confirma que a migration `20260820120000` precisa estar aplicada em produção para este recibo funcionar por completo (ver seção 2.5, item 6) |
| Cancelamento | Lista de itens | ✅ Vem da Server Action | `ComprovanteCancelamentoItem[]`, tipado, sem fallback vazio silencioso conhecido |
| Sangria/suprimento | Nome do operador | ✅ Campo opcional tratado | `operadorNome?: string \| null` — a linha some do recibo se não houver, não mostra "undefined" |
| Relatório (admin) | Ocultação de sidebar na impressão | ✅ Implementado | CSS `@media print` em `styles/admin-v2.css:363-377` esconde `.admin-v2-sidebar` e força fundo branco/texto preto |

**Conclusão da verificação de dados:** não há vazamento de placeholders de configuração (`[NÚMERO CTO]` etc.) dentro dos recibos impressos — esse problema está isolado aos manuais impressos para o operador, não ao software. O único ponto de dado potencialmente incompleto é a lista de itens do recibo de devolução/troca, condicionada à migration pendente.

---

## 4. Checklist de validação visual — para rodar hoje à noite ou levar impresso amanhã

Marque cada item ao testar. Se algo falhar, anote o que apareceu na tela (ou tire print) antes de reportar.

### Antes de começar
- [ ] Confirmar que a migration `20260820120000_devolver_ou_trocar_venda_retorna_itens.sql` foi aplicada em produção (rodar a query de verificação do runbook, ou simplesmente testar uma devolução e ver se os itens aparecem)
- [ ] Ter uma venda de teste já finalizada disponível para cancelar/devolver (não usar dados reais do cliente)

### Cupom de venda
- [ ] Recibo abre automaticamente ao finalizar a venda
- [ ] Todos os itens aparecem com nome, quantidade e preço corretos
- [ ] Total bate com o valor cobrado
- [ ] Botão "Imprimir" gera a caixa de diálogo de impressão do navegador (ou imprime direto se for térmica)
- [ ] Papel sai formatado (sem cortar texto, sem sobrepor linhas) — testar na impressora real da loja, não só na pré-visualização

### Fechamento de caixa
- [ ] Sistema bloqueia o fechamento se o carrinho não estiver vazio (mensagem de aviso aparece)
- [ ] Nome da loja aparece corretamente (não aparece "—")
- [ ] Todos os valores (inicial, vendas, sangrias, suprimentos, saldo sistema, saldo contado, diferença) aparecem preenchidos, não em branco
- [ ] Se a diferença for diferente de zero, aparece destacada
- [ ] Impressão sai legível

### Sangria e suprimento
- [ ] Sangria pede confirmação extra antes do formulário
- [ ] Recibo mostra o tipo correto (sangria com "−", suprimento com "+")
- [ ] Motivo digitado aparece completo no recibo (não cortado)
- [ ] Saldo antes/depois batem com a movimentação
- [ ] Impressão sai legível

### Cancelamento
- [ ] Itens da venda original aparecem completos
- [ ] Motivo digitado aparece completo
- [ ] Total estornado bate com o valor da venda original
- [ ] **Testar um cancelamento inválido de propósito** (venda já cancelada, ou sem permissão) e confirmar que aparece **erro real**, não "sucesso" falso

### Devolução / troca
- [ ] Título muda corretamente entre "TROCA" e "DEVOLUÇÃO" conforme o tipo escolhido
- [ ] **Lista de itens aparece preenchida** (se vier vazia, é sinal de que a migration não foi aplicada — não é motivo de pânico, mas precisa ser corrigido antes de depender desse recibo)
- [ ] Valor estornado e forma de estorno corretos
- [ ] Impressão sai legível

### Relatórios
- [ ] Barra lateral do admin não aparece na impressão
- [ ] Filtros e abas (botões) não aparecem na impressão
- [ ] Fundo sai branco com texto preto, mesmo se a tela estiver em modo escuro
- [ ] Conteúdo da aba ativa (Visão/Produtos/Estoque/Margem) aparece completo, sem cortar tabelas

### Se algo falhar durante o treinamento amanhã
1. Anotar exatamente qual recibo, qual tela, e o que apareceu (ou não apareceu) na tela.
2. Não insistir tentando reimprimir várias vezes na frente do cliente — seguir em frente com a demonstração e voltar ao item depois.
3. Reportar ao contato técnico assim que possível (ver pendência de preencher o telefone real de suporte, registrada em `docs/STATUS_PROJETO_PRE_TREINAMENTO.md`, item crítico #2).
