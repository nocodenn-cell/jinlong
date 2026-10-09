# Conferência valor a valor — Relatórios clássicos × views executivas

| Campo | Valor |
|---|---|
| Data | 2026-10-09 |
| Objetivo | Liberar (ou não) o PR 7 — aposentar as abas clássicas — conferindo **números**, não só rótulos |
| Código | Branch de #514 (`ux/pr7a-migrar-conteudo-relatorios`) |
| Ambiente | **Local e isolado**: Supabase local (401 migrations + `seed.sql`) + `next dev`. Nenhuma produção, migration remota, deploy ou merge. Stack, servidor e `.env.local` removidos ao final. |
| Dados | 7 vendas de teste criadas **pela RPC real do PDV** (`finalizar_venda_transacional_canonica_v4`) como OPERADOR; cancelamento (`cancelar_venda_transacional`) e devolução (`devolver_ou_trocar_venda`) como GERENTE. Período `2026-10-01` a `2026-10-09`, fuso `America/Sao_Paulo`. |

## 1. Dados de entrada e valores esperados

| Venda | Itens | Forma | Valor | Situação |
|---|---|---|---|---|
| V1 | 2× Garrafa (custo 38) | Dinheiro | 179,80 | concluída |
| V2 | 1× Cabo (6,20) + 3× Hashis (3,80) | PIX | 61,20 | concluída |
| V3 | 1× Luminária (52) | Débito | 125,00 | concluída |
| V4 | 2× Fones (78) | Crédito | 378,00 | concluída |
| V5 | 4× Hashis, **custo desconhecido** | Dinheiro | 51,60 | concluída |
| V6 | 1× Garrafa | Dinheiro | 89,90 | **cancelada** |
| V7 | 5× Álcool (6,80) | Dinheiro | 94,50 | concluída; **devolução de 2 un. = 37,80** |

Esperado (calculado a partir dessas entradas e da listagem de `vendas` do banco — **não** por outra consulta de relatório):
faturamento = **890,10** (6 concluídas) · devoluções = **37,80** · receita líquida = **852,30** · ticket = 890,10/6 = **148,35** · cancelamento = 1/7 = **14,3%** · CMV conhecido = 76 + 17,60 + 52 + 156 + 34 − 13,60 (devolvido) = **322,00** · caixa de dinheiro = 179,80 + 89,90 + 94,50 + 51,60 − 89,90 − 37,80 = **288,10**.

## 2. Resultado por item da tabela de equivalência

| # | Conteúdo | Clássico | View | Veredito |
|---|---|---|---|---|
| R1 | Faturamento + devoluções + receita líquida | 890,10 · 37,80 · 852,30 | Vendas & Caixas: faturamento 890,10. **DRE**: bruta 890,10 · devoluções −37,80 · líquida 852,30 | **Confere** (devoluções/líquida moram no DRE, não em Vendas & Caixas) |
| R2 | Ticket médio | 148,35 | 148,35 (migrado) | **Confere** |
| R3/R4 | Nº de vendas / cancelamento | 6 · 14,3% | 6 · 14,3% | **Confere** |
| R5 | **Margem** | **"Indisponível"** (custo incompleto) | DRE: **R$ 530,30** "Custo incompleto — margem aproximada" | **DIVERGE** — ver §3 |
| R6 | Faturamento por dia | 1 barra (08/10) | 1 barra (08/10) | **Confere** |
| R7 | Status (concluídas × canceladas) | 6 · 1 | 6 · 1 | **Confere** |
| R8 | Top produtos | Fones 378 · Garrafa 179,80 · Luminária 125 · Álcool 94,50 · Hashis 90,30 · Cabo 22,50 (soma = 890,10) | idêntico (mesma função) | **Confere** (a venda cancelada não entra; a devolução **não** é abatida no ranking — comportamento do clássico, mantido) |
| R9 | Reposição | "nenhum crítico" | "nenhum abaixo do mínimo" | **Confere** |
| R10 | Cobertura | saldo + **média/dia** + dias | saldo + dias | **Faltava média/dia → corrigido** |
| R11 | Divergência de estoque | Garrafa saldo 9.998 × movimentos −2 → +10.000, etc. | idêntico (mesma função) | **Confere** (as divergências de +10.000 existem porque o `seed.sql` cria saldo sem movimento; é o detector funcionando) |
| R12 | Sem giro / Encalhe | produto · saldo · **valor imobilizado** (ex.: R$ 310.000,00) · última venda | produto · saldo · última venda | **Faltava valor imobilizado → corrigido** |
| R13 | Vendas em detalhe | 7 linhas, valores e ordem iguais; colunas **Cliente**, Vendedor, Forma, Valor, Status | 7 linhas, valores e ordem iguais; **sem Cliente** | **Faltava Cliente → corrigido** |
| R14 | Margem por venda | V1 103,80 · V2 43,60 · V3 73,00 · V4 222,00 · V7 60,50 · V5 "—" | idêntico (mesma função) | **Confere** e bate com o cálculo independente (ex.: V4 = 378 − 156) |
| R15 | Curva ABC | Fones 42,5% A … Cabo 2,5% C | idêntica | **Confere** |
| — | Fluxo previsto (DRE) | — | saldo inicial R$ 288,10 | **Confere** com o caixa de dinheiro esperado |
| — | Vendas por hora | — | pico 23h · 890,10 (6 vendas) | **Confere** |

