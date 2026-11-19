# Tranche de segurança — runbook de homologação, implantação e recuperação

**Status:** PRONTA PARA HOMOLOGAÇÃO. **Não aplicada em produção.** Nenhuma ação remota foi executada nesta preparação.
**Projeto de produção:** `kbabmewnahysfvlybiak` (jinlong). **Não usar como ambiente de teste.**
**Data:** 2026-11-05.

## 1. Escopo

Migrations, nesta ordem:

| # | Migration | Efeito principal | Rollback |
|---|---|---|---|
| 1 | `20261028100000_sec_token_gerente_loja_nula_fora_da_loja` | Token de gerente emitido por DONO/ADMIN deixa de valer fora da empresa do emissor | `rollback/20261028100000_sec_token_gerente_loja_nula_fora_da_loja.rollback.sql` (**criado nesta preparação**) |
| 2 | `20261028110000_corte_admin_papeis` | Perfil ADMIN perde poder nas lojas; ex-ADMIN é desativado; bloqueio de perfil ADMIN | `rollback/20261028110000_corte_admin_papeis.rollback.sql` (**corrigido nesta preparação**) |
| 3 | `20261028120100_sec_tokens_usuario_inativo_revogacao` | Usuário inativo ou sem vínculo perde tokens; revogação por gatilho | `rollback/20261028120100_sec_tokens_usuario_inativo_revogacao.rollback.sql` |
| 4 | `20261028121000_provisionamento_automatico_bloqueado` | Provisionamento automático de empresas bloqueado (fail-closed) | `rollback/20261028121000_provisionamento_automatico_bloqueado.rollback.sql` |
| 5 | `20261028122000_admin_residual_escopo_ativo` | RLS e funções gerenciais exigem usuário ativo e vínculo atual | `rollback/20261028122000_admin_residual_escopo_ativo.rollback.sql` |

**Fora da tranche:** `20261028101000` (cobrança Asaas), que exige decisão do dono. Ver `docs/ops/MIGRATIONS_ADIADAS_2026-11-05.md`.

**Dependência entre 2 e 101000:** o cabeçalho de `110000` cita `101000`. No teste em banco descartável, as cinco migrations aplicaram sem `101000` e os testes passaram. Isso indica que não há dependência de SQL, mas a decisão de negócio cabe ao dono.

## 2. Pré-checagens (somente leitura, antes de qualquer aplicação)

Executar no projeto alvo, com o SQL Editor ou `psql` de leitura:

```sql
-- a) Versões já aplicadas (não pode haver nenhuma das cinco)
select version, name from supabase_migrations.schema_migrations
 where version in ('20261028100000','20261028110000','20261028120100','20261028121000','20261028122000');

-- b) ADMINs existentes e estado (dados que a 110000 altera)
select id, perfil, ativo, loja_id from public.usuarios where perfil = 'ADMIN';

-- c) Vínculos ativos desses ADMINs (serão desativados pela 110000)
select v.* from public.usuario_vinculos v
  join public.usuarios u on u.id = v.usuario_id where u.perfil = 'ADMIN' and v.ativo;

-- d) Tokens pendentes que a 120100 vai revogar em usuários que serão inativados
select count(*) from public.tokens_desconto_gerente where usado = false and revogado_em is null;
```

**Critério para seguir:** (a) vazio; (b) e (c) registrados no protocolo de aplicação; (d) registrado. Tokens revogados não voltam com o rollback.

## 3. Identidade e recuperação antes de qualquer alteração remota

- Confirmar o projeto: `jinlong` (`kbabmewnahysfvlybiak`) é produção. Não aplicar nada sem autorização expressa do dono.
- **Backup lógico** das tabelas afetadas, somente leitura (`pg_dump --data-only -t public.usuarios -t public.usuario_vinculos -t public.tokens_desconto_gerente -t public.tokens_autorizacao_operacao -t public.tokens_revogacao_log` ou equivalente). Guardar fora do repositório.
- **Retenção/PITR:** confirmar no painel Supabase que a janela de PITR cobre o horário da aplicação. **Não verificado nesta preparação.**
- A 110000 cria `internal.usuarios_admin_corte_backup` e `..._vinculos_backup`. Não apagar essas tabelas sem autorização.

