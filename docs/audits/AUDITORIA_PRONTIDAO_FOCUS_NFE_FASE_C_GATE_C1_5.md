# Prontidão Focus NFe — Fase C / Gate C1.5: Execução Real das Migrations

**Data:** 2026-09-02
**Objetivo:** substituir os itens "NOT RUN" da Onda C1 por execução real contra Postgres verdadeiro. Nenhuma funcionalidade nova foi implementada nesta rodada — apenas execução e verificação do que já estava commitado.

---

## Como o ambiente foi obtido

Não havia projeto Supabase de homologação/staging disponível (confirmado na Onda C1: `docs/AMBIENTES_E_RELEASE.md` — só existe o projeto de produção, staging nunca foi provisionado). Produção está explicitamente vetada. O caminho seguido foi **local descartável**, igual ao que o próprio CI do projeto usa (`backend/scripts/ci-supabase-local-start.sh`):

1. Docker Desktop estava instalado mas o serviço `com.docker.service` estava parado (sem permissão para iniciar via `Start-Service`, faltando elevação). A VM WSL2 do backend (`docker-desktop`) já estava de pé de uma sessão anterior, mas o proxy Windows↔WSL não.
2. Lancei `Docker Desktop.exe` diretamente (sem GUI interativa) e aguardei o daemon responder — ficou pronto em ~2 minutos.
3. Rodei `backend/scripts/ci-supabase-local-start.sh` (o mesmo script do CI) → `npx supabase start`, que baixou as imagens e aplicou **as 338+ migrations do zero**, incluindo as duas novas.
4. Para o teste Deno (item 4), em vez de instalar o CLI Deno no host (evitando "infraestrutura grande"), usei o Docker já disponível: `docker run --rm denoland/deno:latest deno check|test ...` — container descartável, nada instalado permanentemente.

Ambiente permanece **local e efêmero** (containers `supabase_*_fastproduct`), não é staging nem produção. Deixei rodando ao final para o caso de C2 ser autorizado em seguida; posso derrubar (`supabase stop`) a qualquer momento.

---

## MIGRATION 130000 — `fiscal_payload_snapshot_venda.sql`

**PASS.**

Evidência: log completo de `supabase start` (aplicação de todas as migrations em ordem) não contém nenhuma linha `error`/`exception` antes, durante ou depois de `Applying migration 20260902130000_fiscal_payload_snapshot_venda.sql...`. O script inteiro terminou com exit code 0 — se o `DO $verify$` desta migration (que checa os 4 marcadores: guard A01-1.1 preexistente, INSERT com coluna payload, join produtos, campos fiscais, emitente) tivesse falhado, a migration inteira teria abortado (`BEGIN...COMMIT`) e `supabase start` teria retornado erro.

## MIGRATION 130100 — `fiscal_provider_config.sql`

**PASS.**

Mesma evidência de log (zero erro). Adicionalmente, reproduzi de forma **independente** (fora do `DO $verify$` da própria migration, em sessão `psql` separada) os dois testes mais críticos:

```sql
-- Insert normal — gera o nome corretamente
INSERT INTO fiscal_provider_config (loja_id, provider_type, ambiente, habilitado)
VALUES ('99999999-9999-4999-8999-999999999999', 'focus', 'homologacao', true)
RETURNING loja_id, provider_type, ambiente, token_env_var, habilitado;
-- → token_env_var = FISCAL_TOKEN_FOCUS_99999999999949998999999999999999_HOMOLOGACAO

-- Tentativa de forjar o secret de outra coisa — REJEITADA pelo Postgres
INSERT INTO fiscal_provider_config (loja_id, provider_type, ambiente, token_env_var, habilitado)
VALUES ('99999999-9999-4999-8999-999999999999', 'focus', 'producao', 'SUPABASE_SERVICE_ROLE_KEY', true);
-- ERROR: cannot insert a non-DEFAULT value into column "token_env_var"
-- DETAIL: Column "token_env_var" is a generated column.
```

`\d public.fiscal_provider_config` confirmou ao vivo: FK de `loja_id` → `lojas(id) ON DELETE CASCADE`; `PRIMARY KEY (loja_id, ambiente)`; `CHECK (ambiente = ANY (ARRAY['homologacao','producao']))`; `CHECK (provider_type = ANY (ARRAY['mock','http','focus','bling']))`; `token_env_var` como `generated always as (...) stored`; exatamente 2 policies (`fiscal_provider_config_select`, `fiscal_provider_config_write`) com o texto exato projetado.

## RPC VENDA

**PASS.** `finalizar_venda_transacional_canonica_v4_unscoped` continua executável — 4/4 testes de `vendaConsistency.integration.test.ts` passaram contra o Postgres real (venda atômica, falha de estoque atômica, concorrência com exatamente um vencedor, snapshot fiscal + 3 SSOT).

## SNAPSHOT INTEGRATION

