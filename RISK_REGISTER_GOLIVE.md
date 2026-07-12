# RISK_REGISTER_GOLIVE — Registro de Riscos Jinlong

> Registro consolidado de riscos do go-live, coletado das Fases 1–8 e da Operação
> Assistida. Escala: Probabilidade (B/M/A) × Impacto (B/M/A). Data: 2026-07-12.
> Atualizar durante a Semana 1 (ver `POST_GOLIVE_MONITORING_PLAN.md`).

## Matriz-resumo

| ID | Risco | Prob. | Impacto | Severidade | Status | Dono |
|---|---|---|---|---|---|---|
| **R1** | Emissão fiscal (NF-e/NFC-e) em modo stub — sem emissor real | A | A | 🔴 Alta | Aberto — decisão de negócio | Dono/Fiscal |
| **R2** | Cadastro de funcionário sem UI | — | A | 🟢 Mitigado | **Resolvido** (tela `/admin/funcionarios`) | Dev/Gerente |
| **R3** | Botões "Etiqueta" e "NF-e" no histórico são stubs desabilitados | A | B | 🟡 Baixa | Aberto — cosmético | Produto |
| **R4** | Dívida técnica em venda-em-espera com cliente | B | M | 🟡 Média-baixa | Documentado | Dev |
| **R5** | `SUPABASE_SERVICE_ROLE_KEY` ausente no ambiente quebra R2 | M | M | 🟡 Média | Verificar antes do go-live | DevOps |
| **R6** | CI vermelho por falhas **pré-existentes** (`guard:core`, 1 teste de venda) | A | B | 🟡 Baixa (não-runtime) | Aberto — fora do escopo seguro | Dev |
| **R7** | Build de produção exige env `NEXT_PUBLIC_SUPABASE_*` (prerender falha sem elas) | M | A | 🟡 Média | Config de deploy | DevOps |
| **R8** | Componente `CaixaPageClient` monolítico (1641 linhas), modais sem lazy-load | A | B | 🟢 Baixa | Melhoria futura | Dev |
| **R9** | Reconciliação de caixa com pagamento parcial pouco exercitada em produção | M | M | 🟡 Média | Vigiar Semana 1 | Gerente |

## Detalhamento e mitigação

### R1 — Fiscal em stub 🔴
- **Descrição:** `enfileirarDocumentoFiscalPosVenda` usa `NFC_E_STUB`; não há emissor
  fiscal produtivo. A venda funciona, mas **não emite documento fiscal válido**.
- **Impacto:** conformidade fiscal no dia 1.
- **Mitigação:** decisão de negócio — (a) operar sem NF-e temporariamente e comunicar,
  ou (b) integrar provedor fiscal (**exige autorização**: mexe em RPC de venda /
  feature nova). Vigiar acúmulo na fila fiscal.
- **Gatilho de escalonamento:** exigência legal de emissão imediata.

### R2 — Cadastro de funcionário 🟢 (mitigado nesta Operação Assistida)
- **Antes:** sem UI; criação só via Supabase Studio.
- **Agora:** tela `/admin/funcionarios` (cadastrar/listar/ativar-desativar) sem
  migration, sem tocar o fluxo de venda. Ver `R2_CADASTRO_FUNCIONARIOS_PLAN.md`.
- **Resíduo:** depende de `SUPABASE_SERVICE_ROLE_KEY` (ver R5).

### R3 — Stubs no histórico 🟡
- Botões desabilitados com tooltip "em breve". Não quebram nada.
- **Mitigação opcional:** ocultar até implementar (decisão de produto).

### R4 — Venda-em-espera com cliente 🟡
- Edge case documentado em `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`.
- **Mitigação:** orientar operador; corrigir em PR futuro.

### R5 — Service-role ausente 🟡
- Sem `SUPABASE_SERVICE_ROLE_KEY`, R2 retorna erro controlado (não quebra a tela).
- **Mitigação:** confirmar a env var no Vercel antes do go-live (já usada por outras
  rotas admin, provavelmente presente).

### R6 — CI vermelho pré-existente 🟡
- `guard:core` (regra em `LoginForm.tsx`/`ProdutoFormModal.tsx`) e 1 teste de venda
  (`finalizarVendaCaixa.integration`) falham em commits **anteriores**, não nesta
  missão. **Não afetam runtime** (Vercel builda). Correção exige tocar login/venda →
  **aguarda decisão** (usuário instruiu **não** mexer em guard:core/testes históricos).

### R7 — Env de build 🟡
- `next build` falha no prerender de páginas que instanciam Supabase sem env.
- **Mitigação:** garantir `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` no ambiente de build
  (CI já injeta via secret `CI_NEXT_PUBLIC_*`).

### R8 — Performance/bundle do PDV 🟢
- Melhoria não bloqueante: lazy-load de modais e quebra do componente monolítico.
  Ver `PDV_PERFORMANCE_UX_AUDIT.md`. PR separado pós-go-live.

### R9 — Reconciliação com pagamento parcial 🟡
- Funcionalidade recente (Fase 5a/6). Pouco rodada com volume real.
- **Mitigação:** priorizar no monitoramento da Semana 1 (fechamento de caixa diário).

## Objetos protegidos (não podem regredir — vigiar)

`finalizar_venda_transacional_canonica_v4` · `fn_registrar_comissao` ·
`trg_registrar_comissao` · estrutura de `vendas` · migrations aprovadas.
Qualquer alerta que os envolva → escalonar, **não corrigir sem autorização**.

## Cadência de revisão

- **Diária (Semana 1):** reavaliar R1, R5, R9; registrar riscos novos.
- **Semanal (Semana 2–4):** R6, R7, R8; decidir R1 e R3.
