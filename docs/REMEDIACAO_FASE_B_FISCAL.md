# Fase B — Worker Fiscal: estado real e runbook de ativação

**Data:** 2026-07-25 · **Status:** agendador duplicado removido. **Worker continua inativo — falta passo manual.**

---

## 1. Divergência: a migração já existia

O plano (`docs/PLANO_REMEDIACAO_CICD.md` §4.9, P2-1) propunha *"migrar o disparo fiscal do GitHub Actions para `pg_cron`"*. **Essa migração já estava feita.** Havia **dois agendadores paralelos**, ambos sem efeito.

| | Agendador 1 (removido) | Agendador 2 (mantido) |
|---|---|---|
| Onde | `.github/workflows/fiscal-cron.yml` | `pg_cron`, job 1 `fiscal-worker-every-minute` |
| Frequência | `*/5 * * * *` | `* * * * *` (`active = true`) |
| Header | ❌ `apikey` — a função nunca lê | ✅ `X-FISCAL-WORKER-KEY` — correto |
| Execuções | 736 runs, **nenhum com runner** | **95.156 `succeeded`** desde 20/05, última hoje |
| Custo | ~8.640 min/mês de Actions | 0 |

---

## 2. Causa raiz real: o Vault está vazio

Terceiro modo de falha silenciosa — não previsto em nenhuma auditoria anterior.

`internal.fiscal_worker_invoke()`:

```sql
select decrypted_secret into v_url from vault.decrypted_secrets where name = 'fiscal_worker_url'  limit 1;
select decrypted_secret into v_key from vault.decrypted_secrets where name = 'fiscal_worker_key'  limit 1;

if v_url is null or v_key is null then
  raise warning 'fiscal_worker_invoke: segredos vault ausentes (...)';
  return;                     -- ← sai ANTES de net.http_post
end if;

select net.http_post(url := v_url,
                     headers := jsonb_build_object('Content-Type','application/json',
                                                   'X-FISCAL-WORKER-KEY', v_key),
                     body := '{"limit":20}'::jsonb) into v_req;
```

Medição:

```sql
select (select count(*) from vault.secrets)             as secrets_total,        -- 0
       (select count(*) from vault.decrypted_secrets)   as decrypted_total,      -- 0
       (select count(*) from net._http_response)        as respostas_http,       -- 0
       (select count(*) from net.http_request_queue)    as fila_http,            -- 0
       (select count(*) from cron.job_run_details
          where jobid=1 and start_time > now() - interval '2 hours') as runs_2h; -- 120
```

**120 execuções do cron em 2 horas, zero requisições HTTP.** A função encontra o Vault vazio, emite um `warning` e retorna. Como não levanta exceção, o `pg_cron` registra `succeeded` — daí as 95.156 "execuções bem-sucedidas" que não fizeram nada.

Coerente com o banco: os 2 documentos da fila têm `ultima_tentativa_em = NULL`, ou seja, `fiscal_claim_documentos` nunca foi chamado.

---

## 3. Runbook de ativação — **NÃO EXECUTADO**

Não posso executar: não tenho o valor de `FISCAL_WORKER_KEY` (é o segredo configurado nos secrets da Edge Function).

```sql
-- 1) URL da função
select vault.create_secret(
  'https://kbabmewnahysfvlybiak.supabase.co/functions/v1/fiscal-worker',
  'fiscal_worker_url'
);

-- 2) Mesma chave configurada em FISCAL_WORKER_KEY nos secrets da Edge Function
select vault.create_secret('<VALOR_REAL_DA_CHAVE>', 'fiscal_worker_key');
```

Verificação após ativar:

```sql
select status_code, content, created from net._http_response order by created desc limit 5;
select id, status, tentativas, ultima_tentativa_em from public.documentos_fiscais_pendentes;
```

Esperado: `status_code = 200` e `ultima_tentativa_em` preenchido.

---

## 4. ⚠️ NÃO ATIVE AINDA — pré-condições de segurança

Ativar o Vault agora faz o worker processar a fila **no minuto seguinte**. Com o estado atual do banco, isso causa dano:

| # | Pré-condição | Estado | Consequência se ativar antes |
|---|---|---|---|
| 1 | `FISCAL_PROVIDER_TYPE` ≠ `mock` | ❌ default é `"mock"` (`index.ts:36`) | O `MockProvider` retorna chave falsa `NFE-MOCK-…`; o doc `PENDENTE` seria marcado **`EMITIDO`** com chave que a SEFAZ nunca viu |
| 2 | Migration `092` aplicada (máquina de estados) | ❌ não aplicada — colunas e triggers ausentes | Nenhuma transição é validada; `EMITIDO → PENDENTE` é aceita, permitindo reemissão de documento autorizado |
| 3 | Reaper de `EM_PROCESSAMENTO` | ❌ não existe | Worker que morrer após o claim deixa o documento órfão permanente — nem o retry nem o reprocesso manual o resgatam |
| 4 | Overload `fiscal_reprocessar_documento(uuid,text)` removido | ❌ ainda existe | Função sem verificação de perfil, com `GRANT` a `authenticated`, referenciando 5 colunas inexistentes |

**Ordem correta:** 4 → 2 → 3 → 1 → ativar Vault.

Nenhum desses quatro itens foi executado nesta fase — todos alteram schema/RPC de produção e estão fora do escopo autorizado (Fases A/B/C são de CI/CD). Ficam como P0/P1 no `docs/PLANO_REMEDIACAO_CICD.md`.

---

## 5. O que esta fase entregou

- ✅ Removido `.github/workflows/fiscal-cron.yml` — agendador que nunca poderia autenticar e custava ~8.640 min/mês.
- ✅ Documentada a causa raiz real (Vault vazio), que nenhuma auditoria anterior tinha encontrado.
- ✅ Referência corrigida em `.cursor/skills/engineering-loop/references/monorepo.md`.
- ⏸️ Ativação do worker: **pendente**, exige passo manual + as 4 pré-condições acima.

**O estado funcional do worker não mudou** — estava inativo antes, continua inativo. O que mudou é que agora existe **um** caminho (o correto) em vez de dois, o custo de Actions caiu, e a razão da inatividade está documentada em vez de silenciosa.
