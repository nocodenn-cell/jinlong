# Relatório de Validação Operacional — Jinlong

**Data da execução:** 2026-11-18 e 2026-11-19
**Base testada:** `main` em `5b0c82d5` (worktree `jinlong-validation-sprint-826e9e`), app web `pdv-importados`
**Ambiente:** exclusivamente local. Supabase local do projeto `fastproduct` (Docker, `127.0.0.1:54321`, 459 migrations aplicadas), Next.js dev na porta 3002, Edge Functions servidas localmente (`supabase functions serve`). Produção e homologação **não foram acessadas**.
**Dados:** fictícios. Produto `VAL Garrafa Termica 1L` (GTIN 7891000000014), cliente `VAL Cliente Atacado Ltda`, fornecedor `VAL Distribuidora Teste`. Usuários de teste locais `e2e-dono`, `e2e-gerente`, `e2e-operador` (`@localhost.test`); senhas de teste redefinidas só no banco local.
**Método:** cada fluxo foi executado pela interface (navegador do app) e conferido no banco com `psql` dentro do contêiner local. Nada foi marcado como aprovado só por existir tela ou código.
**Restrições respeitadas:** nenhuma implementação, refatoração, migration, commit, push ou deploy. Os únicos ajustes de ambiente foram locais: `pdv-importados/.env.local` (ignorado pelo git) e, no banco local, senha dos usuários de teste e hash da senha do gerente da empresa de teste.

---

## Atualização de 2026-11-19 (depois do teste)

1. **Correção de ambiente:** o banco local tinha duas migrations que **não estão na `main`**: `20261103120000_fechar_caixa_bloqueia_vendas_em_espera` e `20261104100000_vendas_em_espera_descarte_auditavel`, ambas do PR #657 (aberto, branch `claude/pdv-rn03-descarte-auditavel`). Por isso:
   - **B1 (descartar venda em espera)** não é defeito da `main`: na `main` o descarte não exige motivo. A falha só aparece com o banco do #657 e a tela da `main` misturados. O #657 já traz o pedido de motivo na tela. **Ação: decidir e mesclar o #657 (migration + UI juntos).**
   - **“D-06 resolvido”** (fechamento bloqueado com venda em espera) vale só com o #657. Na `main`, o caixa continua fechando com venda em espera.
2. **B2 (vendedor grudado) — corrigido.** Era regra intencional (lembrar o último vendedor por operador). Decisão do dono: toda venda começa com o operador. `app/caixa/caixaVendedor.ts` e `CaixaPageClient.tsx`; teste em `caixaVendedor.test.ts`. Revalidado no PDV local: venda com “Gerente E2E” gravou o gerente e a seguinte voltou para “Operador”.
3. **B3/B4 (cancelamento) — corrigido sem migration.** `valor_estornado` da RPC é só o dinheiro da gaveta (regra do banco, mantida). O comprovante passou a mostrar o total devolvido ao cliente (mesma conta da RPC: total líquido − estornos pós-venda) e a trilha de auditoria passou a mostrar o total cancelado e quem cancelou (`vendas_canceladas_auditoria.operador_id`). Revalidado: venda PIX de R$ 64,90 cancelada pelo Dono → comprovante “Total estornado R$ 64,90”, auditoria “R$ 64,90 · Dono E2E”.
4. Testes após as correções: Vitest `app/caixa`, `app/gerente/vendas`, `app/admin/auditoria` 75 arquivos / 480 testes OK; `tsc` e ESLint sem erros; `guard:all` OK. Nada commitado.

As seções abaixo mantêm o registro do teste original; onde B1, B2, B3, B4 e D-06 aparecem, valem as observações acima.

---

## Resposta à pergunta central

**Se um cliente usar o Jinlong amanhã:**

**Consegue fazer (validado ponta a ponta):** cadastrar produto com preço de varejo, atacado e custo; cadastrar cliente e fornecedor; dar entrada de mercadoria sem nota com geração de conta a pagar; abrir caixa; vender no varejo e no atacado (o preço de atacado entra sozinho na quantidade mínima); dividir pagamento entre PIX e cartão; aplicar desconto com senha do gerente; fazer sangria e suprimento; fechar o caixa às cegas com cálculo correto da diferença; cancelar uma venda com devolução ao estoque e estorno financeiro; pagar parcialmente uma conta a pagar; consultar relatórios de vendas, caixas, curva ABC e encalhe.

**Não consegue fazer:** emitir NFC-e ou NF-e (a fiscal é stub); fazer orçamento; enviar nada por WhatsApp; fazer inventário formal (só ajuste de saldo); trocar a senha do gerente pelo sistema (só por SQL); reabrir caixa pela tela; ter perfis Financeiro, Estoque ou Vendedor; ver auditoria de cadastros, preços, caixa ou usuários na tela de auditoria; controlar inadimplência (títulos a receber sem vencimento); fazer backup ou restauração pelo sistema.

**O que pode dar errado no primeiro dia:**
1. **O operador não consegue descartar uma venda em espera** (`motivo_obrigatorio` cru na tela). Como o fechamento de caixa agora bloqueia com vendas em espera, o operador fica sem saída: precisa finalizar a venda ou chamar suporte. *Severidade alta.*
2. **Comissão para a pessoa errada:** o vendedor escolhido numa venda continua selecionado nas seguintes, sem aviso. *Média/alta se houver comissão.*
3. **Auditoria enganosa:** o cancelamento feito pelo Dono aparece como feito pelo operador, com valor R$ 0,00. *Média.*
4. **Promessa fiscal:** o cupom diz “não é documento fiscal”. Uma loja que precise de NFC-e não pode operar legalmente só com o Jinlong.
5. **Ambiente de produção não reconciliado** (drift de migrations, views que vazam vendas entre empresas — ver `PROXIMOS_PASSOS.md`). Este teste foi local; nada aqui prova o estado de produção.

