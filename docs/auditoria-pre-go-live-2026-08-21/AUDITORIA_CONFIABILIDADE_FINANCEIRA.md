# Auditoria de confiabilidade financeira

## Conclusao

Veredito: **NAO COMPROVADA**. Existem mecanismos maduros de invariantes, idempotencia, ledger e reconciliacao, mas a release observada nao e reproduzivel pelo SHA e os testes que provariam o banco aplicado nao puderam rodar.

## Modelo financeiro observado

| Dominio/valor | Fonte de verdade observada | Leitura/UI | Riscos pendentes |
|---|---|---|---|
| Venda e itens | `vendas`, `venda_itens`, RPC v4/web e `registrar_venda_com_itens`/offline | dashboard, vendas, relatorios | estado aplicado e replay real nao provados |
| Pagamentos da venda | `vendas_pagamentos` | caixa/relatorios | concorrencia e soma exigem banco |
| Caixa | `caixas`, `movimentacoes_caixa`, RPCs transacionais | caixa/admin | fechamento concorrente/pendencias nao executado |
| Receber | `contas_receber`, `liquidacoes_receber` | financeiro/receivableReader | reconciliacao AR alterada no working tree/testes sem banco |
| Pagar | `contas_pagar`, `contas_pagar_pagamentos` | financeiro/payableReader | reconciliacao AP alterada no working tree/testes sem banco |
| Cancelamento/devolucao | eventos/ledger, RPCs de cancelar/devolver | vendas/auditoria | ordem e compensacao dependem de schema efetivo |
| Comissoes | ledger/snapshots e migrations 103 + bloco 20260814 | financeiro/comissoes | concorrencia e historico exigem testes DB |
| Relatorios | RPCs de periodo/dashboard/margem | admin | timezone default Brasil e divergencia detalhado x KPI nao provada |

## Achados

### FIN-001 - release financeira nao reproduzivel pelo SHA

- Severidade/status: **P0 - FALHA**; bloqueia: **sim**.
- Evidencia: branch `codex/ap-payments-reconciliation`, HEAD `3d68...`; `git status` mostra alteracoes locais em quatro migrations de reconciliacao/invariantes, migration de revogacao e `financial-adversarial-gates.test.sql` (+1.290 linhas no diff stat).
- Impacto/cenario: auditor, CI e deploy podem validar conteudos diferentes; merge parcial pode levar funcoes, testes e rollback fora de sincronia.
- Requisito: release imutavel, auditavel e reproduzivel.
- Correcao: definir commit candidato unico, revisar diff, rebase em `main`, reconstruir banco vazio e publicar manifest SHA+migrations.
- Regressao/aceite: working tree limpo; CI no mesmo SHA; `git diff` vazio; inventario de migration e schema correspondem; artefatos mostram SHA.
- Dependencias/esforco/dono: codigo + DevOps; **M**.

### FIN-002 - invariantes e concorrencia nao executados contra banco

- Severidade/status: **P1 - NAO COMPROVADO**; bloqueia: **sim**.
- Evidencia: `backend/package.json` define `test:financial` e `test:financial-concurrency`; exigem URL/credenciais de Postgres ausentes. Nao houve execucao SQL.
- Impacto: retry, timeout, duas baixas e queda intermediaria podem duplicar/omitir fatos apesar de testes textuais.
- Correcao/aceite: Supabase efemero do zero; suite SQL completa e concorrencia em 30 repeticoes; zero duplicata; replay retorna fato original; rollback transacional em failpoint.
- Dependencias/esforco/dono: banco + QA; **G**.

### FIN-003 - grants/RLS dos diagnosticos financeiros nao provados

