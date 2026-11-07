# Plano de remediação das vulnerabilidades A1, A2, A3, B1, C1

Base: `docs/security/FASE3_DIAGNOSTICO_COMPLETO.md`. Nenhuma correção foi aplicada. Todas as migrations abaixo são **propostas**, a validar em homologação antes de qualquer aplicação.

Critérios de avaliação das 4 migrations do relatório (`migrations_preparadas/`):
- Não estão no repositório. Avaliação feita sobre o efeito descrito e sobre o catálogo de produção.
- "Passou na réplica" não basta: a réplica não tinha o trigger `trg_caixas_fechado_imutavel`.

---

## A1 — Inserção direta de venda e pagamento (impacto financeiro)

- **Causa-raiz:** policies `vendas_insert_loja`, `vendas_pagamentos_insert_loja` e `itens_insert` permitem INSERT direto. Grant de INSERT na tabela para `authenticated`. O total não é validado no banco nesse caminho.
- **Evidência:** catálogo de produção (policies e grants) [PROD-SOMENTE-LEITURA]; trigger `trg_vendas_pagamentos_credita_caixa` soma pagamentos DINHEIRO no saldo [PROD-SOMENTE-LEITURA]. A réplica do relatório confirmou o mecanismo (saldo 100 → 10149).
- **Impacto operacional:** vendas sem produto ou sem baixa de estoque; kardex e estoque divergentes [HIPÓTESE, validar com `v_kardex_unificado`].
- **Impacto financeiro:** fechamento usa `calcular_valor_sistema_dinheiro_caixa` (E(c)). Um pagamento DINHEIRO forjado aumenta E(c). Quem subtrai dinheiro do caixa pode forjar uma venda que iguale E(c) ao valor contado, sem divergência. [INFERÊNCIA a partir do código do fechamento; não testado em produção.]
- **Cenário de exploração:** operador autenticado chama REST `POST /rest/v1/vendas` e `vendas_pagamentos` com JWT próprio.
- **Correção mínima:** `REVOKE INSERT, UPDATE, DELETE ON vendas, itens_venda, vendas_pagamentos, descontos_venda FROM authenticated` (e `anon`, que já não tem). Manter SELECT. Escrita só por RPC SECURITY DEFINER.
- **Migration:** `002_vendas_dml_direto_revogar.sql` (proposta do relatório) — **aprovada tecnicamente com ressalvas**: (1) precisa ser reconciliada com o ledger; (2) só é segura porque todas as escritas são DEFINER (verificado); (3) falta a remoção/rebaixamento das policies de INSERT/UPDATE/DELETE, senão ficam mortas e confusas. Recomendo também `DROP POLICY` das policies de escrita, para não haver dependência de grant+policy.
- **Dependências:** F1, F2, F3, F7, F8 usam RPC (OK). Confirmar `demo-fluxo` (F14) e qualquer script de importação que use service role (não afetado).
- **Testes de regressão:** ver matriz (`docs/security/MATRIZ_TESTES_HOMOLOGACAO_FASE3.md`), casos T-A1-*.
- **Rollback:** `GRANT INSERT, UPDATE, DELETE ... TO authenticated` e recriar as policies a partir de cópia prévia (`pg_get_policydef`). Script a criar e testar antes da migration.
- **Risco residual:** a RPC `finalizar_venda_transacional_canonica_v4` continua aceitando total do cliente? **Não verificado** — o corpo tem 1.459 caracteres e precisa ser lido para confirmar que recalcula preços e totais no servidor (o relatório afirma que sim para a `_v4` com `fp_assert_loja`).

## A2 — Reabertura direta de caixa fechado

- **Causa-raiz (original):** `caixas_update_authenticated` + grant de `status`.
- **Estado em produção:** **mitigado.** `trg_caixas_fechado_imutavel` bloqueia qualquer mudança de `status` a partir de FECHADO (`CAIXA_FECHADO_STATUS_IMUTAVEL`), para todos os papéis. Constraint `caixas_fechado_exige_dados_fechamento` bloqueia FECHADO sem dados. [PROD-SOMENTE-LEITURA]
- **Evidência do relatório:** V17–V19 foram reproduzidos **sem** o trigger; o relatório se baseou na réplica. Não reproduz em produção.
- **Impacto residual:** operador pode mudar ABERTO→FECHADO só se fornecer dados (CHECK); isso passa por RPC na prática. Sem exploração demonstrada.
- **Migration 001 (proposta):** **redundante.** Recomendo **não aplicar**. Se for mantida, deve ser apenas para permitir a retomada via `retomar_caixa_atomico` (que cria novo turno, não muta o antigo). Hoje não há caminho de UI para isso.
- **Decisão de negócio pendente:** reabertura legítima (sangria de dia anterior, erro de fechamento) deve ser via `retomar_caixa_atomico` com token de gerente? Se sim, falta a tela. Se não, nada a fazer.
- **Testes:** T-A2-* (update direto bloqueado; retomada autorizada cria novo turno; retomada sem gerente bloqueada; histórico preservado).
- **Rollback:** nenhum necessário se não aplicar 001.
- **Risco residual:** baixo.

