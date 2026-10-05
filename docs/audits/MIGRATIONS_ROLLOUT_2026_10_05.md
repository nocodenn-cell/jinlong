# Rollout das migrations pendentes — 05/10/2026

## Resultado e autorização

O usuário pediu revisar as 19 migrations pendentes e colocá-las na main, após solicitar
o merge das melhorias financeiras. Os arquivos das 19 já pertenciam à main:
a pendência efetiva era a aplicação no projeto Supabase `kbabmewnahysfvlybiak`.
Nesta etapa foram aplicadas de fato as 19 e a migration de hardening financeiro
`20261005091218`. A PR #456 entrou na main pelo merge automático normal do GitHub,
commit `6fb5930d077215d2c0f0a391a553dee10df1fe64`; nenhum gate foi removido
ou ignorado por privilégio administrativo.

O usuário confirmou expressamente que os seis caixas incompletos são TESTES.
A correção desses seis precedeu a constraint. Não houve autorização inferida para
corrigir caixas reais ou inventar uma chave fiscal.

## Pré-deploy, dependências e avaliação de risco

- As três funções centrais em produção (wrapper online, unscoped online e escritor
  offline escalar) foram comparadas com suas origens aplicadas. Corpos iguais após
  normalizar CR/LF e whitespace nas extremidades: nenhum patch posterior desconhecido
  seria perdido ao aplicar as substituições antigas.
- Ordem preservada: snapshot → configuração de provider → ICMS/listagem/retencão →
  claim/identidade → split/replay → XML/lease/hotfix → timezone → segurança →
  fechamento/desconto. Nenhuma emissão real, credencial ou provider foi ativado.
- O sync-outbox implantado já envia `p_pagamentos`; assim a remoção da assinatura
  escalar de 11 argumentos é compatível com esse consumidor. Existe somente a nova
  assinatura de 12 argumentos, service_role, ao final.
- Antes das alterações foram salvas cópias privadas dos corpos/ACLs de 22 funções,
  policies/grants/constraints afetados e registros completos dos seis caixas.
  São snapshots direcionados para recuperação, não uma certificação de backup
  completo do projeto nem de PITR. Dados brutos ficam fora do Git.
- Alto risco identificado: impor o CHECK sobre caixas antigos incompletos poderia
  bloquear cancelamentos/estornos. Resolveu-se somente o conjunto confirmado como
  teste; o preflight terminou com zero e o CHECK foi VALIDADO.
- Alto risco identificado: o backfill de XML tocava um documento EMITIDO antigo com
  chave de smoke inválida e disparava o CHECK NOT VALID de chave fiscal. A primeira
  aplicação do hotfix abortou e foi desfeita. O predicado agora exige chave válida
  de 44 dígitos. O registro antigo permanece intacto, fora dessa inicialização de XML.
- A tabela de configuração de provider permanece vazia; secrets externos não foram
  criados ou copiados. Fiscal-worker remoto versão 38 não foi implantado novamente
  nesta etapa. Estrutura pronta não certifica emissão ou obtenção real de XML.

## Ajustes mínimos nos arquivos SQL antes da aplicação

| Arquivo | Correção e finalidade |
|---|---|
| 20260903100000 | A fixture tem created_at=-infinity e claim(1), para ficar à frente de uma fila populada e não reclamar outros documentos nesse claim. O reaper original continua exercitado dentro de subtransação com rollback sentinela |
| 20260903130000 | Produto sintético com preço controlado e origem válida; teste do split não assume o preço do catálogo real; produto e efeitos são desfeitos |
| 20260903140000 | Mesma correção de fixture para os cenários de replay, ordem, divergência e escalar → split |
| 20260903180000 | Backfill de XML limitado a chave fiscal válida; não desativa CHECK, não inventa chave e não altera documento de smoke inválido |

As três primeiras mudanças atingem somente os autotestes, sem alterar os corpos
das RPCs operacionais. A quarta restringe o backfill, preservando as RPCs de lease
e as proteções de TOCTOU/imutabilidade. Nos autotestes, a sentinela VRB01 desfaz as
escritas; erros de asserção não são capturados como sucesso.

## Correção dos seis registros de teste

