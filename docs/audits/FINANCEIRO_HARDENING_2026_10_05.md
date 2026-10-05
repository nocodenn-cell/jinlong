# Auditoria final do financeiro — 05/10/2026

Base: main `9cc73a6`; branch `fix/financeiro-hardening-final`. Diagnóstico entregue
antes das alterações. Consultas remotas somente leitura; nenhuma migration,
correção de dados, merge ou publicação em produção autorizada nesta etapa.
Dados operacionais brutos e os identificadores completos dos caixas permanecem
fora do Git. A declaração de ausência de erros em 24 horas veio do solicitante;
não foi substituída por uma verificação independente de logs nesta auditoria.

## Diagnóstico e decisões

Os nove testes financeiros originais passaram. Uma asserção adicional mostrou
que o estorno de uma transferência do PDV aparecia como despesa. Catálogo remoto
confirmou RLS permissiva com exceção global para DONO/ADMIN em AP/AR e históricos,
e permissões de UPDATE/DELETE nos títulos. Na interface, a fila fiscal aparecia
em A receber e Fiscal; a navegação não seguia a ordem operacional solicitada.

| Achado real / evidência | Prioridade | Cliente / integridade / segurança / UX | Menor correção | Migration / domínio / reversão |
|---|---|---|---|---|
| Estorno da sangria bancária altera resultado: teste reproduziu diferença de R$20; `financeiro_painel` omitia `ESTORNO_TRANSFERENCIA_PDV` da exclusão | P0 | Resultado incorreto / sim / não / sim | Excluir também a contrapartida compensatória | Sim / sem mudar cash / reversível por nova migration |
| Exceção cross-loja em policies de títulos e históricos: `pg_policies` permite DONO/ADMIN; grants permitem alterações diretas nos títulos | P0 | Exposição e reescrita / sim / sim / inconsistente | SELECT por loja para todos; revogar DML; preservar INSERT de AR validado | Sim / somente financeiro / reversível, mas não reabrir acesso inseguro sem revisão |
| Fila fiscal duplicada: duas renderizações de `FiscalList` | P2 | Confusão / não / não / sim | Remover só a apresentação em A receber | Não / sem alterar fiscal / revert Git |
| Ordem das abas e falta de orientação inicial | P2 | Primeiro uso / não / não / sim | Ordem única neutra e cartão PT/zh quando não há contas | Não / sem wizard / revert Git |
| Fixtures dependem de dados prévios: AP prepara títulos sob authenticated; comissão usa vendedor do seed e conta lotes globais; caixa online pode ter operador nulo | P2 | Confiabilidade dos testes / indireto / não / não | Preparar AP como proprietário; vendedor/operador sintéticos e contagem escopada | Não / nenhum escritor de vendas alterado / revert Git |

Não criar novos serviços, tabelas, filas ou modelos de escrituração. Os defeitos
remotos antigos de vendas/fiscal/segurança já têm migrations no repositório;
duplicá-las não resolve a autorização nem o histórico remoto. Não são P3: sua
implantação é uma pendência separada, com prioridade de segurança indicada abaixo.

## Sete fluxos e sua autoridade

Fonte principal: `20261005004647_financeiro_loja_contas_ledger.sql`; a correção
aditiva é `20261005091218_financeiro_hardening_final.sql`.

