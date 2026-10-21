# 15 — Runbook: administrador de plataforma e habilitação do Import Intelligence

Procedimentos administrativos (D2, D3). **Nenhum deles foi executado em produção.** Cada execução real exige autorização expressa e registro do executor.

## 0. Princípios

- Ninguém é promovido automaticamente. O ADMIN legado continua sendo ADMIN legado.
- Cadastrar um administrador de plataforma é um **procedimento sem identidade de usuário**: service_role pelo SQL Editor ou por um script operacional. Nenhuma tela faz isso, e nenhum usuário consegue se autopromover.
- Habilitar o módulo exige autorização comercial registrada (contrato ou pedido), responsável, motivo e, quando houver, vigência.
- O módulo nasce desabilitado. A licença não substitui o papel do usuário nem o isolamento entre empresas.

## 1. Pré-checagem obrigatória antes de aplicar a F1 em qualquer ambiente com dados reais

Consultas somente leitura, executadas com service_role e **depois** de aplicar a migration em um clone autorizado:

```sql
-- a) divergências entre o cadastro legado e os vínculos (esperado: 0)
SELECT motivo, count(*) FROM public.fp_divergencias_vinculos_legados() GROUP BY 1;

-- b) exceções do backfill: cada linha é uma conta que NÃO passa na cerca
SELECT motivo, count(*) FROM public.m1_backfill_excecoes GROUP BY 1;

-- c) lojas sem empresa (esperado: 0)
SELECT count(*) FROM public.lojas WHERE empresa_id IS NULL;
```

Um resultado diferente do esperado bloqueia a aplicação até haver decisão operacional.
- `ADMIN_SEM_VINCULO` é esperado (D2).
- `LOJA_INEXISTENTE` e `LOJA_SEM_EMPRESA_POS_CORTE` exigem análise conta a conta.

## 2. Cadastrar administrador de plataforma (identidade fictícia na homologação)

Pré-requisito: o usuário existe em `auth.users` e em `public.usuarios`, ativo.

```sql
-- service_role, sem JWT de usuário. Capacidades: PROVISIONAMENTO e/ou COMERCIAL.
SELECT public.ops_definir_plataforma_admin(
  '<uuid do usuário>'::uuid,
  true,
  ARRAY['COMERCIAL'],
  'Motivo com pelo menos 10 caracteres (ex.: designação aprovada em <data/ata>)',
  '<nome de quem executa>'
);
```

Para revogar, chame com `p_ativo = false`. O histórico fica em `plataforma_admins_historico`, que é append-only.

Separação de funções recomendada: `PROVISIONAMENTO` (criar lojas) e `COMERCIAL` (habilitar módulos) em pessoas diferentes.

## 3. Habilitar o Import Intelligence para o cliente contratante

**Caminho de plataforma** (usuário com capacidade `COMERCIAL`, autenticado):

```sql
SELECT public.plataforma_definir_modulo_empresa(
  '<empresa_id>'::uuid, 'IMPORT_INTELLIGENCE', true,
  'Contrato nº <...>',                 -- autorização comercial
  'Contratação do módulo pelo cliente', -- motivo
  DATE '<início>', DATE '<fim ou NULL>'
);
```

**Caminho operacional** (service_role, sem identidade):

```sql
SELECT public.ops_definir_modulo_empresa(
  '<empresa_id>'::uuid, 'IMPORT_INTELLIGENCE', true,
  'Contrato nº <...>', 'Contratação do módulo pelo cliente', '<responsável>',
  DATE '<início>', NULL
);
```

Para desabilitar, use `p_habilitado = false`, com motivo. O histórico fica em `empresa_modulos_historico`, que é imutável.

Conferência:

```sql
SELECT acao, autorizado_por, responsavel_id, responsavel, motivo, vigencia_inicio, vigencia_fim, origem, registrado_em
  FROM public.empresa_modulos_historico
 WHERE empresa_id = '<empresa_id>' AND modulo_codigo = 'IMPORT_INTELLIGENCE'
 ORDER BY registrado_em;
```

O empresa_id do primeiro cliente é o da empresa `origem = 'LEGADA_M1'`. Ele é lido no banco, nunca fixado em código.

## 4. Acesso no aplicativo

Toda rota ou action do módulo começa por `requireModulo(client, 'IMPORT_INTELLIGENCE')` (`pdv-importados/lib/modulos/requireModulo.ts`), com o client da sessão do usuário. A função nega por padrão. O papel padrão é DONO; liberar para GERENTE é decisão de produto e deve ser passado explicitamente.

## 5. Pendências antes de produção

1. Designar a identidade real de plataforma (D2), por procedimento autorizado.
2. Rodar §1 em um clone autorizado e medir o custo do trigger de cerca em escrita com volume real (doc 14 §5).
3. Validação jurídica da retenção de documentos (doc 11) antes de anexar documentos reais ao módulo.