**PASS.** Rodado com `SUPABASE_URL=http://127.0.0.1:54321` e a chave secreta do projeto local:

```
✓ app/caixa/server/vendaConsistency.integration.test.ts (4 tests) 1615ms
  ✓ deve finalizar venda com consistência atômica
  ✓ deve falhar de forma atômica se estoque insuficiente
  ✓ deve manter consistência em concorrência (exatamente um vencedor)
  ✓ deve congelar snapshot fiscal do item e ignorar alteração posterior do produto
Test Files  1 passed (1) | Tests  4 passed (4)
```

## IMMUTABILITY

- **produto: PASS** — NCM/CFOP/CSOSN alterados após o enqueue; documento manteve os valores originais.
- **loja: PASS** — `razao_social`/`cnpj` alterados após o enqueue (com save/restore); `emitente.razao_social`/`cnpj` do documento continuaram os originais.
- **pdv_config: PASS** — `regime_tributario` alterado após o enqueue; `emitente.regime_tributario` do documento continuou o original.

## SECRET SELECTION

**PASS.** Provado duas vezes: dentro do `DO $verify$` da própria migration (que teria abortado a migration inteira se a rejeição não ocorresse) e de forma independente em sessão `psql` separada (acima). Nome gerado nunca colide com `SYNC_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`FISCAL_PROVIDER_TOKEN` (prefixo `FISCAL_TOKEN_` exclusivo).

## RLS/GRANTS

**PASS.** `\d` confirmou RLS habilitada, as 2 policies com o texto exato projetado, e (via `has_table_privilege`, dentro do `DO $verify$` que passou) `service_role` com SELECT.

## SYNC/DENO

**PASS** (corrigido de NOT RUN para PASS nesta rodada).

```
$ docker run --rm denoland/deno:latest deno check --config .../deno.json fiscal_enqueue_after_venda_sync.ts
Check supabase/functions/sync-outbox/fiscal_enqueue_after_venda_sync.ts   (exit 0)