| Fluxo diário / utilidade | Interface e comando | Fonte autoritativa / escritor | Repetição, reversão, loja e risco |
|---|---|---|---|
| A pagar: despesas, compras, vencimento, recorrência, pagamento parcial | `FinanceiroTitulosOperations`, `CRIAR_AP`, `BAIXAR_AP`; lista e modal AP legados | `contas_pagar`, `contas_pagar_pagamentos`; `registrar_pagamento_contas_pagar`; hook `financeiro_baixa_ledger` vincula somente banco | Comando UUID + chave por título; pagamento e ESTORNO preservados; `estornar_pagamento_contas_pagar`; conta/título na loja do ator. Pagamento em dinheiro permanece em cash. Corrigir DML direto dos títulos |
| A receber: dívida de cliente, vencimento, recebimento parcial | `FinanceiroReceberExtras`, adapter `ReceivableWriter`, `CRIAR_AR`/`BAIXAR_AR` | `contas_receber`, `liquidacoes_receber`; `registrar_liquidacao_receber`; hook bancário | Chave por título; `estornar_liquidacao_receber`; data efetiva e journal compensatório. INSERT legado validado por loja, cliente, centavos e aberto=total. Sem UPDATE/DELETE direto |
| PIX/cartão: previsão e conferência do depósito líquido | `FinanceiroRecebiveis`, `CONFIGURAR_RECEBIVEL`, `RECEBER_VENDA` | `vendas_pagamentos` → triggers diferidas `financeiro_capturar_venda` → `financeiro_recebiveis_venda` → journal | Dinheiro excluído; parcelas preservam bruto/taxa; taxa é valor monetário informado. Configuração não credita banco; receber credita bruto−taxa−reembolso. Correção com motivo via `ESTORNAR_RECEBIVEL`. Nenhum backfill automático de vendas antigas; split offline remoto ainda pendente |
| Contas, reservas e transferências: onde está o dinheiro da loja | `FinanceiroContas`, `CRIAR_CONTA`, `TRANSFERIR`, `MOVIMENTO` | `contas_financeiras`, `movimentos_financeiros`; único escritor interno `financeiro_movimento` | Saldo = soma assinada no PostgreSQL; abertura/transferência não são receita. Transferência gera duas pernas na mesma transação. Avulso estornado por contrapartida e motivo; RLS e ACL impedem escrita direta |
| PDV ↔ banco/reserva: sangria ou suprimento já existente | `VINCULAR_CAIXA` | `movimentacoes_caixa` é o fato do domínio cash; journal só registra contrapartida bancária; `financeiro_estorno_caixa` acompanha reversão | Movimento aprovado, não apagado, mesma loja, não associado a AP, não reutilizado. Financeiro não atualiza `caixas.saldo_atual`. Excluir original e estorno do resultado; teste completo usa RPC real e E(c) |
| Devolução/cancelamento: refletir dinheiro já recebido | Gatilhos diferidos `financeiro_pos_venda`, `financeiro_reembolso_parcela` | `devolucoes`, `venda_pos_venda_operacoes`, recebível e journal | Reembolso proporcional com soma exata de centavos; dinheiro já desembolsado pelo PDV não debita banco. Crédito ao cliente não é reembolso bancário. Repetir evento não repete compensação. Taxa original fica como despesa; conferir casos de reembolso por conta/meio diferente |
| Conciliação: conferir realidade bancária sem criar dinheiro | `FinanceiroConciliacao`, `IMPORTAR_EXTRATO`, `CONCILIAR`/`DESCONCILIAR` | `extratos_financeiros`, `conciliacoes_financeiras`; RPC e `financeiro_candidatos_conciliacao` | Importar não altera saldo. Referência única por conta; reimportar igual é neutro, diferente é erro. Mesmo sinal/valor/conta e vínculo ativo único. Desfazer preserva usuário, data e motivo; importar não substitui lançamento |

Todas as operações novas passam por `financeiro_comando`: autenticação, usuário
ativo, perfil GERENTE/DONO/ADMIN, loja obrigatória, lock por loja, validação de
IDs, comparação do payload de replay e registro em `financeiro_comandos` na mesma
transação. As RPCs antigas de baixa/estorno continuam como escritores de AP/AR.
Categorias, clientes e fornecedores são consumidos dos cadastros oficiais.

Não há segundo escritor de saldo no frontend. Conversão e formatação de números,
somas de exibição por categoria e margem estimada não persistem saldo nem validam
pagamentos. Projeção de 91 dias, valores abertos, parcelas, taxas, compensações e
saldo consolidado vêm do banco. Recebíveis sem previsão/taxa e AR sem vencimento
ficam fora da projeção com alerta. Resultado gerencial separa competência de
regime de caixa e exclui NF-e como despesa manual para não descontar CMV duas vezes.

## Dezesseis cenários obrigatórios

