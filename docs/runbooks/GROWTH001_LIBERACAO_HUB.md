# Liberação da Central de Conversão (Growth-001) — preparação para revisão

**Status:** preparado, **não aplicado**. Nenhuma alteração em produção. Decisão de aplicar: dono do produto.
**Recomendação atual:** NO-GO até as condições da seção 5 serem cumpridas.
**Data da análise:** 2026-11-04.

## 1. Dependências e alterações

| Tipo | Objeto | Efeito |
|---|---|---|
| Coluna nova | `public.commercial_leads.origem` | `text NOT NULL DEFAULT 'site'`, check `site`/`teste_gratis` |
| Coluna nova | `commercial_leads.empresa_id` | `uuid` FK `empresas(id)` ON DELETE SET NULL |
| Coluna nova | `commercial_leads.email`, `interesse`, `proximo_contato` | aditivas, nulas |
| Constraint | `commercial_leads_channel_check` | passa a aceitar `email` |
| Constraint | `commercial_lead_events_kind_check` | passa a aceitar `solicitacao`, `conversao` |
| Índice | `commercial_leads_empresa_uniq` | único parcial em `empresa_id` |
| Privilégio | `UPDATE (interesse, proximo_contato)` | para `authenticated` |
| Funções | `public.commercial_trials_listar`, `commercial_planos`, `commercial_converter_trial`, `commercial_solicitar_contratacao`, `commercial_trial_garantir_lead` | RPCs do hub e do ERP |
| Funções | `internal.commercial_protocolo`, `commercial_trial_lead`, `commercial_valor_tabela` | auxiliares |
| Escrita | `saas.assinaturas`, `saas.assinatura_auditoria` (via trigger existente), `commercial_customers`, `commercial_lead_events`, `empresas.plano/max_lojas` | só na conversão manual |
| Backfill | um lead por teste grátis existente | hoje: 0 testes em produção |

Não cria policy nem trigger. A RLS existente continua valendo.

**Dependências anteriores (presentes em produção, verificado por leitura):** `is_commercial_admin()`, `internal.cobranca_reativar(uuid)`, `fp_empresa_contexto(uuid)`, `saas.tg_auditar_assinatura()`, `saas.planos`, `saas.assinatura_auditoria`, `public.usuario_vinculos`, colunas `empresas.plano`, `empresas.max_lojas`.

**Migrations posteriores não aplicadas em produção** (repositório): `20261028100000`, `20261028101000`, `20261028110000`, `20261028120100`, `20261028121000`, `20261028122000`, `20261029155000`, `20261029160000`, `20261030100000`, `20261030120000`, `20261030130000`, `20261030140000`. Tocam `saas.assinaturas` e funções de cobrança, mas não redefinem nenhuma dependência da Growth-001 (verificado por busca nos arquivos).

**Histórico divergente:** produção registra `20261029202813` com o nome de `20261029160000` no repositório. Não é bloqueio para esta migration, mas precisa de conciliação antes de qualquer `db push`.

## 2. Estado de produção x exigido pelo hub

| Item | Produção (leitura, 2026-11-04) | Exigido |
|---|---|---|
| `commercial_leads.origem`, `empresa_id` | ausentes | `/leads` e painel selecionam essas colunas |
| RPCs `commercial_*` | ausentes | `/conversao` e pedido de contratação do ERP |
| Leads | 2 (ambos `site`) | — |
| Eventos / clientes / testes grátis | 0 / 0 / 0 | — |
| Admin | 1 (usuário Auth confirmado, não banido) | — |

**Impacto atual no ERP:** `/admin/assinatura` (pedido de contratação) retorna erro ao dono. `/teste-gratis` cadastra normalmente, mas a ficha comercial não é criada (erro logado e ignorado).

## 3. Testes realizados (cópia local isolada, dados sintéticos `example.invalid`)

- Base: 439 migrations do repositório anteriores à Growth-001, em imagem Supabase Postgres 17. Sete falharam por ausência de `storage` e guardas de owner locais; nenhuma delas toca os objetos da Central. A base é aproximação, não cópia exata.
- Migration aplicada sem erro (`ON_ERROR_STOP=1`) sobre base com 2 leads de site e 1 teste grátis.
- Permissões: admin vê a Central; dono é negado (`COMMERCIAL_ACESSO_NEGADO`) e não vê leads (RLS); `anon` negado.
- Fluxo: pedido do dono → conversão manual → assinatura `ATIVA`, auditoria registrada, cliente criado, sem Asaas.
- Rollback original (`20261023130000_growth001_rollback.sql`): **destrutivo**. Apagou o lead de teste grátis, os eventos `solicitacao`/`conversao` e desvinculou o cliente (`lead_id` nulo). Reaplicar recriou o lead como `novo`, sem histórico.
- **Rollback seguro** (`rollback/20261023130000_growth001_rollback_seguro.sql`): antes e depois idênticos (leads 3, teste 1, eventos 3, clientes 1 com lead, assinatura ATIVA, auditoria 2). Consulta de leads do hub continua funcionando. Funções removidas (0 restantes). Reaplicar a migration funciona.
- **Rollback de colunas** (`rollback/20261023130000_growth001_rollback_colunas_guardado.sql`): aborta corretamente quando há dados da Central (`ROLLBACK_COLUNAS_ABORTADO`).