---

## A. Diagnóstico executivo

**Estágio real:** produto em **piloto assistido**. O núcleo de loja física (catálogo → entrada → PDV → caixa → cancelamento → financeiro básico) funciona e os módulos conversam entre si de forma consistente no banco. Não está pronto para um cliente pagante operar sozinho: há uma falha que trava o fechamento do caixa, lacunas de auditoria em relação ao que a especificação pede, e os módulos fiscal, WhatsApp, orçamento, inventário, backup e permissões granulares não existem.

**O que já podemos oferecer:** PDV web de varejo/atacado com controle de caixa e estoque, para loja que **não depende de emissão fiscal pelo sistema** (ou que emite em outro sistema), com acompanhamento próximo da nossa equipe.

**O que impede operação profissional:**
- Defeito no descarte de venda em espera (bloqueia fechamento).
- Emissão fiscal inexistente (NFC-e/NF-e).
- Auditoria parcial (sem cadastros, preços, caixa, usuários, configurações; sem valor anterior/novo na tela; ator errado no cancelamento).
- Permissões fixas em 3 perfis (Operador, Gerente, Dono), sem matriz por ação.
- Configuração de senha do gerente só por SQL.
- Produção com pendências de segurança e drift de migrations (documentadas em `PROXIMOS_PASSOS.md`, fora do escopo deste teste).

**Módulos maduros:** PDV (venda, atacado, pagamento dividido, desconto com gerente, bloqueio sem estoque), caixa (abertura, sangria/suprimento com gerente acima do limite, fechamento cego com diferença por forma), estoque (entrada com conferência, kardex por venda, devolução no cancelamento), cancelamento com estorno financeiro, contas a pagar com pagamento parcial, isolamento de dados por RLS.

---

## B. Matriz de funcionalidades

Legenda: **APROVADA** · **PARCIAL** · **FALHA** · **NÃO IMPLEMENTADA** · **BLOQUEADA** · **NÃO VERIFICADA**.
Camadas: C = código existe · I = interface existe · B = backend implementado · F = fluxo operacional aprovado neste teste.

### 1. Frente de caixa (PDV)

| Módulo | Funcionalidade | Status | Evidência | Problema | Próxima ação |
|---|---|---|---|---|---|
| PDV | Pesquisa rápida de produtos | APROVADA | Busca por nome “Garrafa térmica inox” listou o item com “Sem estoque”; busca em ~600–980 ms (telemetria) | Ao apertar Enter antes da lista, mostra “Código não encontrado” mesmo existindo o produto | Corrigir mensagem quando a busca ainda está em andamento |
| PDV | Leitura de código de barras | PARCIAL | GTIN digitado + Enter adicionou o item (equivalente a leitor tipo teclado) | Leitor físico não testado | Teste com leitor real na máquina da loja |
| PDV | Inclusão de itens | APROVADA | 2 bipes → qtd 2, total 129,80 | — | — |
| PDV | Exclusão de item | APROVADA | “remover” tirou o item, com aviso “Ctrl+Z para desfazer” | — | — |
| PDV | Aplicação de descontos (gerente) | APROVADA | Senha errada → `SENHA_INVALIDA`; senha certa → motivo obrigatório → 10%; `descontos_venda` gravou gerente, operador, motivo `NEGOCIACAO`, 6,49 | Mensagem de sucesso aparece em caixa vermelha de erro com “Carrinho preservado — tente novamente”; erro mostra código cru | Ajustar tipo/texto das mensagens |
| PDV | Cancelamento de itens | APROVADA | Mesmo fluxo do “remover” | — | — |
| PDV | Cancelamento de vendas | APROVADA (com falha de auditoria) | Venda 0ae0b503 → `CANCELADA`; estoque +6; recebíveis `CANCELADO`; lançamento −200 de reembolso | `vendas_canceladas_auditoria.valor = 0,00`; comprovante “Total estornado R$ 0,00”; auditoria mostra o operador como autor | Corrigir valor e autor gravados no cancelamento dividido (SPLIT) |
| PDV | Consulta de estoque em tempo real | APROVADA | Lista mostra “Sem estoque”; aviso “estoque baixo ou zero” ao adicionar | — | — |
| PDV | Venda sem estoque | APROVADA | Finalização recusada: “Estoque insuficiente… Carrinho preservado” | — | — |
| PDV | Identificação do vendedor | FALHA | Vendedor escolhido (“Gerente E2E”) na venda 2 ficou gravado na venda 3 sem escolha (`vendas.vendedor_id`); na venda 1 o padrão “Operador” gravou `NULL`; lista de vendas mostra “Operador E2E” como vendedor de todas | Seleção persiste entre vendas; relatório mostra operador, não vendedor | Resetar vendedor a cada venda e exibir o vendedor gravado |
| PDV | Múltiplas formas de pagamento | APROVADA | PIX 200 + Débito 99,40 em `vendas_pagamentos`; soma = total | Lista de vendas mostra só “PIX” para venda dividida | Mostrar “Dividido” na lista |
| PDV | Troco | PARCIAL | Troco 20,20 calculado na tela | `vendas_pagamentos.valor_recebido`/`troco` existem mas ficam `NULL`; campo “Recebido” traz valor da venda anterior (64,90) | Persistir recebido/troco; limpar campo a cada venda |
| PDV | Orçamentos | NÃO IMPLEMENTADA | Nenhuma tela/rota de orçamento (`grep orçamento` vazio) | — | Definir escopo (P1) |
| PDV | Venda em espera | APROVADA | Pedidos #2 e #3 retomados e finalizados | — | — |
| PDV | Recuperação de venda em espera | APROVADA | “Venda #3 retomada” com itens | — | — |
| PDV | Descartar venda em espera | **FALHA** | Botão “Descartar” → `motivo_obrigatorio`; `useCaixaVendasEmEspera.ts:256` chama sem motivo e o RPC `descartar_venda_em_espera` exige | Operador não consegue descartar; com o bloqueio de fechamento, fica sem saída | Pedir motivo no descarte (P0) |
| PDV | Impressão e compartilhamento de comprovante | PARCIAL | Recibo na tela com “Imprimir (térmica)” e “Imprimir comprovante” | Impressora térmica não testada; não há compartilhamento (WhatsApp/e-mail) | Teste com impressora real |
| PDV | Preço varejo × atacado | APROVADA | Qtd 6 → 49,90 automático, “Atacado (min 6)”, desconto −90,00 | — | — |
| PDV | Seleção manual do preço | NÃO VERIFICADA | Não encontrei controle manual de varejo/atacado no carrinho | — | Confirmar se existe |
| PDV | Regra comercial por produto | APROVADA | Faixa em `precos_atacado` (min 6, 49,90) criada pelo cadastro | Coexistem `produtos.preco_atacado` e `quantidade_gatilho_atacado` (duas fontes; D-11) | Escolher a fonte única |