## 3. Achado aberto — R5: duas regras diferentes para a mesma margem

Com uma venda de custo desconhecido (V5, R$ 51,60):
- **Clássico** esconde a margem ("Indisponível") porque o custo é incompleto — regra conservadora.
- **DRE** mostra **R$ 530,30** = receita líquida 852,30 − CMV conhecido 322,00. Isso **trata a venda sem custo como custo zero** e, portanto, **superestima** a margem em até R$ 51,60. A tela avisa "Custo incompleto — margem aproximada", mas exibe o número.

Origem: `ExecDreFinanceiroPanel.tsx` usa a margem do resumo só se `custo_confiavel`; senão cai para `receita_vendas − custo_conhecido` do resultado gerencial do Financeiro.

**Não foi alterado**: é regra de exibição financeira (restrição da sprint) e exige decisão de produto. Opções:
- (a) DRE também mostra "indisponível" quando o custo é incompleto (igual ao clássico);
- (b) manter o aproximado, mas exibir o **intervalo** ("≥ 530,30 · custo faltando em 1 venda de R$ 51,60") em vez de um número único;
- (c) manter como está e apenas aposentar o clássico (a margem "Indisponível" deixa de existir em qualquer lugar).
Recomendo **(b)**: não esconde o dado e não mente.

## 4. Correções feitas nesta conferência (em #514, `08d07f1e`)
1. **Cliente** na tabela Transações (venda a prazo precisa mostrar o devedor).
2. **Valor imobilizado** no Encalhe.
3. **Média/dia** na Cobertura.
Os três dados já estavam nos DTOs. Testes novos em `ExecutiveDomainView.paridade.test.tsx`; suíte completa verde (359 arquivos / 2.242 testes) e verificação visual com os dados de teste.

## 5. Limites da conferência
- **Um dia, um operador, uma loja.** Não exercitei virada de dia/fuso, múltiplas lojas nem períodos longos.
- **Sem cliente/fiado:** a coluna Cliente foi testada em teste unitário e vista no cabeçalho; as linhas de teste são todas anônimas.
- **Sem desconto:** a RPC exige autorização do gerente para desconto (V4 com desconto foi recusada); a divergência de preço/desconto não foi conferida.
- **Valores esperados** vieram das entradas e da listagem do banco, não de uma consulta SQL independente por relatório.
- Pagamentos aparecem como códigos brutos (`CARTAO_CREDITO`) nos dois lados; status em maiúsculas no clássico × capitalizado na view. Cosmético, pré-existente.
- Perfil DONO e mobile não foram usados nesta rodada.

## 6. Veredito para o PR 7

**GO COM RESSALVAS.** Com as 3 colunas e a migração do #514, **nenhum conteúdo do clássico ficou sem equivalente**, e os números conferem em todos os itens, **exceto R5**.

Antes de aposentar o clássico:
1. **Decidir R5** (a/b/c acima).
2. Mergear #514 (inclui o `08d07f1e`).
3. No PR 7: redirecionar `?tab=` → `?view=` conforme a tabela de URLs, e **manter** a rota base `/admin/relatorios` abrindo Vendas & Caixas; remover "Detalhe por domínio" da sidebar só nesse PR.
4. Repetir a conferência com **um cliente a prazo** e **um desconto autorizado** (exigem gerente) numa rodada curta.