Identificadores e cópias anteriores estão nos arquivos privados locais. A operação
adquiriu lock por linha, comparou o registro inteiro com o snapshot e abortaria se
houvesse mudança concorrente. Atualizou somente fechamento_diferenca e anexou uma
observação explícita de normalização de TESTE.

Fórmula: valor_fechamento − saldo_atual da fixture no instante da manutenção.
Não se apresenta esse cálculo como diferença histórica de caixa real. Dois
registros resultaram em −347,50; quatro em zero pela conta dos valores existentes,
sem preencher zero indiscriminadamente. Valor contado, saldo, loja, status e datas
não mudaram. Após a correção: zero caixas fechados incompletos; constraint validada.

## Aplicações e prova integral de SQL

O Supabase MCP registrou o horário real de cada aplicação. O SQL completo de
`schema_migrations.statements[1]` foi comparado com o arquivo correspondente:
**20 de 20 iguais**, normalizando somente CR/LF e whitespace nas extremidades.
Os hashes abaixo são SHA-256 desses textos normalizados.

`migration-human-gates.json` registra os pares version local/remota pelo mecanismo
existente. Não é repair de migrations ausentes nem dispensa do gate: cada aplicação
ocorreu, foi verificada e ambos os lados do par precisam aparecer no ambiente
avaliado. Os 12 testes do mecanismo confirmam que um par incompleto continua bloqueando.

| Arquivo local | Version aplicada no remoto | SHA-256 normalizado |
|---|---|---|
| 20260902130000_fiscal_payload_snapshot_venda.sql | 20261005151443 | `d855e89de59c2d954fc07b656d4d10026a1214ee6caf18c8b3e26d87cc086a1b` |
| 20260902130100_fiscal_provider_config.sql | 20261005151446 | `ef1dd88a68884cd05ff32980240e2ee021ee2ee4341d4fdd87526e739dfd4c50` |
| 20260902140300_fiscal_payload_snapshot_icms_origem.sql | 20261005151453 | `0413d6bef5f7b01e4ef5b1db394a64233f3248474c02e614dfafafbdd9bee0e9` |
| 20260902150000_list_produtos_gerente_filtrados_campos_fiscais.sql | 20261005151457 | `47d210849fbdbd4a91b2fc7a10a8b06c3c7a15a9bb1e8c0bb688a9e6fe2cac71` |
| 20260902160000_documentos_fiscais_venda_id_restrict.sql | 20261005151501 | `abf797a5a3035025294740327ff949c69996173a8aba00ed5dfa8c66da6ccf58` |
| 20260903100000_fiscal_claim_ja_tentou_emissao.sql | 20261005151513 | `a51caf00c9bb447e60c2b1004842ad2b10eda5cf159bd242f587ae220c42fecc` |
| 20260903110000_fiscal_delete_integrity.sql | 20261005151518 | `bc46ea0a0dc7bfea3bc1fcb74c3c97eb76dca140b3529a99cf550058f629667a` |
| 20260903120000_fiscal_provider_identity_imutavel.sql | 20261005151521 | `db274b001cd522af01bb540397e42df542852e27a977c20d28a55533ce36b1b3` |
| 20260903130000_registrar_venda_pagamentos_split.sql | 20261005151524 | `fe80e3e47d6aa7755bdc28399830d6814f4d4f8766ec1ffa6f878fb9413f1747` |
| 20260903140000_registrar_venda_pagamentos_idempotencia.sql | 20261005151527 | `8fe9dc392637a32cb003bbf8c8c02b0242f3cda69997143ea5c8b9b21ca3f5e1` |
| 20260903150000_fiscal_xml_persistence.sql | 20261005151543 | `e6e726ed6d7f8c4974ddb5457060641c13a0abe816f09486cd03cf8262e2937f` |
| 20260903160000_fiscal_eventos_provider_congelado.sql | 20261005151548 | `8a7951f6f6feb1558dbcd5c4f98f68a04a1eaa6b9dacd6b4ce69f383636e37f8` |
| 20260903170000_fiscal_xml_lease_concorrencia.sql | 20261005151552 | `f89f445d86393d19a0dadb299b097f9594c8acfa30edfb8c2cd3ffd6cda95b0c` |
| 20260903180000_fiscal_hotfix_codex_review.sql | 20261005151717 | `e70dbf662265fbdf744f5062618a3b714bd131864401c4d91bf8e3c9a8f5d811` |
| 20260913090000_relatorio_tz_validado_sem_pg_timezone_names.sql | 20261005151721 | `d85bb7760125f6374f95053980562b6cb2ad689d2e8319274aeb7c1d59eda99c` |
| 20260916120000_sec04_token_gerente_vinculo_loja_v4.sql | 20261005151725 | `7c140436b0067d9f21b125d820bad6d023f8cd1154c0a566205a1a923089b5ef` |
| 20260916120200_sec06_revoke_transferir_estoque_entre_lojas_legado.sql | 20261005151728 | `d49117809d76da8d93a193f25b89eda7ca1cc66ebecbd555677b027b4840bfbd` |
| 20260929120000_caixas_fechado_exige_dados_fechamento.sql | 20261005151730 | `eea96f3dcf8673c1fc38eb22fd9715a9b4422804a64a2f1d1fa7590be65c6b95` |
| 20260929130000_descontos_venda_exige_pagamento_dinheiro.sql | 20261005151733 | `1f0ac0ee38cac75318016805bdfc6a7fe5ee49ffeec6776f456e30093a703ff5` |
| 20261005091218_financeiro_hardening_final.sql | 20261005151736 | `bd9e46886fdb0c9b80628d4c4736560cf61f5ad8b64b64840491f540837ef33f` |