### 2. Cadastro de produtos

| Módulo | Funcionalidade | Status | Evidência | Problema | Próxima ação |
|---|---|---|---|---|---|
| Produtos | Cadastro completo | APROVADA | `produtos` 58fd4766: GTIN, SKU, custo 25, varejo 59,90, atacado 49,90/6, localização A-01, `PUBLICADO` | Sem confirmação visível; redireciona para edição após ~10 s em dev | Feedback de “salvo” |
| Produtos | Validação de GTIN | APROVADA | Aviso de dígito verificador inválido, sem bloquear | — | — |
| Produtos | Categoria, marca, unidade, fornecedor, observação | NÃO VERIFICADA (campos existem) | Campos na tela | Não preenchidos no teste | — |
| Produtos | Estoque mínimo | PARCIAL | Gravou 5 em `estoque.estoque_minimo` | `produtos.estoque_minimo` ficou 0: duas colunas para o mesmo conceito | Remover a duplicada |
| Produtos | Imagem | BLOQUEADA | Storage local parado | — | Testar com Storage ativo |
| Produtos | Margem | APROVADA | Tela mostra R$ 34,90 (58,3%) | — | — |
| Produtos | Histórico de alteração de preços | APROVADA (banco) | `historico_precos_produto`: 59,90 → 64,90, com usuário e data | Não verificado se há tela de consulta | Expor na ficha do produto |
| Produtos | Custo médio | FALHA (conhecida) | `preco_custo_medio = 0` após entrada | Nunca é calculado | IM-F01 |

### 3. Clientes e fornecedores

| Módulo | Funcionalidade | Status | Evidência | Problema | Próxima ação |
|---|---|---|---|---|---|
| Clientes | Cadastro e consulta | APROVADA | Toast “Salvo com sucesso”; lista com limite R$ 500; busca no PDV encontra | No PDV, “Nenhum cliente encontrado” aparece antes de buscar; uma vez o campo de limite mostrou `500,00000` (não reproduzido) | Ajustar estado vazio |
| Fornecedores | Cadastro e consulta | PARCIAL | Criado com razão social e CNPJ | Só 2 campos (sem contato, telefone, e-mail, endereço) | Completar cadastro (referência Bling) |

### 4. Estoque

| Módulo | Funcionalidade | Status | Evidência | Problema | Próxima ação |
|---|---|---|---|---|---|
| Estoque | Entrada de mercadoria (sem NF) | APROVADA | 0 → 20; kardex `ENTRADA_NFE +20`; AP 500,00 vencendo 18/12 ligada ao fornecedor por CNPJ | Kardex rotula entrada manual como “Importação NF-e”; 4 etapas (dados → vincular → conferir → confirmar); coluna “REF. FORNECEDOR” mostra UUID; 1ª busca de produto ficou girando | Simplificar etapas; rótulos corretos |
| Estoque | Saída por venda | APROVADA | `SAIDA_VENDA` −2, −6, −1, todas com `venda_id` | — | — |
| Estoque | Devolução no cancelamento | APROVADA | `ENTRADA_DEVOLUCAO_CLIENTE +6` | — | — |
| Estoque | Ajustes | NÃO VERIFICADA | Botões “Ajustar saldo”, “Retirar”, “Ajustar quantidade” | Não executado | — |
| Estoque | Inventário | NÃO IMPLEMENTADA | Só motivo “acerto de inventário” no ajuste | Sem contagem/inventário cego | P2 |
| Estoque | Transferência | NÃO VERIFICADA | Rota `/admin/estoque/transferencias` | Não executado | — |
| Estoque | Histórico (kardex) | PARCIAL | Kardex por produto | Sem valor/custo (`quantidade_delta` apenas) | Kardex valorizado |
| Estoque | Alerta de estoque baixo | APROVADA | Dashboard “Estoque baixo 1”; relatório “Reposição urgente” | — | — |
| Estoque | Divergência saldo × kardex | APROVADA | Relatório lista produtos cujo saldo não bate com o kardex | — | — |

