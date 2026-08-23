# Escopo do Piloto D0 — Consolidação e Achados

Documento de consolidação criado no encerramento técnico de 2026-08-23, na branch
`codex/ap-payments-reconciliation`. Reúne os dois documentos-fonte fornecidos pelo
proprietário do produto, os princípios de engenharia aplicáveis, e o inventário de
achados já produzido pela auditoria pré-go-live de 2026-08-21
(`docs/auditoria-pre-go-live-2026-08-21/`), acrescido do que foi verificado nesta
sessão de encerramento.

Convenção usada abaixo: **FATO** (comprovado por comando/leitura nesta sessão),
**INFERÊNCIA** (dedução razoável a partir de fatos), **RECOMENDAÇÃO** (proposta,
não decisão), **PENDÊNCIA** (requer decisão de terceiro — dono do produto, DevOps,
jurídico).

## 1. Resumo executivo

O piloto D0 visa colocar o Jinlong em produção para o primeiro cliente pagante,
usando o Bling como referência funcional (PDV, cadastro de produtos, estoque,
financeiro, fiscal, WhatsApp, permissões, fechamento de caixa, backup e
relatórios). A base de código já implementa a maior parte desse escopo; o
trabalho em andamento nesta branch é a reconciliação financeira AR/AP (contas a
receber/pagar) e a documentação de rollback dessas migrations, além de uma
auditoria completa de segurança/financeiro/i18n concluída em 21/08/2026 que
bloqueia o go-live até que seus achados P0/P1 sejam remediados.

**FATO:** o branch está sincronizado com `origin/codex/ap-payments-reconciliation`
(0 commits à frente/atrás) e não há PR aberto para ele.
**FATO:** a auditoria de 21/08/2026 concluiu **NÃO COMPROVADA** a confiabilidade
financeira, **REPROVADO** o quesito de segurança técnica e **INSUFICIENTE** a
prontidão LGPD (ver `docs/auditoria-pre-go-live-2026-08-21/`).

## 2. Requisitos extraídos da especificação

Fonte: `01-Especificação de Alterações e Melhorias do Sistema.pdf` (fornecido pelo
proprietário; localizado em
`C:\Users\nocod\OneDrive\Desktop\01-Especifica-o-de-Altera-es-e-Melhorias-do-Sistema.pdf`
e lido integralmente nesta sessão). Referência funcional declarada: sistema Bling.

1. **Frente de Caixa (PDV):** busca rápida, código de barras, inclusão/exclusão
   de itens, desconto, cancelamento de item/venda, estoque em tempo real,
   vendedor responsável, múltiplas formas de pagamento, orçamento, venda em
   espera e recuperação, impressão/compartilhamento de comprovante. Diferencial:
   preço de varejo e atacado por produto, com aplicação automática por
   quantidade mínima configurável e regras comerciais por produto.
2. **Cadastro de produtos:** campos mínimos (código de barras, referência,
   descrição, categoria, marca, unidade, fornecedor principal, estoque mínimo,
   localização, imagem, ativo/inativo, observações) e controle de preços (custo,
   varejo, atacado, margem, histórico de alteração).
3. **Auditoria e histórico:** toda inclusão/alteração/exclusão/cancelamento/
   reativação/movimentação financeira ou de estoque deve registrar usuário,
   data/hora, estação, módulo, registro, valor anterior e novo — em todos os
   módulos (produtos, clientes, fornecedores, estoque, financeiro, caixa,
   usuários, configurações, relatórios, vendas, fiscal). Consulta filtrável por
   usuário/data/período/módulo/tipo de operação.
4. **Controle de estoque:** entrada, saída, ajuste, inventário, transferência
   entre lojas, histórico completo, estoque mínimo com alerta. Relatórios:
   estoque atual/mínimo, produtos sem movimentação, divergência de inventário,
   curva ABC.
5. **Financeiro:** contas a receber (parcelas, recebimento parcial/total,
   histórico, inadimplência) e a pagar (vencimento, pagamento, histórico); fluxo
   de caixa (entrada/saída/saldo diário/projeção) segmentado por venda realizada
   vs. efetivamente recebida.
