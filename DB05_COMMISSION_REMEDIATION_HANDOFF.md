> ## ⚠️ SUPERADO — não usar o veredito abaixo como estado atual
>
> Este documento foi escrito com HEAD `08b04de3` e conclui `DB-05 FECHADO: NÃO`.
> O histórico do branch mostra que, **depois** desse HEAD, os commits
> `562fbe69`, `fd9bdfc0`, `684882bb`, `3c2a6e90` e `efb5dd24`
> ("docs(go-live): certify DB-05 and frontend reconciliation", 2026-08-14
> 18:52) implementaram e certificaram as unidades DB-05A–F cobradas abaixo. A
> certificação está registrada em `docs/go-live/00-README.md` e
> `docs/go-live/03-deploy-backend.md`.
>
> O conteúdo original abaixo foi preservado como registro histórico dos
> achados DB05-F1..F8 e da metodologia usada para prová-los — útil como
> referência de como reproduzir/auditar esse tipo de garantia financeira — mas
> **o veredito "DB-05 FECHADO: NÃO" não reflete o estado atual do repositório**.
> O próprio commit de certificação registra que a reauditoria AR/AP (escopo da
> branch `codex/ap-payments-reconciliation`) e itens residuais continuam
> pendentes antes da Fase 3A — ver
> `docs/piloto-d0/ESCOPO_E_ACHADOS_PILOTO_D0.md` (achado D0-04) e
> `docs/piloto-d0/HANDOFF_CLAUDE_PARA_CODEX_2026-08-23.md` para o estado atual
> verificado. Nota adicionada em 2026-08-23 durante encerramento técnico desta
> sessão; nada abaixo desta linha foi alterado.
>
> ---
>
> # DB-05 — Handoff de Remediação Pós-Reauditoria

## 1. ESTADO ATUAL

- Branch: `codex/ap-payments-reconciliation`.
- HEAD no início deste handoff: `08b04de3ed2c02a5172870f51f98cd451793cbb1` (`08b04de3`).
- Migration DB-05 em andamento: `backend/supabase/migrations/20260814114654_commission_post_sale_adjustments.sql`.
- Gates DB-05 existentes: bloco `GATE 18 — DB-05: ajustes pós-venda de comissão` em `backend/scripts/financial-adversarial-gates.test.sql`.
- Definição histórica/base de comissões e pagamento: `backend/supabase/migrations/103_comissoes.sql`.
- Migrations diretamente relacionadas à fórmula e ao pós-venda:
  - `backend/supabase/migrations/20260711020021_260_comissoes_regras_funcionario.sql`;
  - `backend/supabase/migrations/20260711020053_261_comissoes_vendedores_regra_e_congelamento.sql`;
  - `backend/supabase/migrations/20260814110028_commission_on_completed_sale_event.sql`;
  - `backend/supabase/migrations/20260806090414_303_ssot04_kardex_cancelamento_devolucao.sql`;
  - `backend/supabase/migrations/20260717031500_248_devolver_ou_trocar_venda.sql`.

Estado do worktree antes da criação deste documento:

```text
## codex/ap-payments-reconciliation
 M .claude/settings.local.json
 M backend/README.md
 M backend/scripts/financial-adversarial-gates.test.sql
 M backend/scripts/p0-migration-status.mjs
 M backend/scripts/p0-migration-status.test.mjs
 M backend/supabase/MIGRATIONS_DRIFT_CLASSIFICATION.md
 M docs/CI_BACKEND_SUPABASE_FIX_PR267.md
 M docs/FASE_3_1_DECISAO_VENDA_FINANCE_CONTEXT.md
 M docs/FASE_3_2_REAPPLY_VENDA_FINANCE_CONTEXT.md
 M docs/FASE_3_RECONCILIACAO_SUPABASE_PLANO.md
 M docs/GOVERNANCA_PMO_JINLONG.md
 M docs/PLANO_EXECUTIVO_EXECUCAO_JINLONG.md
 M docs/RECONCILIACAO_SUPABASE_PRODUCAO_REPOSITORIO.md
?? .codex/
?? backend/supabase/migration-human-gates.json
?? backend/supabase/migrations/20260814114654_commission_post_sale_adjustments.sql
```