### 5. Caixa

| Módulo | Funcionalidade | Status | Evidência | Problema | Próxima ação |
|---|---|---|---|---|---|
| Caixa | Abertura | APROVADA | Turno #5403, fundo 200, `caixas` ABERTO | — | — |
| Caixa | Suprimento | APROVADA | R$ 100, saldo 583,84 → 683,84, comprovante | Motivo padrão “Troco inicial” | Motivos por tipo |
| Caixa | Sangria acima do limite | APROVADA | R$ 300 pediu senha; `movimentacoes_caixa` com `gerente_id`, IP, user agent, saldo antes/depois | Motivo gravado `TROCO_INICIAL`; passo extra “Confirmar abertura de sangria?” | Exigir motivo coerente; remover confirmação |
| Caixa | Fechamento cego | APROVADA | Sistema 428,84 = 300 + 328,84 + 100 − 300; contado 425,00; diferença −3,84 em `caixas` e `caixas_fechamento_formas` | — | — |
| Caixa | Conferência por forma | PARCIAL | PIX/Débito/Crédito mostrados como “Registrado no Jinlong” | Sem campo para conferir PIX e cartões | Conferência opcional por forma |
| Caixa | Bloqueio com venda em espera | APROVADA | “Há vendas em espera neste caixa…” (D-06 resolvido) | Combinado com o defeito do descarte, trava o operador | Ver P0-01 |
| Caixa | Controle por operador | APROVADA | Caixa por `operador_id` | — | — |
| Caixa | Histórico de fechamentos | NÃO VERIFICADA | Rota `/admin/caixas` | Não aberta | — |
| Caixa | Reabertura mediante autorização | NÃO IMPLEMENTADA (tela) | RPC `retomar_caixa_atomico` sem tela | — | P1 |

### 6. Financeiro

| Módulo | Funcionalidade | Status | Evidência | Problema | Próxima ação |
|---|---|---|---|---|---|
| Financeiro | Recebível de PIX | APROVADA | `financeiro_recebiveis_venda` RECEBIDO + `movimentos_financeiros` +200 | — | — |
| Financeiro | Recebível de cartão | APROVADA | Débito 99,40 PENDENTE | Sem taxa/previsão preenchidas | Configurar taxas |
| Financeiro | Estorno no cancelamento | APROVADA | −200 “Reembolso pós-venda”; débito CANCELADO | — | — |
| Financeiro | Contas a pagar — pagamento parcial | APROVADA | 500 → pago 200, `PARCIAL`; saída −200 na conta | Rótulo do título “· null ·” no seletor | Corrigir rótulo |
| Financeiro | Contas a receber — parcial | PARCIAL | Lista mostra pago/aberto | Títulos sem vencimento (“—”); “Vencidos R$ 0,00” sempre | Vencimento obrigatório |
| Financeiro | Controle de inadimplência | NÃO IMPLEMENTADA | Sem vencimento não há atraso | — | P1 |
| Financeiro | Fluxo de caixa / projeção | NÃO VERIFICADA | Aba “Resumo” e DRE existem | Não validado | — |
| Financeiro | Venda a prazo (crediário) no PDV | NÃO VERIFICADA | Formas no PDV: Dinheiro, PIX, Débito, Crédito; `FIADO` só como rótulo | Não achei caminho na tela | Confirmar desenho |

### 7. Fiscal, integrações, auditoria, permissões, relatórios, backup

| Módulo | Funcionalidade | Status | Evidência | Problema | Próxima ação |
|---|---|---|---|---|---|
| Fiscal | NFC-e / NF-e emissão | NÃO IMPLEMENTADA | Aba fiscal: “Modo fiscal Stub… Emissão NFC-e real está fora do escopo”; fila `NFC_E_STUB` | Venda cancelada continua `PENDENTE` na fila | Fase Focus NFC-e |
| Fiscal | SEFAZ, cancelamento, CC-e, inutilização, XML, DANFE, e-mail | NÃO IMPLEMENTADA | — | — | — |
| Fiscal | Importação de NF-e de compra | NÃO VERIFICADA | Botão “Importar NF-e” | Não executado; pendências conhecidas (custo 2 casas, AP sem conciliação) | — |
| Integrações | WhatsApp | NÃO IMPLEMENTADA | Só campo em funcionários | — | P3 |
| Integrações | Edge Function `validar-gerente` | APROVADA (local) | Respondeu `SENHA_INVALIDA` e emitiu token | — | — |
| Auditoria | Vendas, cancelamentos, estoque, descontos | PARCIAL | `/admin/auditoria` com 14 eventos | Cancelamento com autor errado e R$ 0,00 | Corrigir |
| Auditoria | Cadastros, preços, caixa, usuários, configurações, financeiro | NÃO IMPLEMENTADA (na tela) | `AuditoriaTipo` = VENDA, CANCELAMENTO, AJUSTE_ESTOQUE, ALERTA, DESCONTO, DEVOLUCAO | Dados existem em tabelas separadas, não na trilha | Trilha única de auditoria |
| Auditoria | Estação, valor anterior/novo, filtros por módulo/usuário | PARCIAL | IP/UA só em `movimentacoes_caixa`; antes/depois só em `historico_precos_produto` | — | — |
| Permissões | Bloqueio de rota por perfil | APROVADA | Operador em `/admin/financeiro` → redireciona a `/caixa` | — | — |
| Permissões | Bloqueio na API (RLS) | APROVADA | Operador: `contas_pagar`/`contas_receber` vazios; PATCH em `produtos`/`estoque` → 403; PATCH em `vendas` → 0 linhas | — | — |
| Permissões | Perfis Financeiro, Estoque, Vendedor; permissão por ação | NÃO IMPLEMENTADA | `usuarios.perfil` ∈ OPERADOR, GERENTE, DONO, ADMIN | — | P1/P2 |
| Configurações | Senha do gerente | NÃO IMPLEMENTADA (tela) | Nenhuma tela/RPC grava `pdv_config.gerente_senha_bcrypt` | Implantação depende de SQL | P0/P1 |
| Relatórios | Vendas & Caixas | APROVADA | Faturamento, cancelamento 0,9%, caixas com divergência, vendas por hora, CSV | Sem “por vendedor/categoria” visível | — |
| Relatórios | Produtos & Estoque | APROVADA | Curva ABC, encalhe, reposição, cobertura, divergência | Receita da ABC usa valor bruto (194,70 vs 188,21 líquido) | Usar valor líquido |
| Relatórios | DRE / financeiro | NÃO VERIFICADA | Rota `view=dre-financeiro` | Não aberta | — |
| Backup | Backup automático e restauração | NÃO IMPLEMENTADA (no produto) | Só scripts (`backend/scripts/backup-ro-postgres.sh`) | — | Rotina operacional (P1) |
| Multiempresa | Isolamento | NÃO VERIFICADA (neste teste) | Seletor de empresa; RLS testado em outra rodada | — | — |

