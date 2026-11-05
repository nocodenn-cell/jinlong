# Validação da tranche de segurança — 2026-11-05 (estabilização)

**Escopo:** `20261028100000`, `20261028110000`, `20261028120100`, `20261028121000`, `20261028122000`.
**Ambiente:** contêiner Postgres 17 descartável (`hub_seeded:snap`, estado pré-tranche), dados sintéticos.
**Reprodutível:** `backend/scripts/tranche-seguranca-validar.sh` (aplica, testa e reverte, e compara com o baseline).
**Produção:** não foi alterada. Só consultas de leitura, usadas para comparar definições, privilégios e volume de uso.

> **Evidência técnica preliminar, não homologação final para produção.** Ver §9.

## 1. Resultado da execução reproduzível

```
== aplicação da tranche: 5 APLICADAS (ordem fixa)
== suítes
   PASSOU   sec-tokens-usuario-inativo
   PASSOU   sec04-token-gerente-tenant
   PASSOU   tokens-autorizacao-operacao
   PASSOU   tokens-autorizacao-adversarial
   PASSOU   listar-caixas-elegiveis-desembolso
   PASSOU   provisionamento-wizard-trial
   PASSOU   recuperacao-acesso-tokens
== rollback em cadeia: 5 REVERTIDAS
   RESULTADO: funções e ACLs idênticas ao baseline após o rollback
script exit=0
```

## 2. Matriz PASSOU / FALHOU / NÃO TESTADO

| Área | Teste | Resultado | Observação |
|---|---|---|---|
| Autenticação / tokens | `sec-tokens-usuario-inativo` | **PASSOU** (48 ok, 0 NOT OK) | Cobre tenant (B), vínculo (E), auth.uid (G), produtos (H), ADMIN (I), provisionamento (J), caixas/gerencial (K) |
| Tokens / tenant | `sec04-token-gerente-tenant` | **PASSOU** | Fixture corrigida (lojas com `empresa_id`) |
| Tokens / autorização de operação | `tokens-autorizacao-operacao` | **PASSOU** (23 casos) | Fixture passou a ser explícita. Inativar o gerente revoga tokens pendentes (comportamento da 120100); o teste recria os tokens que dependem disso |
| Tokens / adversarial | `tokens-autorizacao-adversarial` | **PASSOU** (7 casos) | Fixture explícita, com limite de sangria por empresa (`fp_pdv_config_id`) |
| Recuperação de acesso | `recuperacao-acesso-tokens` (novo) | **PASSOU** (REC-1 a REC-7) | Ver `RECUPERACAO_ACESSO_TOKENS.md` |
| Caixas / desembolso | `listar-caixas-elegiveis-desembolso` | **PASSOU** (38 ok, 0 NOT OK) | Fixture com `empresa_id` |
| Provisionamento | `provisionamento-wizard-trial` (reescrito) | **PASSOU** (A–E) | Ver §3 |
| Dispositivo / sync | `sec-token-dispositivo-vale-na-loja` | **PASSOU** com a `20261030100000` aplicada **só no contêiner** | Fora da tranche e adiada em produção. Fixture: vínculo duplicado removido (`ON CONFLICT DO NOTHING`) |
| Sync offline (contrato) | `sync-outbox-contract-smoke.mjs` | **PASSOU** | |
| Sync offline (unitário) | `planGate.test.ts` e `pagamentosParcelas.test.ts` (Deno) | **PASSOU** (4/4 cada) | |
| Multiempresa | `multiempresa-fase1-isolamento` (PGlite) | **PASSOU** | |
| Multiempresa | `multiempresa-fase2-cobertura` (PGlite) | **FALHOU (pré-existente)** | Ver §6 |
| Permissões de grants | `fase1-hardening-grants-residuais` | **FALHOU (ambiente)** | Contêiner tem EXECUTE para anon em `converter_venda_em_espera`. **Produção (leitura): anon = false** |
| Permissões de default ACL | `c1-secdef-sem-identidade` | **FALHOU (ambiente)** | ACL padrão do contêiner difere da de produção. **Produção (leitura): `{postgres, service_role}`** |
| Corte ADMIN | `corte-admin-pg-local/run.sh` | NÃO TESTADO | Exige cluster local com `PG_BIN`; não executado |
| Rollback — cadeia | 100000→122000 e reversão | **PASSOU** | Funções e ACLs idênticas ao baseline (md5) |
| Rollback — dados (110000) | ADMIN sintético | **PASSOU** | Inativo após a 110000; ativo após o rollback |
| Rollback — dados (120100) | tokens revogados | NÃO TESTADO como restauração | Por design, tokens revogados não voltam (documentado) |
| Backup / restauração | dump + restore em banco separado | **PASSOU** (procedimento) | Ver `BACKUP_RESTAURACAO_SEM_PITR.md`. Dados pequenos e sintéticos |
| Backup / PITR | habilitação e retenção no painel | **NÃO TESTADO** | Ação manual do dono |
| PDV real / dispositivo | fila offline com token revogado, ponta a ponta | NÃO TESTADO | Sem dispositivo de teste |

