# Diagnóstico da infraestrutura E2E e do teste unitário quebrado (2026-11-01)

Somente leitura. Nenhum usuário criado, nenhuma senha redefinida, nenhuma alteração em homologação, produção ou permissões. Nenhuma credencial aparece neste documento.

## Resumo

| Item | Status | Evidência |
|---|---|---|
| Login em homologação com conta de teste | FALHOU (não há conta utilizável) | 5 contas em `auth.users`, nenhuma confirmada, nenhuma com `last_sign_in_at`; nenhuma `e2e-*` |
| E2E crítico e Golden Flow em homologação | NÃO TESTADO (bloqueado pelo desenho do E2E) | `playwright.config.ts` recusa alvo não local; o job de CI usa Supabase local efêmero |
| E2E crítico e Golden Flow no CI (Supabase local) | NÃO TESTADO nesta sessão (sem Docker daemon; sem push) | `.github/workflows/ci-pdv-importados.yml`, job "E2E crítico" e job "e2e-playwright" |
| `caixaParcelasCredito.test.ts`, hook `renderHook` | FALHOU (ambiente local) | Causa comprovada na seção 4 |
| Demais 3 testes de `caixaParcelasCredito.test.ts` | PASSOU | saída do vitest |
| Matriz `Matriz` (loja) e empresa `e0000001` em homologação | PASSOU (existem) | consulta somente leitura |

## 1. Origem de cada referência

| Referência | Onde aparece | Origem | Conclusão |
|---|---|---|---|
| `lojamatriz.test` (operador@ e gerente@) | apenas `pdv-importados/e2e/README.md` (linhas 64 e 68) | exemplo de documentação escrito à mão | **Não é conta real.** Nunca foi seedada nem usada em código |
| `e2e-gerente@localhost.test`, `e2e-operador@localhost.test`, `e2e-dono@…` | `scripts/seed-dev-users.mjs`, `docs/SEED_DEV_E2E.md`, workflow de CI, specs | criadas pelo seed para o Supabase **local** | **Fonte oficial de contas E2E.** Só existem no stack local após `db reset` + seed |
| Loja `a0000001-0000-4000-8000-000000000001` ("Matriz") | `lib/auth/lojaUsuario.ts`, `scripts/seed-dev-users.mjs`, `e2e/gerente-transferencias.spec.ts`, `backend/supabase/migrations/*multiempresa*` | criada pelas **migrations** do repositório | **Fonte oficial da loja de teste.** Existe em homologação |
| Empresa `e0000001-…` ("Empresa 1 (cliente piloto)") | migrations `20261019120000_multiempresa_fase1_base.sql` e vizinhas | migrations | Existe em homologação |
| `f5100000-…` e `FIXTURE-S1 *` (5 usuários, 4 lojas, `@fixture.invalid`) | **nenhuma referência no repositório** | origem externa ao repositório (script ou SQL fora do git) | **Órfã.** Não é usada por nenhum E2E nem seed. Ver decisão D3 |
| `PLAYWRIGHT_*` | `e2e/helpers/env.ts`, `e2e/helpers/login.ts`, specs, `scripts/run-e2e-with-env.mjs` | lidas do ambiente | Nenhuma está definida no ambiente desta sessão |
| `storageState` | nenhuma ocorrência em `pdv-importados/e2e` nem em `playwright.config.ts` | — | **Não há cache de sessão.** Cada spec faz login pelo formulário, usando as variáveis acima |

## 2. Matriz: esperado pelos testes x existente na homologação