## 4. Sequência de aplicação (somente com autorização do dono)

1. Aplicar **uma migration por vez**, por SQL (`psql -v ON_ERROR_STOP=1 -f`, ou SQL Editor em transação). **Não usar `supabase db push`** (aplicaria as pendentes da seção 1 do runbook de Growth-001 e a 101000).
2. Após cada migration, rodar a verificação da seção 5 para a parte correspondente.
3. Registrar em `supabase_migrations.schema_migrations` **somente após validação**, com a versão real de cada arquivo.

Ordem: 100000 → 110000 → 120100 → 121000 → 122000.

## 5. Validação pós-aplicação

- Testes do repositório, executados em banco descartável (não em produção):
  - `backend/scripts/sec-tokens-usuario-inativo.test.sql`: 48 casos, todos ok (ver seção 6).
  - `backend/scripts/sec04-token-gerente-tenant.test.sql`: **passa** após correção da fixture (lojas com `empresa_id`, exigido pela multiempresa). Resultado: `SEC04 TOKEN GERENTE TENANT: OK`. Ver `TRANCHE_VALIDACAO_2026-11-05.md`.
- Consultas de conferência: `to_regprocedure` das funções da seção 6 não nulo; `select` de `public.usuarios` e `public.usuario_vinculos` sem erro; login de um DONO e de um OPERADOR de teste ainda funcionando.
- Operacional (com contas de teste em homologação, não produção): operador inativado perde o caixa na hora; DONO de outra empresa não vê produtos da empresa; ADMIN ativo sem vínculo não lista caixas nem custos.

## 6. Matriz de testes em banco descartável (dados sintéticos)

Ambiente: contêiner Postgres 17 local (`hub_seeded:snap`, estado pré-tranche), aplicado na ordem da seção 4.

| Teste | Resultado |
|---|---|
| Aplicação das 5 migrations, sem erro | OK |
| `sec-tokens-usuario-inativo.test.sql` (48 casos) | **48 ok, 0 NOT OK** |
| Cobertura negativa (exemplos): token de outra empresa (B1, B2, B3, B4); usuário inativo e sem vínculo (E2, C4, E3, G1); usuário de outra empresa (G2); isolamento de produtos (H2b); ADMIN novo bloqueado (I1); provisionamento sem interruptor (J1 a J7); ADMIN forçado sem acesso (I3, K5) | OK |
| Rollback de 100000 isolado: definição e ACL idênticas ao estado anterior (md5) | OK |
| Cadeia completa: aplicar 100000–122000 e reverter na ordem inversa; funções e ACLs idênticas ao baseline | **OK** (após correção do rollback de 110000) |
| Corte ADMIN com ADMIN sintético ativo: após 110000, `ADMIN\|inativo`; após rollback, `ADMIN\|ativo` | OK |

**Importante:** a cadeia de rollback foi validada **em contêiner local**. Os rollbacks de 120100, 121000 e 122000 existiam antes desta preparação e foram exercitados apenas na cadeia (sem dados de teste específicos).

### Correção feita nesta preparação

O rollback de `20261028110000` era um **stub**: restaurava dados, mas não restaurava as quatro funções (`auth_usuario_eh_admin`, `fp_admin_legado`, `fp_pode_loja`, `vincular_usuario_loja`) nem `internal.token_gerente_fora_da_loja`. Havia uma inconsistência entre o cabeçalho e o corpo. Agora o arquivo restaura as definições, e as quatro foram conferidas por md5 do `pg_get_functiondef` contra **produção (somente leitura, 2026-11-05)**: as quatro são idênticas.

### Divergência com o homologação já existente