Essas alterações já existiam antes deste handoff e não devem ser descartadas, restauradas ou sobrescritas. Os arquivos especificamente relacionados ao DB-05 são a migration `20260814114654_commission_post_sale_adjustments.sql` e o novo bloco DB-05 em `financial-adversarial-gates.test.sql`.

```text
DB-05 FECHADO: NÃO
FASE 3A LIBERADA: NÃO
```

## 2. O QUE JÁ FOI IMPLEMENTADO

A implementação atual tentou estabelecer o seguinte desenho:

- preservar a comissão original em `public.comissoes_vendedores`, mantendo `UNIQUE (venda_id, operador_id)`;
- centralizar a fórmula em `internal.calcular_comissao_venda(p_venda_id, p_efetivo)`;
- fazer `public.processar_comissao_venda(uuid)` gerar ou atualizar a comissão original;
- criar `public.comissoes_ajustes` como ledger separado de ajustes positivos cujo sinal econômico é determinado pelo tipo;
- gerar ajustes de cancelamento quando `vendas.status` muda para `CANCELADA`;
- gerar ajustes de devolução/troca a partir de `venda_pos_venda_itens` e `venda_pos_venda_operacoes`;
- calcular ajustes incrementais por `comissão original - comissão efetiva - ajustes anteriores`;
- usar as chaves `CANCELAMENTO:<venda_id>` e `DEVOLUCAO:<operacao_id>` para idempotência;
- expor `public.comissoes_vendedores_liquidas`, com `total_ajustes`, `valor_liquido` e `saldo_a_compensar`;
- adicionar os triggers `trg_vendas_cancelamento_ajusta_comissao` e `trg_pos_venda_ajusta_comissao`;
- restringir acesso direto às funções principais e habilitar RLS na tabela de ajustes;
- adicionar gates para cancelamento simples, devolução parcial de um item, devoluções sucessivas do mesmo item, retry, preservação da comissão original e apresentação de saldo negativo após comissão marcada como paga.

Os gates atuais executaram com sucesso no Supabase local dentro de `BEGIN/ROLLBACK`. Esse resultado prova apenas os cenários exercitados. Não certifica pagamento líquido, multi-item, snapshot histórico, concorrência, troca ou equivalência online/offline.

## 3. VEREDITO DA REAUDITORIA

```text
DESENHO DB-05 CORRETO: NÃO
SSOT PRESERVADO: NÃO
CANCELAMENTO SEGURO: NÃO
DEVOLUÇÃO PARCIAL SEGURA: NÃO
DEVOLUÇÕES SUCESSIVAS SEGURAS: NÃO
COMISSÃO JÁ PAGA REALMENTE COMPENSADA: NÃO
CONCORRÊNCIA SEGURA: NÃO
ONLINE/OFFLINE EQUIVALENTES: NÃO
IDEMPOTÊNCIA PROVADA: NÃO
AUDITORIA COMPLETA: NÃO
DB-05 APTO PARA CONCLUSÃO: NÃO
```

## 4. ACHADOS COMPROVADOS

### DB05-F1 — P0 — Ajuste negativo não participa do pagamento futuro

**Classificação:** COMPROVADO.

A migration calcula `saldo_a_compensar` apenas na view `public.comissoes_vendedores_liquidas`, aproximadamente nas linhas 406–429 de `20260814114654_commission_post_sale_adjustments.sql`. A busca de callers encontrou essa view somente na própria migration e nos gates.

O fluxo real `public.marcar_comissoes_pagas`, em `backend/supabase/migrations/103_comissoes.sql` aproximadamente nas linhas 254–294, continua marcando linhas positivas de `comissoes_vendedores` como pagas. Ele não lê `comissoes_ajustes`, `valor_liquido` ou `saldo_a_compensar` e não registra quanto foi efetivamente pago.