`backend/scripts/test-financeiro-loja.mjs` usa PostgreSQL real em memória, catálogo
legado simplificado e corpos originais das RPCs, sem simular suas respostas.
`financeiro-hardening-full-schema.test.sql` usa Supabase completo e RPC cash real.

| Caso | Evidência automatizada / resultado esperado |
|---|---|
| 1 Aluguel R$2.000 por três meses | Três títulos de R$2.000; competências outubro/novembro/dezembro, sem dividir o valor recorrente |
| 2 Pagar R$500 de R$2.000 | Valor aberto R$1.500, banco −R$500, PDV preservado |
| 3 Repetir a baixa | Mesmo UUID retorna o mesmo pagamento; exatamente um histórico; payload diferente recusado |
| 4 Estornar a baixa | Original R$500 preservado; uma linha compensatória; banco e aberto restaurados |
| 5 Transferir banco/reserva | Duas pernas; consolidado inalterado; resultado sem receita/despesa |
| 6 Sangria vinculada | RPC real: E(c) e contador 100→80; vincular não os altera; banco +20; estorno retorna PDV100/banco0 e não produz despesa |
| 7 Cartão R$100/taxa R$3 | Depósito exato R$97; mesma chave neutra; segundo recebimento com nova chave recusado |
| 8 Cartão em três parcelas | Soma bruto100/taxa3/líquido97; vencimentos 31/10, 30/11, 31/12 |
| 9 Venda mista R$150 | Dinheiro50/cartão100; captura apenas100 eletrônico; não credita previsão no banco |
| 10 Cancelamento eletrônico | Receber, corrigir, receber novamente e cancelar preserva histórico e compensa uma única vez |
| 11 Devolução parcial | Dinheiro10 não altera banco; cartão50 proporcional, soma exata50; novo UPDATE de venda não repete ajuste |
| 12 Importar extrato igual | Uma linha por referência/conta; mesmo arquivo novamente não cria saldo nem duplica linha |
| 13 Importar extrato alterado | Mesma referência com valor diferente recusada; conteúdo original preservado |
| 14 Conciliar errado | Sinal oposto ou conta diferente recusados; candidato correto encontrado; vínculo duplicado recusado; desfazer preserva histórico |
| 15 Loja A versus B | GERENTE, DONO e ADMIN de B não leem títulos/históricos/tabelas novas de A; conta de outra loja não recebe comando; histórico sem loja usa loja do título |
| 16 Papel/perfil/acesso direto | 80 combinações de ACL: dez tabelas × quatro verbos × dois papéis; tentativas reais de INSERT/UPDATE/DELETE; anon sem leitura; operador/inativo/sem sessão sem RPC; nove funções internas não executáveis |

Os testes de cancelamento/reembolso em memória inserem os fatos de pós-venda;
não substituem a validação dos escritores reais, que pertence ao gate completo.
Não foram feitos pagamentos de teste em produção. Não declarar certificação de
concorrência do módulo novo a partir de testes sequenciais: lock e unicidades
foram revisados; as suítes concorrentes existentes continuam no gate financeiro.

## UI, uso inicial e limites

Fila fiscal permanece apenas em Fiscal, mantendo abertura do detalhe e stub;
sem alterar emissão, worker, retenção ou schema fiscal. Ordem: Resumo, A receber,
A pagar, Contas e movimentos, PIX e cartões, Conciliação, Resultado, Fiscal;
Categorias é o cadastro separado. Links preservam somente filtros da aba de
destino. Contrato de IDs e ordem ficam em módulo neutro compartilhado pelo nav.

Orientação inicial PT/zh aparece sem contas em A receber, Resumo e Contas:
conferir banco, cadastrar reservas fora dos PDVs, não duplicar dinheiro do PDV,
saldo inicial não é receita, organizar despesas e conferir taxas/previsões.
Nenhuma orientação cria registros. Some quando já há contas.