O projeto `jinlong-homolog-palm` (`yvdilcmxyjafnnsfdtam`) já tem as cinco migrations aplicadas, e também `20261029155000`, `20261030100000` e as NF-e `20261030120000`–`20261030140000`. Ou seja, **o homologação não representa o estado de produção**. Comparação por md5 de 17 das 18 funções: idênticas às do repositório; a exceção é `internal.token_gerente_fora_da_loja`, cuja definição no homologação corresponde a `20261030100000` (que sobrescreve a 100000). **Não executei testes no homologação** nesta preparação: o ambiente não está isolado do estado de produção-like e não confirmei que os dados são sintéticos.

## 7. Rollback

Ordem obrigatória (reverter o último primeiro):

1. `20261028122000` → 2. `20261028121000` → 3. `20261028120100` → 4. `20261028110000` → 5. `20261028100000`.

Cada arquivo está em `backend/supabase/rollback/` e deve ser executado por SQL, com `ON_ERROR_STOP=1`.

**Limitações do rollback (não revertidas por SQL):**
- Tokens revogados pela 120100 **continuam revogados**. O rollback não os devolve. Os usuários que os usavam precisam emitir novos.
- Operações feitas durante a janela (vendas, descontos aprovados por token revogado) ficam registradas, mas não são desfeitas.
- Usuários inativados pela 110000 voltam a ser ativos pelo rollback, mas o histórico de tentativas bloqueadas não é restaurado.
- `internal.tokens_revogacao_log` e as tabelas de backup são mantidas de propósito (auditoria).

## 8. Riscos que não se revertem apenas por SQL

1. **Revogação de tokens (120100):** irreversível. Operações de gerente pendentes em lojas com usuários inativados param até nova emissão.
2. **Desativação de ADMINs (110000):** o rollback restaura, mas as sessões ativas dos usuários podem ter sido invalidadas no meio.
3. **Bloqueio de provisionamento (121000):** a criação de empresas fica bloqueada até a contingência manual (`docs/PROVISIONAMENTO_CONTINGENCIA.md`).
4. **RLS (122000):** usuários com vínculo inativo perdem leitura imediatamente; reverter exige o rollback e a aplicação da mudança de RLS em cada sessão.
5. **Sincronização do PDV offline:** tokens emitidos pelo dispositivo (`20261030100000`, adiada) não são afetados por esta tranche, mas a 120100 altera `fp_token_gerente_vale_na_loja`, usado pelo `sync-outbox`. Validar a fila de sincronização antes e depois.

## 9. Decisões que exigem autorização do dono

1. Autorizar a homologação em ambiente **isolado** (hoje o homologação já tem parte do histórico aplicado; decidir se é o ambiente de teste ou se é criado um novo).
2. Confirmar que a 110000 pode ser aplicada sem a 101000.
3. Autorizar a aplicação em produção, e a janela.
4. Aceitar as limitações da seção 7 e os riscos da seção 8.
5. Definir quem executa e quem valida (SQL e teste operacional).

## 10. Recomendação

- **Homologação:** GO, em ambiente isolado e confirmado.
- **Produção:** **NO-GO** até as decisões da seção 9 e a confirmação de backup/PITR.

## 11. Documentos e validação relacionados (atualizados em 2026-11-05)

- `docs/ops/TRANCHE_VALIDACAO_2026-11-05.md`: matriz PASSOU / FALHOU / NÃO TESTADO, dependência 110000 × 101000, falhas pré-existentes.
- `docs/ops/RECUPERACAO_ACESSO_TOKENS.md`: recuperação de gerente, operador e sincronização offline.
- `docs/ops/BACKUP_RESTAURACAO_SEM_PITR.md`: backup lógico e restauração testada, sem presumir PITR.
- `backend/scripts/tranche-seguranca-validar.sh`: reprodução completa em contêiner descartável (aplica, testa, reverte e compara).

**Pré-requisitos adicionais para produção:** PITR (ou dump lógico) confirmado; decisão do dono sobre a `20261028101000` (a gestão de assinatura do DONO depende dela); PDV testado com sincronização offline; procedimento de contingência de cadastro executado uma vez em homologação.
