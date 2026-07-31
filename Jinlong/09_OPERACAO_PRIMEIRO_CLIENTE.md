# 09 — Operação Primeiro Cliente

> Checklist, validações e riscos para o piloto D0.
> Fonte: `docs/FEATURE_FREEZE_PILOTO.md`, `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`, `docs/P0_CHECKLIST_OPERACIONAL.md`
> [[00_DASHBOARD_PROJETO]] · [[06_ROADMAP]] · [[04_PDV]]

---

## Perfil do Piloto (Contrato D0)

| Item | Decisão |
|---|---|
| **Canal** | Web (`pdv-importados`) — sem desktop/outbox |
| **Pagamentos** | Dinheiro, PIX, débito, crédito — **sem fiado** no PDV |
| **Fiscal** | Mock/stub — NFC-e Focus só se contrato exigir |
| **Loja** | Uma loja (Matriz) |
| **Catálogo** | Assistido (time Jinlong) + cadastro unitário + import CSV |
| **Financeiro** | Receber + pagar em `/admin/financeiro` |
| **Fora do escopo** | Venda em espera, inventário cego, conciliação, multi-loja |

---

## Checklist de Abertura

### Fase 1 — Infraestrutura Supabase

- [ ] `supabase link` para projeto correto (staging → prod)
- [ ] `npx supabase migration list` — sem lacunas entre Local e Remote
- [ ] `node scripts/p0-migration-status.mjs` → saída **ALINHADO**
- [ ] Se drift: `npx supabase db push` → repetir verificação
- [ ] **Resolver conflito migration 255** (dois arquivos `255_*`) — decisão humana
- [ ] Aplicar migration `256` se RPC `pdv_diagnostico_pre_producao` ausente
- [ ] Executar `backend/supabase/scripts/verify_p0_producao.sql`
- [ ] Deploy Edge Functions: `sync-outbox`, `validar-gerente`, `fiscal-worker`
- [ ] Secrets configurados: `SYNC_KEY` (se desktop futuro), `FISCAL_*` (se aplicável)

### Fase 2 — Aplicação Web

- [ ] `.env.local` / Vercel com `NEXT_PUBLIC_SUPABASE_URL` e `ANON_KEY` corretos
- [ ] Deploy Vercel (branch `main` ou promoção staging → prod)
- [ ] Validar `/api/health` pós-deploy (SSRA)
- [ ] Acessar `/admin/diagnostico-caixa` — checklist OK — **só perfil ADMIN** (fora do menu do cliente desde 2026-07-30; acessível por URL)
- [ ] `npm run check:caixa-pre-producao` — sem falhas críticas

### Fase 3 — Onboarding Cliente

Seguir `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`:

- [ ] **Criar loja nova** (nunca reutilizar Matriz de teste `a0000001-…`)
- [ ] Criar usuários no Supabase Auth (e-mail real, Auto Confirm)
- [ ] Vincular em `public.usuarios` (NUNCA em `public.perfis`)
  - DONO → `/admin/dashboard`
  - GERENTE → `/admin/dashboard`
  - OPERADOR → `/caixa`
- [ ] Seed catálogo mínimo (5–10 produtos)
- [ ] Configurar idioma (`pt` ou `zh`)

### Fase 4 — Validação Operacional

- [ ] DONO loga → `/admin/dashboard`
- [ ] DONO troca idioma PT ↔ 中文 → persiste após logout
- [ ] OPERADOR loga → `/caixa` (sem acesso admin)
- [ ] OPERADOR abre caixa → bip produto → finaliza venda
- [ ] GERENTE/DONO vê venda em `/admin/vendas`
- [ ] Smoke 023: desconto gerente por token (`smoke_023_finalizar_venda_token_gerente.sql`)
- [ ] Contas a receber/pagar visíveis em `/admin/financeiro`
- [ ] Cancelamento de venda funciona

### Fase 5 — Homologação e Go/No-Go

- [ ] Registrar evidências em `docs/CHECKLIST_P0_STAGING.md`
- [ ] Preencher `docs/DONE_DEFINITION_PILOTO.md` §4.3 e §7
- [ ] GO/NO-GO: `docs/CHECKLIST_EXECUCAO_GO_LIVE.md`
- [ ] Smoke ao vivo com o cliente em produção

---

## Validações Necessárias

| Validação | Ferramenta | Critério de aceite |
|---|---|---|
| Migrations alinhadas | `migration list` | Local = Remote |
| GRANTs corretos | `verify_p0_producao.sql` | Sem FALHA |
| RLS funcional | `test:rls-scope` (CI) | Passa localmente |
| Diagnóstico PDV | `/admin/diagnostico-caixa` | Sem FALHA crítica |
| Venda end-to-end | Smoke manual | Venda aparece em admin |
| Desconto gerente | Smoke 023 | Token aceito |
| Health pós-deploy | `/api/health` | 200 + deployment ID |

---

## Treinamento do Operador

