# Cobertura do Modelo de Autoridade por Domínio

**Data:** 2026-07-01. **Tese central:** o sistema **não** tem arquiteturas
concorrentes. Tem **uma arquitetura de autoridade única, com cobertura
incompleta**. Onde o padrão foi aplicado (Venda, Preço), o domínio é consistente e
protegido por CI. Onde não foi, há drift silencioso. O objetivo não é refatorar —
é **estender a cobertura do modelo que já existe** aos domínios que faltam.

O padrão-alvo (já comprovado internamente) tem 3 elementos:

1. **1 escritor autorizado** por operação de domínio (RPC canônica / serviço único).
2. **Guard de CI** que quebra o build se outro caminho escrever ou reimplementar a regra.
3. **Camadas derivadas**: client só exibe/envia intenção; offline replica com **teste de equivalência/paridade**.

---

## Matriz de cobertura (as 5 perguntas, por domínio)

| Domínio | 1. Autoridade real hoje | 2. >1 writer? | 3. Bypass de RPC? | 4. Dup TS×SQL? | 5. Enforcement | Cobertura |
|---|---|---|---|---|---|---|
| **Venda** | RPC `finalizar_venda_transacional_canonica_v4` (online) / `registrar_venda_com_itens` (offline) | Não | Não | Não | **CI** — `rpc-gate-guard.mjs` (caller único, bloqueante) | ✅ **Completa** |
| **Preço** | RPC `calcular_preco_produto` (online) / `PricingService` (offline) | Não | Não | Não (offline tem golden test de equivalência) | **CI** — `pricing-rpc-guard.mjs` (proíbe `PricingService` online; caller único da RPC) | ✅ **Completa** (1 furo estreito: MANUAL/PROMOCAO confiam no client — `caixaPrecoAutoritativoServer.ts:212-233`) |
| **Fiscal** | Edge `fiscal-worker` (`fiscal-validation.ts`) via `fiscal_enfileirar_documento_venda` | Não | Não | Não | **Convenção** — consistente por construção (só o worker valida), mas **sem guard** dedicado | 🟡 **Consistente, mas não enforced** |
| **Caixa** | Fechamento `fechar_caixa_atomico`; movimentação `registrar_movimentacao` (unificada) | **Sim** — abertura, fechamento e sync escrevem por caminhos distintos | **Sim** — abertura faz `insert` direto sem RPC (`caixaSessaoOperador.impl.ts:100-110`); `sync-outbox/index.ts:459` é 3º writer de `caixas` | **Sim** — limite R$5 em SQL (`fechar_caixa_atomico`, migr.230, `c_limite:=5.00`) e TS (`CaixaPageClient.tsx:624`, `> 5`) | **Convenção** — nenhum guard cobre `caixas`/`movimentos_caixa` | ❌ **Incompleta** |
| **Estoque** | RPC `decrementar_estoque_seguro` / `ajustar_estoque_manual` / `transferir_estoque_seguro` | **Sim** — 3 escritas diretas | **Sim** — `estoque/actions.ts:87`, `produtos/actions.ts:79` e `:640` fazem `.from('estoque').insert/delete` | Validação "não-negativo" só em PL/pgSQL; **sem CHECK constraint** no schema | **Convenção** — `core-rule-guard` não cobre escrita em `estoque` | ❌ **Incompleta** |
| **Auth (Permissões)** | RLS SQL (defesa real) + `adminPolicy.ts` (roteamento/UX) | N/A (dois papéis) | N/A | **Sim, com divergência ATIVA** — TS libera `['GERENTE','DONO','ADMIN']` (`adminPolicy.ts:55`); ~44 policies legadas (migr.042/034/035) usam `('GERENTE','DONO')` **sem ADMIN** | **Convenção** — **nenhum teste de paridade TS↔SQL**; sem helper SQL central (só `auth_usuario_eh_dono()` p/ DONO); `AUTHORIZATION_MATRIX.md` mantido à mão | 🔴 **Incompleta (segurança)** |
| **Cadastros (Cliente/Fornecedor)** | `clientes/actions.ts` / `fornecedores/actions.ts` | **Sim** — `criarCliente()` dup em `financeiro/actions.ts:19`; Produto/Fornecedor têm 2ª escrita via RPC `importar_nfe_transacao` (fluxo NFe) | **Sim** (via NFe, caminho paralelo) | Não confirmado | **Convenção** — sem guard | ❌ **Incompleta** |

---

## Leitura da matriz (tipos de falha, conforme sua taxonomia)

**1. Falha de cobertura de autoridade única** (mais de um writer): Caixa (abertura direta + RPC + sync), Estoque (RPC + 3 writes diretos), Cadastros (dup + caminho NFe). Venda/Preço/Fiscal: 1 writer.

**2. Falha de enforcement (não de design):** o design está certo; o guard só existe para 2 de 7 domínios. Venda e Preço têm guard de CI bloqueante; **Fiscal é consistente mas por convenção** (sem guard); Caixa, Estoque, Auth e Cadastros dependem inteiramente de convenção.

**3. Drift SQL×TS:** concentrado em **Auth** — a única divergência *ativa e de segurança* (ADMIN liberado no TS, bloqueado em ~44 policies RLS). Caixa tem drift de constante (R$5 em dois lugares). Nenhum teste de paridade em lugar nenhum.

**4. Client em regra de domínio:** Caixa (limite R$5 no client), Preço (MANUAL/PROMOCAO confiam no snapshot do client). Nos demais, `core-rule-guard.mjs` já barra regra de negócio na UI — mas só para os padrões que ele conhece (status/vendabilidade), não para limites/preço.

---

## Conclusão operacional

A distância entre "consistente" e "com problema" **não é arquitetural** — é **1 guard de CI + 1 correção de writer único + (para Auth) 1 teste de paridade** por domínio. Ou seja: o trabalho é *submeter os 4 domínios ao mesmo regime de autoridade* que Venda e Preço já têm.

Um único `authority-guard.mjs` parametrizável — declarando, por tabela crítica
(`caixas`, `movimentos_caixa`, `estoque`, `clientes`, `fornecedores`), quais RPCs/
arquivos podem escrevê-la — rodando no `guard:all` (já bloqueante no CI), fecha a
falha de *enforcement* de uma vez. As correções de writer/paridade fecham a falha
de *cobertura*.

**Ordem de execução (definida por risco de negócio):** Caixa → Preço → Estoque →
Auth. Detalhe de cada correção, verificação e roadmap:
ver o plano de resolução em `docs/adr/` / plano de trabalho associado (Caixa: RPC
de abertura com lock + remover fechamento órfão + limite única fonte; Preço: fechar
trust-client de MANUAL/PROMOCAO; Estoque: CHECK constraint + eliminar bypass; Auth:
helper SQL `fn_usuario_tem_perfil_gerencial` + reescrever as 44 policies + teste de
paridade — este último subitem recomendado como hotfix antecipado por ser
divergência de segurança ativa).

> **Não** faz parte deste escopo: domain layer formal, event bus, permissões
> geradas. A tese é cobertura, não reengenharia.