## A3 — Alteração e exclusão de vendas, itens e pagamentos por gerente

- **Causa-raiz:** `vendas_update_loja`, `vendas_delete_loja`, `itens_venda_write_gerente_loja`, `descontos_venda_update/delete` + grants de tabela.
- **Evidência:** catálogo de produção [PROD-SOMENTE-LEITURA]. Nenhuma trigger de auditoria em DELETE de `vendas` (N7).
- **Impacto:** venda excluída ou alterada sem trilha; cancelamento legítimo via RPC gera ledger (`venda_eventos`), mas alteração direta não.
- **Correção:** (1) `REVOKE UPDATE, DELETE` em `vendas`, `itens_venda`, `vendas_pagamentos`, `descontos_venda` para `authenticated`; (2) substituir "excluir" por cancelamento auditável (`cancelar_venda_transacional`), que já existe; (3) manter SELECT.
- **Verificação de necessidade:** o app não usa UPDATE/DELETE direto (F-tabela, seção 2 do diagnóstico). Porém é preciso confirmar que `app/gerente/vendas/actions.ts` não tem escrita fora da busca feita (linhas 200–270 lidas).
- **Dependências:** A1 (mesma migration 002).
- **Testes:** T-A3-* (gerente não consegue UPDATE/DELETE direto; cancelamento via RPC gera evento; estorno de devolução consistente).
- **Rollback:** GRANT de volta; policies intactas se não removidas.
- **Risco residual:** dados históricos alterados antes da correção não são recuperáveis sem backup. Ver plano de backup.

## B1 — Autoelevação em `perfis`

- **Causa-raiz:** `perfis_update_policy` permite `auth.uid() = user_id` sem restrição de coluna; grant de UPDATE e INSERT/DELETE para `authenticated`; `perfis_insert_policy` permite criar perfil próprio (N3).
- **Evidência:** catálogo [PROD-SOMENTE-LEITURA]. Produção: 3 linhas, 0 divergências com `usuarios.loja_id`.
- **Impacto atual:** baixo. Nenhum consumidor de `perfis` no código (N4). Autorização usa `usuarios.perfil`. Risco de integridade e de confusão futura; risco de bypass se alguma policy ou função passar a depender de `perfis`.
- **Correção:** `REVOKE INSERT, UPDATE, DELETE ON perfis FROM authenticated`; `DROP POLICY perfis_update_policy, perfis_insert_policy, perfis_delete_policy` (ou tornar somente leitura). Manter `perfis_select_policy`.
- **Migration 003 (proposta):** adequada, com a ressalva de que `perfis_usuario_gerencial_loja()` é usada só pelas policies de `perfis` (verificar antes de remover a função; **não remover nesta etapa**).
- **Compatibilidade:** sem consumidor, sem quebra conhecida. Recomendo, porém, decidir se `perfis` deve continuar existindo (ver roadmap, decisão D2).
- **Testes:** T-B1-* (operador não altera perfil/loja; gerente não exclui perfil de outra loja; SELECT continua).
- **Rollback:** recriar policies e grants a partir do catálogo.
- **Risco residual:** baixo.

## C1 — Feature flags globais

- **Causa-raiz:** policies de INSERT/UPDATE/DELETE aceitam `authenticated` com `perfil IN ('DONO','ADMIN')` sem filtro de empresa; tabela é global (sem `empresa_id`).
- **Evidência:** catálogo [PROD-SOMENTE-LEITURA]; 4 linhas; nenhum consumidor de escrita no app (N5).
- **Impacto:** qualquer DONO/ADMIN de qualquer empresa altera flags globais.
- **Correção:** escrita só por `service_role` (manter a policy de service_role). Remover `authenticated` das policies de escrita. Manter SELECT.
- **Necessidade de RPC administrativa:** **não há tela no repo**. Se a administração de flags for necessária, criar RPC SECURITY DEFINER restrita a plataforma (não a DONO de cliente), com auditoria. Decisão D3.
- **Migration 004 (proposta):** adequada. Verificar que nenhum script externo usa a sessão `authenticated` para gravar flags.
- **Testes:** T-C1-* (DONO não grava flag; service_role grava; SELECT continua).
- **Rollback:** recriar policies a partir de cópia prévia.
- **Risco residual:** baixo.

---

## Ordem recomendada de aplicação (proposta)

1. Reconciliar ledger repo × produção (sem aplicar nada).
2. Aplicar 003 (perfis) em homologação; depois produção.
3. Aplicar 004 (feature flags) em homologação; depois produção.
4. **Não aplicar 001** (redundante). Se a decisão D1 for manter reabertura via retomada, validar só o caminho de retomada.
5. Aplicar 002 (DML direto) por último, após homologação completa do PDV (matriz de testes), com janela e rollback pronto.

## Autorizações necessárias

- Aprovação para aplicar qualquer migration em produção (não concedida).
- Confirmar regra de negócio: reabertura de caixa (D1); teto de `valor_inicial` (N1); se `perfis` deve existir (D2); se flags precisam de tela (D3).