Cenário falsificador:

```text
comissão paga: +5
devolução: -2
nova comissão: +5
pagamento atual: +5
pagamento economicamente correto: +3
```

O gate atual marca a primeira comissão como paga por `UPDATE` direto e verifica somente que a view exibe `-2`. Isso não prova que o próximo fluxo de pagamento consome o ajuste. Uma view informativa não produz compensação econômica.

**Causa raiz:** foi criado saldo informativo, mas não um mecanismo canônico de liquidação/compensação.

**Correção mínima esperada:** o pagamento canônico deve consumir ajustes negativos atomicamente, registrar valor bruto, compensado e líquido e deixar trilha explícita entre comissão, ajuste e pagamento.

### DB05-F2 — P0 — Devolução multi-item pode processar apenas o primeiro item

**Classificação:** COMPROVADO pelo fluxo de código.

Funções/arquivos envolvidos:

- `public.devolver_ou_trocar_venda(...)`, atualmente definida pela migration `20260806090414_303_ssot04_kardex_cancelamento_devolucao.sql`;
- `public.trg_comissao_pos_venda()`;
- `public.processar_ajuste_comissao_venda(...)`;
- trigger `trg_pos_venda_ajusta_comissao`, aproximadamente nas linhas 518–548 da migration DB-05.

A RPC pós-venda insere os itens em um loop, com um `INSERT` separado por item. O trigger DB-05 é `AFTER INSERT ... FOR EACH STATEMENT`. A sequência real é:

```text
INSERT item A
→ processamento do ajuste
→ idempotency_key DEVOLUCAO:<operacao_id> criada

INSERT item B
→ mesma idempotency_key
→ processamento ignorado pelo retorno antecipado de idempotência
```

O retorno antecipado ocorre aproximadamente nas linhas 466–468 da migration DB-05. Portanto, uma operação com dois itens pode consolidar somente o estado existente após o primeiro `INSERT`. Os gates atuais usam apenas um item por operação e não detectam a falha.

**Causa raiz:** o evento é marcado como processado antes de a operação pós-venda estar completa.

**Correção mínima esperada:** persistir todos os itens e processar a comissão uma única vez após a finalização canônica da operação.

### DB05-F3 — P0 — Cancelamento antes da criação da comissão pode perder o ajuste definitivamente

**Classificação:** COMPROVADO pelo fluxo de código.

`public.processar_ajuste_comissao_venda(...)` retorna quando não encontra uma comissão, aproximadamente na linha 461 da migration DB-05. `public.processar_comissao_venda(uuid)` só cria comissão se a venda estiver `CONCLUIDA`, aproximadamente nas linhas 332–343.

Race falsificadora:

```text
venda sem comissão
→ venda vira CANCELADA
→ trigger de ajuste procura comissão e não encontra
→ processador posterior vê CANCELADA
→ comissão não nasce
→ ajuste não nasce
```

Não existe pendência, reconciliação ou segundo fato que repare automaticamente essa ordem.

**Causa raiz:** o desenho depende da ordem acidental entre geração da comissão e cancelamento.

**Correção mínima esperada:** garantir fato original e ajuste/reconciliação deterministicamente, independentemente da ordem de triggers ou processadores.

### DB05-F4 — P1 — Ajuste usa regra, custo e configuração atuais e quebra congelamento histórico

**Classificação:** COMPROVADO.

`internal.calcular_comissao_venda(..., true)` consulta novamente:

- `produtos.preco_custo` atual, aproximadamente nas linhas 152 e 174–175;
- `produtos.comissao_tipo` e `produtos.comissao_valor` atuais;
- `produtos.categoria_id` atual;
- vínculo atual entre usuário e funcionário;
- regras atualmente ativas em `comissoes_regras_funcionario`;
- vigência comparada com `CURRENT_DATE`, aproximadamente nas linhas 199–200, 218–219, 238–239 e 256–257;
- `configuracoes_gerais.comissao_padrao_percentual` atual.