6. **Emissão fiscal:** NFC-e e NF-e, status SEFAZ, cancelamento, carta de
   correção, inutilização, reenvio, armazenamento de XML/DANFE, envio automático
   por e-mail.
7. **WhatsApp:** envio de orçamento, pedido, comprovante, cobrança, boleto, nota
   fiscal e relatório, com histórico (usuário, data, hora, documento).
8. **Permissões:** ações granulares (visualizar/incluir/alterar/excluir/
   cancelar/emitir relatório/autorizar operação especial) por perfil
   (administrador, gerente, financeiro, estoque, vendedor, operador de caixa),
   com relatórios individuais e consolidados.
9. **Fechamento de caixa:** abertura/fechamento, sangria, suprimento, controle
   por operador, conferência por forma de pagamento, relatório de diferenças,
   histórico, reabertura mediante autorização.
10. **Backup automático:** diário/semanal/mensal, local e em nuvem, com registro
    de execução/falha e restauração simplificada.
11. **Relatórios gerenciais:** vendas (período/vendedor/cliente/produto/
    categoria/forma de pagamento), estoque, financeiro, fiscal e auditoria
    (alterações, histórico completo, usuários mais ativos).

O documento-fonte declara explicitamente que qualquer funcionalidade do Bling não
listada aqui, mas observada no fluxo padrão, também deve ser considerada
referência — e que toda funcionalidade implementada precisa de auditoria e
histórico de alterações (item 3 é transversal aos demais).

**PENDÊNCIA:** o documento-fonte não define aceite objetivo por item (não há
critério de "pronto" por funcionalidade) nem prioridade entre elas — ver seção 8.

## 3. Princípios de engenharia aplicáveis

Fonte: `02-Princípios-de-Engenharia.txt` (fornecido pelo proprietário; localizado
em `C:\Users\nocod\Downloads\02-Princ-pios-de-Engenharia.txt` e lido integralmente
nesta sessão). Resumo operacional dos pontos com efeito direto sobre as decisões
deste encerramento:

- Antes de qualquer alteração: reduz complexidade? melhora manutenibilidade?
  preserva a arquitetura? reduz dívida técnica? reduz acoplamento? existe solução
  mais simples? — nunca recomendar mudança só por ser mais moderna.
- Single Source of Truth: verificar sempre se existe apenas uma definição para
  entidades, regras, cálculos, estados e validações; explicar qual implementação
  deve prevalecer quando houver duplicidade.
- Alteração financeira: rollback compensa, nunca apaga fatos (isso já está
  refletido nos comentários de ROLLBACK adicionados às migrations AR/AP nesta
  branch — ver seção 6).
- Nunca concluir que existe um problema sem evidência concreta — todo achado
  neste documento cita comando, arquivo ou linha.
- Toda mudança arquitetural precisa preservar a Arquitetura Hexagonal, os
  boundaries entre módulos e a testabilidade/observabilidade existentes.

Este encerramento seguiu esses princípios: nenhuma migration foi reescrita
silenciosamente, nenhum backup foi apagado, e todo achado abaixo tem evidência
anexada (comando executado ou arquivo:linha).

## 4. Estado verificado do repositório (fatos desta sessão)

| Item | Valor |
|---|---|
| Branch | `codex/ap-payments-reconciliation` |
| HEAD | `3d68d32880986832403976d46a47968efcd8d873` |
| Upstream | `origin/codex/ap-payments-reconciliation` — 0 à frente / 0 atrás |
| PR aberto para esta branch | Nenhum (`gh pr list --head codex/ap-payments-reconciliation` → vazio) |
| `main`/produção | Produção foi atualizada recentemente a partir de `main` no commit `ede1f459785f79ced4df0cd9a97a6ccdd3e26220` (declarado pelo usuário; não reverificado nesta sessão porque não havia necessidade de tocar em produção) |
| Working tree | 10 arquivos modificados, 6 caminhos não rastreados (detalhe na seção 6 e no handoff geral) |