---

## C. Resultados dos testes (cenários)

| # | Objetivo | Procedimento | Esperado | Encontrado | Evidência | Status | Gravidade |
|---|---|---|---|---|---|---|---|
| T01 | Login do dono | `/login` com e-mail/senha | Ir ao dashboard | Auth 200; ficou em `/login` ~20 s compilando e então abriu o dashboard | Network: token 200, `usuarios` 200 | APROVADA | Baixa (lentidão em dev) |
| T02 | Cadastrar produto | Cadastro completo com atacado | Produto publicado com faixa | Gravado; faixa em `precos_atacado` | `produtos` 58fd4766 | APROVADA | — |
| T03 | Alterar preço | 59,90 → 64,90 | Histórico com autor | Gravado | `historico_precos_produto` | APROVADA | — |
| T04 | Cadastrar cliente | Nome, CPF, telefone, limite, LGPD | Cliente salvo | Salvo, toast | Lista de clientes | APROVADA | — |
| T05 | Cadastrar fornecedor | Razão social + CNPJ | Salvo | Salvo | Lista de fornecedores | APROVADA | Baixa (cadastro mínimo) |
| T06 | Entrada de mercadoria | Sem documento, 20 × 25,00, 30 dias | Estoque +20, AP 500 | Estoque 20, AP 500 PENDENTE 18/12 | `estoque`, `movimentos_estoque_log`, `contas_pagar` | APROVADA | Baixa (rótulos/etapas) |
| T07 | Venda varejo | 2 × 64,90, dinheiro 150 | Venda 129,80, troco 20,20, estoque −2, caixa +129,80 | Tudo confere; troco não persistido | venda 9a5af5e0 | APROVADA c/ ressalva | Média (troco) |
| T08 | Venda atacado + cliente + dividido | 6 un., PIX 200 + Débito 99,40, vendedor Gerente | 299,40 com atacado | Confere; recebíveis criados | venda 0ae0b503 | APROVADA | — |
| T09 | Venda sem estoque | Produto com saldo 0 | Bloquear | Bloqueou, carrinho preservado | Mensagem na tela | APROVADA | — |
| T10 | Desconto com senha errada | Senha inválida | Recusar | `SENHA_INVALIDA` | Modal | APROVADA | Baixa (código cru) |
| T11 | Desconto autorizado | 10%, motivo negociação | 58,41 e auditoria | Confere | `descontos_venda` | APROVADA | — |
| T12 | Vendedor por venda | Não escolher vendedor na venda 3 | Padrão (operador) | Gravou “Gerente E2E” da venda anterior | `vendas.vendedor_id` | **FALHA** | Média/Alta |
| T13 | Suprimento | R$ 100 | Saldo +100 | Confere | `movimentacoes_caixa` | APROVADA | Baixa (motivo) |
| T14 | Sangria acima do limite | R$ 300 | Pedir gerente | Pediu; gravou gerente | `movimentacoes_caixa.gerente_id` | APROVADA | Baixa (motivo) |
| T15 | Fechar caixa com espera | Fechar com 2 pedidos em espera | Bloquear ou tratar | Bloqueou | Mensagem na tela | APROVADA | — |
| T16 | Descartar venda em espera | Botão “Descartar” | Descartar com motivo | Erro `motivo_obrigatorio`, sem campo | `useCaixaVendasEmEspera.ts:256` | **FALHA** | **Alta** |
| T17 | Fechamento com divergência | Contado 425 × sistema 428,84 | Diferença −3,84 | Confere em `caixas` e por forma | `caixas_fechamento_formas` | APROVADA | — |
| T18 | Permissão negativa (tela) | Operador abre `/admin/financeiro` | Bloquear | Redireciona a `/caixa` | Navegação | APROVADA | — |
| T19 | Permissão negativa (API) | Operador faz PATCH em produto, estoque, venda | Negar | 403, 403, 0 linhas | Script local | APROVADA | — |
| T20 | Cancelar venda dividida | Dono cancela 0ae0b503 | Estoque +6, estorno, auditoria correta | Estoque e estorno OK; auditoria R$ 0,00 e autor “Operador” | `vendas_canceladas_auditoria`, `/admin/auditoria` | PARCIAL | Média |
| T21 | Pagar conta parcialmente | R$ 200 de 500 | PARCIAL | Confere | `contas_pagar.valor_pago` | APROVADA | — |
| T22 | Relatórios | Vendas & Caixas, Produtos & Estoque | Números coerentes | Coerentes; ABC usa bruto | Telas | APROVADA c/ ressalva | Baixa |
| T23 | Auditoria | Conferir trilha | Todas as ações | Faltam cadastros, preço, caixa, AP | `/admin/auditoria` | PARCIAL | Média |
| T24 | Fiscal | Aba fiscal | Emissão | Stub; cancelada continua PENDENTE | Aba fiscal | NÃO IMPLEMENTADA | Alta (se o cliente precisa) |
| T25 | Imagem de produto | Upload | Salvar | Storage local parado | — | BLOQUEADA | — |
| T26 | Equipamentos | Leitor, impressora, Tauri | Funcionar | Sem equipamento | — | BLOQUEADA | — |