## 3. Cadastro de novos clientes (contrato da 121000)

O contrato mudou. O teste antigo esperava que o cadastro automático funcionasse; agora o teste prova dois fatos separados:

- **A. Bloqueio automático:** sem contingência, `plataforma_provisionar_empresa` recusa com `PROVISIONAMENTO_AUTOMATICO_BLOQUEADO` e não grava nada. O teste verifica o código do erro. Não é PASS por erro inesperado.
- **B. Contingência sem responsável:** recusada com `PROVISIONAMENTO_CONTINGENCIA_SEM_RESPONSAVEL`, e a trilha não muda.
- **C. Cadastro autorizado:** com `fp.provisionamento_contingencia` (chamado) e `fp.provisionamento_responsavel`, uma sessão SQL direta cadastra empresa, loja, DONO, GERENTE e OPERADOR, grava a trilha em `internal.provisionamento_contingencia_log` e completa o wizard (pdv_config, formas de pagamento, checklist) com vínculos ativos.
- **D.** O trial automático (`plataforma_iniciar_trial`) fica bloqueado pelo mesmo interruptor. O limite por IP continua valendo.
- **E.** Isolamento: DONO, GERENTE e OPERADOR veem só a própria empresa. Nenhum papel de aplicação executa a porta.

**Quem cadastra, hoje:** só quem tem sessão SQL direta como `postgres` (responsáveis técnicos autorizados pelo dono), com chamado e responsável registrados. Não há caminho pela interface.

**Impacto real no cadastro de novos clientes:**
- O assistente `/admin/provisionamento` está fechado (depende de `requireAdminSession`, que o corte do ADMIN desativou).
- O teste grátis (`/teste-gratis`) não cria empresa automaticamente.
- O hub comercial ainda não tem função de provisionamento.
- Resultado: **nenhum cliente novo pode ser cadastrado sem intervenção manual de um responsável técnico.** Isso é aceitável para um primeiro cliente pagante **se** o procedimento de contingência for executado e registrado conforme `docs/PROVISIONAMENTO_CONTINGENCIA.md`.

## 4. Dependência 110000 × 101000 (funcional)

**Resposta:** a `110000` aplica sem a `101000` (SQL) e os testes passam. Há **dependência funcional** entre elas, mas não na direção que o cabeçalho sugere:

1. **Cobrança depende da `101000` e está bloqueada sem ela.** A tela de assinatura (`pdv-importados/app/admin/assinatura/actions.ts`) confere se o usuário é DONO chamando `fp_sou_dono_da_empresa`, que só existe na `101000`. Sem ela, a função falha **fechada**: o DONO recebe "Somente o DONO gerencia a assinatura".
2. **Verificado em produção (leitura, 2026-11-05):** `fp_sou_dono_da_empresa`, `cobranca_registrar_assinatura` e `cobranca_reservar_assinar` **não existem**. Ou seja, **a gestão de assinatura pelo DONO já está indisponível em produção hoje**, antes desta tranche.
3. **A `110000` não altera a gestão de assinatura.** O gate de cobrança é por perfil DONO, não ADMIN. Logo, aplicar a `110000` sem a `101000` **não piora** a cobrança; a cobrança já está quebrada sem a `101000`.
4. **Impacto no lançamento:** para o primeiro cliente pagante, a contratação e a cobrança pelo app dependem da `101000` (e da Growth-001, também adiada). **Adiar a `101000` tem custo de produto**, não só de segurança. A decisão da revisão de cobrança precisa ser tomada com esse custo visível.

