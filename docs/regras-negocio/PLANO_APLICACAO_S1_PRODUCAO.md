# Plano de aplicação da S1 em produção (Jinlong)

| Campo | Valor |
|---|---|
| Status | **Rascunho para revisão. Nenhuma ação em produção autorizada.** |
| Projeto Supabase de produção | `kbabmewnahysfvlybiak` (nome `jinlong`, região sa-east-1) |
| Projeto de homologação validado | `yvdilcmxyjafnnsfdtam` |
| Branch com os arquivos | `claude/jinlong-modular-integration-plan-4b3b2d` (commit `a29da7fc`) |
| Pacote a aplicar | S1, S1c, S1b e G14 (ver seção 2) |

## 1. Escopo e resultado esperado

- **S1:** GERENTE autorizado por vínculo (`usuario_vinculos` via `fp_usuario_pode_loja`) em `receber_ordem_compra`, `confirmar_remessa_entrada`, `confirmar_importacao_nfe` e `transferir_estoque_seguro`. A remessa passa a aceitar `p_loja_id` opcional (NULL = loja legada, comportamento de loja única preservado).
- **S1c:** a mesma troca de guarda em `registrar_conferencia_ordem_compra` e `registrar_conferencia_nfe`.
- **S1b:** transferência entre lojas com CNPJs distintos bloqueada para todos os perfis (`TRANSFERENCIA_CNPJ_DISTINTO_SEM_FLUXO_FISCAL`), até o fluxo fiscal (S8).
- **G14:** tabela `produto_equivalencias` (vazia na aplicação) e transferência que exige produto da origem e equivalência confirmada para o destino.

**Sem mudança de dados.** Nenhum backfill, nenhuma alteração em estoque, movimentos, remessas ou contas a pagar. Nenhuma revogação de grant de função existente.

## 2. Pacote e ordem de aplicação

| Ordem | Migration (arquivo no repositório) | Depende de |
|---|---|---|
| 1 | `20261029120000_s1_autorizacao_vinculo_recebimento_transferencia.sql` | — |
| 2 | `20261029140000_s1c_conferencia_recebimento_por_vinculo.sql` | — (independente) |
| 3 | `20261029130000_s1b_bloqueia_cnpj_distinto_todos_perfis.sql` | S1 (usa o bloco CNPJ que a S1 cria) |
| 4 | `20261029150000_g14_produto_equivalencias_transferencia.sql` | S1b (âncoras do corpo de transferência) |

Ordem de **rollback** (inversa, obrigatória): G14 → S1b → S1c → S1. O rollback da S1 só funciona depois que S1b e G14 forem desfeitos, porque ambos alteram o mesmo corpo de `transferir_estoque_seguro`.

Arquivos de rollback: `backend/supabase/rollback/20261029*_rollback.sql` (um por migration).

## 3. Pré-requisitos (antes de qualquer alteração em produção)

1. **Aprovação explícita** deste plano, da janela e do responsável pela execução.
2. **Merge do branch** em `main` por PR revisado. O banco de produção deve receber exatamente o conteúdo versionado. Nada de SQL colado à mão.
3. **Linha de base de produção** capturada e guardada: `md5(pg_get_functiondef(...))` dos corpos de `internal.receber_ordem_compra`, `internal.confirmar_remessa_entrada`, `internal.confirmar_importacao_nfe`, `internal.transferir_estoque_seguro`, `internal.criar_confirmar_remessa_entrada`, `internal.registrar_conferencia_ordem_compra`, `internal.registrar_conferencia_nfe`, além de `public.transferir_estoque_seguro` e `public.criar_confirmar_remessa_entrada`. Comparar com a linha de base da homologação antes da janela. **Se qualquer corpo divergir do esperado, abortar.** As migrations são feitas por substituição de texto com asserção de contagem: divergência faz a transação falhar, mas o diagnóstico precisa ser feito antes.
4. **Lista de migrations aplicadas em produção** comparada com o repositório (`list_migrations`). Confirmar que não há migration pendente que mexa nas mesmas funções.
5. **Backup lógico** (ou ponto de restauração do Supabase) registrado antes da janela. As migrations não alteram dados, mas o backup é a salvaguarda de último recurso.
6. **Consumidores verificados:** o app chama `criar_confirmar_remessa_entrada` com 5 argumentos (`pdv-importados/app/gerente/recebimento/actions.ts:198`). A assinatura muda para 6 argumentos, com `p_loja_id` com DEFAULT NULL. A chamada antiga continua válida. Confirmar em homologação que a chamada do app (5 argumentos, nomeados) resolve para a nova assinatura. **Já validado** nos testes E2E de remessa sem `p_loja_id`.
7. **Janela de baixo uso** (produção tem uma única loja, mas confirmar horário com o operador).