**Testes automatizados (não substituem os cenários acima):**
- `npm run guard:all` (11 guardas: regra de negócio fora da UI, fluxo único de venda v4, rotas, preço via RPC, dependências, sequência de migrations, fronteiras de domínio, ratchet, sem alvo de produção, SSoT de entidades): **todos OK**.
- Vitest `pdv-importados`: 461 arquivos passaram, 1 falhou (teste de integração fiscal dependente do banco local), 2 pulados. Detalhe na seção “Resultado do Vitest”.

**Consistência entre módulos (venda ↔ estoque ↔ caixa ↔ financeiro ↔ auditoria):**
- Estoque do produto: 0 → +20 → −2 → −6 → −1 → +6 = **17** (bate com `estoque.quantidade_atual`).
- Caixa: 300 + vendas em dinheiro 328,84 + 100 − 300 = **428,84** (bate com `caixas.saldo_atual` e com o comprovante).
- Financeiro: PIX +200 e −200 no cancelamento; AP 500 com 200 pagos e saída −200.
- Auditoria: cada venda tem `SALE_REGISTERED`; o cancelamento tem `SALE_CANCELLED`.

---

## D. Avaliação de UX

**Problemas principais**

| # | Problema | Onde | Impacto |
|---|---|---|---|
| U1 | Sucesso exibido como erro (“Gerente autorizado…” em caixa vermelha com “Carrinho preservado — tente novamente”) | PDV | Operador acha que falhou |
| U2 | Códigos crus na tela: `SENHA_INVALIDA`, `motivo_obrigatorio` | PDV | Operador sem orientação |
| U3 | Campo “Recebido” traz o valor da venda anterior; aparece “Falta R$ 234,50” falso | PDV | Risco de troco errado |
| U4 | Vendedor persiste entre vendas sem destaque | PDV | Comissão errada |
| U5 | Entrada manual em 4 etapas, com “Confirmar importação” e coluna de UUID | Estoque | Lento e confuso (o Bling faz em uma tela) |
| U6 | Motivo padrão “Troco inicial” em sangria/suprimento | Caixa | Dados de auditoria sem sentido |
| U7 | Confirmação extra antes de abrir a sangria | Caixa | Clique desnecessário |
| U8 | “Nenhum cliente encontrado” antes de buscar | PDV | Parece que o cliente não existe |
| U9 | Cadastro de produto salva sem toast visível | Produtos | Usuário clica de novo |
| U10 | Primeira busca de produto na entrada fica girando | Estoque | Precisa redigitar |
| U11 | Painel de telemetria “scan pipeline · DEV” cobre o botão de finalizar em telas menores | PDV (modo dev) | Só em dev, mas afeta homologação |
| U12 | Resolução 1366 px: colunas do carrinho cortadas, rolagem horizontal | PDV | Comum em PCs de loja |
| U13 | Lentidão: primeira abertura de cada tela 12–20 s em dev | Admin | Em produção (build) deve ser menor; medir |

**Comparação com o Bling (onde vale a pena)**
- **Cadastro de produto:** o Jinlong está no nível do Bling no essencial e melhor no atacado por faixa. Falta foto (não testada), variações e cadastro em massa por planilha. Valor: reduzir tempo de implantação.
- **Entrada de estoque:** o Bling dá entrada numa tela com fornecedor, itens e financeiro. O Jinlong tem conferência física (vantagem real contra erro de recebimento), mas em 4 etapas. Recomendo manter a conferência e juntar as etapas de dados e vínculo.
- **PDV:** o Jinlong é mais rígido em controles (bloqueio sem estoque, desconto com motivo, sangria com gerente, fechamento cego) e isso tem valor para loja com vários operadores. Faltam orçamento e venda a prazo visível, que o Bling oferece e que o cliente de atacado usa.
- **Fornecedores:** o Bling tem cadastro completo; o do Jinlong tem só nome e CNPJ. Completar porque compras e contas a pagar dependem dele.

---

## E. Gaps do produto

**Funcionalidades inexistentes:** NFC-e/NF-e e todo o ciclo fiscal; orçamentos; WhatsApp; inventário formal; perfis Financeiro/Estoque/Vendedor e permissão por ação; tela de senha do gerente; reabertura de caixa pela tela; backup/restauração no produto; inadimplência; transferência entre empresas (só entre lojas).

**Funcionalidades incompletas:** auditoria (falta cadastros, preço, caixa, AP, usuários, configurações; valor antes/depois e estação só em partes); cadastro de fornecedor; conferência de PIX/cartão no fechamento; troco/recebido não persistidos; kardex sem valor; custo médio não calculado; contas a receber sem vencimento.