| Elemento | Esperado pelos testes (E2E local/CI) | Existente na homologação `yvdilcmxyjafnnsfdtam` | Situação |
|---|---|---|---|
| Empresa | `e0000001-0000-4000-8000-000000000001` (migrations) | existe ("Empresa 1 (cliente piloto)") | PASSOU |
| Loja | `a0000001-…-000000000001` "Matriz" | existe, 0 usuários vinculados | PASSOU (existe) / FALHOU (sem usuários) |
| Usuário DONO | `e2e-dono@localhost.test` (seed) | não existe | NÃO EXISTE |
| Usuário GERENTE | `e2e-gerente@localhost.test` (seed); `PLAYWRIGHT_TEST_EMAIL` | não existe | NÃO EXISTE |
| Usuário OPERADOR | `e2e-operador@localhost.test` (seed); `PLAYWRIGHT_CAIXA_TEST_EMAIL` | não existe | NÃO EXISTE |
| Perfil | GERENTE/OPERADOR em `public.usuarios` | nenhuma linha `e2e-*` | NÃO EXISTE |
| Vínculo usuário/loja | `usuarios.loja_id = a0000001…` | nenhum usuário nessa loja | NÃO EXISTE |
| Autenticação (Supabase Auth) | senha válida, e-mail confirmado, `aud=authenticated` | 5 contas `@fixture.invalid`, nenhuma confirmada, nenhuma com login registrado | FALHOU |

**Fonte oficial recomendada:** as migrations do repositório (empresa e loja) + `scripts/seed-dev-users.mjs` (usuários), aplicados ao stack local. Homologação não deve ser a fonte de dados de teste, porque o próprio harness recusa esse alvo.

## 3. Arquitetura dos testes

1. **Integração autenticada com Supabase Auth real:** **sim, mas só no stack local.** O job de CI sobe Supabase (`ci-supabase-local-start.sh`), roda `db reset` com as migrations do repositório, executa o seed e faz login real. Em homologação não há conta utilizável.
2. **E2E com conta dedicada:** **sim.** O seed cria DONO, GERENTE e OPERADOR `@localhost.test` com a mesma senha (`SEED_DEV_PASSWORD`). O seed tem guarda que recusa URL não local.
3. **Reuso seguro das fixtures:** as migrations (empresa e loja Matriz) são reutilizáveis e determinísticas. As fixtures `FIXTURE-S1` não são reutilizáveis: não há script no repositório que as reconstrua, e a origem delas é externa.
4. **Independência entre SQL e E2E:** sim. Os testes SQL de `backend/` e os E2E de `pdv-importados/` usam stacks distintos. Só o E2E depende das contas do seed.

Não há caminho de autenticação simulada no E2E. Qualquer afirmação de "E2E passou" sem login real no stack local seria inválida.

## 4. Falha de `app/caixa/caixaParcelasCredito.test.ts`

**Causa raiz comprovada: `@testing-library/react` não está declarado em `pdv-importados` e é resolvido a partir do checkout pai.**

Evidências:
- `pdv-importados/package.json` não declara `@testing-library/react`.
- O `package-lock.json` declara essa dependência apenas em `pdv-local` (linha 22993) e em `site` (linha 23091).
- Na árvore do worktree, `node_modules/@testing-library/` não existe.
- `require.resolve('@testing-library/react', {paths:['pdv-importados']})` resolve para `C:\Naturecode\fastproduct\node_modules\@testing-library\react`, o checkout principal (fora do worktree).
- Nesse caminho, `react` resolve para `C:\Naturecode\fastproduct\node_modules\react` (19.2.5), enquanto o hook (`app/caixa/hooks/useCaixaPagamentos.ts`) importa `react` de `…\worktree\node_modules\react` (19.2.5).
- São duas instâncias físicas de React. O hook chama `useState` fora do dispatcher do `react-dom` que renderizou, e o dispatcher é `null`: exatamente `Cannot read properties of null (reading 'useState')`.
- Experimento descartável (apagado após o teste): `renderHook(() => useState(1))` falha do mesmo jeito. Logo, o problema não é a lógica do hook; é o `renderHook` do pacote resolvido fora da árvore.
- Não há duplicidade de React dentro do worktree: existe uma única cópia `react` e uma `react-dom`, ambas 19.2.5.

