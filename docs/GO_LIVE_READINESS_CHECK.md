# Go-Live Readiness Check — Jinlong

**Data:** 2026-07-17
**Escopo:** validação do caminho crítico de operação. **Sem alterações de código, sem migrations, sem Fiscal.**
**Método:** evidência estática (código do repositório) + consultas read-only ao banco de produção
(`jinlong`, `kbabmewnahysfvlybiak`) + guards locais. **Não** houve execução funcional live do app
(sem app rodando nesta sessão; CI bloqueado por cota — DEC-10).

**Legenda:** ✅ OK (verificável por código/schema) · 🟡 Não validado (exige homologação funcional) ·
❌ Falha/bloqueador.

---

## Bloqueador estrutural (afeta a leitura de toda a tabela)

**As migrations 270–281 (Fase 5 + Database Integrity Hardening) NÃO estão aplicadas em produção.**
Evidência objetiva (produção, 2026-07-17):
- `autorizar_operacao_privilegiada` (migration 272) = **0 ocorrências** → o primitivo de autorização
  de gerente para cancelamento/devolução **não existe em produção ainda**.
- `finalizar_venda_transacional_canonica_v4` executável por `anon` = **true** → a correção da Frente 5
  (migration 280) **não foi aplicada** — o bypass de identidade descrito em DEC-07 **segue aberto em
  produção**.

Ou seja: **o repositório está pronto; a produção roda o estado anterior à Fase 5.** O `db push` em
homologação/produção é o gate #1 de go-live. Enquanto ele não roda, os itens abaixo marcados "código"
refletem o repositório, não o comportamento vivo em produção.

---

## Tabela de aceite

| Área | Cenário | Resultado | Evidência |
|---|---|---|---|
| **Autenticação** | login (usuário/senha) | ✅ código | `app/login/LoginForm.tsx` + `supabase.auth.signInWithPassword` |
| | sessão | ✅ código | `lib/auth/usuarioAtual.ts` (`auth.getUser`/`getSession`) |
| | permissões por perfil | ✅ schema+código | RLS habilitado em `usuarios`; `lib/auth/gerenteOuDono.ts`, `assertGerenteSession` |
| **PDV** | abrir caixa | 🟡 código | `obter_status_caixa_operador`, `fechar_caixa_pdv_atomico` existem em prod; fluxo live não executado |
| | iniciar venda / adicionar produto | 🟡 | `app/caixa` (client); requer app rodando |
| | preço da autoridade definida | ✅ código+schema | `calcular_preco_produto` (1 em prod) como fonte única via `caixaPrecoAutoritativoServer.ts` |
| | aplicar desconto (gerente) | 🟡 / ❌ prod | fluxo de token de gerente é da Fase 5 (migration 272) — **ausente em prod**; presente no repo |
| | concluir pagamento | 🟡 código | v4 (1 overload em prod) via caller único `caixaVendas.impl.ts` |
| | finalizar venda | ✅ código / 🟡 live | v4 = **1 overload** (sem ambiguidade); `rpc-gate-guard` OK (caller único) |
| **Pós-venda** | cancelamento/estorno | 🟡 código | `cancelar_venda_transacional` existe em prod; novo fluxo c/ token gerente (272) pendente de `db push` |
| | consistência da venda | 🟡 | `v_venda_consistencia_anomalias` + `venda_eventos`; requer dados/homologação |
| **Estoque** | baixa automática após venda | ✅ código / 🟡 live | v4 chama `decrementar_estoque_seguro` (1 em prod) atômico na mesma transação |
| | consistência de quantidade | 🟡 | `v_kardex_unificado`; requer dados reais para validar |
| **Financeiro** | geração de contas a receber | ✅ código+schema | v4 em prod já cria `contas_receber` em pagamento parcial (migration 24702, aplicada) |
| | consultas básicas | ✅ código | `app/gerente/financeiro` + RPCs de relatório presentes em prod |
| **Segurança** | RLS ativo (tabelas críticas) | ✅ schema | `vendas, itens_venda, estoque, contas_receber, caixas, clientes, usuarios` = **todas RLS=true** |
| | acesso por perfil | ✅ schema / 🟡 live | policies por perfil em prod; escopo por loja/perfil não exercido funcionalmente aqui |
| **Deploy** | Vercel Ready | ✅ | deploy `pdv-importados` reportado **Ready** repetidamente no PR #199 |
| | variáveis necessárias | ✅ documentado | `.env.example`, `.env.production.example` presentes |
| | procedimento de rollback | ✅ documentado / 🟡 exec | `docs/RUNBOOK_ROLLBACK.md`, `docs/AMBIENTES_E_RELEASE.md` presentes; não executado |
| **Governança** | guards de invariante | ✅ | `rpc-gate-guard` OK (caller único de venda) · `migration-sequence-guard` OK |
| | bootstrap reproduzível | ✅ provado | Frente 7: 205 migrations, 2 instalações = schema idêntico (8730 linhas) |

---

## Bloqueadores registrados

1. **[Gate #1 — obrigatório] `db push` das migrations 270–281 em homologação/produção.** Sem ele, a
   produção não tem: correção do bypass anon na v4 (280), autorização de gerente para cancel/devolução
   (272), RLS versionada (277), views seguras (279). Rodar com as validações pós-aplicação embutidas
   em cada migration (retornos esperados documentados em cada arquivo).

2. **[Gate #2 — obrigatório] Homologação funcional do caminho crítico.** Login → abrir caixa → venda →
   preço → desconto → pagamento → finalizar → cancelamento → baixa de estoque → contas a receber —
   **não executável nesta sessão** (sem app rodando; CI bloqueado por cota). Exige ambiente de
   homologação com dados de teste. Todos os itens 🟡 acima dependem deste gate.

3. **[Atenção] Ambiente de produção consultado está quase vazio** (1 cliente, 0 contas_receber, 2 docs
   fiscais). Confirmar se `kbabmewnahysfvlybiak` é de fato o projeto de produção real ou um
   staging/homolog antes do go-live — a validação de consistência de dados exige volume representativo.

4. **[Conhecido, não bloqueia] CI em execução** bloqueado por cota GitHub Actions (DEC-10); código do
   CI já corrigido. Verde remoto pendente de cota.

---

## Veredito

**Prontidão de código/schema: ✅ ALTA.** O caminho crítico está implementado, com caller único de
venda, autoridade única de preço, RLS ativo nas tabelas críticas, baixa de estoque atômica, automação
de contas a receber, deploy Vercel verde e bootstrap comprovadamente reproduzível.

**Prontidão para go-live: 🟡 CONDICIONAL** aos dois gates obrigatórios: (1) aplicar as migrations
270–281 em homologação/produção e (2) executar a homologação funcional do caminho crítico num
ambiente com dados. Nenhum defeito de código foi encontrado nesta revisão; o que falta é **execução e
promoção**, não implementação.