Uma venda antiga não pode ter a parcela devolvida recalculada segundo regra, custo ou configuração futura. A comissão original está congelada em `comissoes_vendedores`, mas o valor efetivo é reconstruído com dados atuais; essas duas autoridades temporais podem divergir.

Exemplo:

```text
venda histórica com taxa de 5%: comissão original +5
taxa atual muda para 10%
devolução de 40%
recomputação do remanescente pela taxa atual: 6
alvo calculado: max(0, 5 - 6) = 0
ajuste histórico correto: -2
```

**Causa raiz:** não existe snapshot por item suficiente para atribuir a comissão histórica às quantidades devolvidas.

**Correção mínima esperada:** derivar o ajuste de fatos históricos congelados, não das configurações atuais.

### DB05-F5 — P1 — Pagamento × devolução sem proteção transacional suficiente

**Classificação:** COMPROVADO por análise transacional.

O gerador de ajuste bloqueia a linha de `comissoes_vendedores` com `FOR UPDATE`, mas `marcar_comissoes_pagas` não lê nem bloqueia o saldo econômico e não vincula o pagamento aos ajustes consumidos. Não há protocolo comum de locks, lote de liquidação ou registro do valor pago.

Race:

```text
T1 lê/seleciona comissão positiva disponível
T2 cria ajuste negativo
T1 confirma pagamento integral da linha positiva
```

Mesmo que o ajuste espere o lock e seja criado depois, ele vira somente saldo informativo, pois o pagamento futuro também não o consome.

**Correção mínima esperada:** pagamento e criação/consumo de ajustes devem usar uma estratégia transacional comum, com locks em ordem estável e liquidação explícita.

### DB05-F6 — P1 — Ledger não é realmente append-only

**Classificação:** COMPROVADO.

Em `public.comissoes_ajustes`, aproximadamente nas linhas 364–378 da migration DB-05:

```sql
comissao_id ... ON DELETE CASCADE
venda_id ... ON DELETE CASCADE
```

Logo, apagar comissão ou venda apaga todos os ajustes. Também não existe proteção estrutural contra `UPDATE`/`DELETE` por roles privilegiadas ou por código futuro. Isso contradiz as invariantes “fato original nunca é apagado” e “ledger append-only”.

**Correção mínima esperada:** FKs restritivas e mecanismo explícito de imutabilidade do ledger, preservando a trilha mesmo diante de tentativas de alteração/exclusão.

### DB05-F7 — P1 — Auditoria insuficiente para explicar cada centavo e a compensação futura

**Classificação:** COMPROVADO.

O ledger registra comissão, venda, beneficiário, loja, valor, origem, chave e timestamp, mas não registra adequadamente:

- ator responsável pelo evento;
- tipo real `TROCA` — o trigger atualmente converte devolução e troca em `DEVOLUCAO`;
- decomposição ou atribuição histórica por item;
- pagamento/lote que consumiu o ajuste;
- valor bruto, compensado e líquido de cada pagamento;
- data e ator da compensação;
- preservação da origem se venda/comissão for excluída.

O `operador_id` atual é o recebedor da comissão, não necessariamente o ator da operação pós-venda. Um auditor ainda precisa fazer inferências externas e não consegue reconstruir a compensação futura, pois ela não existe como fato.

**Correção mínima esperada:** ledger e pagamentos devem conter vínculos explícitos e suficientes para reconstrução determinística de cada centavo.

### DB05-F8 — P2 — Funções de trigger `SECURITY DEFINER` com ACL padrão

**Classificação:** COMPROVADO no catálogo local; risco imediato baixo, remediação obrigatória de hardening.

