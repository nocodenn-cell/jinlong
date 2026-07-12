# PRODUCTION_ACTIVATION_CHECKLIST — Ativar Ambiente de Produção (P1)

> Checklist de configuração para a demo/produção não rodar com banners de preview,
> variáveis incorretas ou telas vazias. **Config/ambiente, não código.** Data: 2026-07-12.

## 1. `NODE_ENV=production`

- No Vercel, deploys de **Production** já definem `NODE_ENV=production` automaticamente
  — não precisa (nem deve) ser setado no código.
- Efeito verificado no repositório: com `NODE_ENV=production`,
  - `CaixaScanPipelineDevPanel` retorna `null` (painel de debug do scanner oculto);
  - telemetria de scan em modo produção;
  - banner de preview de layout **oculto** (ver §2).
- ✔️ Confirmar que a URL da loja aponta para o deploy **Production** (não um Preview).

## 2. Desligar banners de preview

| Banner | Gating | Ação |
|---|---|---|
| "Lead time típico de importação" | **Removido** (Fase 2) | ✔️ nada a fazer |
| `CaixaPdvLayoutPreviewBanner` ("PDV clássico") | `showClassicLayoutPreviewBanner()` → **false** em produção, salvo `NEXT_PUBLIC_CAIXA_PDV_LAYOUT_PREVIEW_BANNER=1` | ✔️ **não** definir essa env como `1` em produção |
| `CaixaScanPipelineDevPanel` | `NODE_ENV === 'production'` → `null` | ✔️ automático |

- ✔️ Garantir `NEXT_PUBLIC_DEBUG_MODE=false`.
- ✔️ Não expor a rota de demonstração (`/demo-fluxo`) como entrada principal da loja.

## 3. Variáveis de ambiente obrigatórias (Vercel → Settings → Environment Variables)

| Variável | Obrigatória | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL do projeto Supabase de produção |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | chave pública anon |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ (server) | **necessária para R2** (cadastro de funcionários) e rotas admin |
| `NEXT_PUBLIC_DEFAULT_LANG` | recomendada | `pt` |
| `NEXT_PUBLIC_DEBUG_MODE` | recomendada | `false` |
| `USE_UNIFIED_SALES_FLOW` | conforme deploy | `true` (fluxo de venda unificado) |
| `STRICT_MANAGER_DISCOUNT_AUTH` | recomendada | `true` (exige token de gerente no desconto) |
| `NEXT_PUBLIC_CAIXA_PDV_LAYOUT_PREVIEW_BANNER` | **não definir** | deixar ausente/0 em produção |
| `SENTRY_*` | recomendada | telemetria de erros (ver plano de monitoramento) |
| `FISCAL_DEFAULT_DOC_TYPE` | conforme R1 | permanece stub até decisão fiscal |

> Sem `NEXT_PUBLIC_SUPABASE_*`, o build falha no prerender e telas de dados ficam
> vazias/erro. Sem `SUPABASE_SERVICE_ROLE_KEY`, o R2 retorna erro controlado.

## 4. Validar seed de dados (evitar telas vazias)

Antes de liberar, confirmar que o banco de produção tem dados mínimos para as telas
não abrirem vazias:

- ✔️ Pelo menos **1 loja** (`lojas`) e a `loja_id` default coerente.
- ✔️ **Usuário DONO/GERENTE** ativo para login inicial (ver `FUNCIONARIOS_CADASTRO_GAP.md` / R2).
- ✔️ **Catálogo** com produtos e preços (senão a busca do caixa não retorna nada).
- ✔️ **Estoque** inicial para os produtos vendáveis.
- ✔️ Configurações de caixa (`pdv_config`) presentes (limites, formas de pagamento).
- ✔️ Categorias de produto/financeiras mínimas para os cadastros não abrirem vazios.

## 5. Gate de release (SSRA)

- `npm run validate:production` (`scripts/validate-production.mjs`) compara o
  deployment ID da plataforma Vercel com o `/api/health` em runtime — usar como gate
  final. Requer `VERCEL_TOKEN` e `VERCEL_ORG_ID`.
- ✔️ `GET /api/health` e `GET /api/gerente/health` → 200 após o deploy.

## 6. Resumo

Nenhuma mudança de código é necessária para "ativar produção": os banners de
preview e painéis de dev **já são ocultados** por `NODE_ENV=production`. O trabalho
de P1 é **de configuração** (env vars corretas) e **de dados** (seed mínimo). Use
este checklist junto de `GO_LIVE_REGRESSION_CHECKLIST.md` e
`POST_GOLIVE_MONITORING_PLAN.md`.