- Severidade/status: **P1 - PARCIAL**; bloqueia: **sim**.
- Evidencia: `20260818000001_revoke_relatorio_consistencia_vendas.sql` esta modificada localmente; teste adversarial possui gate de diagnostico exposto. Aplicacao e overloads reais nao foram consultados.
- Impacto: RPC de consistencia pode expor dados cross-loja ou informacao operacional a `authenticated`/`PUBLIC`.
- Correcao/aceite: enumerar todas as assinaturas em `pg_proc`; `has_function_privilege` falso para anon/authenticated/PUBLIC; acesso somente server-side auditado; teste REST direto negativo.
- Dependencias/esforco/dono: banco + seguranca; **M**.

### FIN-004 - timezone financeiro permanece Brasil-centrico

- Severidade/status: **P1 - COMPROVADO**; bloqueia: **sim para expansao; condicional no go-live BR**.
- Evidencia: varias RPCs usam default `America/Sao_Paulo`, inclusive `20260818000000_reconcile_production_report_functions.sql:42-345`; desktop formata `pt-BR`/`R$` em `pdv-local/src/App.tsx:850-919`.
- Impacto: virada do dia e lojas fora do fuso podem divergir dashboard, detalhe e fechamento.
- Correcao/aceite: timezone por loja obrigatorio, bounds UTC calculados uma vez, fixtures em virada/DST e Recife/UTC; nenhuma inferencia por idioma.
- Dependencias/esforco/dono: produto + banco + frontend; **G**.

### FIN-005 - fechamento entre telas financeiras nao foi demonstrado

- Severidade/status: **P2 - NAO COMPROVADO**; bloqueia: nao isoladamente, mas necessario antes do aceite financeiro.
- Evidencia: readers de AP/AR e RPCs de dashboard existem; nao houve dataset controlado que reconcilie dashboard, vendas, caixa, AP, AR e comissoes no mesmo periodo/loja.
- Impacto: KPI visual pode omitir cancelamento, devolucao ou filtro, mesmo com writer correto.
- Correcao/aceite: fixture dourada unica e reconciliacao automatica centavo a centavo por tela.
- Dependencias/esforco/dono: QA + produto + financeiro; **G**.

## Matriz das telas administrativas

| Tela | Indicadores/definicao | Origem/formula/filtros | Vazio/erro/atualizacao | Confianca/evidencia |
|---|---|---|---|---|
| Dashboard | vendas, faturamento, ticket, top produto/serie | RPCs `dashboard_gerente_resumo*`; loja, periodo, TZ | estados existem; reconciliacao nao executada | **NAO COMPROVADO** |
| Vendas | total, status, pagamentos, eventos | vendas+itens+pagamentos+ledger; loja/periodo | UI e auditoria existem | **CONFIAVEL COM RESSALVA**: writer canonico guard passou; DB nao provado |
| Caixa | abertura, movimentos, saldo esperado, diferenca | caixas+movimentacoes; formula server-side | fluxo documentado | **NAO COMPROVADO**: concorrencia/pendencias sem DB |
| Contas a pagar | saldo, pagamentos, vencimento | `contas_pagar` + pagamentos; reader admin | reader possui retorno de erro | **NAO COMPROVADO**: AP SQL nao executado |
| Contas a receber | saldo, liquidacoes, cliente | `contas_receber` + liquidacoes; reader admin | paginacao/erro no reader | **NAO COMPROVADO**: AR SQL nao executado |
| Comissoes | base, ajustes, liquido | ledger/snapshot e bloco 20260814 | tela/reporting existente | **NAO COMPROVADO**: concorrencia e ordem nao executadas |
| Relatorios | margem, consistencia, periodo | RPCs report; loja/TZ/status | diagnosticos restritos por migration pretendida | **NAO COMPROVADO**: grants e fechamento nao consultados |

## Cenários de regressao obrigatorios

Duas requests simultaneas; retry apos timeout; failpoint entre writer e caixa; venda offline duplicada; mesma chave em duas lojas; cancelamento parcial/total; devolucao antes/depois da comissao; mudanca de configuracao; fechamento com outbox pendente; virada de dia; Recife/UTC; `0,005`, `0,015`, valores negativos/limite; payload adulterando loja/usuario/preco/desconto/total; usuario inativo; migration interrompida e leitura concorrente.

