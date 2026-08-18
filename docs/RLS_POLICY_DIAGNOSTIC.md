# Diagnóstico RLS por Perfil

Este documento resume o estado atual de RLS no backend Supabase e os riscos identificados para os perfis `OPERADOR`, `GERENTE`, `DONO` e `ADMIN`.

## Cobertura atual observada (migrations)

- **Vendas e estoque por loja/perfil**: políticas consolidadas em `042_estoque_vendas_rls_por_loja.sql` e reforçadas em `044_usuario_perfil_admin_rls.sql`.
- **Caixas**: políticas consolidadas em `057_caixas_rls_consolidate_permissive.sql`.
- **Fiscal e financeiro**: políticas em `035_fiado_fiscal_stub.sql`, `050_cancelar_venda_transacional.sql`, `066_fiscal_documento_timeline.sql`.
- **Configurações e suporte**: `032_lojas_estoque_por_loja.sql`, `013_relatorios_timezone_configuravel.sql`, `058_pdv_config_rls_e_rpc_caixa_web.sql`.

## Lacunas e riscos encontrados

1. **`vendas` com escrita ampla para perfis gerenciais**
   - `vendas_insert_loja` permite insert para `GERENTE`, `DONO`, `ADMIN` na mesma loja.
   - Risco: criação de vendas fora do fluxo canônico caso endpoints não restrinjam operação.

2. **`itens_venda` ainda depende de policy permissiva por vínculo de venda**
   - Insert autorizado quando a venda pertence ao operador ou perfil gerencial.
   - Risco: inconsistências se houver venda previamente criada por fluxo alternativo.

3. **`produtos` e `categorias` com leitura global para autenticados** — *confirmado por teste real em 2026-08-16, com escrita também exposta*
   - `produtos_leitura` e `categorias_leitura` usam `auth.role() = 'authenticated'`.
   - `produtos_escrita` (cmd `ALL`) e `historico_precos_produto_leitura` verificam **apenas perfil**, sem predicado de loja.
   - Risco: em cenário multi-loja estrito, exposição de catálogo fora do escopo desejado.

   **Evidência empírica** (transação revertida no projeto de produção, gerente da
   loja Matriz contra produto da loja Filial):

   | Operação | Resultado |
   |---|---|
   | `SELECT` produto de outra loja | **1 linha** — nome, preço e `criado_por` retornados |
   | `SELECT` `historico_precos_produto` de outra loja | **1 linha** — preço anterior/novo e autor |
   | `UPDATE preco_varejo` em produto de outra loja | **permitido** |

   Ou seja: não é só leitura de catálogo — um perfil gerencial de uma loja pode
   **alterar preço** de produto de outra. Hoje o impacto prático é nulo porque há
   uma única loja em operação (todos os 11 usuários ativos nela), mas a lacuna é
   estrutural e cresce junto com o roadmap de multi-loja.

   **Mitigação parcial já aplicada (2026-08-16)**: as actions de autoria e de
   histórico de preços (`obterAutoriaProduto`, `listarHistoricoPrecos`) passaram a
   validar produto→loja na camada de aplicação, via
   `lib/gerente/assertProdutoDaLojaSessao.ts` — falha fechada, mesma mensagem para
   "não existe" e "outra loja" (sem oráculo de enumeração), ADMIN global espelhando
   `auth_usuario_gerencial_loja`. Isso fecha as superfícies novas, **mas não
   substitui o hardening de RLS**: quem falar direto com o PostgREST continua
   alcançando as tabelas.

   **Pendente (exige decisão de produto)**: alterar a cardinalidade das policies de
   `produtos`/`historico_precos_produto` para escopo por loja. Está registrado como
   backlog em `AUTHORIZATION_MATRIX.md` (linha `produtos`: "avaliar hardening
   multi-loja futuro") e em `PLANO_EXECUTIVO_EXECUCAO_JINLONG.md` ("hardening
   multi-loja de `produtos.SELECT` — backlog, exige decisão de produto"). Ao
   executar, reteste PDV/caixa, catálogo, relatórios e transferências: a mudança
   afeta todos de uma vez.

4. **Views dependentes de RLS de base + `security_invoker`**
   - `v_estoque_baixo` está protegida por tabela base, mas qualquer regressão no invoker/policies vaza dados.
   - Risco: regressão silenciosa sem teste automatizado de escopo.

5. **RPCs críticas não têm verificação sistemática em CI por perfil**
   - RPCs como `finalizar_venda_transacional_canonica_v2` e funções de estoque exigem teste com JWT real.
   - Risco: “falso verde” quando SQL compila, mas autorização quebra.

## Conclusão

O baseline de RLS existe e está melhor que MVP, porém ainda demanda:

- validação automatizada de escopo por perfil com Supabase local;
- matriz de autorização versionada;
- gate dedicado no CI para bloquear regressões de autorização.