### Operador de Caixa (OPERADOR)
1. Login → redirecionado para `/caixa`
2. Abrir caixa (saldo inicial)
3. Bip produto ou busca por nome
4. Verificar preço (varejo/atacado automático)
5. Aplicar desconto (se autorizado)
6. Escolher forma de pagamento (split se necessário)
7. Finalizar venda
8. Fechar caixa ao fim do turno

**Idioma:** sempre português (sem seletor no caixa).

### Gerente/Dono (GERENTE/DONO)
1. Login → `/admin/dashboard`
2. Criar categorias em `/admin/categorias-produtos` (**pré-requisito** do cadastro)
   e marcas em `/admin/marcas-produtos` (opcional, mas evita marca digitada errada)
3. Cadastrar produtos em `/admin/catalogo`
4. Gerenciar estoque em `/admin/estoque` e receber mercadoria em `/admin/estoque/recebimento`
5. Ver vendas e cancelar em `/admin/vendas`
6. Financeiro em `/admin/financeiro`
7. Trocar idioma PT ↔ 中文 na sidebar

> **Menu (desde 2026-07-30):** o cliente não enxerga `Implantação / GO-LIVE`,
> `Diagnóstico do Caixa` nem `Provisionamento` — são `adminOnly`. O item de
> suspensão chama-se **"Suspensão de vendas"** (era "de licença").
> Detalhe e mapa antes/depois: `AUDITORIA_MENU_EXPOSICAO_CLIENTE.md` §8.

---

## Riscos para o Piloto

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Migration 255 conflitante | Alta | Alto | Decidir renumeração antes do deploy |
| GRANT drift em prod | Média | Alto | `verify_p0_producao.sql` + migration `255_grant_baseline…` |
| Operador sem treinamento | Média | Médio | Sessão ao vivo + runbook impresso |
| Queda de internet | Alta (web only) | Alto | Informar cliente: D0 requer conexão |
| Expectativa de NF-e | Média | Médio | Confirmar contrato: fiscal mock no D0 |
| Conta em `public.perfis` | Baixa | Alto | Runbook proíbe; usar só `usuarios` |
| Loja de teste reutilizada | Média | Alto | Criar loja nova sempre |
| Produto publicado com saldo 0 não vende | Alta | Médio | A tela pós-salvar já avisa que o ajuste de estoque é obrigatório; incluir no treinamento |
| Base legada sem linha em `estoque` | Média | Médio | Corrigido: o ajuste de saldo cria a linha faltante sozinho (auditoria do catálogo, rodada 1) |
| CI do GitHub Actions sem runner (billing) | Alta | Médio | Validação local completa antes do merge; revisar spending limit da conta |

### Catálogo — estado após a auditoria de 2026-07-30

Relatório completo: `AUDITORIA_CATALOGO_PRODUTO.md`. Decisões de regra:
`Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md`.

| Fluxo | Estado |
|---|---|
| Criar produto (com estoque inicial, na mesma transação) | ✅ coberto por teste de contrato |
| Salvar rascunho · publicar no PDV · reativar | ✅ regra imposta no servidor |
| Alterar preço · alterar estoque | ✅ |
| Vincular categoria / marca / fornecedor | ✅ cadastro rápido + telas de gestão |
| Excluir / inativar produto (linha e lote) | ✅ religado à UI |
| Recebimento de mercadoria | ✅ busca server-side (sem teto de 500) |
| Consultar no PDV | ✅ regra única `productEngine` |

**Ainda aberto (decisão de produto, não bug):** filtro por tags sem UI; sem tela de
detalhe do produto; fornecedor inativo ainda aparece no seletor (mesma questão já
resolvida para categoria e marca). Ver §5 do relatório.

---

## Contatos e Documentos de Referência

| Documento | Path |
|---|---|
| Feature Freeze | `docs/FEATURE_FREEZE_PILOTO.md` |
| P0 Checklist | `docs/P0_CHECKLIST_OPERACIONAL.md` |
| Runbook onboarding | `docs/RUNBOOK_PRIMEIRO_CLIENTE.md` |
| Checklist staging | `docs/CHECKLIST_P0_STAGING.md` |
| Go/No-Go | `docs/CHECKLIST_EXECUCAO_GO_LIVE.md` |
| Done definition | `docs/DONE_DEFINITION_PILOTO.md` |
| Roteiro demo | `docs/ROTEIRO_DEMO.md` |
| Diagnóstico PDV | [[04_PDV#Diagnóstico Pré-Produção]] |

---

## Critérios de Encerramento do Piloto D0

- [ ] Cliente operando vendas reais por ≥ 1 semana
- [ ] Zero bugs P0 abertos sem mitigação
- [ ] Evidências T1–T12 registradas para produção
- [ ] `DONE_DEFINITION_PILOTO.md` assinado
- [ ] Feature Freeze pode ser revisado pelo sponsor

---

> Sprint go-live: [[Próxima Sprint]] · Roadmap P0: [[06_ROADMAP#P0 Detalhado]]