`public.trg_comissao_cancelamento()` e `public.trg_comissao_pos_venda()` são `SECURITY DEFINER`, têm `search_path` fixado, mas permanecem com ACL padrão (`proacl = NULL`). Funções `RETURNS trigger` não são normalmente invocáveis como RPC comum, mas o padrão seguro exige avaliar se `SECURITY DEFINER` é necessário e aplicar `REVOKE EXECUTE FROM PUBLIC` explicitamente quando aplicável.

Também devem ser revalidados:

- RLS e grants da tabela/view resultantes;
- isolamento por loja;
- impossibilidade de cross-loja;
- usuário inativo;
- ausência de concessões amplas após recriações de função.

## 5. PONTOS NÃO COMPROVADOS

Os itens abaixo permanecem **NÃO COMPROVADOS** e não podem receber PASS apenas porque os gates atuais estão verdes:

- arredondamento adversarial e drift de centavos;
- múltiplas devoluções em combinações variadas;
- equivalência online × offline completa;
- troca real com venda substituta e duas pernas econômicas;
- concorrência real em sessões/transações distintas;
- idempotência multi-item;
- colisões deliberadas entre eventos distintos;
- fechamento exato após devolução total complementar;
- pagamento real após saldo negativo;
- preservação histórica após mudanças de regra/custo/configuração.

## 6. PROBLEMA ARQUITETURAL CENTRAL

O sistema precisa separar claramente quatro camadas:

```text
COMISSÃO ORIGINAL CONGELADA
↓
LEDGER IMUTÁVEL DE AJUSTES
↓
PAGAMENTOS/COMPENSAÇÕES
↓
SALDO ECONÔMICO
```

A comissão original é um fato histórico. Ela não deve ser apagada nem recalculada retroativamente. O ledger registra eventos posteriores sem reescrever o fato original. Pagamentos precisam consumir créditos e débitos de forma explícita e auditável. O saldo econômico deve ser consequência desses fatos, não apenas uma coluna informativa numa view.

Não criar duas fórmulas concorrentes. A regra histórica aplicada na venda deve permanecer congelada. O ajuste posterior deve derivar dos itens e valores históricos congelados na venda, não de custo, regra, categoria, vínculo de funcionário ou percentual atuais.

Uma futura mudança estrutural na fórmula deve ocorrer em um SSOT. Essa mudança não pode alterar a interpretação econômica de vendas já concluídas.

## 7. ORDEM OBRIGATÓRIA DE REMEDIAÇÃO

### DB-05A — Pagamento líquido e compensação real

O fluxo canônico de pagamento deve consumir ajustes negativos. Não basta uma view.

O pagamento precisa registrar explicitamente:

- quais comissões foram pagas;
- quais ajustes foram compensados;
- valor bruto selecionado;
- valor compensado;
- valor líquido efetivamente pago;
- data e lote de pagamento;
- operador/ator responsável, quando aplicável;
- idempotência do pagamento.

Pagamento e ajustes precisam ser atomicamente consistentes. Definir primeiro o modelo de liquidação e o saldo econômico canônico; não adaptar apenas a UI.

### DB-05B — Processamento pós-venda atômico

Não processar devolução item a item antes de a operação estar completa.

Fluxo preferencial:

```text
persistir operação
→ persistir todos os itens
→ finalizar operação pós-venda
→ processar comissão uma única vez
```

Usar o fato canônico da operação. A idempotency key deve representar a operação concluída e não pode bloquear a inclusão legítima dos itens restantes.

### DB-05C — Snapshot histórico

Congelar na venda os elementos mínimos necessários para reconstruir a comissão por item, por exemplo:

- item de venda;
- quantidade elegível;
- base elegível histórica;
- regra aplicada;
- tipo da regra;
- percentual ou valor fixo aplicado;
- valor de comissão atribuível ao item;
- versão/data da apuração, se necessária.

Determinar a menor estrutura que preserve a verdade histórica. Não copiar arbitrariamente a fórmula para outro lugar. O ajuste deve consumir o snapshot produzido pela fórmula canônica no momento da venda.