**Bugs encontrados neste teste:**
| ID | Descrição | Severidade |
|---|---|---|
| B1 | Descartar venda em espera falha sempre (`motivo_obrigatorio`) | Alta |
| B2 | Vendedor da venda anterior gravado na próxima | Média/Alta |
| B3 | Cancelamento SPLIT grava valor 0,00 e comprovante “Total estornado R$ 0,00” | Média |
| B4 | Auditoria atribui cancelamento ao operador da venda, não a quem cancelou | Média |
| B5 | Campo “Recebido” mantém valor anterior | Média |
| B6 | Sangria/suprimento gravam motivo “Troco inicial” por padrão | Baixa |
| B7 | Venda cancelada continua PENDENTE na fila fiscal | Baixa (stub) |
| B8 | Rótulo “· null ·” no seletor de título a pagar | Baixa |
| B9 | Entrada manual registrada como “Importação NF-e” no kardex | Baixa |
| B10 | Curva ABC usa receita bruta, não líquida | Baixa |
| B11 | Lista de vendas mostra operador como vendedor e só a 1ª forma do pagamento dividido | Baixa |

**Integrações pendentes:** Focus/SEFAZ, WhatsApp, Asaas (cobrança), adquirentes de cartão (taxas e liquidação), Storage para imagens (não testado).

**Problemas arquiteturais (com evidência):**
- **SSoT violado:** `produtos.estoque_minimo` × `estoque.estoque_minimo`; `produtos.preco_atacado`/`quantidade_gatilho_atacado` × `precos_atacado`. Qual fica: `estoque` (por loja) e `precos_atacado` (faixas). Risco: telas e relatórios lendo valores diferentes.
- **Auditoria espalhada:** `venda_eventos`, `vendas_canceladas_auditoria`, `descontos_venda`, `historico_precos_produto`, `movimentacoes_caixa`, `import_auditoria`, sem trilha única. A tela de auditoria só agrega 6 tipos. Recomendação mais simples que uma nova arquitetura: uma view/consulta de leitura que unifique as fontes existentes e passe a cobrir cadastros, antes de qualquer tabela nova.
- **`vendas.tipo_venda = 'COM_NF'`** em venda sem nota: nome de dado que não corresponde ao fato.
- **Contrato UI × RPC quebrado** no descarte (UI não envia o parâmetro que o RPC passou a exigir): falta teste de contrato para esse caminho.

**Problemas operacionais:** configuração de senha do gerente por SQL; drift de migrations e correções de segurança pendentes em produção (já listados em `PROXIMOS_PASSOS.md`); nenhum teste com leitor, impressora térmica ou Tauri; storage e realtime não usados no teste local.

---

## F. O que já podemos vender

**Pacote “PDV + Caixa + Estoque” para loja física, em piloto assistido**, com estas condições:

| Recurso | Pronto? | Limitações | Pré-requisitos |
|---|---|---|---|
| PDV varejo/atacado | Sim, após corrigir B1 e B2 | Sem orçamento; troco não guardado | Leitor e impressora testados na loja |
| Desconto com autorização do gerente | Sim | Senha configurada por nós (SQL) | Implantação feita pela equipe |
| Caixa (abertura, sangria, suprimento, fechamento cego) | Sim, após B1 | Sem conferência de PIX/cartão | Treinar o operador |
| Cadastro de produtos e clientes | Sim | Sem cadastro em massa validado; foto não testada | — |
| Entrada de mercadoria com conta a pagar | Sim | 4 etapas; custo médio não calculado | — |
| Cancelamento com estorno | Sim | Auditoria com valor/autor errados (B3/B4) | — |
| Contas a pagar | Sim | — | Contas financeiras configuradas |
| Relatórios de vendas e estoque | Sim | ABC em receita bruta | — |

**Não vender ainda:** emissão fiscal, WhatsApp, orçamento, inventário, perfis personalizados, auditoria completa “de todos os módulos”, backup gerenciado, multiempresa com transferência entre empresas. Os Termos de Serviço e o site não podem prometer emissão fiscal.

---

## G. Roadmap de evolução

### P0 — Impedimentos para operação segura

| Entrega | Problema que resolve | Benefício | Dependências | Critério de aceitação | Risco | Prioridade |
|---|---|---|---|---|---|---|
| P0-01 Motivo no descarte de venda em espera | B1 trava o fechamento | Operador fecha o caixa sozinho | Nenhuma | Descartar pede motivo, grava `descartada_motivo/por/em`, fecha o caixa; teste de contrato UI×RPC | Baixo | P0 |
| P0-02 Vendedor por venda | B2 atribui venda/comissão errada | Comissão confiável | Nenhuma | Vendedor volta ao padrão a cada venda; teste com 2 vendas seguidas | Baixo | P0 |
| P0-03 Valor e autor no cancelamento | B3/B4 auditoria errada | Rastreabilidade | Nenhuma | `vendas_canceladas_auditoria.valor` = total; trilha mostra quem cancelou | Baixo | P0 |
| P0-04 Produção alinhada | Drift e vazamento entre empresas (fora deste teste) | Segurança de dados | Autorização do dono | Itens P0 de segurança de `PROXIMOS_PASSOS.md` aplicados e verificados | Médio | P0 |
| P0-05 Senha do gerente na tela | Implantação depende de SQL | Cliente se configura | Nenhuma | Dono define/troca a senha; hash bcrypt; evento auditado | Baixo | P0 |

### P1 — Essencial para o cliente