## 5. Inventário de problemas — herdado da auditoria de 21/08/2026

A auditoria pré-go-live já entrega uma matriz rastreável completa
(`docs/auditoria-pre-go-live-2026-08-21/MATRIZ_ACHADOS_PRE_GO_LIVE.md`) com 21
achados classificados por severidade (P0/P1/P2) e um plano executável em 5
sprints (`PLANO_REMEDIACAO_PRE_GO_LIVE.md`). Este encerramento não repete esse
trabalho — apenas resume os itens que bloqueiam o go-live (`Bloqueia = Sim`) e
acrescenta o que foi verificado agora:

| ID | Sev. | Bloqueia | Resumo |
|---|---|---|---|
| FIN-001 | P0 | Sim | Release financeira não reproduzível pelo SHA (working tree sujo sobre migrations já aplicadas) |
| SEC-001 | P1 | Sim | Conexão/dumps locais podem vazar (`conexao.txt`, `backups/`) |
| SEC-002 | P1 | Sim | Chave desktop global permite forjar novo cliente |
| SEC-003 | P1 | Sim | Logs persistem localmente sem redação/TTL |
| SEC-004 | P1 | Sim | RLS/grants/definers aplicados desconhecidos (sem banco) |
| LGPD-001 | P1 | Sim | Direitos/retenção prometidos sem fluxo provado |
| LGPD-002 | P1 | Sim | Dumps de produção sem governança |
| FIN-002 | P1 | Sim | Concorrência/invariantes sem execução DB completa |
| FIN-003 | P1 | Sim | Diagnósticos/grants podem divergir |
| I18N-002 | P1 | Sim (i18n) | Desktop PT/BRL-only |
| I18N-003 | P1 | Sim (EN) | Banco/tipos aceitam só pt/zh |

Ver a matriz original para os P2 e para os campos de evidência, correção e dono
de cada linha — não duplicados aqui para evitar divergência entre cópias.

## 6. Achados verificados nesta sessão de encerramento (novos, não estavam na auditoria de 21/08)

### D0-01 — P0 — `financial-adversarial-gates.test.sql` truncado no working tree

**Estado em 2026-08-23 (continuação Codex): RESOLVIDO.** A cauda foi recuperada
da versão ancestral certificada, o isolamento de GATE19/GATE23 foi corrigido
para bases locais compartilhadas e `npm run test:financial -w
fastproduct-backend` passou 6/6, incluindo 6 cenários concorrentes. A execução
foi feita sem reset do banco.

**Classificação:** COMPROVADO por execução direta.

**Evidência:**
```
cd backend && npm run test:financial
...
FAIL  financial-adversarial-gates.test.sql — unterminated dollar-quoted string at or near "$g$
```
O arquivo (`backend/scripts/financial-adversarial-gates.test.sql`, 99.754 bytes,
1795 linhas na working copy) termina literalmente no meio de um comentário —
`-- ---------------------------------------------------------- 6: troca` — sem
newline final, sem fechamento do bloco `DO $g$ ... $g$`, sem `COMMIT`/`ROLLBACK`.//
Contagem de `$g$` no arquivo: 45 (ímpar — confirma quote não fechada).

**Impacto:** o gate financeiro adversarial completo (GATE 1–23, incluindo os
gates DB-05 e FIN-298 novos) não executa. `npm run test:financial` falha com
exit code 1. Nenhum dos outros 5 sub-testes financeiros foi afetado — todos
passaram isoladamente (ver seção 7).

**Causa provável:** edição interrompida no meio do bloco de teste do GATE23
(cenário 6, "troca"), antes desta sessão.

**Recomendação:** Codex deve localizar a versão completa do bloco GATE23
cenário 6 (troca) — possivelmente em outra sessão/worktree que tenha o arquivo
íntegro — ou reescrever esse cenário do zero, fechar o bloco `$g$...$g$`, e
reexecutar `npm run test:financial` até PASS antes de qualquer commit deste
arquivo. **Este encerramento não commitou o arquivo.**