### DB-05D — Race cancelamento/comissão

Eliminar dependência da ordem de triggers. Provar ambos:

```text
comissão → cancelamento
cancelamento → tentativa/processamento atrasado de comissão
```

O estado econômico final deve ser determinístico e equivalente. Não aceitar retorno silencioso que perca o evento para sempre.

### DB-05E — Ledger imutável e auditoria

Remover semântica que permita apagar ajustes junto com venda/comissão e proteger o ledger contra `UPDATE`/`DELETE`.

Registrar, no mínimo:

- tipo real: `CANCELAMENTO`, `DEVOLUCAO` ou `TROCA`;
- venda;
- comissão;
- operação pós-venda;
- ator;
- beneficiário;
- valor;
- timestamp;
- origem canônica;
- chave idempotente;
- vínculo com compensação/pagamento;
- decomposição por item ou referência suficiente ao snapshot histórico.

### DB-05F — Concorrência

Pagamento e geração de ajuste devem compartilhar estratégia transacional coerente, incluindo:

- linhas bloqueadas;
- ordem estável de aquisição dos locks;
- isolamento esperado;
- tratamento de retry/deadlock/timeout;
- unicidade como última linha de defesa;
- transação única para seleção, compensação e confirmação do pagamento.

Testar com sessões independentes, não apenas chamadas sequenciais.

## 8. REGRAS QUE NÃO PODEM SER VIOLADAS

```text
fato original nunca é apagado
ajuste nunca altera retroativamente o fato original
configuração futura não altera comissão histórica
mesmo evento lógico gera no máximo um ajuste
eventos distintos não colidem
pagamento considera saldo econômico, não apenas linhas positivas
online e offline produzem o mesmo resultado econômico
cancelamento/devolução nunca dependem da ordem acidental dos triggers
```

Adicionalmente:

- um retry não pode produzir novo efeito econômico;
- uma devolução total não pode deixar resíduo nem ultrapassar a comissão original;
- um ajuste já compensado deve permanecer auditável;
- nenhuma role pode ler ou alterar fatos de outra loja sem autorização explícita;
- falhas não podem ser silenciadas quando isso causar perda definitiva do ajuste.

## 9. TESTES OBRIGATÓRIOS

O Claude deve implementar e falsificar, no mínimo, este checklist:

- [ ] 1. Cancelamento simples: fato original permanece, ajuste integral existe uma vez, líquido zero.
- [ ] 2. Cancelamento antes da comissão: nenhuma perda definitiva do fato ou ajuste.
- [ ] 3. Cancelamento depois da comissão: mesmo estado econômico do item 2.
- [ ] 4. Retry do mesmo cancelamento/devolução: nenhum efeito adicional.
- [ ] 5. Dois cancelamentos concorrentes: um único ajuste lógico.
- [ ] 6. Devolução de um item: atribuição histórica exata.
- [ ] 7. Devolução de dois itens na mesma operação: ambos considerados.
- [ ] 8. Dois itens com margens/regras diferentes: ajuste por item, sem proporção global artificial.
- [ ] 9. Devoluções sucessivas: cada operação distinta aparece uma vez.
- [ ] 10. Devolução total complementar: líquido exatamente zero, sem ultrapassar original.
- [ ] 11. Arredondamento adversarial: frações de centavo e fechamento total sem drift.
- [ ] 12. Mudança de custo depois da venda: ajuste histórico permanece igual.
- [ ] 13. Mudança de regra depois da venda: ajuste histórico permanece igual.
- [ ] 14. Mudança de percentual/configuração depois da venda: ajuste histórico permanece igual.
- [ ] 15. Comissão não paga + ajuste: pagamento considera o líquido correto.
- [ ] 16. Comissão paga + ajuste: débito futuro é criado e permanece auditável.
- [ ] 17. Ajuste negativo + nova comissão + próximo pagamento: pagamento líquido correto.
- [ ] 18. Pagamento concorrente com devolução: sem pagamento excessivo ou ajuste perdido.
- [ ] 19. Troca real: comissão antiga reduzida, venda substituta tratada uma vez, sem duplicidade.
- [ ] 20. Online × offline: mesmos fatos e valores econômicos.
- [ ] 21. Retry online/offline: nenhum efeito duplicado nos dois caminhos.
- [ ] 22. Imutabilidade do ledger: fatos permanecem após operações permitidas ao redor.
- [ ] 23. Tentativa de `DELETE`: rejeitada sem apagar trilha.
- [ ] 24. Tentativa de `UPDATE`: rejeitada sem alterar trilha.
- [ ] 25. Cross-loja: leitura, criação, pagamento e compensação indevidos são bloqueados.
- [ ] 26. Usuário inativo: nenhuma autorização gerencial/econômica permanece válida.

