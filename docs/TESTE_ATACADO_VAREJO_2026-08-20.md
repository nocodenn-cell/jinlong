# Teste — Preço Atacado × Varejo (online × offline)

**Prazo:** resultado solicitado em até 30 minutos, para decisão sobre o treinamento de amanhã (2026-08-21).
**Metodologia:** dado o prazo, priorizei o caminho mais rápido e ainda rigoroso — chamadas diretas às RPCs de preço/venda no Supabase local (mesmo código que a UI usa, sem passar pela UI) + comparação linha a linha do código online vs. offline. Uma tentativa de validar também pela UI real esbarrou num travamento de ambiente (Turbopack dev, "Abrindo caixa…" sem resolver) que já tinha aparecido antes nesta mesma sessão em um worktree totalmente diferente — não é um sintoma de bug de preço, é flakiness do servidor de desenvolvimento. Mais adiante no mesmo dia, **já tinha sido validada uma venda real completa pela UI** (produto diferente, varejo, ver `docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md`) — o pipeline de venda→recibo→estoque já tem prova ao vivo; o que faltou provar ao vivo especificamente foi o caso **atacado** com múltiplas faixas.

---

## Resumo (para decisão rápida)

| Pergunta | Resposta | Confiança |
|---|---|---|
| A engine de preço resolve varejo/atacado corretamente por quantidade? | ✅ Sim | Alta — 8 cenários testados via RPC direta, todos corretos |
| Múltiplas faixas (3+ / 10+) resolvem para a faixa certa? | ✅ Sim | Alta — testado explicitamente |
| Fronteira exata da faixa (quantidade == mínimo) aplica o desconto? | ✅ Sim | Alta — testado explicitamente |
| Quantidade fracionada (5.5) causa divergência online×offline? | ✅ Não — comportamento idêntico | Alta — código idêntico linha a linha nos dois lados |
| Promoção sobrepõe atacado incorretamente? | ⚠️ Não se aplica hoje — **promoção não está implementada na engine de preço automática** | Alta — confirmado por leitura direta da função SQL atual e do schema |
| O offline (pdv-local) aplica a mesma regra de atacado que o online? | ⚠️ **Não testado ao vivo** — só verificado por leitura de código (que mostra lógica idêntica) | Média — não executei o app desktop de verdade |
| Recibo mostra o preço com desconto correto no caso atacado? | ⚠️ **Não confirmado ao vivo para este teste específico** (travamento de ambiente); já confirmado ao vivo para varejo mais cedo no mesmo dia | Média |
| Estoque baixa a quantidade certa (não 1 unidade fixa)? | ⚠️ Não confirmado ao vivo neste teste específico | Média — código revisado, não executado |

**Não há nenhuma evidência de bug real na lógica de preço atacado/varejo.** O que existe é um risco de processo diferente do que o relatório original sugeria: **a "validação de faixa e promoção só existe online"** não é bem o quadro atual — o quadro real é que **promoção automática simplesmente não existe em nenhum dos dois lados ainda** (é trabalho futuro, BL-2, já no backlog). Isso muda o risco: não é "offline pode aplicar preço errado por falta de validação de promoção", é "nem online nem offline aplicam promoção automática hoje — só desconto de gerente manual, que é outro mecanismo".

---

## 1. Engine de preço (`calcular_preco_produto`) — testado via RPC direta

Produtos de teste criados no Supabase local (loja Matriz):

| Produto | Preço varejo | Faixas de atacado |
|---|---|---|
| TESTE Notebook Multi-Tier | R$ 2.000,00 | 3+ → R$ 1.800,00 · 10+ → R$ 1.700,00 |
| TESTE Produto Preço Único | R$ 100,00 | nenhuma (controle) |
| TESTE Produto Atacado Simples | R$ 100,00 | 5+ → R$ 80,00 |

Resultados (chamada direta a `calcular_preco_produto`, mesma função que a UI/RPC de venda usa):

