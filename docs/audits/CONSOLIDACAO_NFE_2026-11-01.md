# Consolidação NF-e (#653 + #654) — 2026-11-01

Registro da consolidação feita na branch `claude/consolidacao-nfe-653-654`, enviada para a branch da PR #653 (`claude/jinlong-cost-profitability-integration-5b886c`). Head final: `99dbcaea`.

**Estado: não mergeado.** A PR #653 segue como draft, com `mergeStateStatus: BLOCKED`. O merge fica bloqueado até o dono confirmar o registro de produção. O label `deploy-prod:aprovado` não foi aplicado e depende de decisão explícita.

## 1. Decisões

- **Merge da #654 sem reescrever histórico.** A transferência (#629) entra depois do G14, como nos commits da #654 (`539cd0a0`). A integração foi feita por merge commit (`0176677f`).
- **Growth-001 volta para `20261023130000`.** A renomeação para `20261023130100`, feita em 2026-10-30, foi desfeita. A versão `20261023130000` agora aparece só uma vez no diretório de migrations. As referências do hub voltaram ao nome original.
- **Testes SQL da versão PR-A adotados.** Os cinco testes foram incorporados com as mesmas assertivas da PR-A.
- **Scripts de concorrência fora da esteira.** Dois scripts sem validação completa saíram da esteira e foram para `backend/scripts/backlog-redesign/`, com histórico preservado por `git mv`. O `test-nfe-conferencia-concurrency.mjs` continua na esteira.

## 2. Commits

| Commit | Descrição |
|---|---|
| `0176677f` | merge: integra #654 (transferência #629 após G14) na #653 sem reescrever histórico |
| `dfdf9e41` | fix(migrations): Growth-001 volta a `20261023130000` (sem duplicar; referências do hub) |
| `0a00201d` | test(nfe): adota os 5 testes SQL da versão PR-A |
| `99dbcaea` | chore(nfe): scripts de concorrência para trilha de redesign (fora da integração) |

## 3. Arquivos alterados

- `docs/audits/PR_B1_TRANSFERENCIA_629_2026-10-30.md` (somente no merge `0176677f`, +37 linhas).
- `backend/supabase/migrations/20261023130000_growth001_central_conversao.sql` e o `.rollback.sql` correspondente (renomeados de `20261023130100`, em `dfdf9e41`).
- `hub/README.md`, `hub/scripts/rls-test.sh`, `hub/supabase/test/central_conversao_test.sql` (referências ao nome da migration, em `dfdf9e41`).
- `backend/scripts/nfe-conciliacao-exigivel.test.sql`, `nfe-manual-sem-cnpj.test.sql`, `nfe-precisao-documental.test.sql`, `nfe-quantidade-precisao.test.sql`, `ux04-oc-recebimento-parcial.test.sql` (em `0a00201d`; em `99dbcaea` o ux04 teve o comentário de referência atualizado).
- `backend/scripts/backlog-redesign/README.md` (novo), `ux04-oc-recebimento-concorrencia.sh` e `nfe-concorrencia-confirmacao.sh` (movidos, em `99dbcaea`).

## 4. Evidências

Registradas na sessão anterior. Nesta etapa de documentação, não foram reexecutadas, exceto onde indicado.

- **Migrations sem duplicata.** Reconferido nesta etapa: `backend/supabase/migrations` tem 325 arquivos `.sql` sem rollback e nenhuma versão repetida. A sessão anterior registrou 450, mas não guardou o método de contagem, então esse número não foi reproduzido. Há uma duplicata fora desse diretório, `20261021115705_nature_code_commercial_hub.sql`, presente em `backend/supabase/migrations` e em `hub/supabase/`. São projetos separados e não é a mesma pasta de migrations.
- **Supabase.** `supabase start` e `supabase db reset`, com e sem seed: rc=0 em ambos.
- **Testes SQL PR-A.** Os cinco testes adotados em `0a00201d` retornaram rc=0 em duas rodadas, uma em C1 e outra em C2. Cada rodada rodou em transação com `ROLLBACK` e não deixou resíduos.
- **Concorrência.** `test-nfe-conferencia-concurrency.mjs`: PASS 2/2 (contenção real de lock, T2 bloqueado por 900 ms).
- **Vitest.** Importação NF-e: 110/110.
- **Build.** `tsc` e `next build` com exit 0.

## 5. Não executado

- **E2E Playwright.** Não foi rodado.
- **Esteira completa de 34 suítes.** Não foi rodada. Só as suítes listadas na seção 4 foram executadas.
- **Scripts de backlog.** `ux04-oc-recebimento-concorrencia.sh` e `nfe-concorrencia-confirmacao.sh` não foram executados. Estão fora da esteira e não são válidos como estão (ver `backend/scripts/backlog-redesign/README.md`).
- **Aplicação em produção ou homologação.** Nenhuma migration foi executada nesses ambientes.

## 6. Débitos

- **Scripts de backlog com `replica` e `DELETE` no kardex (ux04).** `ux04-oc-recebimento-concorrencia.sh` usa `session_replication_role = replica` (linhas 35 e 75) e faz `DELETE` em `movimentos_estoque_log` (linha 37). Isso contraria a imutabilidade do kardex e as FKs `NO ACTION`. Não basta remover o `replica`. A limpeza precisa respeitar o kardex e os dados de teste.
- **`DISABLE TRIGGER` em `financial-adversarial-gates.test.sql`.** Linha 1616 desabilita `trg_itens_venda_comissao` em `itens_venda`. Linha 1774 desabilita `trg_movimentos_estoque_log_bloqueia_mutacao` em `movimentos_estoque_log`. Os dois precisam de revisão antes de a suíte ser tratada como evidência.

## 7. Próximo passo

Confirmar o registro de produção e decidir sobre o label `deploy-prod:aprovado`. Só depois disso a PR #653 pode ser mergeada.
