# Procedimento — `20261119120000` (fechamento com venda em espera) no homolog

**Data das verificações:** 2026-11-19 · **Projeto homolog:** `yvdilcmxyjafnnsfdtam` · **Produção:** `kbabmewnahysfvlybiak`
**Escopo:** pré-checagens, backup, aplicação, rollback e evidências. Todas as verificações abaixo são somente leitura. **Nada foi aplicado nem alterado** nesta rodada.

---

## 1. Situação encontrada (somente leitura)

| Verificação | Resultado |
|---|---|
| `schema_migrations` do homolog contém `20261119120000` e `20261119120100` | **sim** (já registradas) |
| Função `internal.fechar_caixa_atomico` no homolog contém a checagem `FECHAR_CAIXA_VENDAS_EM_ESPERA` | **sim** |
| Corpo de `internal.fechar_caixa_atomico` no homolog vs. arquivo do repositório (md5 do corpo, LF) | **idêntico** (`d18bff3360c1e1c8ad36d37c94d9029c`) |
| Coluna `vendas_em_espera.descartada_por` no homolog | **existe** |
| Esperas ativas (`EM_ESPERA`/`RETOMADA`) no homolog | **0** |
| Caixas `ABERTO` no homolog | **0** |
| Trigger D1 `trg_caixas_bloqueia_fechamento_em_espera` em `public.caixas` | **ativo** (`O`) |
| Produção: `20261119120000` / `120100` | **não aplicadas** |

**Conclusão:** a migration já está no homolog. Não há o que aplicar ali nesta etapa. O procedimento passa a ser de **verificação e de versionamento**, não de aplicação.

## 2. Achado crítico: wrapper público fora do repositório

- O app chama `rpc('fechar_caixa_atomico')` (`pdv-importados/app/caixa/server/cashSession.ts:185`), ou seja, **`public.fechar_caixa_atomico`**.
- No homolog, `public.fechar_caixa_atomico` tem este corpo (não existe em nenhuma migration do repositório):
  ```sql
  SELECT public.fp_assert_loja(public.fp_loja_de('usuario', p_operador_id), false, 'fechar_caixa_atomico.p_operador_id');
  SELECT * FROM internal.fechar_caixa_atomico(p_operador_id => p_operador_id, p_valor_contado => p_valor_contado, p_motivo => p_motivo);
  ```
- A migration `20261119120000` cria **apenas** `internal.fechar_caixa_atomico`. Nenhuma migration do repositório faz `public` chamar `internal`.
- **Efeito:** no repositório, a checagem D-06 é código morto para o app. No homolog ela só funciona porque o wrapper foi alterado fora do versionamento (drift). Em produção, a `20261119120000` sozinha **não** ativaria a checagem para o app.
- **Proteção efetiva hoje:** o trigger D1 (`20261106100000`) recusa o fechamento com venda em espera em qualquer caminho (RPC ou `UPDATE` direto). Está ativo no homolog. Por isso a decisão de manter o D1 é necessária.

## 3. Pré-requisitos antes de qualquer aplicação em produção

1. **Versionar o wrapper.** Criar migration nova (versão posterior a `20261119120100`) com o corpo acima, validada contra o homolog. Não editar `20261119120000` já registrada no homolog.
2. **Decidir o destino do drift do wrapper.** Confirmar com quem aplicou o wrapper no homolog (fora do repositório). Registrar a versão no manifesto de decisões.
3. **Rollback.** A `20261119120000` cria `internal.fechar_caixa_atomico` nova. O rollback exige restaurar o wrapper público ao estado anterior. **Esse estado anterior não está no repositório** (ver §2). Enquanto o item 1 não for resolvido, o rollback não é executável com segurança.
4. **Janela de produção.** Sem autorização do dono, não há aplicação.

## 4. Backup (quando autorizado)

- Dump lógico de `public` e `internal` (somente as funções e triggers de caixa) antes de qualquer `CREATE OR REPLACE`.
- Export de `pg_get_functiondef` de `public.fechar_caixa_atomico` e `internal.fechar_caixa_atomico`, com md5, guardado como evidência.
- Snapshot de `caixas` e `vendas_em_espera` com contagens (linhas e status).

## 5. Procedimento de aplicação (quando autorizado, após §3)

1. Repetir as verificações de §1 no alvo.
2. Aplicar a migration de wrapper (item 1 de §3) **antes** ou **junto** com `20261119120000`, em transação, com `ON_ERROR_STOP`.
3. Conferir por `pg_get_functiondef` que o corpo de `public` delega para `internal` e que o corpo de `internal` tem `FECHAR_CAIXA_VENDAS_EM_ESPERA`.
4. Smoke: com uma espera de teste em caixa aberto, `fechar_caixa_atomico` deve recusar com `FECHAR_CAIXA_VENDAS_EM_ESPERA`. Descartar a espera pela RPC auditável e refazer o fechamento.
5. Registrar em `docs/ops/` o md5 final e a data.

## 6. Evidências desta rodada

- Leitura de `schema_migrations`, `pg_proc`, `pg_trigger` e `information_schema.columns` no homolog (somente `SELECT`).
- md5 do corpo de `internal.fechar_caixa_atomico`: idêntico ao repositório.
- Teste D1 no clone de validação: passa (ver `docs/ops/REVISAO_D1_D6_2026-11-19.md`).

## 7. Decisões que dependem do dono

- Aceitar a versão do wrapper do homolog como referência e versioná-la (§3.1)?
- Quem aplicou o wrapper fora do repositório, e isso será documentado?
- Quando a produção receberá as migrations do D1–D6 e da `20261119120000`?