| Entrega | Problema | Benefício | Dependências | Critério de aceitação | Risco | Prioridade |
|---|---|---|---|---|---|---|
| Persistir recebido/troco e limpar “Recebido” | D-05, B5 | Conferência de dinheiro | Decisão já registrada em D-05 | `valor_recebido`/`troco` gravados; campo zera a cada venda | Baixo | P1 |
| Trilha de auditoria unificada (leitura) | Auditoria parcial | Atender item 3 da especificação | Nenhuma tabela nova no 1º passo | Tela mostra produto, cliente, fornecedor, preço, caixa, AP com autor e data | Médio | P1 |
| Vencimento em contas a receber + inadimplência | Sem atraso | Cobrança | Nenhuma | Título com vencimento; filtro “vencidos” | Baixo | P1 |
| Orçamento no PDV | Atacado negocia antes | Conversão | Venda em espera como base | Salvar, imprimir, converter em venda | Médio | P1 |
| Reabertura de caixa com autorização | RPC sem tela | Corrigir erro de fechamento | `retomar_caixa_atomico` | Gerente reabre com motivo; auditado | Baixo | P1 |
| Teste em equipamento real | Nunca testado | Evitar falha no balcão | Máquina da loja | Leitor, impressora e queda de rede testados | Médio | P1 |
| Fiscal NFC-e (Focus) | Fiscal stub | Operação legal | Contador, certificado | Emitir, cancelar, consultar status em homologação SEFAZ | Alto | P1 (se o cliente exigir) |

### P2 — Produtividade e experiência

| Entrega | Problema | Benefício | Dependências | Critério de aceitação | Risco | Prioridade |
|---|---|---|---|---|---|---|
| Entrada de mercadoria em 2 etapas | 4 etapas | Menos tempo no recebimento | Nenhuma | Dados + conferência numa tela | Baixo | P2 |
| Cadastro completo de fornecedor | Só nome/CNPJ | Compras e AP | Nenhuma | Contato, telefone, e-mail, endereço | Baixo | P2 |
| Mensagens de PDV legíveis | U1, U2 | Menos chamados | Nenhuma | Nenhum código cru; sucesso em verde | Baixo | P2 |
| Conferência PIX/cartão no fechamento | Só dinheiro | Fechamento completo | Nenhuma | Campo opcional por forma | Baixo | P2 |
| Remover colunas duplicadas (SSoT) | Duas fontes | Previsibilidade | Migração com dados | Uma coluna por conceito; testes | Médio | P2 |
| Inventário com contagem | Só ajuste | Controle de perdas | Kardex valorizado | Contagem, divergência, aprovação | Médio | P2 |

### P3 — Diferenciais e expansão

| Entrega | Problema | Benefício | Dependências | Critério | Risco | Prioridade |
|---|---|---|---|---|---|---|
| WhatsApp (comprovante, orçamento, cobrança) | Não existe | Atendimento | Orçamento, fiscal | Envio com histórico | Médio | P3 |
| Perfis personalizados e matriz por ação | 3 perfis fixos | Lojas maiores | Auditoria unificada | Perfil configurável por ação | Alto | P3 |
| Backup gerenciado e restauração simplificada | Só script | Confiança | Plano de backup | Registro de execução e restore mensal | Médio | P3 |
| NF-e, CC-e, inutilização, DANFE por e-mail | Fiscal completo | Atacado B2B | NFC-e | Ciclo fiscal completo | Alto | P3 |

---

## H. Plano das próximas sprints

| Sprint | Objetivo (valor operacional) | Entregas | Saída esperada |
|---|---|---|---|
| S1 (1 semana) | **Operador fecha o dia sozinho** | P0-01, P0-02, P0-03, B5, B6 | Repetir T07–T20 sem nenhuma FALHA |
| S2 (1 semana) | **Cliente se implanta sem SQL e produção segura** | P0-05; P0-04 com autorização; teste em equipamento real | Smoke na máquina da loja aprovado; senha do gerente pela tela |
| S3 (2 semanas) | **Dono confia nos números** | Auditoria unificada (leitura), vencimento/inadimplência, recebido/troco, mensagens do PDV | Trilha mostra todo cadastro e caixa; títulos vencidos aparecem |
| S4 (2 semanas) | **Atacado vende melhor** | Orçamento, fornecedor completo, entrada em 2 etapas, reabertura de caixa | Orçamento convertido em venda; entrada em 2 telas |
| S5+ | **Operação legal** | NFC-e Focus (homologação SEFAZ) | Emissão e cancelamento em homologação |

Cada sprint termina com a repetição deste roteiro (T01–T26) em ambiente local ou homologação, não com contagem de testes automatizados.

---

## Resultado do Vitest

`npx vitest run` em `pdv-importados` (2026-11-19, 316 s): **461 arquivos passaram, 1 falhou, 2 pulados** (464).

A falha é `app/admin/produtos/produtosFiscalEdicao.integration.test.ts` (4 casos): `list_produtos_gerente_filtrados` devolveu 0 linhas para o produto criado pelo próprio teste (`expected 0 to be greater than 0`, linha 135). Esse teste só roda quando há Supabase local configurado; aqui ele rodou porque o `.env.local` desta validação apontava para o banco local. A causa provável é de fixture/escopo (produto de teste fora da loja/empresa que a RPC filtra), não regressão comprovada do produto. **Classificação: NÃO VERIFICADA** — investigar antes de usar esse teste como evidência da preservação de campos fiscais.

Lembrete: testes automatizados aprovados não são aprovação operacional. Os cenários da seção C são a evidência de uso real.