Quatro testes de interface verificam exclusividade fiscal/detalhe, ordem e
filtros e primeiro uso PT/zh. Formulários usam labels envolvendo os controles,
fieldset desabilitado durante envio e status/alert; paginação de 50 vem do banco;
nav rola horizontalmente e tabelas principais têm overflow. O CSV aceita até500
linhas e mensagens do banco são exibidas. Carregamento do painel mostra alerta
quando a RPC falha. Não houve homologação visual móvel completa desta nova PR.

Pendências de UX existentes: textos operacionais das telas novas ainda estão em
português mesmo sob locale zh; datas nas tabelas novas são YYYY-MM-DD; filtro de
período não significa filtro de vencimento em todas as listas; legado e painel
possuem paginações diferentes; exportação é da página, explicitamente rotulada;
repetir recebimento já recebido com nova chave retorna mensagem genérica de
configuração. Não ampliar esta PR para refazer todas as telas ou traduções.

## Dezenove migrations antigas ausentes no remoto

Consulta de `supabase_migrations.schema_migrations`, catálogo e cabeçalhos locais.
A = necessária ao financeiro atual; B = vendas/fiscal; C = segurança;
D = equivalência integral demonstrada; E = exige autorização/tratamento separado.
A classificação é técnica; todas continuam pendentes no histórico remoto.
Nenhuma das 19 foi reparada, aplicada, marcada equivalente ou excluída do gate.
Não foi demonstrada equivalência integral D, nem dependência A para executar as
três RPCs financeiras novas. B/C podem afetar a qualidade dos fatos de origem.

| Migration | Classe | Finalidade, evidência remota e risco | Recomendação |
|---|---|---|---|
| 20260902130000 fiscal_payload_snapshot_venda | B/E | Congelar payload na venda. Snapshot atualizado ausente; altera escritor central | Revisar com cadeia fiscal/vendas; sem replay de vendas antigas |
| 20260902130100 fiscal_provider_config | B/E | Credencial por empresa; tabela ausente | Exige configuração real e autorização fiscal; não usar credencial global como equivalente |
| 20260902140300 fiscal_payload_snapshot_icms_origem | B/E | Snapshot inclui origem ICMS; escritor remoto não a inclui | Depende do snapshot anterior; não aplicar isolada substituindo correções posteriores |
| 20260902150000 list_produtos_gerente_filtrados_campos_fiscais | B/E | Leitura completa na edição fiscal; retorno remoto não tem icms_origem | Revisar impacto de catálogo; risco de perder classificação fiscal na edição |
| 20260902160000 documentos_fiscais_venda_id_restrict | B/C/E | Retenção; FK remota ainda ON DELETE CASCADE | Prioridade de integridade fiscal; implantar apenas com revisão própria |
| 20260903100000 fiscal_claim_ja_tentou_emissao | B/C/E | Não reemitir após DLQ; claim remoto sem sinal independente da contagem | Revisar worker+RPC juntos antes de emissor real |
| 20260903110000 fiscal_delete_integrity | B/C/E | Impedir apagar documento; DELETE authenticated ainda concedido | Pendência de segurança/retencão, sem provar equivalência pela RLS apenas |
| 20260903120000 fiscal_provider_identity_imutavel | B/C/E | Congelar empresa/ambiente/provider; campos e guarda nova ausentes | Cadeia fiscal própria; não mudar identidade de documentos existentes |
| 20260903130000 registrar_venda_pagamentos_split | B/E | Preservar misto offline; remoto tem só assinatura escalar de11 argumentos | Importante para recebíveis: remoto escalar não equivale a split. Homologar sync/desktop e writer |
| 20260903140000 registrar_venda_pagamentos_idempotencia | B/C/E | Replay compara pagamentos; overload split ausente | Revisar junto do split; risco de retry divergente aceito |
| 20260903150000 fiscal_xml_persistence | B/E | XML autorizado, retenção/status; colunas/RPC XML ausentes | Cadeia fiscal com contrato do provedor confirmado |
| 20260903160000 fiscal_eventos_provider_congelado | B/E | Timeline do congelamento; evento novo ausente | Depende da identidade imutável; não reconstruir eventos por suposição |
| 20260903170000 fiscal_xml_lease_concorrencia | B/C/E | Lease durável; RPC XML remota ausente | Implante com persistência XML e teste de concorrência |
| 20260903180000 fiscal_hotfix_codex_review | B/C/E | TOCTOU lease, retries XML e correções dependentes | Sem equivalente demonstrado; revisar toda a cadeia antes de executar |
| 20260913090000 relatorio_tz_validado_sem_pg_timezone_names | E | Performance de relatórios; remoto mantém função SQL com pg_timezone_names | Semântica semelhante não é equivalência da otimização; não marcar aplicada |
| 20260916120000 sec04_token_gerente_vinculo_loja_v4 | C/E | Token emitido em outra loja: helper ausente e wrapper sem guarda | P0 histórico: já existe correção local. Rollout separado de vendas obrigatório; não duplicar migration |
| 20260916120200 sec06_revoke_transferir_estoque_entre_lojas_legado | C/E | Superfície antiga sem consumidor; EXECUTE authenticated ainda true | Revisar revogação; guarda gerencial existente reduz exposição, mas não equivale à revogação |
| 20260929120000 caixas_fechado_exige_dados_fechamento | E | Seis linhas violam CHECK; preflight aborta; NOT VALID ainda trava UPDATE delas | Conferir dados reais antes de autorizar. Não completar diferença zero por estimativa |
| 20260929130000 descontos_venda_exige_pagamento_dinheiro | B/C/E | Regra de desconto só em dinheiro; trigger remota ausente | Homologar vendas e descontos por todos os meios; não alterar saldo para satisfazer constraint |

