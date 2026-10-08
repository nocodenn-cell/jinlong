# Plano — migrations pendentes em produção (Jinlong) · 2026-10-08

> **Estado: analisado e aplicado somente em réplica local descartável. NADA foi aplicado no Supabase
> compartilhado com `jinlong.app`.** A aplicação em produção exige **autorização específica do dono**.

## 1. O que está pendente

Produção (`kbabmewnahysfvlybiak`) tem como última migration `20261006200048`. O repositório (`main`)
tem **8 migrations posteriores**, todas de 07/10/2026:

| # | Migration | O que muda | Código da `main` que depende |
|---|---|---|---|
| 1 | `20261007161220_fiscal_cancelado_ssot` | `fiscal_marcar_cancelado`, `fiscal_marcar_emitido` (fail-closed), **nova** `fiscal_cancelar_documento`; `REVOKE INSERT` em `documentos_fiscais_pendentes` | RPC `fiscal_cancelar_documento` (ausente em produção) |
| 2 | `20261007163000_ssot_001_002_painel_ec_cache` | `cancelar_venda_transacional` e `trg_creditar_saldo_caixa_venda_dinheiro` usam E(c) (saldo de dinheiro calculado); `saldo_atual` vira cache | — |
| 3 | `20261007163100_ssot_003_nfe_obrigacao_duplicata` | `confirmar_importacao_nfe` exige duplicata quando há valor econômico | — |
| 4 | `20261007163200_ssot_004_revoke_insert_documentos_fiscais` | repete o `REVOKE INSERT` (idempotente) | — |
| 5 | `20261007170000_ssot_002_mov_ar_ec_cache` | `registrar_movimentacao`, `aprovar_movimentacao`, `registrar_liquidacao_receber`, `estornar_liquidacao_receber` deixam de decidir por `saldo_atual` | — |
| 6 | `20261007171000_ssot_002_cancel_guard_antes_devolucao` | `cancelar_venda_transacional`: guard E(c) **antes** de gravar a devolução | — |
| 7 | `20261007180000_calcular_valor_sistema_por_forma_caixa` | **novas** `calcular_valor_sistema_por_forma_caixa` e `internal.valor_sistema_registrado_forma` (somente leitura) | — |
| 8 | `20261007190000_caixas_fechamento_formas_snapshot` | **nova tabela** `caixas_fechamento_formas` (RLS), **novas** `listar_caixas_fechamento_formas`, `internal.persistir_fechamento_formas`; `fechar_caixa_atomico` passa a gravar o snapshot por forma | RPC `listar_caixas_fechamento_formas` e tabela `caixas_fechamento_formas` (ausentes em produção) |

### Compatibilidade código × schema (RPCs usadas pelo app)

