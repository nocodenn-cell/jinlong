# Rodada 3 — RISCO e DESCARTADOS

## TB-06

**Título:** Histórico do operador no PDV usa fuso local do servidor para delimitar "hoje"

**Categoria:** Bug

**Veredito:** RISCO

**Descrição:**
`listarHistoricoOperadorImpl` define o início do período como `new Date(); d.setHours(0,0,0,0)` — meia-noite no **fuso do processo Node**, não no fuso da loja. É a mesma classe de SSOT-03, agora no PDV.

**Impacto operacional:** Se o runtime roda em UTC (padrão Vercel) e a loja está em `America/Sao_Paulo` (UTC-3), "meia-noite" no servidor é 21h do dia anterior no horário local. O operador que consulta o próprio histórico vê as vendas das 21h–00h do dia anterior misturadas com as de hoje — e não vê as suas primeiras vendas se o corte cair errado. Na conferência de fechamento de caixa, isso gera divergência entre o que o operador conta e o que a tela mostra.

**Por que RISCO:** depende de `TZ` no ambiente de produção, que não posso ler.

**Evidências:**
- `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts:311-315` → `const d = new Date(); d.setHours(0,0,0,0); return d.toISOString()`
- Padrão correto disponível e não usado: `pdv-importados/lib/relatorios/getRelatorioTimezone.ts`
- Mesma classe: SSOT-03 (rodada 2)

**Fluxo afetado:** Venda → Caixa (conferência de fechamento)

**Comportamento esperado:** Delimitar o dia pelo fuso da loja, reutilizando `getRelatorioTimezone()`.

**Prioridade:** **P1**

**Arquivos:** `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts`

**Dependências:** resolver junto com SSOT-03 (mesma correção conceitual)

**Critério de aceite:** Com `TZ=UTC` no runtime e loja em `America/Sao_Paulo`, o histórico "de hoje" começa às 00h locais.

---

# DESCARTADOS — rodada 3

### DESC-10 — "Existem botões sem ação / handlers no-op / TODOs de funcionalidade"

**Veredito:** DESCARTADO

Varredura em `app/admin`, `app/caixa` e `components` por `onClick={() => {}}`, `TODO`, `FIXME`, `"não implementado"`, `"Em breve"` (excluindo testes): **nenhum botão morto**. Os únicos matches de `TODO` são dois comentários em `caixaVendaEspera.impl.ts:345-346`, ambos sobre melhorias de dados (join para nome do cliente), não funcionalidade ausente.

Os matches de `disabled` inspecionados são estado legítimo de paginação (`disabled={page <= 1}`).

Este é um sinal de qualidade real: em uma base deste tamanho, zero botão decorativo é incomum.

---

### DESC-11 — "`listarHistoricoOperadorImpl` vaza vendas entre lojas (`void lojaId`)"

**Veredito:** DESCARTADO

O código descarta explicitamente o parâmetro `lojaId` (`void lojaId; void LOJA_MATRIZ_ID`), com um TODO admitindo a pendência — o que à primeira vista sugere vazamento entre tenants.

**Não é o caso:** a query filtra por `.eq('operador_id', userId)`, e o operador pertence a uma única loja. O resultado é necessariamente restrito às vendas do próprio usuário. O `lojaId` é redundante aqui, não ausente.

O problema real nesse arquivo é o fuso — **TB-06**.

**Evidência:** `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts:317-322,344-347`

---

### DESC-12 — "Validação de cliente é fraca ou inexistente no frontend"

**Veredito:** DESCARTADO

`validateClienteInput.ts` é sólido: nome `>= 2`, CPF exatamente 11 dígitos, CNPJ exatamente 14 (após `replace(/\D/g,'')`), regex de e-mail, limite de crediário `>= 0`. Códigos de erro tipados e mensagens em PT.

O problema **não** é a qualidade da validação — é ela existir *só* nessa camada (TB-04).

---

## Nota da rodada 3

A lacuna Tela↔Backend, arrastada por duas rodadas, está fechada. O resultado justifica o custo do adiamento ter sido cobrado: rendeu **um P0 novo** (TB-05, vazamento de fornecedores entre tenants) que nenhuma das frentes anteriores alcançaria, porque só aparece ao comparar o isolamento de uma entidade com o de outra.

O padrão que emergiu das três rodadas é consistente e vale nomear: **o projeto valida bem no TypeScript e sub-valida no banco.** Produto, cliente e fornecedor têm regras ricas em `shared-core/src/*/policies/` e schemas permissivos em produção. Como toda RPC é chamável diretamente por qualquer usuário autenticado, cada uma dessas regras é hoje uma convenção, não uma garantia.

Isso não é crítica ao desenho — as políticas em `shared-core` são bem escritas e testadas. É um desequilíbrio de camada: falta espelhar no banco o que já está corretamente pensado no TS. E o projeto já sabe fazer isso — `chk_produto_ncm_formato`, `chk_produto_cfop_formato` e `chk_produto_cest_formato` são exatamente esse espelhamento, aplicado aos campos fiscais e a mais nenhum.