Após criar a migration desta PR haverá uma nova pendência intencional além das
19 antigas. O gate de drift deve permanecer vermelho até um rollout autorizado
ou prova específica de equivalência; não enfraquecer CI para liberar a PR.

## Seis fechamentos históricos

Todos têm `data_fechamento` e `valor_fechamento`; falta somente
`fechamento_diferenca`. Dois são de abril, três foram fechados no mesmo instante
em julho e um tem abertura/fechamento no mesmo instante em julho. Duas linhas de
abril têm cinco vendas e duas movimentações cada. Outros turnos têm zero/uma
venda ou movimento. Padrões sugerem fixtures/atualizações em lote, mas não provam
a origem exata. Os IDs completos estão na evidência privada local, fora do Git.

O saldo atual não é o esperado histórico no fechamento: há diferença em relação
ao valor contado. Correção manual somente com conferência original e trilha
válida naquele instante. Nenhum valor foi inventado, linha removida, status
alterado ou constraint imposta. Consulta reproduzível, somente leitura:

```sql
SELECT id, data_abertura, data_fechamento
FROM public.caixas WHERE status='FECHADO'
AND (data_fechamento IS NULL OR valor_fechamento IS NULL OR fechamento_diferenca IS NULL);
```

## Segurança, advisors e evidências

Seis tabelas novas: RLS habilitada; anon sem verbos; authenticated apenas SELECT.
Três RPCs públicas intencionais: EXECUTE authenticated, nunca anon; autenticação,
ativo/perfil/loja e search_path fixo. Nove funções internas sem EXECUTE de clientes.
Ledger imutável também para owner; histórico de baixa não pode ser reescrito.
RLS antiga era permissiva e combinada por OR: nova migration remove as oito
policies conhecidas e aborta se encontrar outra desconhecida. História com loja
nula permanece acessível ao ator correto via título; não é preenchida em lote.
AR manual preserva adapter, mas exige cliente da mesma loja, total positivo e
finito com centavos, aberto=total e status ABERTO.

Advisors remotos executados antes da correção, sem ERROR:

| Advisor | Resultado / interpretação |
|---|---|
| Security | 5 INFO RLS sem policy fora do financeiro; 7 WARN search_path mutável fora das funções novas; 68 WARN SECURITY DEFINER authenticated, incluindo três RPCs financeiras intencionais; 1 WARN proteção de senha vazada desativada |
| Performance | 63 INFO FKs sem índice, 25 WARN auth RLS initplan, 1 INFO sem PK, 72 INFO índices não usados, 130 WARN policies permissivas múltiplas. AR/liquidações estão entre as duplicadas e a migration as consolida |

