# D-11 — Fonte única de preço de atacado

Status: **desenho e testes na branch; nada aplicado em nenhum banco.**
Data: 2026-11-07. Branch: `claude/d11-atacado-fonte-unica-925cb7`.

## Decisão de origem

O dono decidiu D-11: o cadastro oficial do produto (`produtos.preco_atacado`,
`produtos.quantidade_gatilho_atacado`) é a **fonte única** de varejo, atacado e
quantidade mínima. Faixas existentes em `precos_atacado` são preservadas (nenhuma
linha é removida); as que não forem migradas ficam com `ativo = false`.

Referências citadas na tarefa (`docs/planos/P0_DECISOES_2026-11-07.md` seções 3 e 8.2;
`docs/qa/CHECKLIST_HOMOLOG_FUNCIONAL.md` PRE-03/04/05, AUD-02): **nenhum dos dois
arquivos existe nesta branch, na `main` ou no histórico git (`git log --all`).**
Os critérios aqui foram derivados do pedido e de `PROXIMOS_PASSOS.md` (item
"PDV-100 D-11"). Confirmar com o dono antes de considerar este desenho aprovado.

## REGISTRO OBRIGATÓRIO ANTES DE QUALQUER MIGRATION

> **A estratégia de migração depende do inventário de produção, que ainda não foi
> autorizado.** Não se conhece em produção: quantas faixas ativas existem em
> `precos_atacado`, quantos produtos têm mais de uma faixa, quantos têm faixa de
> loja (`loja_id` não nulo), quantos têm `preco_atacado` com
> `quantidade_gatilho_atacado < 1`, nem se há conflito entre faixa e cadastro.
> Em homologação: `precos_atacado` tem 0 linhas e 6 produtos têm
> `preco_atacado` com `quantidade_gatilho_atacado = 0`. Produção não foi lida.
>
> Por isso a migration **não move dados**: ela cria as regras, a auditoria e as
> funções de plano/execução. A migração de faixas é um passo separado, executado
> manualmente, somente depois do inventário de produção autorizado pelo dono.

## Desenho

| Parte | Onde | Efeito ao aplicar |
|---|---|---|
| Invariantes do cadastro | trigger `trg_d11_validar_cadastro_atacado` em `produtos` (BEFORE INSERT / UPDATE OF preco_atacado, quantidade_gatilho_atacado, preco_varejo) | Rejeita `preco_atacado` com gatilho < 1 e `preco_atacado >= preco_varejo`. Não varre linhas existentes; dispara só em escrita. |
| Auditoria | tabela `historico_atacado_produto` + trigger AFTER INSERT/UPDATE | Grava anterior/novo de preço e gatilho, com `motivo` (via `app.d11_motivo`) e `alterado_por`. Padrão de `historico_precos_produto`. |
| Resolução de preço | `calcular_preco_produto` (mesma assinatura e chaves de retorno) | Transitório: tier ativo ainda vence (comportamento atual, sem mudança de preço ao aplicar). Depois: `fonte = 'produto'` quando `quantidade >= quantidade_gatilho_atacado`, `preco_atacado` válido. Senão varejo. |
| Plano de migração | `d11_plano_migracao_faixas_atacado()` (somente leitura) | Classifica cada faixa ativa: `MIGRAR`, `NAO_MIGRADA_MULTIPLAS_FAIXAS`, `NAO_MIGRADA_FAIXA_DE_LOJA`, `NAO_MIGRADA_INVALIDA`, `NAO_MIGRADA_CONFLITO`. |
| Execução da migração | `d11_executar_migracao_faixas_atacado(motivo)` (service_role) | Copia faixa `MIGRAR` para o cadastro, desativa **todas** as faixas ativas (`ativo = false`), grava `d11_migracao_faixas_log`. Exige motivo ≥ 10 caracteres. |
| Seleção manual | `registrar_selecao_manual_atacado(produto, quantidade, motivo)` + tabela `selecoes_manuais_atacado` | Só `GERENTE` ou `DONO` (`usuarios.perfil`), motivo obrigatório, mesma loja (exceto DONO). Grava sugerido × aplicado. |
| Paridade offline | `shared-core/src/pricing/calcularPrecoCanonico.ts` + fixture `shared-core/src/pricing/fixtures/d11-paridade.json` | TS e SQL leem o mesmo fixture e devem produzir o mesmo `preco/tipo/fonte`. |

## Riscos e pontos para homologação

1. **Produtos inconsistentes (6 em homologação).** Qualquer escrita que toque
   `preco_atacado`, `quantidade_gatilho_atacado` ou `preco_varejo` nesses produtos
   passa a falhar até o cadastro ser corrigido. Edição de nome/estoque não é afetada.
   Validar em homologação que a tela de edição mostra o erro de forma compreensível.
2. **Precedência transitória.** Enquanto houver faixa ativa, ela vence o cadastro
   (como hoje). O preço só passa a vir do cadastro depois de `d11_executar_...`.
   Antes de executar, o cadastro de atacado não altera a venda.
3. **Efeito da execução.** Faixas de produtos com várias faixas, ou de loja, não são
   migradas: ficam `ativo = false` e o produto passa a vender no atacado apenas pelo
   cadastro (que pode estar vazio). Isso é a regra pedida pelo dono, mas altera preço
   de venda. O plano (`d11_plano_migracao_faixas_atacado()`) deve ser revisado e
   aprovado pelo dono antes da execução.
4. **Seleção manual não está ligada ao PDV.** A função existe e é testada; a tela e
   o RPC de venda ainda não a chamam. Ligação fica para a próxima etapa.
5. **Escopo de loja.** `usuarios.loja_id` e `usuarios.perfil` são assumidos pelo
   padrão de `estoque_ajuste_concorrente`/`historico_precos_produto`. A leitura de
   `historico_atacado_produto` espelha `historico_precos_produto` (perfil
   GERENTE/DONO, sem recorte por loja): revisar antes de liberar.
6. **Não validado contra banco real.** Os testes rodam em PGlite com esquema mínimo.
   Não há teste contra o schema completo de homologação nem de produção.

## Testes

- `backend/scripts/d11-atacado-fonte-unica.test.mjs` (PGlite): invariantes, resolução,
  auditoria, plano/execução, seleção manual, permissões, paridade SQL do fixture.
- `shared-core/src/pricing/calcularPrecoCanonico.spec.ts`: mesma matriz do fixture no TS.

## Rollback

`backend/supabase/rollback/20261107120000_d11_atacado_fonte_unica_produto.rollback.sql`.
Restaura `calcular_preco_produto` da versão anterior e remove trigger, tabelas e
funções. Remover tabelas apaga a auditoria: só usar antes de haver registros, ou
depois de exportá-los.

## Não feito nesta rodada

- Nenhuma aplicação em homologação ou produção; nenhum merge; nenhum deploy; nenhum
  label; grants e RLS remotos intocados.
- Inventário de produção (depende de autorização do dono).
- Ligação da seleção manual no PDV e na tela de cadastro.