**Por que nos outros testes não aparece:** todos os outros testes com hooks usam `createRoot` de `react-dom/client` importado da própria árvore (ex.: `useProdutoForm.behavior.test.tsx`). Só este arquivo depende de `@testing-library/react`, que é o único consumidor do pacote em `pdv-importados`.

**Por que no CI provavelmente passa:** em instalação limpa do monorepo, `npm ci` na raiz hoista `@testing-library/react` e `react` para a mesma árvore. Isso não foi verificado nesta sessão; é a hipótese a confirmar.

## 5. Plano incremental de correção

| Passo | Ação | Arquivo | Impacto | Dados de homologação | Exige decisão |
|---|---|---|---|---|---|
| P1 | Reescrever o hook test com `createRoot` + `act` de `react-dom` (mesmo padrão dos testes que passam), sem `@testing-library/react` | `app/caixa/caixaParcelasCredito.test.ts` | Mínimo. Nenhuma dependência nova. Segue o padrão do repositório | não | não |
| P2 | Declarar `@testing-library/react` e `@testing-library/dom` em `pdv-importados` **só se** o P1 não for aceito | `pdv-importados/package.json` + lock | Muda o lockfile. Exige justificativa (sprint: sem dependência nova sem justificativa) | não | **sim** |
| P3 | Restaurar a árvore de dependências do worktree com `npm ci` na raiz | ambiente | Resolve a resolução cruzada entre checkouts | não | não (ação local de setup) |
| P4 | Corrigir `e2e/README.md`: trocar `lojamatriz.test` por `e2e-gerente@localhost.test` e `e2e-operador@localhost.test` | `pdv-importados/e2e/README.md` | Só documentação | não | não |
| P5 | Rodar E2E somente no stack local (Docker) ou no job de CI `E2E crítico` | CI | Necessário para qualquer resultado de E2E | não | **sim** (push de branch dispara o CI; é ação externa) |
| P6 | Decidir o destino das fixtures `FIXTURE-S1` em homologação (manter para testes SQL, documentar ou remover) | homologação | Não afeta E2E | **sim, mexe em homologação** | **sim** |

**Não recomendado:** apontar o E2E para homologação com `ALLOW_NONLOCAL_E2E=1`. O seed grava usuários e o harness foi desenhado para ambiente local. Isso também contraria a regra de não usar produção e não criar dados de teste em homologação sem necessidade.

## 6. Critérios objetivos para liberar a execução do E2E

1. `npx vitest run app/caixa/caixaParcelasCredito.test.ts` passa em um checkout limpo com `npm ci` (P1 + P3).
2. Stack Supabase local sobe e `db reset` aplica as migrations do repositório sem erro.
3. `seed-dev-users.mjs` cria DONO, GERENTE e OPERADOR `@localhost.test`, e cada um tem `usuarios.loja_id = a0000001…`.
4. Login real com `e2e-gerente@localhost.test` retorna sessão (token), sem usar credenciais de homologação ou produção.
5. Guarda `playwright.config.ts` aceita o alvo (`localhost`).
6. Só então: `test:e2e:critical` (caixa-venda, caixa-fluxos-criticos, sync-fluxo-gerente) e o Golden Flow (`caixa-golden-flow-cycle5`, `caixa-fase5b-golden-flow-ui`) executados e classificados PASSOU/FALHOU/NÃO TESTADO.

## 7. Decisões que dependem de você

- **D1.** Aprovar P1 (reescrever o teste unitário com `react-dom` direto) ou preferir P2 (nova dependência no `pdv-importados`).
- **D2.** Autorizar um push de branch para rodar o job de E2E no CI com Supabase local efêmero (confirmar antes se o workflow dispara em push de branch). É a única forma de executar o E2E nesta sessão, porque o Docker local não tem daemon.
- **D3.** Decidir o destino das fixtures `FIXTURE-S1` em homologação (origem externa ao repositório).
- **D4.** Confirmar que nenhuma conta de homologação deve ser usada para E2E. A recomendação técnica é não usar.