Aviso SECURITY DEFINER não prova vulnerabilidade; ACL, guardas e testes são a
evidência relevante. FKs sem índice não provam lentidão nesta base pequena;
não remover índices só porque ainda não foram usados. A proteção de senha e o
search_path de funções legadas são backlog de segurança independente, não P3.
Referências oficiais consultadas: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[advisor 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
[changelog](https://supabase.com/changelog).

## Validação e entrega

| Verificação local | Resultado |
|---|---|
| `test:financeiro-loja` | 14/14 aprovados, incluindo 80 combinações de ACL, tentativas reais e os valores obrigatórios |
| Interface e contratos relacionados | 17/17 aprovados; quatro são os testes novos de fiscal/nav/primeiro uso PT/zh |
| Suíte web completa | Primeira execução: 2.009 aprovados e integração de produto com chave placeholder inválida. Reexecução: 2.007 aprovados, contrato textual das abas corrigido e timeout de dashboard que passou isoladamente. Nova execução completa/CI necessária; não declarar verde integral |
| Tipos | Aprovado |
| Lint | Aprovado, um aviso anterior de `any` em E2E de atalhos |
| `guard:all` | Aprovado, um aviso anterior de cadastro inline de fornecedor |
| Build | Build local aprovado; reexecução final em acompanhamento |
| Gate financeiro completo | Instalação anterior: 29/31 suítes aprovadas; as duas falhas também reproduzidas com arquivos de main. Com migrations dentro de transações: 24/26 SQL aprovados, incluindo novo teste cash/PDV completo e AP/AR. Fixtures antigas foram isoladas; execução final interrompida por Docker indisponível, ainda exige CI completo |
| Edge | Sync e validar-gerente aprovados; fiscal-worker aprovado com Deno temporário2.9.6. `npm run check` com Deno2.2.2 falha por lockfile v5 preexistente; nenhuma dependência/lockfile alterada |
| Advisor / drift remoto | Leitura documentada acima; 19 pendências anteriores mais esta migration nova não aplicada. Não dispensar o gate |

O teste SQL novo foi registrado no runner do gate financeiro, portanto o CI
deve executá-lo na instalação completa, além do PGlite. As transações do harness
local foram desfeitas; nem a migration financeira anterior foi persistida nessa
instalação local durante o teste. Não confundir falha de infraestrutura com teste
aprovado. A PR permanece para revisão e sem merge.

Arquivos alterados:

- Banco: `backend/supabase/migrations/20261005091218_financeiro_hardening_final.sql`.
- Banco/testes: `backend/scripts/test-financeiro-loja.mjs`, `financeiro-hardening-full-schema.test.sql`, `run-financial-tests.mjs`, `ap-payments-reconciliation.test.sql`, `sale-totals-invariant.test.sql`, `financial-adversarial-gates.test.sql`.
- Interface: `pdv-importados/app/admin/financeiro/_components/FinanceiroContent.tsx`, `FinanceiroWorkspace.tsx`, `FinanceiroPrimeiroUso.tsx`, `financeiroTabs.ts`, `FinanceiroHardening.behavior.test.tsx`.
- Navegação: `pdv-importados/components/ui/admin-v2/AdminHubTabNav.tsx`, `pdv-importados/lib/navigation/financeiroTabId.ts`.
- Idiomas: `pdv-importados/src/lib/i18n/pt.json`, `zh.json`.
- Documentação: este relatório, `docs/financeiro-loja.md`, `docs/architecture/GO_LIVE_FINANCEIRO_FISCAL.md`.

Migration criada: `backend/supabase/migrations/20261005091218_financeiro_hardening_final.sql`.
Nenhuma alteração de schema de dados ou regra de vendas/fiscal/comissões/cash.
Ela revoga permissões, recria policies e substitui apenas uma condição do painel.
O preflight exige o corpo esperado da função e policies conhecidas; é atômica.
Rollback da interface por Git; rollback de ACL/policies exige revisão própria
para não reabrir a exposição. Não apagar o journal nem seus vínculos.