## 4. Riscos

1. **Aplicar pela Supabase CLI:** `db push` exige `--include-all` por causa do histórico não linear e aplicaria as migrations pendentes da seção 1. **Não usar a CLI.**
2. **Rollback original:** destrutivo. Use o seguro (seção 8).
3. **Backfill:** cria nome e e-mail do dono do teste. Hoje não há testes em produção; passa a ocorrer em cada teste novo. Já é o comportamento esperado do produto; registrar no LGPD.
4. **Lock:** `ALTER TABLE` em tabela pequena (2 linhas). Risco de bloqueio desprezível.
5. **Dependência de comportamento:** `commercial_converter_trial` chama `internal.cobranca_reativar` e grava em `saas.assinaturas`. Se alguma migration posterior mudar essas regras, a conversão deve ser retestada.

## 5. Condições antes de aplicar

1. Backup lógico confirmado (seção 6, passo 1) e restauração testada em cópia local.
2. Decisão sobre o rollback: usar o seguro (seção 8) como padrão.
3. Aplicação **somente** deste arquivo, por SQL (psql ou SQL Editor), não pela CLI.
4. Registrar o histórico **depois** de validar, e só se a conciliação do `20261029202813` estiver decidida.
5. Autorização explícita do dono do produto.

## 6. Plano de aplicação (para revisão, NÃO executar)

```bash
# 1. Backup somente leitura (string de conexão do gerenciador de senhas; não colar em chat)
pg_dump "$PROD_DB_URL" --data-only \
  -t public.commercial_leads -t public.commercial_lead_events -t public.commercial_customers \
  -t saas.assinaturas -t saas.assinatura_auditoria -t public.empresas \
  > backup_growth001_data_$(date +%Y%m%d%H%M).sql

pg_dump "$PROD_DB_URL" --schema-only -n public -n saas -n internal \
  > backup_growth001_schema_$(date +%Y%m%d%H%M).sql

# 2. Aplicação isolada (o arquivo já tem BEGIN/COMMIT; não usar -1)
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f backend/supabase/migrations/20261023130000_growth001_central_conversao.sql

# 3. Histórico (somente após validação; conferir colunas de supabase_migrations.schema_migrations antes)
psql "$PROD_DB_URL" -c "insert into supabase_migrations.schema_migrations(version, name) values ('20261023130000', 'growth001_central_conversao')"
```

Se o passo 2 falhar, o arquivo não confirma (transação interna). Verifique antes de repetir.

## 7. Validação pós-aplicação (somente leitura)

- Colunas e constraints da seção 1 presentes.
- `to_regprocedure` das 5 RPCs públicas não nulo.
- Consulta de `commercial_leads` com as colunas de `LEAD_COLUMNS` do hub retorna sem erro.
- Rotas: `https://hub.jinlong.app/login` (200); `/leads`, `/conversao`, `/clientes` sem sessão redirecionam para `/login`.
- Com a conta admin (pela pessoa responsável, não por Claude): `/` e `/leads` carregam; `/conversao` lista os testes; `/clientes` lista.

## 8. Rollback

1. `backend/supabase/rollback/20261023130000_growth001_rollback_seguro.sql` — remove funções e privilégio, mantém dados e colunas. **Padrão.**
2. `backend/supabase/rollback/20261023130000_growth001_rollback_colunas_guardado.sql` — remove colunas somente se não houver dados da Central. Opcional.
3. Restauração a partir do backup (seção 6, passo 1) apenas se houver corrupção de dados.

## 9. Pendências

- Confirmar na Supabase a retenção de backup/PITR do projeto `kbabmewnahysfvlybiak` (não verificado por esta análise).
- Conciliar `20261029202813` x `20261029160000`.
- Decidir o destino das migrations `20261028100000`–`20261030140000` (fora do escopo desta liberação).
- Login com senha do admin não foi testado (sem credenciais; não solicitadas).
