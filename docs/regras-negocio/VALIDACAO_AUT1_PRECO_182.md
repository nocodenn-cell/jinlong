# Validação pré-merge — Autoridade #1 / PR #182

**Data:** 2026-07-13  
**Tip código:** branch `loop/ba-011-precos-atacado-sync`  
**Projeto:** jinlong (`kbabmewnahysfvlybiak`)

## 1. Edge sync-outbox

| Item | Resultado |
|------|-----------|
| Deploy | **OK** — versão **64** ACTIVE (`verify_jwt=false` como antes via `config.toml`) |
| Bundle fix | Import `shared/logger.ts` (fora do Docker) → `_shared/logger.ts` |
| `deno check` | **OK** após tipagem do filtro `precos_atacado` |

Payload Aut#1 (código deployado):

- `produtos[]` inclui `preco_atacado`
- `precos_atacado[]` (global ∪ `x-loja-id` / `DEFAULT_PDV_LOJA_ID`)
- `regras[]` legado (sem projeção de tiers)
- `loja_id` no root / `pdv_config`

## 2. Dados Postgres (espelho do SELECT da Edge)

Fonte: MCP `execute_sql` no projeto jinlong.

- Colunas confirmadas: `produtos.preco_atacado`; `precos_atacado.{produto_id,loja_id,quantidade_minima,preco_unitario}`
- `pdv_config.quantidade_minima_atacado_padrao` = **6**
- Tiers ativos existem (amostra usada nos testes de paridade)

## 3. SQLite upgrade

Script: `backend/scripts/validate-aut1-sqlite-upgrade.mjs`

| Cenário | Resultado |
|---------|----------|
| Banco legado → ALTER + sync | **OK** — recebe `preco_atacado`, tiers (`quantidade_minima`, `preco_unitario`, `loja_id`), `quantidade_minima_atacado_padrao`, `loja_id` |
| Banco novo / upgrade idempotente | **OK** |

## 4. Paridade Web ≡ Local (diff = 0)

| Suite | Resultado |
|-------|-----------|
| Golden sintético | **9/9 OK** |
| Fixtures **produção** (RPC capturada vs `calcularPrecoCanonico`) | **6/6 OK** |

Fixtures (SKU reais):

- `758313a4-…` (SMOKE): qty 1→100 VAREJO; 10→90; 50→80
- `dbfe93c2-…` (controle TV): qty 1→20; 5→15; 6→15

Cliente: não entra na cadeia automática (RPC sem cliente) — contexto irrelevante para preço automático.

## 5. HMAC live `GET ?op=catalogo`

**Pendente nesta máquina:** sem `SYNC_ENDPOINT` / `SYNC_KEY` locais (secrets existem no GitHub Actions).

Para fechar o último elo device→Edge→SQLite em runtime:

```powershell
$env:SYNC_ENDPOINT = 'https://kbabmewnahysfvlybiak.supabase.co/functions/v1/sync-outbox'
$env:SYNC_KEY = '<secret>'
# opcional: $env:PDV_LOJA_ID = '<uuid-loja>'
./backend/scripts/sync-outbox-anti-replay-diagnostic.ps1 -Op catalogo -OutputJson
```

Confirmar no JSON: chaves `precos_atacado`, `preco_atacado` nos produtos, ausência de tiers projetados como `VALOR_FIXO` fake em `regras`.

## 6. CI / merge

GitHub Actions no tip ainda falha em ~segundos (padrão billing) — **bloqueio externo** (igual #180).

**Merge #182:** somente após (a) Actions verde **ou** aceite explícito do bloqueio billing + evidência desta validação; (b) smoke HMAC catalogo recomendado.

## Critério “validado para produção”

| Critério | Status |
|----------|--------|
| Local não usa `regras_preco` como motor atacado | OK (código) |
| Dados necessários no sync Edge (deploy) | OK |
| SQLite upgrade | OK (script) |
| Web ≡ Local diff=0 | OK (RPC fixtures + golden) |
| Docs | OK |
| HMAC catalogo em device | Pendente secret local |
| CI verde | Pendente billing |