### D0-02 — P0 — remoção de `exceljs` quebra `pdv-importados/lib/xlsx.ts`

**Estado em 2026-08-23 (continuação Codex): RESOLVIDO.** `exceljs@^4.4.0` foi
restaurado como dependência direta e o lockfile foi regenerado. O typecheck do
PDV passou, `npm ls` resolveu `exceljs@4.4.0` e uma instância de `Workbook` foi
criada em teste de runtime.

**Classificação:** COMPROVADO por typecheck direto.

**Evidência:**
```
cd pdv-importados && npx tsc --noEmit -p .
lib/xlsx.ts(11,45): error TS2307: Cannot find module 'exceljs' or its corresponding type declarations.
lib/xlsx.ts(23,42): error TS7006: Parameter 'buffer' implicitly has an 'any' type.
```
`pdv-importados/package.json` remove `exceljs` das dependências nesta working
tree, mas `lib/xlsx.ts` continua importando o pacote. O `package-lock.json` está
internamente coerente com o novo `package.json` (verificado programaticamente:
34 deps/12 devDeps em `packages["pdv-importados"]`, `knip` presente, nenhum dos
pacotes removidos — `html2canvas`, `nanoid`, `ws`, `picocolors`, `source-map-js`,
`@vercel/speed-insights`, `@vitest/ui`, `@fastproduct/shared-core` — sobrevive
na seção do workspace), mas o código-fonte não foi atualizado para acompanhar a
remoção.

**Impacto:** typecheck do workspace `pdv-importados` falha. Qualquer build/CI
que rode `tsc --noEmit` nesse workspace quebra.

**Recomendação:** Codex deve decidir, antes de commitar `package.json`/
`package-lock.json`: (a) reverter a remoção de `exceljs` se `lib/xlsx.ts` ainda
for necessário, ou (b) migrar `lib/xlsx.ts` para outra biblioteca/implementação
e então remover `exceljs`. **Este encerramento não commitou nenhum dos dois
arquivos de dependências.**

### D0-03 — P1 (risco de drift) — 5 migrations financeiras já aplicadas em produção foram editadas (comentário-only)

**Estado em 2026-08-23 (continuação Codex): RESOLVIDO SEM REESCREVER
HISTÓRICO.** As cinco migrations voltaram ao blob do `HEAD` e não aparecem no
diff. O conteúdo operacional foi preservado em
`docs/runbooks/rollback-financeiro-20260813-18.md`.

**Classificação:** COMPROVADO — comparação de diff + `mcp__supabase__list_migrations`.

As migrations abaixo têm alteração no working tree restrita a blocos de
comentário `-- ROLLBACK ...` adicionados no topo do arquivo (nenhuma instrução
SQL executável foi alterada, adicionada ou removida — confirmado por leitura
integral de cada diff):

- `20260813231034_financial_idempotency_correlation_expand.sql`
- `20260813232133_sale_totals_invariant.sql`
- `20260813234233_ar_receipts_reconciliation.sql`
- `20260814000154_ap_payments_reconciliation.sql`
- `20260818000001_revoke_relatorio_consistencia_vendas.sql` (este só *remove*
  linhas de comentário, sem alterar os `REVOKE` executados)

`mcp__supabase__list_migrations` no projeto Supabase vinculado confirma que
**todas as 5 versões já estão aplicadas em produção** (presentes na tabela
`supabase_migrations.schema_migrations`).

**Risco:** o Supabase CLI calcula o checksum de cada migration a partir do
conteúdo integral do arquivo. Alterar bytes de uma migration já aplicada — ainda
que só em comentário — muda esse checksum e pode acender divergência em
`supabase migration list`/`db push` contra o projeto remoto, mesmo sem qualquer
efeito funcional real. Isso é exatamente o cenário descrito em FIN-001 da
auditoria de 21/08 ("release financeira não reproduzível pelo SHA").