Cada teste deve verificar valores, contagens, vínculos e estado econômico final. Verificar apenas existência de uma linha não prova o contrato.

## 10. GATE ECONÔMICO CRÍTICO

Cenário obrigatório:

```text
comissão original = +5
pagamento realizado = 5
devolução posterior = -2
nova comissão = +5

próximo pagamento líquido esperado = 3
```

Provar diretamente no banco:

```text
histórico:
+5
-2
+5

pagamentos:
5
3

saldo final:
0
```

O teste deve chamar o fluxo canônico real de pagamento, não executar `UPDATE status='pago'` manual. Deve provar quais fatos foram liquidados em cada pagamento. Se o sistema pagar 5 no segundo pagamento, DB-05 continua FAIL.

## 11. GATE MULTI-ITEM

Criar venda com pelo menos dois itens de características diferentes, preferencialmente com regras ou margens distintas.

Executar uma única operação pós-venda contendo os dois itens e provar:

- ambos foram persistidos antes do processamento da comissão;
- o ajuste inclui a parcela histórica dos dois itens;
- existe no máximo um ajuste lógico para a operação, ou decomposição explicitamente idempotente por item;
- a soma do ajuste corresponde exatamente aos itens devolvidos;
- repetir a mesma operação não altera contagens nem valores;
- uma operação distinta posterior não colide com a primeira.

O gate deve usar o caminho oficial `devolver_ou_trocar_venda`, não montar apenas uma fixture que insira todos os itens numa única instrução diferente do comportamento real.

## 12. GATE HISTÓRICO

Sequência obrigatória:

1. criar venda e comissão;
2. capturar snapshot e valores originais;
3. alterar custo do produto;
4. alterar regra aplicável;
5. alterar percentual/configuração atual;
6. executar devolução;
7. provar que o ajuste continua baseado exclusivamente no fato histórico congelado.

Executar variações separadas para identificar qual dado atual poderia vazar para o cálculo. Restaurar tudo por `ROLLBACK` nos testes locais.

## 13. GATE DE ORDEM DOS EVENTOS

Provar dois cenários independentes e economicamente equivalentes:

```text
A:
venda
→ comissão
→ cancelamento

B:
venda
→ cancelamento
→ processamento atrasado/reconciliação da comissão
```

Comparar:

- fato original;
- ajuste;
- contagem de eventos;
- líquido econômico;
- trilha de auditoria;
- resultado após retry.

Ambos devem terminar no mesmo estado econômico. O teste B não pode ser descartado por o caminho oficial normalmente disparar triggers em outra ordem; o objetivo é provar tolerância a atraso, retry e concorrência.

## 14. GATE DE CONCORRÊNCIA

Usar duas conexões/sessões reais quando tecnicamente possível. Não simular concorrência com duas chamadas sequenciais na mesma sessão.

Testar:

- pagamento × devolução;
- dois processamentos do mesmo ajuste;
- cancelamento × geração de comissão.

Em cada caso, controlar a ordem com transações e locks, verificar bloqueio/serialização e confirmar o estado após ambos os commits. Provar ausência de:

