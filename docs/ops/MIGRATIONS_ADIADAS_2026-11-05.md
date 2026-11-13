# Migrations adiadas e pendentes — 2026-11-05

Registro formal das migrations do repositório que **não estão aplicadas em produção** (`kbabmewnahysfvlybiak`) e que foram adiadas
em `.github/deploy-governance/deferred-migrations.json`. Este documento é a evidência exigida pelas condições de liberação.

**Nada foi aplicado em produção.** Nenhum `db push`, `migration repair`, deploy ou merge.

## 1. Como o check distingue os casos

`backend/scripts/p0-migration-status.mjs` (job `migration-remote-drift`) compara `supabase migration list` com os arquivos em disco:

| Caso | Classificação no script | Efeito no CI |
|---|---|---|
| Arquivo no repo, ausente no remoto | `remote_ausente` | Bloqueia, **salvo** se estiver no manifesto de adiadas |
| Arquivo no repo, adiado, ausente no remoto | `deferred` (pendente) | Não bloqueia; listado à parte |
| Adiada que aparece aplicada no remoto | `adiada_aplicada` | **Bloqueia** (violação de governança) |
| Aplicada no remoto sem arquivo, ou com version de timestamp diferente | `remote_only` / `git_only` | Bloqueia, **salvo** se houver par aceito em `migration-human-gates.json` |
| Versões legadas numéricas e reordenação greenfield | `legacyNumericMirror` / `greenfieldSsotReorder` | Aceitas por regra fixa |
| Falha de CLI, de conexão, de parse ou de config | exit 2 | Falha (erro de configuração, não drift) |

O manifesto aceita apenas `version` para o check; os demais campos (`owner`, `releaseCondition`, `decisionDoc`) são documentação obrigatória por esta política.

O guard `scripts/ops/deploy-governance-guard.mjs` impede editar, remover ou renomear uma migration adiada, e exige o label `deploy-prod:aprovado` para alterar o manifesto.

## 2. Matriz das 11 migrations pendentes

| Migration | Estado | Motivo | Decisão |
|---|---|---|---|
| `20261028100000` sec token gerente fora da loja | BLOQUEADA | Correção de segurança (vazamento entre empresas). Sem rollback | Preparar homologação (tranche de segurança) |
| `20261028101000` cobrança Asaas | ADIADA | Arquivo exige revisão do dono e homologação. Sem rollback | Adiada (manifesto) |
| `20261028110000` corte ADMIN | BLOQUEADA | Segurança. Depende de 100000 e 101000 (101000 fica fora) | Ver nota de dependência abaixo |
| `20261028120100` tokens de inativos | BLOQUEADA | Segurança, decisão do dono (item 3). Tem rollback | Preparar homologação |
| `20261028121000` provisionamento bloqueado | BLOQUEADA | Segurança, decisão do dono (item 2). Tem rollback | Preparar homologação |
| `20261028122000` ADMIN residual | BLOQUEADA | Segurança. Depende de 110000 e 120100. Tem rollback | Preparar homologação |
| `20261029155000` kardex `transferencia_id` | ADIADA | Altera transferência de estoque. Sem rollback | Adiada (manifesto) |
| `20261030100000` token de dispositivo | ADIADA | Muda regra de desconto. Exige aprovação específica | Adiada (manifesto) |
| `20261030120000` conciliação NF-e | ADIADA | Depende do PR #653 | Adiada (manifesto) |
| `20261030130000` precisão documental NF-e | ADIADA | Depende de app com parser novo | Adiada (manifesto) |
| `20261030140000` precisão de quantidade NF-e | ADIADA | Depende de app com mensagem nova | Adiada (manifesto) |

**Nota sobre dependências:** `20261028110000` depende de `20261028101000` (cobrança), que fica adiada. Antes de aplicar a tranche de segurança, o dono precisa decidir se `110000` pode ir sem `101000`. Se a revisão mostrar que não pode, a tranche inteira fica bloqueada até a decisão.

## 3. Condições de liberação (resumo)

As condições completas estão no manifesto. Em resumo, cada entrada só sai do manifesto por PR com label `deploy-prod:aprovado` e com:

- **Cobrança (101000):** revisão do dono, rollback testado, homologação com webhook Asaas em sandbox.
- **Kardex (155000):** rollback criado e testado, testes de transferência verdes em homologação.
- **Token de dispositivo (`20261030100000`):** aprovação específica do dono e validação presencial no PDV.
- **NF-e (120000, 130000, 140000):** decisão do dono sobre o PR #653, testes de conciliação e precisão em homologação, app com parser e mensagens publicados.