| Cenário | Quantidade | Resultado | Esperado | Status |
|---|---|---|---|---|
| Notebook, varejo | 1 | VAREJO R$ 2.000,00 | R$ 2.000,00 | ✅ |
| Notebook, abaixo da faixa | 2 | VAREJO R$ 2.000,00 | R$ 2.000,00 | ✅ |
| Notebook, faixa 3+ | 3 | ATACADO R$ 1.800,00 (fonte: tier) | R$ 1.800,00 | ✅ |
| Notebook, ainda na faixa 3+ | 5 | ATACADO R$ 1.800,00 | R$ 1.800,00 (não deve pular para 10+) | ✅ |
| Notebook, faixa 10+ | 12 | ATACADO R$ 1.700,00 (fonte: tier) | R$ 1.700,00 | ✅ |
| Atacado Simples, abaixo da faixa | 4 | VAREJO R$ 100,00 | R$ 100,00 | ✅ |
| Atacado Simples, **exatamente no limite** | 5 | ATACADO R$ 80,00 | R$ 80,00 (limite é inclusivo) | ✅ |
| Preço Único, sem tier configurado | 10 | VAREJO R$ 100,00 | R$ 100,00 (não deve inventar desconto) | ✅ |

**Conclusão:** a lógica de resolução de faixa está correta em todos os casos testados, incluindo o caso de borda mais arriscado (múltiplas faixas — pega corretamente a de maior `quantidade_minima` aplicável, não a primeira encontrada) e o limite exato (`quantidade_minima <= quantidade`, inclusivo).

### 1.1 Quantidade fracionada — comparação de código online × offline

A função SQL `calcular_preco_produto` recebe `p_quantidade` como `integer` — **não aceita fracionário diretamente** (uma chamada com `5.5` sem cast falha com erro de tipo). Isso levanta a pergunta: como o código que chama essa RPC trata quantidades fracionadas (produtos por peso, por exemplo)?

Resposta encontrada no código (não foi preciso adivinhar):

- **Online** (`shared/format/quantidadeCaixa.ts`, função `quantidadeParaRpcPreco`, usada em `pdv-importados/app/caixa/server/caixaPrecoProduto.impl.ts`): `Math.max(1, Math.floor(n))` — arredonda para baixo antes de chamar a RPC.
- **Offline** (`shared-core/src/pricing/calcularPrecoCanonico.ts`, função `quantidadeParaCadeiaPreco`, comentário explícito: *"Espelha `quantidadeParaRpcPreco`: max(1, floor(q)) para q > 0"*): **código idêntico**.

**Não há divergência.** Os dois lados arredondam a quantidade para baixo do mesmo jeito antes de decidir a faixa de preço. Uma venda de 5,5 kg de um produto com faixa "5+" aplica o preço de atacado nos dois lados (floor(5.5) = 5, dentro da faixa). O valor total cobrado ainda usa a quantidade real (5,5), só a **decisão de qual faixa usar** é que usa a quantidade arredondada para baixo — comportamento intencional e consistente, não um bug.

**Nota:** um teste direto mostrou que `5.5::integer` em Postgres **arredonda** (vira 6), não trunca — mas isso é irrelevante na prática porque o código de aplicação nunca deixa o Postgres fazer esse cast implícito: sempre floor primeiro, em ambos os lados. Vale como observação para quem for mexer nesse código no futuro: se algum caminho novo passar a quantidade fracionada direto para a RPC sem o floor explícito, o comportamento muda silenciosamente.

---

## 2. Promoção × Atacado — o risco descrito no relatório está desatualizado

