# AUDITORIA HISTÓRICA — Evolução da RPC `finalizar_venda_transacional_canonica_v4`

**Data**: 2026-07-24
**Escopo**: Reconstrução forense da remoção do PASSO 5 (consumo de token + auditoria de desconto de gerente) entre as migrations 243 e 268.
**Banco de referência**: `jinlong` (`kbabmewnahysfvlybiak`).
**Método**: `git log/blame` sobre os arquivos de migration + inspeção de corpo de função + `supabase_migrations.schema_migrations` (ordem real aplicada) + `pg_get_functiondef` (estado vivo).

> **Veredito**: A remoção do PASSO 5 foi uma **REGRESSÃO NÃO INTENCIONAL**, introduzida durante a reescrita da v4 para automação de `contas_receber` (Fase 5b) e cimentada na consolidação de overload único. Não há documentação que a justifique; ao contrário, o fluxo canônico (`venda-golden-flow.md`) ainda a exige. **Nenhuma alteração foi implementada** — este documento entrega o laudo e propõe uma única migration de reconciliação.

---

## 1. Linha do tempo (evidências)

### 1.1 Presença do PASSO 5 por migration (grep no corpo da função)

| Migration (arquivo) | INSERT `descontos_venda` | `UPDATE tokens…SET usado` | check `TOKEN_GERENTE_JA_USADO` | PASSO 5 |
|---|:---:|:---:|:---:|:---:|
| `243_finalizar_venda_canonica_v4_captura` | 1 | 1 | 1 | ✅ presente |
| `20260710212305_264_…cliente_id` | 1 | 1 | 1 | ✅ presente |
| `24702_finalizar_venda_v4_contas_receber_automatico` | 0 | 0 | 0 | ❌ **removido** |
| `268_reconcile_finalizar_venda_v4_single_overload` | 0 | 0 | 0 | ❌ ausente (herdado) |

### 1.2 Ordem **real aplicada** no banco (`schema_migrations`)

| Versão | Migration | v4 com PASSO 5? |
|---|---|:---:|
| `20260710212305` | `264_finalizar_venda_canonica_v4_cliente_id` | ✅ SIM |
| `20260713174520` | `24701_contas_receber_idempotencia_unique_venda` | (constraint prereq) |
| `20260713174909` | `268_drop_v4_overloads` | (DROP) |
| `20260713175308` | `268_reconcile_finalizar_venda_v4_single_overload` | ❌ **NÃO** |

> `24702` **não consta** em `schema_migrations` — seu corpo (sem PASSO 5) nunca foi aplicado como migration rastreada; ele chegou ao banco **através de `268_reconcile`**, cujo próprio cabeçalho declara *"applies 24702 body"*.

**Conclusão de datas:**
- Última v4 **com** PASSO 5 no banco: `264`, aplicada em **2026-07-10**.
- v4 **sem** PASSO 5 passou a valer no banco quando `268_reconcile` foi aplicada em **2026-07-13 17:53 UTC**.
- No **código-fonte**, o PASSO 5 foi descartado pela primeira vez no corpo de `24702` (Fase 5b), consolidado no repositório em **2026-07-12**.

---

## 2. Commits, PRs e autoria

| Evento | Commit | Data | Autor | PR |
|---|---|---|---|---|
| **Origem do corpo sem PASSO 5** (247b→24702, Fase 5b contas_receber) | `a0d6fe3` — *"chore(fase1): estabiliza migrations e SSoT de rotas admin"* | 2026-07-12 | `nocodenn-cell <nocodenn@gmail.com>` + `Co-authored-by: Cursor` | (consolidação renomeando 247a/b/c → 24701/02/03) |
| **Efetivação no banco** (adiciona `268_reconcile` sem PASSO 5) | `8c968ef` — *"fix(caixa): dismiss receipt modal after sale (Cycle 6)"* | 2026-07-13 | `Damatta <nocodenn@gmail.com>` | **#176** |
| **Recuperação de drift** (adiciona `264` e `268_drop_v4_overloads` ao repo) | `89f5be0` — *"R-INFRA-03: recover prod-applied migrations + drift classification"* | 2026-07-22 | `Damatta <nocodenn@gmail.com>` | **#224** |

**Autoria efetiva**: a regressão nasce na reescrita da v4 para a Fase 5b (`247b`/`24702`), atribuível ao trabalho consolidado por `nocodenn-cell` com co-autoria de `Cursor`. Não é ato isolado de um autor: é subproduto de uma reescrita `CREATE OR REPLACE` de corpo inteiro.

---

## 3. Deliberada ou regressão? → **REGRESSÃO**

Evidências convergentes de que a remoção foi acidental, não uma decisão de produto:

1. **Cabeçalho de `24702` só lista adições.** As "ALTERAÇÕES" documentadas são: `p_cliente_id`, campo `contas_receber_id`, validações V7/V8, lógica de `contas_receber`, defesa TOCTOU. **Nenhuma menção** a remover consumo de token ou auditoria de desconto.
2. **Inconsistência interna reveladora.** `24702`/`268` **mantêm** a *validação* do token (`PERFORM 1 … WHERE usado = false … FOR UPDATE`) mas **removem** o *consumo* (`UPDATE … SET usado = true`). Ninguém desativa o consumo de propósito e deixa a validação — é assinatura clássica de bloco perdido em reescrita.
3. **Contradiz documentação canônica.** `docs/venda-golden-flow.md:132` ainda lista `descontos_venda (se desconto)` como escrita **esperada** do fluxo. O comportamento vivo diverge do fluxo documentado.
4. **Auditoria de drift anterior não pegou.** `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md:108` apenas verifica que a função está *"presente (alinhada à troca v3→v4)"* — checou existência, **nunca o corpo**. A regressão passou silenciosa.

---

## 4. Documentação que justifique a mudança? → **NÃO EXISTE**

Nenhum documento em `docs/` justifica a remoção do consumo de token ou da auditoria de desconto. O único registro relacionado é o **oposto**: o fluxo dourado exige a escrita, e o plano executivo (`PLANO_EXECUTIVO_EXECUCAO_JINLONG.md`, tarefa S1.12) já lista como pendência *"confirmar desconto na timeline de auditoria"* — sintoma de que o time suspeitava de lacuna sem ter localizado a causa.

---

## 5. Outros comportamentos alterados entre 243 e 268

| Comportamento | Em 243 | Em 268 (vivo) | Natureza |
|---|---|---|---|
| **Consumo de token de gerente** (`SET usado=true` + `JA_USADO`) | ✅ | ❌ removido | 🔴 **Regressão** |
| **Auditoria de desconto** (`INSERT descontos_venda`) | ✅ | ❌ removido | 🔴 **Regressão** |
| **Fiscal enqueue rico** via `fiscal_enfileirar_documento_venda(...)` com payload estruturado + metadados de auditoria (`ip_address`, `user_agent`, `device_id`, `terminal_id`) | ✅ | ❌ substituído por `INSERT documentos_fiscais_pendentes (…, 'NFC_E_STUB', 'PENDENTE')` sem payload | 🟠 **Regressão colateral** — os 4 parâmetros de auditoria continuam na assinatura mas ficaram **mortos (não usados)** |
| **FIADO** como forma de pagamento | ✅ permitido | ❌ bloqueado (`FIADO_DESABILITADO`) | 🟢 **Deliberado** (migration `246_remover_venda_fiado`, decisão de produto documentada) |
| `p_cliente_id` + `contas_receber` automático + V7/V8 | — | ✅ adicionado | 🟢 Aditivo (Fase 5b) |

> Ou seja, entre 243 e 268 houve **três remoções**: duas regressões silenciosas no domínio de desconto/auditoria (token + `descontos_venda`), uma regressão colateral no encaminhamento de metadados fiscais, e **uma** remoção deliberada e documentada (FIADO).

---

## 6. Relatório de impacto

### 6.1 Segurança
- **Token de gerente reutilizável (P0).** Sem `SET usado=true`, um token válido dentro da janela de expiração pode autorizar **múltiplos** descontos. A validação `usado=false` nunca é acionada porque nada seta `usado=true`. Estado vivo: `tokens_desconto_gerente` = 2 linhas, **ambas `usado=false`**.

### 6.2 Auditoria / Compliance
- **Descontos de gerente sem trilha (P0).** Nenhuma linha em `descontos_venda` é criada. Impossível responder "quem autorizou, quanto, quando" para descontos aplicados via v4 — exatamente o que o MVF #2 pretendia reforçar com `motivo`.
- **Colunas de auditoria ausentes (P1).** `descontos_venda` vivo tem só 4 colunas; faltam `operador_id`/`aplicado_em` (migration `113` nunca refletida).

### 6.3 Fiscal
- **Metadados de auditoria fiscal não propagados (P2).** `ip/user_agent/device/terminal` deixaram de ir ao documento fiscal; enfileiramento reduzido a stub. Não quebra a venda, mas empobrece rastreabilidade fiscal.

### 6.4 Governança
- A regressão sobreviveu a uma auditoria de drift porque esta validou **existência**, não **corpo**. Recomenda-se que verificações de drift passem a comparar `md5(pg_get_functiondef())` contra um corpo canônico versionado.

---

## 7. Proposta de UMA migration de reconciliação (baseada no estado REAL do banco)

> **Não implementada.** Apresentada para aprovação. Escrita contra o estado vivo: `descontos_venda` = 4 colunas; v4 = corpo `268` de 19 args. Idempotente (`IF NOT EXISTS`), timestamped (padrão das 32 rastreadas), preservando SSOT (uma única v4).