## 4. Decisões que exigem autorização do dono

1. Aprovar ou rejeitar a inclusão das 6 entradas adiadas (este PR).
2. Confirmar que `20261028110000` pode ser aplicada sem `20261028101000`, ou decidir como tratar a dependência.
3. Autorizar a aplicação da tranche de segurança em homologação, e depois em produção.
4. Decidir sobre o PR #653 (consolidação NF-e), que bloqueia `20261030120000`.
5. Decidir sobre a regra de token de dispositivo (`20261030100000`).
6. Adicionar o label `deploy-prod:aprovado` ao PR, exigido pelo guard para alterar o manifesto.

## 5. Situação do drift

Com estas entradas adiadas, o check deixa de bloquear pelas 6 migrations acima, mas **continua bloqueando** pelas 5 de segurança enquanto não forem aplicadas ou adiadas formalmente. Não foram adicionadas ao manifesto para tornar o CI verde.

## 6. O que o label `deploy-prod:aprovado` libera (verificado em 2026-11-05)

Busca no repositório (workflows, scripts e docs). O label é lido **em um único lugar**:

| Onde | O que faz |
|---|---|
| `.github/workflows/deploy-governance.yml` | Job `deploy-governance` roda `scripts/ops/deploy-governance-guard.mjs` em PRs para `main`. |
| `scripts/ops/deploy-governance-guard.mjs` | Falha se o PR tocar `backend/supabase/migrations/`, `backend/supabase/functions/`, `backend/supabase/config.toml` ou o manifesto de adiadas, **sem** o label. Também falha se uma migration adiada for alterada, removida ou renomeada, mesmo com label. |

O label **não**:

- aplica migration em nenhum banco;
- faz deploy de Edge Function ou de app;
- habilita a integração GitHub→Supabase (que, segundo `docs/ops/deploy-governance.md`, foi desligada manualmente em 2026-10-20 e não pode ser verificada por este repositório);
- substitui o runbook manual de produção.

Consequência: o label é um **gate de merge na `main`**, não uma autorização de produção. A aplicação em produção continua manual, por SQL, com autorização expressa do dono.

### Separação proposta (sem enfraquecer controles)

1. **Aprovação de governança (merge):** label `deploy-prod:aprovado`, aplicado pelo dono depois da revisão deste documento. Já é o comportamento atual.
2. **Autorização de produção:** registrada no `decisionDoc` de cada migration, com data, responsável e escopo, e executada manualmente conforme `docs/ops/TRANCHE_SEGURANCA_MIGRATIONS_2026-11-05.md`. Não depende de label.
3. **Fortalecimento (ação do dono nas configurações do GitHub, não feita aqui):**
   - *Settings → Branches → regra da `main`:* exigir revisão de Code Owner e o check `deploy-governance`.
   - *Settings → Code and automation → Labels:* restringir quem pode aplicar labels, se o plano permitir. Qualquer pessoa com escrita pode hoje aplicar o label, o que é um controle fraco.
   - Criar `CODEOWNERS` para o manifesto e `config.toml` (já previsto em `docs/ops/deploy-governance.md`, ainda não confirmado no repositório).

Nada disso foi alterado nesta etapa. O label não foi aplicado.

## 7. Custo de produto de adiar a `20261028101000` (verificado em 2026-11-05)

Adiar a cobrança não é neutro para o lançamento:

- A tela de assinatura do DONO (`pdv-importados/app/admin/assinatura/actions.ts`) confere o papel chamando `fp_sou_dono_da_empresa`, que só existe na `20261028101000`. Sem ela, a gestão de assinatura falha fechada ("Somente o DONO gerencia a assinatura").
- Em produção (somente leitura): `fp_sou_dono_da_empresa`, `cobranca_registrar_assinatura` e `cobranca_reservar_assinar` **não existem** hoje. A gestão de assinatura pelo DONO já está indisponível.
- A `20261028110000` (corte ADMIN) não altera essa cobrança, porque o gate é por DONO, não por ADMIN.

**Decisão do dono:** a revisão de segurança da cobrança (condição (a) acima) é pré-requisito para o primeiro cliente pagante contratar pelo app. Priorizar a revisão, sem pular as condições de liberação.