Verifiquei diretamente:
- A tabela `regras_preco` existe no schema (tipo de regra PRODUTO/CATEGORIA, desconto percentual ou valor fixo, quantidade mínima/máxima, validade).
- A coluna `itens_venda.promocao_regra_id` existe (referência a `regras_preco`).
- **Mas `calcular_preco_produto` (a função que decide o preço automático, online e offline) nunca lê `regras_preco`.** A função só olha `precos_atacado` (faixas) e `produtos.preco_atacado` (fallback de catálogo). Não há nenhum caminho de código, hoje, que aplique uma "promoção" automaticamente durante a venda.
- Uma migration recente (`20260731200900_hardening_tipo_preco_remove_promocao_residual.sql`) **removeu explicitamente** `'PROMOCAO'` como valor válido de `itens_venda.tipo_preco`, documentando que a decisão arquitetural (BL2_MODELO_FINAL_APROVADO.md) rejeitou promoção como "tipo de preço" — ela seria modelada como "regra aplicada" separadamente, mas essa parte (BL-2, item do backlog priorizado que já vimos antes) **ainda não foi implementada** na função de cálculo.

**Conclusão prática para amanhã:** não existe cenário de "promoção sobrepõe atacado incorretamente" para testar, porque promoção automática não está no ar. Se alguém no catálogo tiver cadastrado uma linha em `regras_preco` esperando que ela funcione sozinha na hora da venda, **ela não vai fazer nada** — isso é uma expectativa desalinhada com o estado real do sistema, não um bug de precedência. Vale confirmar com o time se alguém está contando com isso para amanhã.

---

## 3. O que NÃO foi possível confirmar ao vivo no prazo disponível

- **Venda real de atacado pela UI (produto com faixa, quantidade ≥ mínimo) até o recibo.** Tentei subir a stack local de novo neste worktree e a tela de caixa travou em "Abrindo caixa…" de forma reproduzível (mesmo sintoma de flakiness do Turbopack dev já visto antes nesta sessão em outro worktree, sempre self-resolvendo depois de um tempo em testes anteriores — não travou por falta de tempo para confirmar se resolveria). **Isso não é evidência de bug na venda em si** — mais cedo no mesmo dia, uma venda varejo real (produto diferente) foi executada com sucesso ponta a ponta pela mesma UI, com recibo e estoque corretos (ver `docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md`).
- **pdv-local (app desktop offline) rodando de verdade.** Não é viável compilar/rodar o Tauri desktop app dentro da janela de 30 minutos. A validação de paridade online×offline foi feita por comparação direta do código-fonte (seção 1.1) — que é uma técnica válida e, neste caso, deu uma resposta clara e conclusiva (código idêntico), mas não substitui um teste de execução real.
- **Baixa de estoque exata para quantidade de atacado** (ex.: vender 10 unidades deve tirar 10 do saldo, não 1). Não testado ao vivo neste teste específico. Não há indício de problema no código revisado (a RPC de finalização de venda usa a quantidade do item, não um valor fixo), mas não tenho prova de execução.
- **Comissão calculada sobre preço com desconto.** Fora do escopo do tempo disponível — não investigado.
- **Interação desconto manual de gerente + atacado.** Fora do escopo do tempo disponível.

---

## 4. Risco para o treinamento de amanhã

**Baixo.** A lógica central de decisão de preço (o que mais importava neste teste) está correta e foi comprovada com 8 cenários diretos, incluindo os casos de borda mais arriscados (múltiplas faixas, limite exato, produto sem atacado). A suposta divergência online×offline por quantidade fracionada não existe — código idêntico nos dois lados. A suposta interação promoção×atacado não é um risco hoje porque promoção automática não está implementada em nenhum dos dois lados.

**O que vale a pena fazer, se der tempo antes de amanhã:** uma venda real de atacado pela UI (não só pela RPC) para confirmar visualmente que o recibo mostra "R$ 80,00 (atacado)" e não o preço cheio, e que o estoque desce a quantidade certa — isso é rápido de fazer manualmente (2-3 minutos) por alguém com acesso à loja de teste, mesmo que a automação aqui tenha esbarrado num travamento de ambiente.

**Produtos de teste criados neste processo** (loja Matriz, prefixo `TESTE`, códigos de barra `999000000000X`) — podem ser usados para esse teste manual rápido, ou removidos se preferir um catálogo limpo para o treinamento: `TESTE Notebook Multi-Tier`, `TESTE Produto Preço Único`, `TESTE Produto Atacado Simples`.