**Escopo proposto (foco no domínio de desconto/auditoria — a regressão auditada):**
1. Completar o schema de `descontos_venda`: ENUM `motivo` + `motivo_descricao_livre` (MVF #2) **e** `operador_id`/`aplicado_em` (fecha o gap da 113), tudo `ADD COLUMN IF NOT EXISTS`.
2. Restaurar o PASSO 5 no corpo da v4: `UPDATE tokens… SET usado=true` + check `JA_USADO` + `INSERT descontos_venda` (agora com `operador_id`, `aplicado_em`, `motivo`, `motivo_descricao_livre`).
3. Estender a assinatura em 2 parâmetros (`p_motivo_desconto`, `p_motivo_descricao`) com DEFAULT, `DROP` do overload de 19 args para evitar ambiguidade PostgREST.
4. **Fora de escopo desta migration** (flag separada, decisão própria): restauração do enqueue fiscal rico com metadados. Não misturar mudança fiscal na reconciliação de desconto.

```sql
-- <timestamp>_reconcile_v4_descontos_audit_e_motivo.sql
-- Reconciliação: restaura PASSO 5 (token consume + auditoria) e adiciona motivo (MVF #2).
-- Baseada no corpo vivo (268) + estado real de descontos_venda (4 colunas).

BEGIN;

-- (A) Schema de auditoria de descontos ---------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'motivo_desconto_enum_tipo') THEN
    CREATE TYPE public.motivo_desconto_enum_tipo AS ENUM (
      'NAO_ESPECIFICADO','ERRO_DIGITACAO','NEGOCIACAO','CLIENTE_PREFERENCIAL',
      'DANO_PRODUTO','AUTORIZACAO_COMERCIAL','OUTROS');
  END IF;
END $$;

ALTER TABLE public.descontos_venda
  ADD COLUMN IF NOT EXISTS operador_id uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS aplicado_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS motivo_desconto public.motivo_desconto_enum_tipo NOT NULL DEFAULT 'NAO_ESPECIFICADO',
  ADD COLUMN IF NOT EXISTS motivo_descricao_livre text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_motivo_descricao') THEN
    ALTER TABLE public.descontos_venda ADD CONSTRAINT check_motivo_descricao CHECK (
      CASE WHEN motivo_desconto = 'OUTROS'
        THEN motivo_descricao_livre IS NOT NULL AND length(trim(motivo_descricao_livre)) > 0
        ELSE motivo_descricao_livre IS NULL END);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_descontos_venda_motivo ON public.descontos_venda(motivo_desconto);

-- (B) v4: DROP do overload de 19 args + CREATE com 21 args (corpo 268 + PASSO 5) --
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid);

-- CREATE OR REPLACE ... (corpo IDÊNTICO ao 268 vivo, com DOIS acréscimos):
--   • + p_motivo_desconto motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO'
--   • + p_motivo_descricao text DEFAULT NULL
--   • RESTAURA, logo após registrar pagamentos (antes do event/fiscal):
--       IF p_desconto_gerente_token IS NOT NULL THEN
--         UPDATE public.tokens_desconto_gerente SET usado = true
--         WHERE token = p_desconto_gerente_token AND usado = false;
--         IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_JA_USADO'; END IF;
--         INSERT INTO public.descontos_venda (
--           venda_id, gerente_id, desconto_percentual, desconto_valor,
--           operador_id, aplicado_em, motivo_desconto, motivo_descricao_livre)
--         VALUES (p_venda_id, COALESCE(v_cfg_gerente_id, v_uid::text),
--           p_desconto_gerente_percentual, v_desconto_gerente_valor,
--           v_uid, now(), p_motivo_desconto, p_motivo_descricao)
--         ON CONFLICT (venda_id) DO UPDATE SET
--           gerente_id = EXCLUDED.gerente_id, desconto_percentual = EXCLUDED.desconto_percentual,
--           desconto_valor = EXCLUDED.desconto_valor, operador_id = EXCLUDED.operador_id,
--           aplicado_em = EXCLUDED.aplicado_em, motivo_desconto = EXCLUDED.motivo_desconto,
--           motivo_descricao_livre = EXCLUDED.motivo_descricao_livre;
--       END IF;
-- (grants idênticos ao 268 para a nova assinatura de 21 args)

COMMIT;
NOTIFY pgrst, 'reload schema';
```

> O corpo completo (não abreviado) da função será materializado a partir do `pg_get_functiondef` vivo + os dois blocos acima, garantindo diferença mínima e verificável linha a linha antes de aplicar.

### 7.1 Verificação pós-aplicação (obrigatória)
```sql
SELECT (pg_get_functiondef(oid) LIKE '%tokens_desconto_gerente SET usado%') AS token_ok,
       (pg_get_functiondef(oid) LIKE '%INSERT INTO public.descontos_venda%') AS audit_ok
FROM pg_proc WHERE proname='finalizar_venda_transacional_canonica_v4';
-- esperado: token_ok = true, audit_ok = true
```

---

## 8. Recomendação

1. Aprovar a migration única da §7 (restaura PASSO 5 + adiciona `motivo` + fecha gap 113), **contra o estado real do banco**.
2. Tratar o enqueue fiscal rico (metadados) como item separado (P2), fora desta reconciliação.
3. Adicionar ao pipeline de drift uma checagem de **corpo** (`md5(pg_get_functiondef)`), não só de existência, para impedir regressões silenciosas futuras.
4. Após aplicar: QA E2E crítico com desconto de gerente confirmando (a) token vira `usado=true`, (b) linha em `descontos_venda` com `motivo`.

**Status**: 🟡 LAUDO ENTREGUE — nenhuma alteração aplicada; aguardando aprovação da migration de reconciliação.
