# SEC-ANON-COMPLEMENTO — evidências (2026-11-06)

Migration: `backend/supabase/migrations/20261106150000_sec_anon_complemento_privilegios.sql`
Rollback: `backend/supabase/rollback/20261106150000_sec_anon_complemento_privilegios.rollback.sql`
Teste: `backend/scripts/sec-anon-complemento.test.sql` (registrado no job de regressão de segurança do CI)

## Estado lido em produção e homologação (somente leitura)

| Objeto | Produção (`kbabmewnahysfvlybiak`) | Homologação (`yvdilcmxyjafnnsfdtam`) |
|---|---|---|
| Tabelas de `public` com privilégio para `anon` | 63 | 0 |
| Views de `public` com privilégio para `anon` | 12 (todas já com `security_invoker`) | 0 |
| Sequências de `public` com privilégio para `anon` | 6 (`SELECT, UPDATE, USAGE`) | 18 |
| Default ACL de `postgres` em `public` | tabelas `anon=rxtm`; sequências `anon=rwU` | o mesmo |
| `public.perfis` com SELECT para `anon` | sim | tabela não existe |
| `authenticated` (relações de `public`) | inalterado | inalterado |

Registro de migrations: `20261104120000` não está em produção; está registrada em homologação, com conteúdo não verificado.
Não presumimos que o registro de homologação corresponde ao arquivo local: a migration nova é idempotente e não depende desse estado.

## Verificação local (PGlite 0.3.14 = Postgres 17 em WASM; sem tocar em nenhum projeto remoto)

Cenário: mesma forma de privilégios de produção para as relações em escopo (13 tabelas, 2 views — uma com `security_invoker` e uma sem —, 3 sequências), papéis `anon`/`authenticated`/`service_role`, default ACL de `postgres`, RPC `registrar_lead_comercial` com EXECUTE para `anon`, uma venda semeada.

Saída completa: `docs/qa/evidencias/sec_anon_complemento_pglite_2026-11-06.json`

| Verificação | Resultado |
|---|---|
| Teste de regressão **antes** da migration | FALHOU como esperado (anon com privilégio em 15 relações) |
| Teste de regressão **depois** da migration | OK |
| Relações com privilégio para `anon`: antes → depois | 15 → 0 |
| Sequências com privilégio para `anon`: antes → depois | 3 → 0 |
| `anon` lê `vendas`: antes → depois | antes: consulta executa (RLS devolve 0 linhas); depois: `permission denied` |
| `authenticated` (privilégios de todas as relações) | **idênticos byte a byte** antes e depois |
| `authenticated` lê `vendas` (com uma linha) | 1 linha antes, 1 linha depois |
| RPC `registrar_lead_comercial` como `anon` | `ok` antes e depois |
| Default ACL de `postgres` em `public` | `anon=rwU` / `anon=arwdDxtm` → vazia |
| Views sem `security_invoker` | 1 → 0 (a `v_legado_sem_invoker` foi corrigida; as de produção já tinham) |
| Reaplicação da migration | sem erro (idempotente) |

## Limitações (não verificado)

- **Não rodou em Postgres com a stack Supabase** (sem Docker local). PGlite não tem `supabase_admin`, `net`, `storage`, `realtime`, `extensions` nem as políticas reais; por isso as políticas foram simplificadas.
- O teste de regressão **roda no CI** (job de regressão de segurança, depois do `db reset`): esse é o teste oficial. Resultado a acompanhar no PR.
- **Fora do escopo** (documentado na migration): EXECUTE de funções; schemas de plataforma (pertencem a `supabase_admin`); default privileges de `supabase_admin`.
- **Lacuna do teste de `authenticated`:** `sec_anon_authenticated_depois.sql` (já no repositório) não tem saída gravada das checagens de `authenticated`. A verificação de tela (relatórios admin com `v_vendas_dia` para DONO/GERENTE/OPERADOR) continua pendente em homologação.

## Rollback

O rollback restaura os privilégios de **produção** capturados por objeto (58 tabelas com `MAINTAIN, REFERENCES, SELECT, TRIGGER`; 5 sem SELECT; 12 views; 6 sequências; default ACL). Não restaura o estado de homologação. Não remove `security_invoker` das views.