## 5. Recuperação de acesso após revogação de tokens

Procedimento em `RECUPERACAO_ACESSO_TOKENS.md`. Resumo:

- **Gerente e operador:** reativação (se foi engano) e token novo aprovado pelo gerente. Validado (REC-1 a REC-7).
- **Reativar não ressuscita tokens revogados** (REC-3). Isso é definitivo.
- **Sync offline:** vendas com token revogado vão para ERRO depois de 12 falhas. "Reprocessar" não resolve. Tratamento manual com autorização do DONO. **Não existe hoje reenvio de venda com token novo.**

## 6. Falhas pré-existentes (não causadas pela tranche)

| Teste | Causa | Relevância para liberação |
|---|---|---|
| `multiempresa-fase2-cobertura` | Tabelas `comissoes_*` (e outras) sem `tenant_guard` nem isenção documentada | **Média.** Em produção, RLS está ligado e as políticas são restritas a `authenticated` (anon não lê). Não há exposição confirmada, mas a convenção do repositório não é cumprida. Revisar tabela a tabela |
| `c1-secdef-sem-identidade` | ACL padrão do contêiner | **Nenhuma para produção.** Produção verificada por leitura |
| `fase1-hardening-grants-residuais` | Grants do contêiner | **Nenhuma para produção.** Produção verificada por leitura (anon = false) |
| `tokens-autorizacao-*` e `listar-caixas-*` | Fixtures dependiam de dados do banco | **Corrigido** (ver §2) |
| `provisionamento-wizard-trial` | Teste anterior à 121000 | **Corrigido** (ver §3) |

**Achado sobre grants (não exploravel hoje):** em produção, `authenticated` tem privilégio de `INSERT`/`UPDATE` em `tokens_desconto_gerente` (verificado; em `tokens_autorizacao_operacao` a política é a mesma, mas o privilégio não foi verificado), mas a política `tenant_guard` é **RESTRICTIVE** e não há política PERMISSIVE de escrita. Logo, RLS nega a escrita a `authenticated`. Por defesa em profundidade, recomenda-se revogar `INSERT`/`UPDATE` de `authenticated` nessas tabelas (mudança de grant, a avaliar com o dono; não incluída nesta tranche).

## 7. Backup e restauração

Procedimento em `BACKUP_RESTAURACAO_SEM_PITR.md`. Testado em contêiner: dump lógico e restauração em banco separado, com contagens e funções iguais. **PITR não foi verificado.** Ação manual do dono: painel Supabase → projeto `jinlong` → *Database → Backups*.

## 8. Ambiente de homologação

O projeto `jinlong-homolog-palm` **não** é um ambiente limpo: tem as cinco migrations e outras pendentes em produção (`20261029155000`, `20261030100000`, `20261030120000`–`20261030140000`) aplicadas via MCP, além de entradas de rollback e reaplicação. Não foi usado para testes. Decisão do dono: validação em banco descartável é a evidência preliminar.

## 9. Riscos remanescentes

1. **Revogação de tokens é irreversível por SQL**, e vendas offline com token revogado exigem tratamento manual.
2. **Gestão de assinatura pelo DONO indisponível em produção** (depende da `101000`), antes e depois da tranche.
3. **Cadastro de clientes só por contingência manual** (sem interface). Custo operacional e de risco de erro humano.
4. **PITR não verificado.**
5. **Validação em contêiner local**, com dados sintéticos e estado aproximado de produção (ACL padrão e grants diferem em dois testes; ver §6).
6. **Dispositivo real não testado** (PDV ponta a ponta).
7. **Defesa em profundidade pendente:** grants de escrita em `tokens_*` para `authenticated`.

## 10. Recomendação

- **Homologação isolada (banco descartável):** GO. Evidência reproduzível.
- **Produção da tranche:** **NO-GO** até: (a) PITR confirmado no painel e dump lógico feito antes da aplicação; (b) decisão do dono sobre a `101000` e a assinatura; (c) PDV testado ponta a ponta com sincronização offline; (d) procedimento de contingência executado uma vez em homologação com chamado e responsável.
- **Prioridade:** segurança e integridade de dados primeiro. A `101000` tem prioridade de **produto** para o primeiro cliente pagante, mas só depois da revisão de segurança dela.
