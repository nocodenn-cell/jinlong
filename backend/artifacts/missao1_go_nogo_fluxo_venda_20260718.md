# Missão 1 — Homologação P0 Fluxo de Venda — Go/No-Go

**Data:** 2026-07-18  
**Ambiente alvo declarado:** Supabase `jinlong` (`kbabmewnahysfvlybiak`) + app Next apontando para esse projeto (`.env.local`)  
**Ambiente de prova complementar:** Supabase local (`127.0.0.1:54321/54322`)  
**Escopo:** somente gates/evidências — sem implementação de melhorias.

**Critério de sucesso:**  
> Uma loja consegue abrir o caixa, vender, receber, baixar estoque e fechar operação sem intervenção técnica.

---

## Veredito

| Ambiente | Veredito | Motivo |
|---|---|---|
| **Local (SQL homolog)** | **GO condicional** | `verify_p0` = `PRONTO_PILOTO`; smoke fluxo completo + fracionado OK |
| **Jinlong (alvo)** | **NO-GO** | E2E UI não autentica; RPC diagnóstico ausente; gaps de gate operacional |

**Veredito da missão (ambiente alvo):** **NO-GO**

O núcleo transacional existe e passa em smoke SQL local. **Não** foi possível provar no jinlong, via UI, o critério “abrir → vender → receber → baixar → fechar sem intervenção técnica”.

---

## Matriz de testes

| # | Teste | Resultado | Evidência | Erro encontrado | Prioridade |
|---|---|---|---|---|---|
| 1 | Diagnóstico do caixa (CLI `check:caixa-pre-producao`) | **FALHA** | Script quebra ao executar | `SyntaxError` em `.mjs` (`Map<string, string>()` — tipagem TS em arquivo JS) | P1 |
| 2 | Diagnóstico RPC `pdv_diagnostico_pre_producao` (jinlong) | **FALHA** | MCP SQL jinlong | Função **ausente**; migration `256` não aplicada no remoto | P0 |
| 3 | Diagnóstico RPC (local) | **OK** | `psql` local: `diag_rpc = t` | — | — |
| 4 | `verify_p0_producao.sql` (local) | **OK** | `backend/artifacts/verify_p0_local_*.txt` | 0 falhas, 1 aviso (`255_grant_baseline`), veredito `PRONTO_PILOTO` | — |
| 5 | `verify_p0` equivalente (jinlong) | **PARCIAL / BLOQUEADO** | MCP checklist | FALHA: `pdv_diagnostico_pre_producao`; AVISO: grant baseline; check nome `243` falso-negativo (v4 existe via migs `264`/`268`) | P0 |
| 6 | Abertura de turno | **OK local / NÃO PROVADO UI jinlong** | Homolog SQL local; E2E jinlong falhou no login | Jinlong: login E2E `Email ou senha incorretos` | P0 |
| 7 | Venda simples (DINHEIRO) | **OK local / NÃO PROVADO UI jinlong** | `SMOKE_PDV_WEB_OK` + artefato histórico `e2e_cycle5_final.txt` (2026-07-13) | Jinlong E2E login inválido | P0 |
| 8 | Venda fracionada | **OK local** | `SMOKE_FRAC_OK` (`homolog_pdv_web_fracionado_cycle4.sql`) | — | — |
| 9 | Desconto autorizado (token gerente) | **NÃO EXECUTADO** | `smoke_023_*.sql` | Local: script usa `caixas.created_at` (coluna inexistente; schema usa `data_abertura`); jinlong: não rodado (mutação + auth) | P1 |
| 10 | Múltiplos pagamentos | **OK local / NÃO PROVADO UI jinlong** | Homolog: split + pix IDs no NOTICE | E2E multi-pagamento não passou login | P0 |
| 11 | Finalização transacional v4 | **OK** | RPC existe + GRANT authenticated; smoke local | Em jinlong: `anon` também tem EXECUTE (ver segurança) | P0 (grant anon) |
| 12 | Baixa de estoque | **OK local** | Homolog: `estoque 88.500→83.500` (pós-cancel `84.500`) | — | — |
| 13 | Registro financeiro | **OK local** | Homolog: pagamentos + `contas_receber` flag `cr=t` | UI contas a receber Fase 5b: harness `supabase` undefined (não é prova de prod) | P1 (harness) |
| 14 | Cancelamento | **OK local + unit** | Homolog cancel ID; Vitest `cancelarVendaPerfil` 15 tests OK | Jinlong: venda `CANCELADA` hoje existe, mas sem E2E controlado | — |
| 15 | Cadastro rápido → venda | **NÃO EXECUTADO** | Código existe (`CadastroProdutoRelampagoModal` no PDV) | Sem E2E/smoke cobrindo o caminho no ambiente alvo | P1 |
| 16 | Retry / idempotência | **PARCIAL** | Homolog local cobre finalização; Fase 5b E2E quebrado no client | Spec `caixa-fase5b-contas-receber` falha: `Cannot read properties of undefined (reading 'rpc')` | P1 |
| 17 | Validação de permissões | **PARCIAL** | Vitest perfil cancelar OK; RLS vendas/caixas/estoque OK no verify | Jinlong: `finalizar_venda_transacional_canonica_v4` e `fechar_caixa_*` com `EXECUTE` para **anon**; `criar_produto_com_estoque_inicial` sem EXECUTE authenticated | P0 (anon grant) |