## 4. Execução (com autorização)

Para cada migration, nesta ordem:

1. Aplicar o arquivo versionado (ferramenta de migration do projeto de produção, mesmo nome e conteúdo do repositório).
2. Rodar a **verificação imediata** da seção 5 para aquela migration.
3. Se qualquer verificação falhar, executar o rollback da própria migration e parar (ver seção 6).

Tempo estimado: poucos minutos por migration. Cada migration tem `NOTIFY pgrst, 'reload schema'`, então a API expõe a nova assinatura sem reinício.

## 5. Verificação (somente leitura em produção)

**Imediata, após cada migration:**
- Corpos contêm as marcas esperadas: `fp_usuario_pode_loja` nas guardas (S1, S1c); `S1b:` no bloco CNPJ (S1b); `TRANSFERENCIA_PRODUTO_SEM_EQUIVALENTE` (G14).
- Grants: `public.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid,uuid)` executável por `authenticated` e `service_role`, não por `anon`; a versão `internal` só por `service_role`.
- Nenhuma função nova exposta a `anon`.

**Após a aplicação completa:**
- Contagem de linhas inalterada nas tabelas afetadas (`remessas`, `estoque`, `movimentos_estoque_log`, `ordens_compra`, `importacoes_nfe`). Nenhuma escrita deve ocorrer na aplicação.
- Monitoramento de erros por 60 minutos: `rpc` com códigos `PE_*`, `TRANSFERENCIA_*`, `REMESSA_LOJA_INVALIDA`, `OC_LOJA`, `IMPORT_NFE_LOJA`. Em loja única, **nenhum** desses erros deve aparecer para o perfil do cliente.
- Nenhum teste de escrita em produção. Os testes E2E já foram feitos em homologação com fixture sintética.

## 6. Critérios de aborto e rollback

**Abortar e reverter** se ocorrer qualquer um:
- Divergência de linha de base (seção 3.3) que não tenha explicação.
- Falha de asserção durante a migration.
- Erro de RPC de loja única em operação normal, nos primeiros 60 minutos.
- Grant indevido para `anon` ou `authenticated` na versão `internal`.

**Rollback**, na ordem inversa da seção 2: G14 → S1b → S1c → S1. Cada rollback foi validado em homologação. A reversão não apaga dados. O único dado descartado é o conteúdo de `produto_equivalencias` (vazio na aplicação, então sem perda).

## 7. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Corpo em produção diferente da homologação | Média | Linha de base (3.3) e asserções das migrations |
| Chamada do app quebrar com a nova assinatura | Baixa | Teste E2E sem `p_loja_id` (validado); verificação de monitoramento |
| `DROP FUNCTION` no meio da janela causar erro em chamada concorrente | Baixa | Janela de baixo uso; transação curta |
| Gerente de loja única perder acesso por falta de vínculo | Baixa | Vínculos automáticos (trigger de usuários). Em produção: 0 gerentes ativos sem vínculo na loja legada (consulta de 2026-10-29). Repetir a consulta antes da janela |
| Transferência entre CNPJs distintos bloqueada e cliente atingido | Muito baixa | Produção tem uma única loja; nenhuma transferência entre lojas registrada |

## 8. Pendências que este plano **não** resolve

- Aplicação do app (interface) para escolher a loja na remessa: fora da S1 de banco.
- Registro de equivalências de produto para as lojas: operação de negócio, feita por DONO/GERENTE depois de G14.
- Fechamento do fluxo fiscal entre CNPJs (S8): o bloqueio permanece até lá.
- Limpeza da fixture de homologação: depende de decisão separada.

## 9. Autorizações necessárias

- [ ] Aprovação deste plano.
- [ ] Merge do branch em `main` por PR revisado.
- [ ] Janela de execução (data e horário).
- [ ] Autorização explícita para cada aplicação em produção.