- `lost adjustment`;
- `double adjustment`;
- comissão positiva líquida após cancelamento;
- pagamento excessivo;
- deadlock não tratado;
- resultado dependente de qual transação terminou primeiro.

## 15. GATE ONLINE × OFFLINE

Criar duas vendas economicamente equivalentes:

```text
A = online
B = offline
```

Usar o mesmo produto, itens, quantidades, preços, vendedor, loja e regra de comissão. Comparar, para as duas:

- comissão original;
- cancelamento integral;
- devolução parcial;
- devolução total;
- ajustes por evento;
- pagamentos;
- compensações;
- saldo econômico final;
- retry de criação e pós-venda.

O resultado deve ser economicamente equivalente. O Gate 15 atual prova somente que a venda offline já concluída gera uma comissão; ele não substitui este gate comparativo.

## 16. VALIDAÇÃO FINAL

Somente depois das correções, executar do zero:

```bash
supabase db reset --local
```

Depois executar na ordem real do CI:

1. seed;
2. RLS;
3. `test:financial`;
4. testes DB-05, incluindo sessões concorrentes;
5. `check:types-drift`;
6. typecheck;
7. vitest;
8. lint;
9. build;
10. `check:edge`.

Antes de executar, descobrir os comandos exatos nos scripts do repositório e na ajuda da CLI; não inventar flags. Registrar os comandos e resultados. Um banco local previamente alterado não substitui `db reset` limpo.

## 17. CRITÉRIO PARA DECLARAR DB-05 FECHADO

DB-05 só pode ser fechado quando todos os itens forem comprovados:

```text
COMISSÃO ORIGINAL CONGELADA: SIM
CANCELAMENTO SEGURO: SIM
DEVOLUÇÃO MULTI-ITEM: SIM
DEVOLUÇÕES SUCESSIVAS: SIM
COMISSÃO PAGA COMPENSADA: SIM
PAGAMENTO LÍQUIDO: SIM
CONCORRÊNCIA: SIM
LEDGER IMUTÁVEL: SIM
AUDITORIA COMPLETA: SIM
ONLINE/OFFLINE EQUIVALENTES: SIM
CI VERDE DO ZERO: SIM
```

Até lá:

```text
DB-05 FECHADO: NÃO
FASE 3A LIBERADA: NÃO
```

## 18. INSTRUÇÃO PARA O PRÓXIMO AGENTE

### INSTRUÇÕES PARA CLAUDE CODE

- Leia este documento integralmente antes de editar qualquer arquivo.
- Valide o estado real do repositório, branch, HEAD, worktree, migrations aplicadas e catálogo local.
- Preserve alterações existentes de outros agentes; não restaure nem descarte trabalho alheio.
- Não confie cegamente nos números de linha deste documento, pois podem mudar. Localize funções e contratos pelo nome.
- Confirme cada achado no código e, quando possível, com teste local reversível antes de corrigir.
- Trabalhe obrigatoriamente na ordem DB-05A → DB-05F.
- Faça uma unidade de remediação por vez.
- Para cada unidade, escreva/falsifique primeiro o gate correspondente, implemente a menor correção e execute novamente o gate.
- Não aceite teste verde que apenas verifica existência; prove valores, identidade, atomicidade e saldo final.
- Faça commits separados, pequenos e intencionais somente quando autorizado pelo responsável do trabalho.
- Não iniciar Fase 3A.
- Não fazer merge.
- Não acessar produção.
- Não aplicar repair/backfill em produção.
- Não declarar DB-05 fechado antes de todos os critérios da seção 17 estarem verdes a partir de `supabase db reset --local`.

## 19. HIGIENE

Este documento foi criado como a única alteração autorizada desta tarefa. Após criá-lo, executar:

```bash
git diff -- DB05_COMMISSION_REMEDIATION_HANDOFF.md
git status
```

Não alterar migrations, gates, código ou outros documentos nesta tarefa. Não fazer commit, push, merge, stash, repair, backfill ou acesso à produção.