$ docker run --rm denoland/deno:latest deno test --allow-env --config .../deno.json fiscal_enqueue_after_venda_sync.test.ts
running 2 tests from ./supabase/functions/sync-outbox/fiscal_enqueue_after_venda_sync.test.ts
desligado por padrão — não chama RPC de enqueue ... ok (3ms)
ativo — payload inclui classificação fiscal do produto e emitente ... ok (12ms)
ok | 2 passed | 0 failed (51ms)
```

Método: Deno CLI **não foi instalado no host** — usei o Docker já disponível para rodar um container descartável `denoland/deno:latest`, sem alterar o ambiente permanentemente, conforme instrução de não instalar infraestrutura grande.

**Gap de CI permanece real e deve ser aberto**: o job `ci-backend-supabase.yml` já instala Deno (`denoland/setup-deno`) mas só executa `deno check`, nunca `deno test` — os 2 testes acima passaram porque eu os executei manualmente nesta sessão; **não rodam automaticamente em nenhum PR hoje**. Não alterei o workflow (fora do escopo desta missão) — registrando aqui como gap explícito para abertura futura.

---

## Verificação extra (não pedida, mas de baixo custo): `destinatario` populado

O item 7 pedia para "preservar a capacidade" sem implementar agora. Testei se essa capacidade já funciona de verdade com o código já commitado (nenhuma alteração feita) — criei um cliente de teste e chamei a RPC com `p_cliente_id` preenchido:

```json
{"cliente_id": "92aba651-...", "destinatario": {"nome": "Cliente Prova Destinatario", "tipo": "PF", "documento": "12345678901", "cliente_id": "92aba651-..."}}
```

**Já funciona hoje, sem precisar de nenhuma mudança em C2** — o código de C1 já cobre tanto o caso anônimo (`destinatario: null`, testado nos 4 testes comprometidos) quanto o caso identificado (acima, verificação ad-hoc, não comprometida como teste permanente — considerar adicionar como teste formal em C2 se fizer sentido).

---

## Exemplo real do snapshot (sanitizado — dado de fixture de teste, sem PII real)

```json
{
  "origem": "web_caixa",
  "venda_id": "1940e3c2-d9cc-4aa7-a89a-991da7ab41ff",
  "loja_id": "a0000001-0000-4000-8000-000000000001",
  "caixa_id": "bbdf1be2-9c30-4628-ad03-7b532f5d7b4f",
  "operador_id": "e99b3080-1cdf-4b7a-ada5-7fcf4021f3b9",
  "cliente_id": null,
  "data_venda": "2026-09-02T14:02:22.580521+00:00",
  "totais": { "bruto": 200.00, "desconto": 0.00, "liquido": 200.00 },
  "pagamentos": [{ "forma_pagamento": "DINHEIRO", "valor": 200.00 }],
  "destinatario": null,
  "itens": [{
    "produto_id": "f755561b-17d9-44cf-bffb-1485b584510d",
    "nome": "Produto snapshot fiscal",
    "codigo_barras": null,
    "quantidade": 1.000,
    "preco_unitario_original": 200.00, "preco_unitario": 200.00, "desconto_unitario": 0.00,
    "tipo_preco": "VAREJO",
    "unidade_medida": "UN",
    "ncm": "12345678", "cfop": "5102", "csosn": "102", "cest": "1234567",
    "cst_pis": "01", "cst_cofins": "01"
  }],
  "emitente": {
    "loja_id": "a0000001-0000-4000-8000-000000000001",
    "cnpj": null, "inscricao_estadual": null, "razao_social": null, "nome_fantasia": null,
    "endereco_logradouro": null, "endereco_numero": null, "endereco_complemento": null,
    "endereco_bairro": null, "endereco_cidade": null, "endereco_uf": null, "endereco_cep": null,
    "cnae": null, "numero_serie_nfce": 1, "numero_serie_nfe": 1, "regime_tributario": null
  }
}
```

**Nota honesta**: os campos de `emitente` vêm `null` aqui porque a loja de fixture do seed local (`LOJA_MATRIZ`) não tem dados fiscais cadastrados (CNPJ/razão social/etc.) — isso é uma característica do dado de teste/seed local, não um defeito do código; a estrutura do payload está correta e os campos seriam preenchidos com uma loja que tivesse esses dados cadastrados (como já é o caso em produção, onde `lojas.cnpj` etc. são preenchidos via `/gerente/configuracoes`).

**`natureza_operacao` continua ausente** — confirmado no exemplo real acima. Não foi inventado nenhum valor. Continua registrado como gap para C2, dependente de decisão de negócio (não é campo técnico esquecido).

**`destinatario: null` confirmado como representação correta** do cenário NFC-e sem identificação do consumidor (a venda de teste não passou `cliente_id`) — e, como mostrado acima, o mesmo payload já popula corretamente quando `cliente_id` é informado.

---

## Revisão da generated column (item 5)

Formato confirmado ao vivo: `FISCAL_TOKEN_<PROVIDER_TYPE maiúsculo>_<loja_id sem hífens>_<AMBIENTE maiúsculo>`.

- Caracteres válidos para env var: só `[A-Z0-9_]`, primeiro caractere é letra (`F`) — válido em qualquer shell/runtime.
- UUID normalizado: hífens removidos via `replace(loja_id::text,'-','')` — 32 caracteres hexadecimais, determinístico.
- Resultado determinístico: confirmado — mesma linha sempre gera o mesmo nome (é `STORED`, calculado uma vez).
- Colisão entre lojas: impossível — `loja_id` é UUID único, é parte literal do nome.
- Colisão homologação×produção: impossível — `ambiente` é parte literal do nome, e é a própria chave primária junto com `loja_id`.
- Colisão entre providers: impossível — `provider_type` é parte literal do nome, e tem `CHECK` restrito a 4 valores (`mock`,`http`,`focus`,`bling`) — confirmado via `\d`.
- Nenhum provider consegue gerar nome de outro namespace — provado pela composição do próprio nome.

---

## GATE FINAL

| Item | Resultado |
|---|---|
| MIGRATION 130000 | **PASS** |
| MIGRATION 130100 | **PASS** |
| RPC VENDA | **PASS** |
| SNAPSHOT INTEGRATION | **PASS** |
| IMMUTABILITY — produto | **PASS** |
| IMMUTABILITY — loja | **PASS** |
| IMMUTABILITY — pdv_config | **PASS** |
| SECRET SELECTION | **PASS** |
| RLS/GRANTS | **PASS** |
| SYNC/DENO | **PASS** |

## LIMITAÇÕES restantes

1. **Gap de CI real e ainda aberto**: `deno test` não roda automaticamente em nenhum job hoje (só `deno check`). Os testes Deno passaram porque eu os rodei manualmente nesta sessão via Docker — não há proteção de regressão automática ainda. Recomendo abrir isso como item de trabalho separado (pequeno: adicionar um step `deno test` ao job existente que já instala Deno) antes ou durante C2.
2. Ambiente usado é **local efêmero**, não homologação real da Focus nem staging — continua sem validar nada específico do comportamento real da Focus (isso é exatamente o que C2 endereça).
3. `destinatario` populado foi verificado ad-hoc (não virou teste permanente comprometido) — considerar formalizar em C2.
4. O container Supabase local segue rodando (não derrubado) para o caso de C2 ser autorizado em seguida.

Nenhum item foi corrigido em C1 nesta rodada — a execução real não revelou nenhum problema que exigisse mudança de código (só um bug ergonômico no meu script de verificação ad-hoc, quando reusei um `operador_id` que já tinha caixa aberto — não é bug de produto, é da minha própria query de teste).

---

## C1.5 GATE: PASS

Parando aqui. Aguardando autorização para C2.