---

## Evidências principais

### Local
- `backend/artifacts/homolog_missao1_local_20260718_101712.txt` — `SMOKE_PDV_WEB_OK`
- `backend/artifacts/homolog_frac_local_*.txt` — `SMOKE_FRAC_OK`
- `backend/artifacts/verify_p0_local_*.txt` — `PRONTO_PILOTO` (0 falhas / 1 aviso)

### Jinlong (alvo)
- MCP `list_migrations` / SQL checks — RPCs core presentes; **sem** `pdv_diagnostico_pre_producao`
- Produto demo `7898512340003` com saldo `153`
- Usuários: DONO 2 / GERENTE 3 / OPERADOR 3 (ativos)
- `e2e-operador@localhost.test` **existe** e está `OPERADOR` ativo — senha do `.env.local` **não autentica**
- 3 caixas `ABERTO` órfãos desde 2026-06-18/19
- Vendas 30d: 3 `CONCLUIDA` (jun/2026) + 1 `CANCELADA` (2026-07-18)
- E2E: `backend/artifacts/e2e_missao1_jinlong_loaded_20260718_102108.txt` — falha login

### Histórico (não substitui prova de hoje no alvo)
- `backend/artifacts/e2e_cycle5_final.txt` (2026-07-13): 3/3 golden+venda OK (contexto anterior)

---

## Bloqueadores P0 para GO no ambiente alvo

1. **Credencial E2E do operador inválida no Auth jinlong** — impede prova UI do fluxo completo.  
2. **Migration/RPC de diagnóstico pré-produção (`256` / `pdv_diagnostico_pre_producao`) ausente no jinlong.**  
3. **GRANT `EXECUTE` para `anon` em RPCs críticas** (`finalizar_venda_transacional_canonica_v4`, `fechar_caixa_atomico`, `fechar_caixa_pdv_atomico`) — segurança não pode depender só de UI.  
4. **Caixas abertos órfãos** — higiene operacional (risco de turno inconsistente).

## Gaps P1 (não bloqueiam núcleo se P0 resolvidos, mas impedem “completo”)

- CLI `check:caixa-pre-producao.mjs` quebrado (sintaxe).  
- Smoke 023 desconto desatualizado (`created_at` vs `data_abertura`).  
- Cadastro rápido → venda sem prova automatizada.  
- Spec Fase 5b (idempotência CR) com client Supabase indefinido.  
- Grant baseline `255_grant_*` não registrado no histórico de migrations do jinlong (aviso).

---

## O que NÃO foi feito (por regra da missão)

- Nenhuma correção de código, migration ou reset de senha.  
- Homolog SQL mutante **não** executado no jinlong (script marcado “NÃO executar em jinlong/produção”).  
- Smoke 023 mutante **não** executado no jinlong.

---

## Próximos passos recomendados (fora desta missão)

Antes da Missão 3 (matriz completa) e Missão 2 (funcionários):

1. Restaurar/sincronizar senha do operador E2E no Auth jinlong (ou atualizar secret local).  
2. Aplicar migration `256` no jinlong e revalidar `/admin/diagnostico-caixa`.  
3. Revogar `EXECUTE` de `anon` nas RPCs de venda/caixa (manter só `authenticated` / `service_role` conforme desenho).  
4. Fechar caixas órfãos ou script de saneamento.  
5. Reexecutar E2E caixa (golden + multi-pagamento + fluxos críticos) até verde no alvo.  
6. Só então promover veredito para **GO**.