**Recomendação (não decisão):** antes de commitar estes 5 arquivos, Codex deve
rodar `supabase migration list` contra o projeto vinculado e confirmar se o CLI
trata comentário-only como divergência bloqueante. Se tratar, mover o texto de
rollback para um documento fora de `supabase/migrations/` (ex.:
`docs/runbooks/rollback-financeiro.md`) preserva o mesmo valor operacional sem
tocar em bytes de migration já aplicada. **Este encerramento não converteu isso
em nova migration incremental automaticamente, conforme instrução explícita
recebida, e não commitou nenhum dos 5 arquivos.**

### D0-04 — informativo — `DB05_COMMISSION_REMEDIATION_HANDOFF.md` está desatualizado

**Classificação:** COMPROVADO por `git log`.

O documento (não rastreado, presente na raiz do repositório) foi escrito com
HEAD declarado `08b04de3` e conclui `DB-05 FECHADO: NÃO`. O histórico do branch
mostra que, **após** esse HEAD, os commits `562fbe69`, `fd9bdfc0`, `684882bb`,
`3c2a6e90` e `efb5dd24` ("docs(go-live): certify DB-05 and frontend
reconciliation", 2026-08-14 18:52) implementaram e certificaram exatamente as
unidades DB-05A–F que o documento cobra, e a certificação está registrada em
`docs/go-live/00-README.md` e `docs/go-live/03-deploy-backend.md`. O commit de
certificação também registra explicitamente que a reauditoria AR/AP (o próprio
escopo desta branch) e certos itens residuais continuam pendentes antes da Fase
3A — o que é coerente com D0-03 acima.

**Ação tomada nesta sessão:** o arquivo foi marcado como superado no topo,
preservando o conteúdo histórico integral (ver seção "Documentação entregue" no
handoff geral). Não foi reescrito nem apagado.

## 7. Testes executados nesta sessão e resultados exatos

Executados contra o Supabase local já em execução no Docker (containers vistos
com `docker ps`, iniciados antes desta sessão — não foi feito `supabase db
reset` para não destruir estado de outra sessão/worktree potencialmente ativa
nesse mesmo banco compartilhado). **Isso significa que os resultados abaixo não
partem de um banco limpo — válidos como evidência de execução, não como
certificação formal**, conforme a própria regra do projeto de nunca aceitar
placar de teste sem reset prévio.

```
cd backend && npm run test:financial
```

| Suíte | Resultado |
|---|---|
| financial-idempotency-correlation-contract.test.mjs | PASS |
| sale-totals-invariant.test.sql | PASS |
| ar-receipts-reconciliation.test.sql | PASS |
| ap-payments-reconciliation.test.sql | PASS |
| financial-adversarial-gates.test.sql | **FAIL** — ver D0-01 |
| test-commission-concurrency.mjs | PASS (6 cenários) |

Resultado agregado do runner: `Gate financeiro FALHOU: 1/6 suíte(s)`.

```
cd pdv-importados && npx tsc --noEmit -p .
```
2 erros, ambos em `lib/xlsx.ts` — ver D0-02.

**Não executado nesta sessão** (registrado objetivamente, não inventado):
- `supabase db reset --local` (evitado deliberadamente — banco compartilhado
  potencialmente em uso por outra sessão/worktree Codex).
- `test:financial-concurrency` isolado (rodou como parte de `test:financial`
  acima, não em isolamento).
- `test:rls-scope`, `check:types-drift`, `check:edge`, `vitest`, `lint`, `build`
  do monorepo completo — fora do escopo proporcional deste encerramento
  (nenhum desses arquivos foi tocado por esta sessão) e não executados por
  restrição de tempo.
- Lint/typecheck de `backend/scripts/p0-migration-status.mjs` e demais scripts
  citados no handoff DB-05 antigo — esses arquivos não aparecem no `git status`
  atual (foram commitados em algum ponto entre `08b04de3` e o HEAD atual) e não
  fazem parte do diff desta sessão.

## 8. Dúvidas em aberto (não respondidas — não inventadas)

- A especificação (seção 2) não define prioridade nem critério de aceite
  objetivo por funcionalidade. **PENDÊNCIA do dono do produto.**
- Não há decisão registrada sobre rotação/descarte de `conexao.txt` e dos dois
  dumps em `backups/` (SEC-001/LGPD-002 pedem decisão humana explícita — ver
  `PLANO_REMEDIACAO_PRE_GO_LIVE.md`, S0.2). **PENDÊNCIA de DevOps/DPO.**
- Não há decisão sobre se o texto de rollback das migrations financeiras deve
  viver dentro do arquivo de migration (risco de checksum) ou em um runbook
  separado (D0-03). **PENDÊNCIA de Codex + dono técnico.**
- Não está confirmado se as migrations mais recentes vistas no projeto Supabase
  remoto (`20260819...`, `20260820...`, faixa `fase1b_*`) têm arquivo local
  correspondente commitado nesta branch — não verificado nesta sessão por não
  fazer parte do diff atual. **PENDÊNCIA — recomenda-se a Codex rodar
  `supabase migration list` vs. `git log -- backend/supabase/migrations` antes
  de qualquer novo apply.**

## 9. Fora do escopo deste D0 (explícito)

- Qualquer merge, deploy, alteração de produção ou fechamento/abertura de PR —
  explicitamente vetado pela instrução que originou este encerramento.
- Correção de código para fazer `financial-adversarial-gates.test.sql` ou
  `lib/xlsx.ts` passarem — registrados como pendência para Codex, não corrigidos
  aqui, para não introduzir mudança funcional não revisada num encerramento que
  deveria ser só de auditoria/documentação.
- Rotação de credenciais, exclusão de backups, ou qualquer decisão sobre
  `conexao.txt`/`backups/` além de git-ignorá-los.
- Reexecução completa da auditoria de 21/08/2026 — reaproveitada, não repetida.

## 10. Sequência recomendada para o Codex

1. Ler este documento e o handoff geral (`HANDOFF_CLAUDE_PARA_CODEX_2026-08-23.md`)
   integralmente antes de tocar em qualquer arquivo.
2. Resolver D0-01 (test SQL truncado) e D0-02 (exceljs) — são bloqueios
   objetivos e independentes um do outro; podem ser feitos em paralelo.
3. Decidir D0-03 (onde vive o texto de rollback das migrations já aplicadas)
   antes de commitar os 5 arquivos de migration.
4. Só depois disso, `supabase db reset --local` limpo e `npm run test:financial`
   do zero — não aceitar placar sobre banco não resetado.
5. Seguir a ordem de sprints já definida em
   `docs/auditoria-pre-go-live-2026-08-21/PLANO_REMEDIACAO_PRE_GO_LIVE.md`
   (Sprint 0 → 4) para os achados P0/P1 que bloqueiam o go-live.
6. Não iniciar Fase 3A antes de FIN-001 e da reauditoria AR/AP estarem
   fechadas com evidência no mesmo SHA candidato.

## 11. Definição objetiva de "pronto" para o D0

Adotando o mesmo padrão de rigor da auditoria de 21/08 e do handoff DB-05
(nunca aceitar "verde" que só prova existência):

- `supabase db reset --local` limpo, seguido de `test:financial` (todas as 6
  suítes, incluindo `financial-adversarial-gates.test.sql` completo) verde.
- `npx tsc --noEmit` sem erros nos três workspaces (`backend`, `pdv-importados`,
  `pdv-local`).
- Nenhum achado com `Bloqueia = Sim` na matriz de 21/08 permanece em `FALHA`
  ou `NAO COMPROVADO` sem evidência de correção no mesmo SHA candidato.
- `git status` limpo na branch candidata, sem segredo/dump/config local no
  diff a ser mergeado (checagem manual do diff antes do merge, não apenas
  `.gitignore`).
- CI completo (mesmo SHA): edge check, lint, typecheck, unit/integration/E2E,
  guards de RLS, financeiro SQL/concorrência, build web/desktop.
- Aprovação humana explícita para: rotação/descarte de segredos, escolha do SHA
  candidato final, e qualquer reparo de migration.

Até que os itens acima estejam satisfeitos, o piloto D0 permanece **NÃO
PRONTO** — este documento não declara "pronto" antecipadamente.
