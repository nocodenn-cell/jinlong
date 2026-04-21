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

3. **`produtos` e `categorias` com leitura global para autenticados**
   - `produtos_leitura` e `categorias_leitura` usam `auth.role() = 'authenticated'`.
   - Risco: em cenário multi-loja estrito, exposição de catálogo fora do escopo desejado.

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