## Pós-deploy e validação

- As 19 migrations foram exercitadas em ordem no Supabase local real, junto com
  os triggers do financeiro, em transação desfeita. As provas de snapshot, split,
  replay, retenção, provider, XML, lease e imutabilidade passaram.
- 12/12 testes do controle de drift e 14/14 regressões PostgreSQL do financeiro
  passaram após os ajustes. O CI completo da atualização ainda deve confirmar o reset.
- Em produção: CHECK de fechamento validado; FK fiscal RESTRICT; DELETE fiscal
  de authenticated negado; execução autenticada da transferência antiga revogada;
  helper de loja do token presente; split único de 12 argumentos; claim XML com
  lease presente; snapshot com ICMS; filtro do resultado exclui estorno de transferência;
  timezone otimizado e trigger de desconto ativos.
- As quatro tabelas financeiras antigas negam UPDATE/DELETE diretos e leitura anon;
  somente criação validada de AR mantém INSERT authenticated.
- Smoke de leitura do painel com sessão gerencial retornou corretamente. O journal
  continuou com zero movimentos; não foram gravados pagamentos comerciais de teste.
- A fila fiscal preservou os 42 registros e sua distribuição: 5 PENDENTE, 35 ERRO,
  1 EM_PROCESSAMENTO e 1 EMITIDO. Produtos sintéticos residuais: zero.
- Advisors pós-DDL: nenhum ERROR. Segurança: 5 INFO RLS sem policy, 7 WARN search_path,
  67 WARN SECURITY DEFINER authenticated e 1 WARN proteção de senha vazada. Performance:
  63 FKs sem índice, 27 auth initplan, 1 tabela sem PK, 70 índices não usados e
  122 policies permissivas múltiplas. As duas novas ocorrências de auth initplan
  são da configuração fiscal; ficam como otimização, não foram disfarçadas como
  ausência de avisos. Avisos legados permanecem backlog.
- Referências dos advisors: [SECDEF](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
  [auth initplan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
  [proteção de senha](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Rollback e limites

DDL funcional e ACLs têm snapshots anteriores privados para preparar reversão
pontual; não reabrir grants inseguros por conveniência. As colunas novas e o bucket
privado de XML não devem ser apagados depois de receber documentos. Um rollback
de código não desfaz automaticamente o schema. Não reduzir a proteção de lease
ou converter XML ARMAZENADO em ERRO.

Os seis ajustes de fixture podem ser revertidos com o snapshot original, mas isso
exige remover/revisar o CHECK porque voltariam a ser inválidos; não executar esse
rollback durante operações de caixa. Não apagar journal nem reconstruir fatos
fiscais por suposição.

Pendências separadas: a chave antiga de smoke permanece inválida; configuração/
secrets e homologação do provedor fiscal não fazem parte desta aplicação; avisos
dos advisors permanecem documentados. A atualização do histórico deve entrar em
main para que o gate remoto reconheça as aplicações reais.