Cruzamento das **69 RPCs** chamadas por `pdv-importados` com `pg_proc` de produção: **67 existem**.
Faltam exatamente **2**, ambas criadas por estas migrations: `fiscal_cancelar_documento` (#1) e
`listar_caixas_fechamento_formas` (#8). Tabela ausente: `caixas_fechamento_formas` (#8).
Efeito hoje em produção: o painel "fechamento por forma" do caixa degrada com erro tratado
(`fechamentoPorForma.impl.ts` devolve `ok:false`); o fechamento de caixa em si segue por
`fechar_caixa_atomico` antigo. Cancelamento fiscal não é usado no D0 (fiscal é stub).

### Migration fora da cadeia: `20261006120000_financeiro_contas_formas_e_painel`

**Nunca foi aplicada em produção** e **não deve ser** (a funcionalidade foi coberta por
`20261006180000_financeiro_contas_operacionais`, aplicada como `20261006195837`). Permanece no repositório
porque os testes financeiros (`test-financeiro-loja.mjs`, `test-pdv-caixa-financeiro-fluxo.mjs`) a carregam.
Outros PRs em rascunho (#487, #500) propõem bloqueá-la/removê-la; **esta sprint não altera essa decisão.**
Ela só falhava no replay do zero em checkouts Windows com CRLF (ver §3); `.gitattributes` resolve.

## 2. Teste realizado (réplica isolada)

1. Dump real de produção (somente leitura) restaurado em Supabase local descartável
   (`restore-drill.sh`): 87/87 tabelas idênticas.
2. As 8 migrations aplicadas **em ordem, uma por uma**, com `ON_ERROR_STOP`: **8/8 `rc=0`**.
3. Replay **do zero** das 400 migrations do repositório (equivale ao `supabase db reset` do CI): ver §3.
4. Suítes SQL do repositório (CI + as demais `*.test.sql`) contra o replay: ver
   `docs/piloto-d0/SPRINT0_EVIDENCIAS_2026-10-08.md`.

## 3. Achado: replay do zero e finais de linha

`20261006120000` altera `financeiro_painel` por **substituição de texto** (`strpos`/`replace` do corpo
retornado por `pg_get_functiondef`) comparando com literais `E'…\n…'`. Em checkout Windows
(`core.autocrlf=true`) os `.sql` viram CRLF e a comparação falha (`bloco movimentos do painel divergente`);
no Linux do CI funciona. Correção mínima: `.gitattributes` com `*.sql text eol=lf`.

## 4. Plano de implantação (a executar SOMENTE com autorização)

Pré-condições (todas obrigatórias):

- [ ] Autorização específica do dono para alterar o schema de produção.
- [ ] **Backup do dia restaurado com sucesso** (`supabase db dump --linked` + `restore-drill.sh`), ver
      [BACKUP_RESTORE_CANONICO.md](./BACKUP_RESTORE_CANONICO.md).
- [ ] Janela fora do horário de venda; nenhum caixa aberto (há 1 caixa `ABERTO` em 08/10 — fechar antes).
- [ ] PR da Sprint 0 integrado e CI verde.

Execução (cada migration é uma transação própria com `BEGIN…COMMIT`):

1. Aplicar na ordem #1 → #8 (via `supabase db push` com a lista de versões, ou `apply_migration` do MCP).
   **Atenção:** as versões gravadas em `supabase_migrations.schema_migrations` devem ser as dos arquivos
   (`2026100716…`); se forem aplicadas via MCP, o timestamp gravado será o do momento da aplicação e o par
   precisa ser registrado em `backend/supabase/migration-human-gates.json` (padrão já usado em 24/08 e 06/10).
2. Verificar, após cada uma: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1 DESC LIMIT 3`.
3. Pós-apply: `to_regclass('public.caixas_fechamento_formas')` não nulo;
   `to_regprocedure('public.listar_caixas_fechamento_formas(uuid)')` e
   `public.fiscal_cancelar_documento` presentes; advisor de segurança sem novos achados.
4. Smoke funcional: abrir caixa → vender (dinheiro + PIX) → fechar → painel por forma mostra
   dinheiro = E(c) e PIX/cartão = "Registrado Jinlong" (item 13 de
   [CHECKLIST_SMOKE_MAQUINA_LOJA.md](./CHECKLIST_SMOKE_MAQUINA_LOJA.md)).

## 5. Rollback

- Cada arquivo traz o rollback no cabeçalho (`DROP FUNCTION …`, `DROP TABLE caixas_fechamento_formas`,
  reaplicar `fechar_caixa_atomico` de `20260902100200`, reordenar o guard de `cancelar_venda_transacional`).
- Rollback estrutural completo = **restaurar o backup do passo de pré-condição** (`restore-drill.sh`).
- Nenhuma destas migrations apaga ou reescreve dados existentes (DDL e funções; a tabela nova nasce vazia).

## 6. Efeito sobre o CI

O job `migration-remote-drift` (não é check obrigatório da branch protection) compara o repositório com o
schema remoto e reprova enquanto as 8 migrations não forem aplicadas em produção. Ele só fica verde depois
da implantação autorizada acima; **não foi mascarado nem tornado não bloqueante**.
