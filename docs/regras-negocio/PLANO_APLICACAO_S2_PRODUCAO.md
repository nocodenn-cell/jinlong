# Plano de aplicação da S2 em produção (NF-e vinculada à OC)

| Campo | Valor |
|---|---|
| Status | **Rascunho para revisão. Nenhuma ação em produção autorizada.** |
| Projeto Supabase de produção | `kbabmewnahysfvlybiak` (nome `jinlong`) |
| Projeto de homologação validado | `yvdilcmxyjafnnsfdtam` |
| PR | #649 (`claude/s2-nfe-vinculada-oc-sem-dupla-creditacao`, base `main`) |
| Migration | `backend/supabase/migrations/20261029160000_s2_nfe_vinculada_oc_sem_dupla_creditacao.sql` |
| Rollback | `backend/supabase/rollback/20261029160000_s2_nfe_vinculada_oc_sem_dupla_creditacao.rollback.sql` |
| Desenho | `docs/regras-negocio/DESENHO_S2_RECEBIMENTO.md` |

## 1. Escopo e resultado esperado

- Altera **somente** `internal.confirmar_importacao_nfe`. Assinatura, grants e a wrapper pública não mudam.
- Crédito de estoque de NF-e vinculada à OC passa a ser o excedente sobre o recebimento físico do item (`ordens_compra_recebimentos`, origens `ORDEM_COMPRA` e `REMESSA`). O abate do saldo da OC usa o mesmo valor.
- Sem OC vinculada, ou sem recebimento físico, o comportamento é o anterior.
- A obrigação financeira (AP por duplicata) **não muda**.
- **Sem alteração de dados.** Nenhum backfill, nenhuma correção retroativa de NF-es já confirmadas.

## 2. Independência da S1

A S2 pode ser aplicada **antes ou depois** da S1. As substituições da S2 atingem só o cálculo do crédito, o `VALUES` do estoque, o movimento `ENTRADA_NFE` e o abate da OC. A S1 altera a guarda de GERENTE (`v_loja_usuario IS DISTINCT FROM v_imp.loja_id`), que a S2 não toca. Por isso o plano não exige ordem entre as duas.

## 3. Pré-requisitos (antes de qualquer alteração em produção)

1. **Aprovação explícita** deste plano, da janela e do responsável pela execução.
2. **Label `deploy-prod:aprovado` no PR #649**, adicionado pelo responsável após a aprovação. O guard `deploy-governance` bloqueia o merge sem ele. Merge = publicação automática da migration pela integração Supabase.
3. **Merge em `main`** por PR revisado e com CI verde (exceto o guard, já resolvido pelo label).
4. **Linha de base de produção.** Corpo atual de `internal.confirmar_importacao_nfe(uuid)`: md5 `81896eeeee5c79aca84f240edb2b8b65`, tamanho 5888 caracteres (conferido em 2026-10-29). **Se o md5 divergir, abortar** e revisar antes de aplicar. A migration faz substituição textual com asserção de contagem, então divergência também aborta a transação.
5. **Consulta de leitura de casos legados, repetida na janela.** Em 2026-10-29 havia 6 NF-es em produção, nenhuma vinculada a OC. A consulta deve ser refeita logo antes da janela. Se surgir NF-e vinculada a OC com recebimento físico do mesmo item, **parar e reavaliar** o efeito sobre o estoque dessa NF-e antes de aplicar.
6. **Lista de migrations de produção** comparada com o repositório. A última aplicada em 2026-10-29 é `20261028120000`, sem pendências que toquem a função alterada.
7. **Backup ou ponto de restauração** registrado antes da janela.
8. **Janela de baixo uso.** Produção tem uma única loja, mas o horário deve ser confirmado com o operador.

## 4. Execução (com autorização)

1. Aplicar a migration `20261029160000_…` com o conteúdo exato do repositório (mesmo nome e mesmo SQL).
2. Rodar a verificação imediata (seção 5).
3. Se qualquer verificação falhar, executar o rollback (seção 6) e parar.

Tempo estimado: poucos minutos. A migration termina com `NOTIFY pgrst, 'reload schema'`.

## 5. Verificação

**Imediata, em produção (somente leitura):**
- O corpo de `internal.confirmar_importacao_nfe(uuid)` contém `S2 (D12): recebimento físico do item na OC`.
- Grants inalterados: `authenticated` e `service_role` com EXECUTE na wrapper pública; `internal` restrito como antes. Confirmar com `aclexplode`.
- Nenhum objeto novo criado. A migration não cria tabela, coluna ou índice.

**Não executar testes de escrita em produção.** Os cenários T1 a T4 já foram validados em homologação (fixture `FX-S2`).

**Pós-aplicação, nas primeiras 24 horas:**
- Monitorar confirmações de NF-e (`IMPORT_NFE_*`, `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`) e erros de RPC no edge log.
- Para cada NF-e confirmada após a aplicação, conferir se o movimento `ENTRADA_NFE` existe quando há recebimento físico do item na OC (esperado: crédito só pelo excedente).

## 6. Rollback

- Aplicar o arquivo `…rollback.sql`. Ele reverte a substituição exata com asserção (falha ⇒ aborta sem alterar nada).
- O rollback **não toca dados**. NF-es confirmadas depois da aplicação mantêm seus movimentos.
- Após o rollback, confirmar que o corpo voltou a conter `v_it.quantidade_conferida` no `VALUES` do estoque e que as declarações `v_credito` / `v_recebido_fisico` foram removidas.

## 7. Critérios de aborto

- Divergência de md5 da linha de base (seção 3.4).
- Falha de asserção durante a migration.
- Caso legado não previsto encontrado na consulta de leitura (seção 3.5).
- Erro de RPC de confirmação de NF-e em uso normal nas primeiras horas.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Corpo de produção diferente do esperado | Linha de base (3.4) e asserção de contagem |
| NF-e com recebimento físico já registrado sendo creditada de novo por engano | Consulta de leitura repetida na janela (3.5) e monitoramento (5) |
| Interpretação do D12 errada para algum caso real (unidades adicionais na NF-e) | O excedente é creditado (T4). Validar o caso com a operação antes da janela |
| Mudança de comportamento para o usuário final | Só afeta NF-e vinculada à OC com recebimento físico. Comunicar à operação |

## 9. Pendências que este plano não resolve

- Chave de identidade: UNIQUE em `importacoes_nfe.chave_acesso` ainda não verificada. Fica para um ajuste separado.
- Correção retroativa de NF-es já confirmadas com dupla creditação: não há caso em produção hoje.
- Interface: nenhuma alteração de tela é necessária.

## 10. Autorizações necessárias

- [ ] Aprovação deste plano.
- [ ] Label `deploy-prod:aprovado` no PR #649, adicionado pelo responsável.
- [ ] Merge em `main` (após o label).
- [ ] Janela de execução (data e horário).
- [ ] Autorização explícita para a aplicação em produção.
